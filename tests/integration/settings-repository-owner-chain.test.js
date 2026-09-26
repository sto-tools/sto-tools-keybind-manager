import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import LocalStorageSettingsRepository from "../../src/js/components/storage/LocalStorageSettingsRepository.js";
import { createDefaultPreferencesSettings } from "../../src/js/components/services/preferencesDefaults.js";
import { createEventBusFixture } from "../fixtures/core/eventBus.js";

const SETTINGS = "sto_keybind_settings";
const ROOT = "sto_keybind_manager";

describe("real settings repository to Preferences owner chain", () => {
  let bus;
  let owner;
  let storage;
  let durable;
  let repository;
  let effects;

  beforeEach(() => {
    bus = createEventBusFixture();
    durable = new Map([
      [
        ROOT,
        '{"settings":{"language":"hostile-root"},"unrelated":"unchanged"}',
      ],
    ]);
    storage = {
      getItem: vi.fn((key) => durable.get(key) ?? null),
      setItem: vi.fn((key, value) => durable.set(key, value)),
      removeItem: vi.fn((key) => durable.delete(key)),
    };
    const defaults = { ...createDefaultPreferencesSettings(), language: "fr" };
    repository = new LocalStorageSettingsRepository({ storage, defaults });
    vi.spyOn(repository, "replace");
    effects = vi.fn();
    owner = new PreferencesService({
      settingsRepository: repository,
      defaults,
      eventBus: bus.eventBus,
      localizeCommands: effects,
      applyTranslations: effects,
    });
  });
  afterEach(() => {
    owner.destroy();
    bus.destroy();
    vi.restoreAllMocks();
  });

  function expectNoSuccess() {
    expect(effects).not.toHaveBeenCalled();
    for (const event of [
      "preferences:loaded",
      "preferences:saved",
      "preferences:changed",
    ]) {
      expect(bus.getEventsOfType(event)).toHaveLength(0);
    }
    expect(bus.eventBus.hasListeners("rpc:preferences:set-setting")).toBe(
      false,
    );
  }

  it("fails closed on real browser read throw without replacement, effects, or ready publication", async () => {
    const oldRoot = durable.get(ROOT);
    storage.getItem.mockImplementation(() => {
      throw new DOMException("blocked storage", "SecurityError");
    });
    owner.init();
    await expect(owner.initialStateReady).rejects.toThrow(
      "storage_read_failed",
    );
    expect(owner.getCurrentState()).toMatchObject({
      ready: false,
      blocked: true,
      readiness: "blocked",
      durability: "unverified",
      blockReason: "storage_read_failed",
      revision: 0,
      settings: { language: "fr" },
    });
    expect(repository.replace).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(durable.get(ROOT)).toBe(oldRoot);
    expect(
      bus
        .getEventsOfType("preferences:state-changed")
        .map(({ data }) => data.reason),
    ).toEqual(["startup-blocked"]);
    expectNoSuccess();
  });

  it("retains acknowledged write evidence but blocks startup on real readback failure", async () => {
    const oldRoot = durable.get(ROOT);
    storage.getItem.mockReturnValueOnce(null).mockImplementation(() => {
      throw new Error("readback failed");
    });
    owner.init();
    await expect(owner.initialStateReady).rejects.toThrow(
      "verification_failed",
    );
    expect(repository.replace.mock.results[0].value).toMatchObject({
      status: "verification_failed",
      write: { status: "acknowledged" },
      verification: { reason: "read_failed" },
    });
    expect(JSON.parse(durable.get(SETTINGS))).toEqual(owner.defaultSettings);
    expect(owner.getCurrentState()).toMatchObject({
      ready: false,
      blocked: true,
      revision: 0,
      blockReason: "verification_failed",
    });
    expect(durable.get(ROOT)).toBe(oldRoot);
    expectNoSuccess();
  });

  it.each([
    ["missing", null],
    ["corrupt", "{invalid"],
    [
      "partial",
      '{"autoSave":false,"theme":3,"plugin:layout":{"panels":["one"]}}',
    ],
    [
      "unsafe extension",
      '{"theme":42,"language":"fr","plugin:layout":{"panels":["one"]},"plugin:unsafe":{"prototype":true}}',
    ],
  ])(
    "writes and verifies complete canonical repair for %s standalone settings",
    async (_case, raw) => {
      if (raw !== null) durable.set(SETTINGS, raw);
      const oldRoot = durable.get(ROOT);
      owner.init();
      await expect(owner.initialStateReady).resolves.toMatchObject({
        ready: true,
        blocked: false,
        durability: "verified",
        revision: 1,
      });
      expect(repository.replace).toHaveBeenCalledOnce();
      expect(JSON.parse(durable.get(SETTINGS))).toEqual(owner.getSettings());
      expect(owner.getSettings()).toMatchObject({
        language: "fr",
        theme: "default",
      });
      if (_case === "partial")
        expect(owner.getSettings()).toMatchObject({
          autoSave: false,
          "plugin:layout": { panels: ["one"] },
        });
      if (_case === "unsafe extension") {
        const accepted = owner.getSettings();
        expect(accepted["plugin:layout"]).toEqual({ panels: ["one"] });
        expect(accepted).not.toHaveProperty("plugin:unsafe");
        accepted["plugin:layout"].panels.push("consumer-mutation");
        expect(owner.getSettings()["plugin:layout"]).toEqual({
          panels: ["one"],
        });
        expect(JSON.parse(durable.get(SETTINGS))).toEqual(owner.getSettings());
        expect({}.polluted).toBeUndefined();
      }
      expect(durable.get(ROOT)).toBe(oldRoot);
      expect(
        storage.getItem.mock.calls.every(([key]) => key === SETTINGS),
      ).toBe(true);
      expect(
        storage.setItem.mock.calls.every(([key]) => key === SETTINGS),
      ).toBe(true);
    },
  );

  it("adopts the exact serialized canonical number returned by the real repository", async () => {
    owner.init();
    await owner.initialStateReady;
    await expect(owner.setSetting("maxUndoSteps", -0)).resolves.toBe(true);
    expect(Object.is(owner.getSetting("maxUndoSteps"), 0)).toBe(true);
    expect(Object.is(owner.getCurrentState().settings.maxUndoSteps, -0)).toBe(
      false,
    );
    expect(JSON.parse(durable.get(SETTINGS))).toEqual(owner.getSettings());
    expect(repository.replace.mock.results.at(-1).value.value).toEqual(
      owner.getSettings(),
    );
  });
});
