import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import ComponentBase from "../../../src/js/components/ComponentBase.js";
import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { extensionPreferenceKey } from "../../../src/js/components/services/preferenceKeys.js";
import { createServiceFixture } from "../../fixtures";

class PreferencesContractConsumer extends ComponentBase {
  constructor(eventBus) {
    super(eventBus);
    this.componentName = "PreferencesContractConsumer";
  }
}

/**
 * Unit tests – PreferencesService
 */

describe("PreferencesService", () => {
  let fixture, service, localizeCommands, applyTranslations;

  beforeEach(async () => {
    fixture = createServiceFixture();
    localizeCommands = vi.fn();
    applyTranslations = vi.fn();
    service = new PreferencesService({
      storage: fixture.storage,
      eventBus: fixture.eventBus,
      localizeCommands,
      applyTranslations,
    });
    service.init();
    await service.initialStateReady;
    localizeCommands.mockClear();
    applyTranslations.mockClear();
    fixture.storage.saveSettings.mockClear();
    fixture.eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    if (service && !service.destroyed) service.destroy();
    fixture.destroy();
  });

  it("loads default settings when storage is empty", () => {
    const settings = service.getSettings();
    expect(settings).toHaveProperty("theme");
    expect(["default", "dark"]).toContain(settings.theme);
    expect(settings).toHaveProperty("language", "en");
  });

  it("returns the immutable ready snapshot used for late joiners", () => {
    const state = service.getCurrentState();

    expect(state).toMatchObject({
      ready: true,
      revision: 1,
      settings: service.getSettings(),
    });
    expect(state.authorityEpoch).toBeGreaterThanOrEqual(1);
    expect(state.settings).not.toBe(service.settings);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.settings)).toBe(true);
  });

  it("setSetting persists to storage and emits preferences:changed", async () => {
    const spySave = fixture.storage.saveSettings;
    const before = service.getCurrentState();
    await expect(service.setSetting("theme", "dark")).resolves.toBe(true);

    expect(service.getSetting("theme")).toBe("dark");
    expect(spySave).toHaveBeenCalledWith(service.getSettings(), {
      replace: true,
    });
    fixture.eventBusFixture.expectEvent("preferences:changed", {
      key: "theme",
      value: "dark",
      settings: service.getSettings(),
    });
    const [canonical] = fixture.eventBusFixture.getEventsOfType(
      "preferences:state-changed",
    );
    expect(canonical.data).toEqual({
      reason: "setting-committed",
      state: service.getCurrentState(),
    });
    expect(canonical.data.state).toBe(service.getCurrentState());
    expect(service.getCurrentState().revision).toBe(before.revision + 1);
  });

  it("rejects a wrong-typed known setting RPC before side effects", async () => {
    const before = service.getSettings();
    const applySettings = vi.spyOn(service, "applySettings");
    fixture.storage.saveSettings.mockClear();
    fixture.eventBusFixture.clearEventHistory();

    await expect(
      fixture.eventBus.request("preferences:set-setting", {
        key: "autoSave",
        value: "yes",
      }),
    ).rejects.toThrow(
      'Invalid value or mutation path for preference "autoSave"',
    );

    expect(service.getSettings()).toEqual(before);
    expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
    expect(applySettings).not.toHaveBeenCalled();
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toHaveLength(0);
  });

  it("accepts valid known setting values through the RPC", async () => {
    fixture.storage.saveSettings.mockClear();
    fixture.eventBusFixture.clearEventHistory();

    await fixture.eventBus.request("preferences:set-setting", {
      key: "autoSave",
      value: false,
    });

    expect(service.getSetting("autoSave")).toBe(false);
    expect(fixture.storage.saveSettings).toHaveBeenCalledTimes(1);
    fixture.eventBusFixture.expectEvent("preferences:changed", {
      key: "autoSave",
      value: false,
      settings: service.getSettings(),
    });
  });

  it("requires the explicit extension path for unknown setting keys", async () => {
    const extensionValue = { density: "compact" };
    const extensionKey = extensionPreferenceKey("plugin:layout");

    await expect(
      fixture.eventBus.request("preferences:set-setting", {
        key: "plugin:layout",
        value: extensionValue,
      }),
    ).rejects.toThrow();

    await fixture.eventBus.request("preferences:set-setting", {
      key: extensionKey,
      value: extensionValue,
      extension: true,
    });
    expect(service.getSetting("plugin:layout")).toEqual(extensionValue);
  });

  it("does not allow a known setting to be branded as an extension key", () => {
    expect(() => extensionPreferenceKey("autoSave")).toThrow(
      'Known preference "autoSave" cannot use the extension mutation path',
    );
  });

  it("rejects an invalid bulk mutation atomically", async () => {
    const before = service.getSettings();
    const applySettings = vi.spyOn(service, "applySettings");
    fixture.storage.saveSettings.mockClear();
    fixture.eventBusFixture.clearEventHistory();

    await expect(
      fixture.eventBus.request("preferences:set-settings", {
        theme: "dark",
        autoSave: "yes",
        "plugin:layout": { density: "compact" },
      }),
    ).rejects.toThrow("Invalid preferences settings payload");

    expect(service.getSettings()).toEqual(before);
    expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
    expect(applySettings).not.toHaveBeenCalled();
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toHaveLength(0);
  });

  it("accepts valid bulk values and preserves extension settings", async () => {
    const extensionValue = { density: "compact" };
    fixture.storage.saveSettings.mockClear();
    fixture.eventBusFixture.clearEventHistory();

    await fixture.eventBus.request("preferences:set-settings", {
      autoSave: false,
      maxUndoSteps: 25,
      syncFolderName: "Keybinds",
      "plugin:layout": extensionValue,
    });

    expect(service.getSettings()).toMatchObject({
      autoSave: false,
      maxUndoSteps: 25,
      syncFolderName: "Keybinds",
      "plugin:layout": extensionValue,
    });
    expect(fixture.storage.saveSettings).toHaveBeenCalledTimes(1);
    fixture.eventBusFixture.expectEvent("preferences:changed", {
      changes: {
        theme: "default",
        autoSave: false,
        maxUndoSteps: 25,
        syncFolderName: "Keybinds",
        "plugin:layout": extensionValue,
      },
      settings: service.getSettings(),
    });
  });

  it("publishes complete defaults when starting without storage", async () => {
    const serviceWithoutStorage = new PreferencesService({
      eventBus: fixture.eventBus,
      localizeCommands: vi.fn(),
      applyTranslations: vi.fn(),
    });

    try {
      fixture.eventBusFixture.clearEventHistory();
      serviceWithoutStorage.init();
      const ready = await serviceWithoutStorage.initialStateReady;

      const [loaded] =
        fixture.eventBusFixture.getEventsOfType("preferences:loaded");
      expect(loaded.data).toEqual({
        settings: serviceWithoutStorage.defaultSettings,
      });
      expect(loaded.data.settings).not.toBe(serviceWithoutStorage.settings);
      expect(Object.keys(loaded.data.settings)).toHaveLength(15);
      expect(ready).toBe(serviceWithoutStorage.getCurrentState());
      expect(ready).toMatchObject({ ready: true, revision: 1 });

      loaded.data.settings.theme = "changed-outside-service";
      expect(serviceWithoutStorage.getSetting("theme")).toBe("default");
    } finally {
      if (!serviceWithoutStorage.destroyed) serviceWithoutStorage.destroy();
    }
  });

  it("starts a replacement with complete defaults when storage cannot be read", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const replacement = new PreferencesService({
      storage: fixture.storage,
      eventBus: fixture.eventBus,
      localizeCommands: vi.fn(),
      applyTranslations: vi.fn(),
    });
    try {
      fixture.storage.getSettings.mockImplementationOnce(() => {
        throw new Error("settings unavailable");
      });
      fixture.eventBusFixture.clearEventHistory();

      replacement.init();
      await replacement.initialStateReady;

      expect(errorSpy).toHaveBeenCalledWith(
        "[PreferencesService] loadSettings failed",
        expect.any(Error),
      );
      expect(replacement.getSettings()).toEqual(replacement.defaultSettings);
      const [loaded] =
        fixture.eventBusFixture.getEventsOfType("preferences:loaded");
      expect(loaded.data).toEqual({ settings: replacement.defaultSettings });
      expect(loaded.data.settings).not.toBe(replacement.settings);
    } finally {
      if (!replacement.destroyed) replacement.destroy();
      errorSpy.mockRestore();
    }
  });

  it("removes state-query responders while retaining direct snapshot accessors", () => {
    expect(fixture.eventBus.hasListeners("rpc:preferences:get-settings")).toBe(
      false,
    );
    expect(fixture.eventBus.hasListeners("rpc:preferences:get-setting")).toBe(
      false,
    );

    expect(service.getSettings()).toEqual(service.getCurrentState().settings);
    expect(service.getSetting("language")).toBe("en");
  });

  it("reports canonical resets and extension deletions from bulk replacement", async () => {
    await expect(
      service.setSettings({
        theme: "dark",
        autoSave: false,
        "plugin:layout": { density: "compact" },
      }),
    ).resolves.toBe(true);
    fixture.eventBusFixture.clearEventHistory();

    await expect(service.setSettings({ autoSave: false })).resolves.toBe(true);

    const [changed] = fixture.eventBusFixture.getEventsOfType(
      "preferences:changed",
    );
    expect(changed.data.changes).toEqual({
      theme: "default",
      "plugin:layout": undefined,
    });
    expect(changed.data.changes).toHaveProperty("plugin:layout", undefined);
    expect(changed.data.settings).toEqual(service.getSettings());
    expect(changed.data.settings).not.toHaveProperty("plugin:layout");
  });

  it("does not announce a change when the canonical bulk state is unchanged", async () => {
    const current = service.getSettings();
    fixture.storage.saveSettings.mockClear();
    fixture.eventBusFixture.clearEventHistory();

    await expect(service.setSettings(current)).resolves.toBe(true);

    expect(fixture.storage.saveSettings).toHaveBeenCalledTimes(1);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toHaveLength(0);
  });

  it("defaults invalid stored known values and preserves stored extensions", async () => {
    const extensionValue = { density: "compact" };
    fixture.storage.getSettings.mockReturnValue({
      theme: "light",
      autoSave: "yes",
      maxUndoSteps: null,
      syncFolderName: 42,
      syncFolderPath: "/keybinds",
      "plugin:layout": extensionValue,
    });

    const replacement = new PreferencesService({
      storage: fixture.storage,
      eventBus: fixture.eventBus,
      localizeCommands: vi.fn(),
      applyTranslations: vi.fn(),
    });
    replacement.init();
    await replacement.initialStateReady;

    expect(replacement.getSettings()).toMatchObject({
      theme: "light",
      autoSave: true,
      maxUndoSteps: 50,
      syncFolderName: null,
      syncFolderPath: "/keybinds",
      "plugin:layout": extensionValue,
    });
    replacement.destroy();
  });

  it.each([
    ["preferences:set-setting", { key: "autoSave", value: false }],
    ["preferences:set-settings", { autoSave: false }],
  ])("returns a boolean success result from %s", async (topic, payload) => {
    await expect(fixture.eventBus.request(topic, payload)).resolves.toBe(true);
  });

  it.each([
    ["preferences:set-setting", { key: "autoSave", value: false }],
    ["preferences:set-settings", { autoSave: false }],
  ])(
    "persists before owner commit and publishes saved before changed for %s",
    async (topic, payload) => {
      const before = service.getSetting("autoSave");
      const order = [];
      fixture.storage.saveSettings.mockImplementation((settings) => {
        expect(settings.autoSave).toBe(false);
        order.push(`write:${service.getSetting("autoSave")}`);
        return true;
      });
      fixture.eventBus.on("preferences:saved", ({ settings }) => {
        expect(settings.autoSave).toBe(false);
        order.push(`saved:${service.getSetting("autoSave")}`);
      });
      fixture.eventBus.on("preferences:changed", ({ settings }) => {
        expect(settings.autoSave).toBe(false);
        order.push(`changed:${service.getSetting("autoSave")}`);
      });
      fixture.eventBusFixture.clearEventHistory();

      const result = await fixture.eventBus.request(topic, payload);

      expect(order).toEqual([
        `write:${before}`,
        "saved:false",
        "changed:false",
      ]);
      expect(result).toBe(true);
    },
  );

  it.each([
    ["preferences:set-setting", { key: "autoSave", value: false }],
    ["preferences:set-settings", { autoSave: false }],
  ])(
    "leaves owner and late-join state unchanged when %s returns false",
    async (topic, payload) => {
      const before = structuredClone(service.getCurrentState());
      const applySettings = vi.spyOn(service, "applySettings");
      fixture.storage.saveSettings.mockReturnValueOnce(false);
      fixture.eventBusFixture.clearEventHistory();

      const result = await fixture.eventBus.request(topic, payload);
      const consumer = new PreferencesContractConsumer(fixture.eventBus);
      try {
        consumer.init();

        expect(service.getCurrentState()).toEqual(before);
        expect(consumer.cache.preferences).toEqual(before.settings);
        expect(applySettings).not.toHaveBeenCalled();
        expect(
          fixture.eventBusFixture.getEventsOfType("preferences:saved"),
        ).toHaveLength(0);
        expect(
          fixture.eventBusFixture.getEventsOfType("preferences:changed"),
        ).toHaveLength(0);
        expect(result).toBe(false);
      } finally {
        consumer.destroy();
      }
    },
  );

  it.each([
    ["preferences:set-setting", { key: "autoSave", value: false }],
    ["preferences:set-settings", { autoSave: false }],
  ])(
    "rejects %s without changing owner or late-join state when persistence throws",
    async (topic, payload) => {
      const before = structuredClone(service.getCurrentState());
      const applySettings = vi.spyOn(service, "applySettings");
      fixture.storage.saveSettings.mockImplementationOnce(() => {
        throw new Error("settings unavailable");
      });
      fixture.eventBusFixture.clearEventHistory();

      await expect(fixture.eventBus.request(topic, payload)).rejects.toThrow(
        "settings unavailable",
      );

      const consumer = new PreferencesContractConsumer(fixture.eventBus);
      try {
        consumer.init();

        expect(service.getCurrentState()).toEqual(before);
        expect(consumer.cache.preferences).toEqual(before.settings);
        expect(applySettings).not.toHaveBeenCalled();
        expect(
          fixture.eventBusFixture.getEventsOfType("preferences:saved"),
        ).toHaveLength(0);
        expect(
          fixture.eventBusFixture.getEventsOfType("preferences:changed"),
        ).toHaveLength(0);
      } finally {
        consumer.destroy();
      }
    },
  );

  it("detaches nested extension input before adopting it", async () => {
    const key = extensionPreferenceKey("plugin:nested-input");
    const input = { panels: [{ id: "commands", visible: true }] };

    await fixture.eventBus.request("preferences:set-setting", {
      key,
      value: input,
      extension: true,
    });
    input.panels[0].visible = false;

    expect(service.getSetting(key)).toEqual({
      panels: [{ id: "commands", visible: true }],
    });
  });

  it.each([
    ["getSetting", (candidate, key) => candidate.getSetting(key)],
    ["getSettings", (candidate, key) => candidate.getSettings()[key]],
  ])(
    "deeply detaches nested extension values returned by %s",
    async (_name, read) => {
      const key = "plugin:nested-accessor";
      await fixture.eventBus.request("preferences:set-settings", {
        [key]: { panels: [{ id: "commands", visible: true }] },
      });

      const returned = read(service, key);
      returned.panels[0].visible = false;

      expect(service.settings[key]).toEqual({
        panels: [{ id: "commands", visible: true }],
      });
    },
  );

  it("shares one immutable canonical snapshot through state access", async () => {
    const key = "plugin:immutable-state";
    await fixture.eventBus.request("preferences:set-settings", {
      [key]: { panels: [{ id: "commands", visible: true }] },
    });

    const state = service.getCurrentState();
    expect(() => {
      state.settings[key].panels[0].visible = false;
    }).toThrow(TypeError);
    expect(service.getCurrentState()).toBe(state);
  });

  it.each(["preferences:saved", "preferences:changed"])(
    "deeply detaches nested extension values in %s payloads",
    async (eventName) => {
      const key = "plugin:nested-event";
      fixture.eventBusFixture.clearEventHistory();

      await fixture.eventBus.request("preferences:set-settings", {
        [key]: { panels: [{ id: "commands", visible: true }] },
      });

      const [publication] = fixture.eventBusFixture.getEventsOfType(eventName);
      publication.data.settings[key].panels[0].visible = false;

      expect(service.settings[key]).toEqual({
        panels: [{ id: "commands", visible: true }],
      });
    },
  );
});
