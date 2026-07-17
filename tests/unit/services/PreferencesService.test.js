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
  let fixture, service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new PreferencesService({
      storage: fixture.storage,
      eventBus: fixture.eventBus,
    });
    service.init();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it("loads default settings when storage is empty", () => {
    const settings = service.getSettings();
    expect(settings).toHaveProperty("theme");
    expect(["default", "dark"]).toContain(settings.theme);
    expect(settings).toHaveProperty("language", "en");
  });

  it("returns a detached settings snapshot for late joiners", () => {
    const state = service.getCurrentState();

    expect(state).toEqual({ settings: service.getSettings() });
    expect(state.settings).not.toBe(service.settings);
  });

  it("setSetting persists to storage and emits preferences:changed", async () => {
    const spySave = fixture.storage.saveSettings;
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

  it("publishes complete defaults when loading without storage", () => {
    const serviceWithoutStorage = new PreferencesService({
      eventBus: fixture.eventBus,
    });

    try {
      fixture.eventBusFixture.clearEventHistory();
      serviceWithoutStorage.loadSettings();

      const [loaded] =
        fixture.eventBusFixture.getEventsOfType("preferences:loaded");
      expect(loaded.data).toEqual({
        settings: serviceWithoutStorage.defaultSettings,
      });
      expect(loaded.data.settings).not.toBe(serviceWithoutStorage.settings);
      expect(Object.keys(loaded.data.settings)).toHaveLength(15);

      loaded.data.settings.theme = "changed-outside-service";
      expect(serviceWithoutStorage.getSetting("theme")).toBe("default");
    } finally {
      serviceWithoutStorage.destroy();
    }
  });

  it("resets and publishes complete defaults when stored settings cannot be read", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(
        service.setExtensionSetting("plugin:layout", { density: "compact" }),
      ).resolves.toBe(true);
      fixture.storage.getSettings.mockImplementationOnce(() => {
        throw new Error("settings unavailable");
      });
      fixture.eventBusFixture.clearEventHistory();

      service.loadSettings();

      expect(errorSpy).toHaveBeenCalledWith(
        "[PreferencesService] loadSettings failed",
        expect.any(Error),
      );
      expect(service.getSettings()).toEqual(service.defaultSettings);
      const [loaded] =
        fixture.eventBusFixture.getEventsOfType("preferences:loaded");
      expect(loaded.data).toEqual({ settings: service.defaultSettings });
      expect(loaded.data.settings).not.toBe(service.settings);
    } finally {
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

  it("defaults invalid stored known values and preserves stored extensions", () => {
    const extensionValue = { density: "compact" };
    fixture.storage.getSettings.mockReturnValue({
      theme: "light",
      autoSave: "yes",
      maxUndoSteps: null,
      syncFolderName: 42,
      syncFolderPath: "/keybinds",
      "plugin:layout": extensionValue,
    });

    service.loadSettings();

    expect(service.getSettings()).toMatchObject({
      theme: "light",
      autoSave: true,
      maxUndoSteps: 50,
      syncFolderName: null,
      syncFolderPath: "/keybinds",
      "plugin:layout": extensionValue,
    });
  });

  it("updateThemeToggleButton syncs label and data-i18n with current theme", () => {
    // Setup DOM elements expected by updateThemeToggleButton
    const toggleBtn = document.createElement("button");
    toggleBtn.id = "themeToggleBtn";
    // icon element inside button
    const iconEl = document.createElement("i");
    toggleBtn.appendChild(iconEl);
    document.body.appendChild(toggleBtn);

    const textSpan = document.createElement("span");
    textSpan.id = "themeToggleText";
    textSpan.setAttribute("data-i18n", "dark_mode");
    document.body.appendChild(textSpan);

    // Stub i18n translator to return readable labels
    service.i18n = {
      t: (key) => ({ light_mode: "Light Mode", dark_mode: "Dark Mode" })[key],
    };

    // Act – switch to dark theme
    service.updateThemeToggleButton("dark");

    expect(iconEl.className).toBe("fas fa-sun");
    expect(textSpan.getAttribute("data-i18n")).toBe("light_mode");
    expect(textSpan.textContent).toBe("Light Mode");

    // Act – switch back to default (light) theme
    service.updateThemeToggleButton("default");

    expect(iconEl.className).toBe("fas fa-moon");
    expect(textSpan.getAttribute("data-i18n")).toBe("dark_mode");
    expect(textSpan.textContent).toBe("Dark Mode");
  });

  it("toggleTheme updates theme without emitting toast events", async () => {
    fixture.eventBusFixture.clearEventHistory();

    const originalTheme = service.getSetting("theme") || "default";
    await expect(service.toggleTheme()).resolves.toBe(true);

    const expectedTheme = originalTheme === "dark" ? "default" : "dark";
    expect(service.getSetting("theme")).toBe(expectedTheme);

    const toastEvents = fixture.eventBusFixture.getEventsOfType("toast:show");
    expect(toastEvents).toHaveLength(0);
  });

  it("changeLanguage emits language:changed without showing toast", async () => {
    const previousLocalizeCommandData = window.localizeCommandData;
    const localizeCommandData = vi.fn();
    window.localizeCommandData = localizeCommandData;
    fixture.eventBusFixture.clearEventHistory();

    try {
      await expect(service.changeLanguage("de")).resolves.toBe(true);

      const languageEvents =
        fixture.eventBusFixture.getEventsOfType("language:changed");
      expect(languageEvents).toHaveLength(1);
      expect(languageEvents[0].data).toEqual({ language: "de" });
      expect(localizeCommandData).toHaveBeenCalledOnce();

      const toastEvents = fixture.eventBusFixture.getEventsOfType("toast:show");
      expect(toastEvents).toHaveLength(0);
    } finally {
      window.localizeCommandData = previousLocalizeCommandData;
    }
  });

  it("does not localize or publish a language change when persistence returns false", async () => {
    const previousLocalizeCommandData = window.localizeCommandData;
    const localizeCommandData = vi.fn();
    window.localizeCommandData = localizeCommandData;
    const before = service.getCurrentState();
    fixture.storage.saveSettings.mockReturnValueOnce(false);
    fixture.eventBusFixture.clearEventHistory();

    try {
      await expect(service.changeLanguage("de")).resolves.toBe(false);

      expect(service.getCurrentState()).toEqual(before);
      expect(localizeCommandData).not.toHaveBeenCalled();
      expect(
        fixture.eventBusFixture.getEventsOfType("language:changed"),
      ).toHaveLength(0);
    } finally {
      window.localizeCommandData = previousLocalizeCommandData;
    }
  });

  it("does not localize or publish a language change when persistence throws", async () => {
    const previousLocalizeCommandData = window.localizeCommandData;
    const localizeCommandData = vi.fn();
    window.localizeCommandData = localizeCommandData;
    const before = service.getCurrentState();
    const failure = new Error("settings unavailable");
    fixture.storage.saveSettings.mockImplementationOnce(() => {
      throw failure;
    });
    fixture.eventBusFixture.clearEventHistory();

    try {
      await expect(service.changeLanguage("de")).rejects.toBe(failure);

      expect(service.getCurrentState()).toEqual(before);
      expect(localizeCommandData).not.toHaveBeenCalled();
      expect(
        fixture.eventBusFixture.getEventsOfType("language:changed"),
      ).toHaveLength(0);
    } finally {
      window.localizeCommandData = previousLocalizeCommandData;
    }
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
    [
      "getCurrentState",
      (candidate, key) => candidate.getCurrentState().settings[key],
    ],
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
