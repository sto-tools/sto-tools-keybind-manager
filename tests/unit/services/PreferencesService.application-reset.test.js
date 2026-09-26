import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const committed = (value) => ({
  status: "committed",
  value: structuredClone(value),
  write: { status: "acknowledged" },
  verification: { status: "verified" },
});
const verificationFailed = () => ({
  status: "verification_failed",
  error: "verification_failed",
  write: { status: "acknowledged" },
  verification: {
    status: "failed",
    error: "verification_failed",
    reason: "read_failed",
  },
});

describe("Preferences application reset contract", () => {
  let fixture;
  let service;
  let effects;

  beforeEach(() => {
    fixture = createServiceFixture();
    effects = vi.fn();
    service = new PreferencesService({
      settingsRepository: fixture.settingsRepository,
      eventBus: fixture.eventBus,
      localizeCommands: effects,
      applyTranslations: effects,
    });
  });
  afterEach(() => {
    service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  async function start() {
    service.init();
    await service.initialStateReady;
    fixture.settingsRepository.replace.mockClear();
    fixture.settingsRepository.load.mockClear();
    fixture.settingsRepository.clear.mockClear();
    fixture.eventBusFixture.clearEventHistory();
    effects.mockClear();
  }

  function expectNoSuccess() {
    for (const topic of [
      "preferences:saved",
      "preferences:loaded",
      "preferences:changed",
      "language:changed",
    ]) {
      expect(
        fixture.eventBusFixture.getEventsOfType(topic),
        topic,
      ).toHaveLength(0);
    }
    expect(effects).not.toHaveBeenCalled();
  }

  it("returns reset receipts and releases the owner queue before publication settlement", async () => {
    await start();
    service.i18n = {
      language: "en",
      changeLanguage: vi.fn(async (language) => {
        service.i18n.language = language;
      }),
      t: (key) => key,
    };
    await service.setSettings({ theme: "dark", language: "de" });
    fixture.settingsRepository.replace.mockClear();
    fixture.settingsRepository.clear.mockClear();
    fixture.eventBusFixture.clearEventHistory();

    let releaseState = () => {};
    const stateBlocked = new Promise((resolve) => {
      releaseState = resolve;
    });
    const emit = fixture.eventBus.emit.getMockImplementation();
    fixture.eventBus.emit.mockImplementation((event, data, options) => {
      const emitted = emit(event, data, options);
      if (
        event === "preferences:state-changed" &&
        data.reason === "settings-reset" &&
        options?.synchronous === true
      ) {
        return stateBlocked;
      }
      return emitted ?? Promise.resolve();
    });

    const completion = await service.runApplicationResetTransition(
      async ({ resetPreferences, assertActive }) => {
        assertActive();
        return await resetPreferences();
      },
    );

    expect(completion.result).toMatchObject({
      success: true,
      changed: true,
      revision: 3,
      effects: "applied",
      receipt: {
        settingsClear: {
          status: "complete",
          committed: true,
          removal: { status: "acknowledged" },
        },
        settingsDefaults: {
          status: "complete",
          committed: true,
          write: { status: "acknowledged" },
          verification: { status: "verified" },
        },
        preferencesOwnerAdoption: {
          status: "complete",
          committed: true,
          revision: 3,
          effects: "applied",
        },
      },
    });
    expect(
      fixture
        .getEventHistory()
        .map(({ event }) => event)
        .filter((event) =>
          [
            "preferences:state-changed",
            "preferences:changed",
            "language:changed",
          ].includes(event),
        ),
    ).toEqual([
      "preferences:state-changed",
      "preferences:changed",
      "language:changed",
    ]);

    let publicationsSettled = false;
    void completion.settlement.then(() => {
      publicationsSettled = true;
    });
    await Promise.resolve();
    expect(publicationsSettled).toBe(false);

    // A later ordinary mutation enters the owner queue even though the reset's
    // synchronous listeners have not settled yet.
    await expect(service.setSetting("showTooltips", false)).resolves.toBe(true);
    expect(publicationsSettled).toBe(false);

    releaseState();
    await completion.settlement;
    expect(publicationsSettled).toBe(true);
  });

  it("returns an indeterminate settings-clear receipt without writing or adopting defaults", async () => {
    await start();
    const before = service.getCurrentState();
    fixture.settingsRepository.clear.mockReturnValueOnce({
      status: "clear_failed",
      removal: {
        status: "indeterminate",
        error: "storage_write_failed",
        category: "security",
      },
    });

    const completion = await service.runApplicationResetTransition(
      ({ resetPreferences }) => resetPreferences(),
    );

    expect(completion.result).toEqual({
      success: false,
      error: "storage_write_failed",
      stage: "settingsClear",
      durable: "indeterminate",
      params: { reason: "storage_write_failed" },
      receipt: {
        settingsClear: {
          status: "failed",
          committed: "indeterminate",
          error: "storage_write_failed",
          removal: {
            status: "indeterminate",
            error: "storage_write_failed",
            category: "security",
          },
        },
        settingsDefaults: { status: "skipped", committed: false },
        preferencesOwnerAdoption: { status: "skipped", committed: false },
      },
    });
    await completion.settlement;
    expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();
    expect(service.getCurrentState()).toBe(before);
    expectNoSuccess();
  });

  it("keeps the acknowledged clear when verified default persistence fails", async () => {
    await start();
    const before = service.getCurrentState();
    fixture.settingsRepository.replace.mockReturnValueOnce(
      verificationFailed(),
    );

    const completion = await service.runApplicationResetTransition(
      ({ resetPreferences }) => resetPreferences(),
    );

    expect(completion.result).toEqual({
      success: false,
      error: "verification_failed",
      stage: "settingsDefaults",
      durable: true,
      params: { reason: "verification_failed" },
      receipt: {
        settingsClear: {
          status: "complete",
          committed: true,
          removal: { status: "acknowledged" },
        },
        settingsDefaults: {
          status: "failed",
          committed: "indeterminate",
          error: "verification_failed",
          write: { status: "acknowledged" },
          verification: {
            status: "failed",
            error: "verification_failed",
            reason: "read_failed",
          },
        },
        preferencesOwnerAdoption: { status: "skipped", committed: false },
      },
    });
    await completion.settlement;
    expect(service.getCurrentState()).toBe(before);
    expectNoSuccess();
  });

  it("cancels stale owner adoption after defaults commit during lifecycle replacement", async () => {
    await start();
    fixture.settingsRepository.replace.mockImplementationOnce((settings) => {
      service.destroy();
      return committed(settings);
    });

    const completion = await service.runApplicationResetTransition(
      ({ resetPreferences }) => resetPreferences(),
    );

    expect(completion.result).toMatchObject({
      success: false,
      error: "operation_cancelled",
      stage: "preferencesOwnerAdoption",
      durable: true,
      params: { reason: "operation_cancelled" },
      receipt: {
        settingsClear: { status: "complete", committed: true },
        settingsDefaults: { status: "complete", committed: true },
        preferencesOwnerAdoption: {
          status: "failed",
          committed: false,
          error: "operation_cancelled",
        },
      },
    });
    await completion.settlement;
    expectNoSuccess();
  });

  it("closes a retained reset capability after its lease", async () => {
    await start();
    let retainedReset;
    await service.runApplicationResetTransition(({ resetPreferences }) => {
      retainedReset = resetPreferences;
      return "lease-complete";
    });

    const completion = await retainedReset();
    expect(completion.result).toMatchObject({
      success: false,
      error: "operation_cancelled",
      stage: "preferencesOwnerAdoption",
      durable: false,
      params: { reason: "operation_cancelled" },
    });
    await completion.settlement;
    expect(fixture.settingsRepository.clear).not.toHaveBeenCalled();
    expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();
  });
});
