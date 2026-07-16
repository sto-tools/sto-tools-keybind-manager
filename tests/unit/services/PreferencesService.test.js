import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { extensionPreferenceKey } from "../../../src/js/components/services/preferenceKeys.js";
import { createServiceFixture } from "../../fixtures";

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

  it("setSetting persists to storage and emits preferences:changed", () => {
    const spySave = fixture.storage.saveSettings;
    service.setSetting("theme", "dark");

    expect(service.getSetting("theme")).toBe("dark");
    expect(spySave).toHaveBeenCalled();
    fixture.eventBusFixture.expectEvent("preferences:changed", {
      key: "theme",
      value: "dark",
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
        autoSave: false,
        maxUndoSteps: 25,
        syncFolderName: "Keybinds",
        "plugin:layout": extensionValue,
      },
    });
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

  it("toggleTheme updates theme without emitting toast events", () => {
    fixture.eventBusFixture.clearEventHistory();

    const originalTheme = service.getSetting("theme") || "default";
    service.toggleTheme();

    const expectedTheme = originalTheme === "dark" ? "default" : "dark";
    expect(service.getSetting("theme")).toBe(expectedTheme);

    const toastEvents = fixture.eventBusFixture.getEventsOfType("toast:show");
    expect(toastEvents).toHaveLength(0);
  });

  it("changeLanguage emits language:changed without showing toast", async () => {
    fixture.eventBusFixture.clearEventHistory();

    await service.changeLanguage("de");

    const languageEvents =
      fixture.eventBusFixture.getEventsOfType("language:changed");
    expect(languageEvents).toHaveLength(1);
    expect(languageEvents[0].data).toEqual({ language: "de" });

    const toastEvents = fixture.eventBusFixture.getEventsOfType("toast:show");
    expect(toastEvents).toHaveLength(0);
  });
});
