import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { createDefaultPreferencesSettings } from "../../../src/js/components/services/preferencesDefaults.js";
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

describe("Preferences repository startup contract", () => {
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

  it("verifies even current startup settings before readiness or effects", async () => {
    const replace = fixture.settingsRepository.replace.getMockImplementation();
    fixture.settingsRepository.replace.mockImplementation((value) => {
      expect(service.getCurrentState()).toMatchObject({
        readiness: "initializing",
        ready: false,
        revision: 0,
      });
      expect(effects).not.toHaveBeenCalled();
      return replace(value);
    });
    service.init();
    await expect(service.initialStateReady).resolves.toMatchObject({
      ready: true,
      blocked: false,
      readiness: "ready",
      durability: "verified",
      revision: 1,
    });
    expect(fixture.settingsRepository.replace).toHaveBeenCalledOnce();
  });

  it("publishes blocked defaults after a read-failure receipt without writes or responders", async () => {
    fixture.settingsRepository.load.mockReturnValueOnce({
      status: "read_failed",
      error: "storage_read_failed",
      category: "security",
    });
    service.init();
    await expect(service.initialStateReady).rejects.toThrow(
      "storage_read_failed",
    );
    expect(service.getCurrentState()).toMatchObject({
      ready: false,
      blocked: true,
      readiness: "blocked",
      durability: "unverified",
      blockReason: "storage_read_failed",
      revision: 0,
      settings: createDefaultPreferencesSettings(),
    });
    expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();
    expect(fixture.eventBus.hasListeners("rpc:preferences:set-setting")).toBe(
      false,
    );
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toHaveLength(1);
    expectNoSuccess();
  });

  it.each([
    ["false", () => false],
    [
      "incomplete value",
      () => ({ status: "current", value: { language: "en" } }),
    ],
    [
      "unknown status",
      () => ({ status: "unknown", value: createDefaultPreferencesSettings() }),
    ],
    [
      "accessor-backed status",
      (getter) =>
        Object.defineProperty(
          {
            value: createDefaultPreferencesSettings(),
          },
          "status",
          { enumerable: true, get: getter },
        ),
    ],
  ])(
    "blocks a %s load receipt before replacement or effects",
    async (_name, makeReceipt) => {
      const getter = vi.fn(() => "current");
      fixture.settingsRepository.load.mockReturnValueOnce(makeReceipt(getter));

      service.init();
      await expect(service.initialStateReady).rejects.toThrow(
        "verification_failed",
      );

      const state = service.getCurrentState();
      expect(state).toMatchObject({
        ready: false,
        blocked: true,
        readiness: "blocked",
        durability: "unverified",
        blockReason: "verification_failed",
        revision: 0,
        settings: createDefaultPreferencesSettings(),
      });
      expect(getter).not.toHaveBeenCalled();
      expect(fixture.settingsRepository.load).toHaveBeenCalledOnce();
      expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();
      expect(fixture.settingsRepository.clear).not.toHaveBeenCalled();
      expect(fixture.eventBus.hasListeners("rpc:preferences:set-setting")).toBe(
        false,
      );
      const publications = fixture.eventBusFixture.getEventsOfType(
        "preferences:state-changed",
      );
      expect(publications).toHaveLength(1);
      expect(publications[0].data).toEqual({
        reason: "startup-blocked",
        state,
      });
      expectNoSuccess();
    },
  );

  it.each([
    ["false", false],
    ["missing", undefined],
    [
      "unverified",
      {
        status: "committed",
        value: createDefaultPreferencesSettings(),
        write: { status: "acknowledged" },
        verification: { status: "not_requested" },
      },
    ],
    ["incomplete", committed({ language: "en" })],
    ["verification failure", verificationFailed()],
    [
      "rejected",
      {
        status: "rejected",
        error: "invalid_data",
        write: { status: "not_attempted" },
        verification: { status: "not_attempted" },
      },
    ],
  ])("blocks startup after a %s replacement result", async (_name, result) => {
    fixture.settingsRepository.replace.mockReturnValueOnce(result);
    service.init();
    await expect(service.initialStateReady).rejects.toThrow(
      "verification_failed",
    );
    expect(service.getCurrentState()).toMatchObject({
      ready: false,
      blocked: true,
      revision: 0,
      blockReason: "verification_failed",
    });
    expect(fixture.eventBus.hasListeners("rpc:preferences:set-setting")).toBe(
      false,
    );
    expectNoSuccess();
  });

  it("blocks startup on throwing replace without treating defaults as durable", async () => {
    fixture.settingsRepository.replace.mockImplementationOnce(() => {
      throw new Error("private storage exception");
    });
    service.init();
    await expect(service.initialStateReady).rejects.toThrow(
      "verification_failed",
    );
    expectNoSuccess();
  });
});
