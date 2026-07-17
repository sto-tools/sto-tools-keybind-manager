import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PreferencesUI from "../../../src/js/components/ui/PreferencesUI.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createPreferencesState } from "../../fixtures/core/componentState.js";
import { createServiceFixture } from "../../fixtures/index.js";

function installPreferencesMarkup() {
  document.body.innerHTML = `
    <select id="languageSelect"></select>
    <input id="translateGeneratedMessagesCheckbox" type="checkbox">
    <input id="autoSaveCheckbox" type="checkbox">
    <input id="autoSync" type="checkbox">
    <select id="autoSyncInterval"></select>
    <input id="bindToAliasModeCheckbox" type="checkbox">
    <input id="bindsetsEnabledCheckbox" type="checkbox">
    <div id="currentSyncFolder" data-i18n="no_folder_selected"></div>
    <button id="savePreferencesBtn" type="button">Save</button>
  `;
}

describe("PreferencesUI settings cache", () => {
  let fixture;
  let ui;
  let detachHandlers;

  beforeEach(() => {
    installPreferencesMarkup();
    fixture = createServiceFixture();
    ui = new PreferencesUI({ eventBus: fixture.eventBus, document });

    // Install ComponentBase's standardized cache listeners without triggering
    // the UI's normal application-startup actions in this focused harness.
    const onInit = vi.spyOn(ui, "onInit").mockImplementation(() => {});
    ui.init();
    onInit.mockRestore();
    detachHandlers = [];
  });

  afterEach(() => {
    detachHandlers.forEach((detach) => detach());
    ui?.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it("renders a freshly loaded broadcast snapshot without querying settings", async () => {
    const settings = createPreferencesState({
      bindToAliasMode: true,
      bindsetsEnabled: true,
      syncFolderName: "Fleet Builds",
      syncFolderPath: "Selected folder: Fleet Builds",
    }).settings;
    detachHandlers.push(
      respond(fixture.eventBus, "preferences:load-settings", () => {
        fixture.eventBus.emit("preferences:loaded", { settings });
        return undefined;
      }),
    );
    const request = vi.spyOn(ui, "request");

    await ui.showPreferences();

    expect(request.mock.calls.map(([topic]) => topic)).toEqual([
      "preferences:load-settings",
    ]);
    expect(ui.cache.preferences).toEqual(settings);
    expect(document.getElementById("bindsetsEnabledCheckbox").checked).toBe(
      true,
    );
    expect(document.getElementById("currentSyncFolder").textContent).toBe(
      "Fleet Builds",
    );
    expect(
      fixture
        .getEventHistory()
        .filter(({ event }) => event === "rpc:preferences:get-settings"),
    ).toHaveLength(0);
  });

  it("merges pending changes into the cached snapshot before saving", async () => {
    const settings = createPreferencesState({
      bindToAliasMode: false,
      bindsetsEnabled: false,
      customPreference: "retained",
    }).settings;
    fixture.eventBus.emit("preferences:loaded", { settings });
    ui.pendingSettings = {
      bindToAliasMode: true,
      bindsetsEnabled: true,
    };

    let submittedSettings;
    detachHandlers.push(
      respond(fixture.eventBus, "preferences:set-settings", (payload) => {
        submittedSettings = payload;
        return true;
      }),
    );
    const request = vi.spyOn(ui, "request");

    await ui.saveAllSettings(false);

    expect(submittedSettings).toEqual({
      ...settings,
      bindToAliasMode: true,
      bindsetsEnabled: true,
    });
    expect(ui.pendingSettings).toEqual({});
    expect(request.mock.calls.map(([topic]) => topic)).toEqual([
      "preferences:set-settings",
    ]);
    expect(
      fixture
        .getEventHistory()
        .filter(({ event }) => event === "rpc:preferences:get-settings"),
    ).toHaveLength(0);
  });

  it("retains pending settings and the modal when the durable mutation fails", async () => {
    const settings = createPreferencesState({
      bindToAliasMode: false,
      bindsetsEnabled: false,
    }).settings;
    fixture.eventBus.emit("preferences:loaded", { settings });
    ui.pendingSettings = {
      bindToAliasMode: true,
      bindsetsEnabled: true,
    };
    detachHandlers.push(
      respond(fixture.eventBus, "preferences:set-settings", () => false),
    );
    fixture.eventBusFixture.clearEventHistory();

    await expect(ui.saveAllSettings(false)).resolves.toBe(false);

    expect(ui.pendingSettings).toEqual({
      bindToAliasMode: true,
      bindsetsEnabled: true,
    });
    expect(fixture.eventBusFixture.getEventsOfType("modal:hide")).toHaveLength(
      0,
    );
    expect(
      fixture.eventBusFixture.getEventsOfType(
        "preferences:autosync-settings-changed",
      ),
    ).toHaveLength(0);
  });

  it("publishes exactly one success toast for a manual durable save", async () => {
    const settings = createPreferencesState({
      bindToAliasMode: false,
      bindsetsEnabled: false,
    }).settings;
    fixture.eventBus.emit("preferences:loaded", { settings });
    ui.ui = { showToast: vi.fn() };
    ui.pendingSettings = {
      bindToAliasMode: true,
      bindsetsEnabled: true,
    };
    detachHandlers.push(
      respond(fixture.eventBus, "preferences:set-settings", () => true),
    );
    fixture.eventBusFixture.clearEventHistory();

    await expect(ui.saveAllSettings(true)).resolves.toBe(true);

    const toastEvents = fixture.eventBusFixture.getEventsOfType("toast:show");
    expect(toastEvents).toHaveLength(1);
    expect(toastEvents[0].data).toMatchObject({ type: "success" });
  });

  it("keeps the modal open when an explicit save fails", async () => {
    detachHandlers.push(
      respond(fixture.eventBus, "preferences:save-settings", () => false),
    );
    fixture.eventBusFixture.clearEventHistory();

    await expect(ui.saveAllSettings(false)).resolves.toBe(false);

    expect(fixture.eventBusFixture.getEventsOfType("modal:hide")).toHaveLength(
      0,
    );
    expect(
      fixture.eventBusFixture.getEventsOfType(
        "preferences:autosync-settings-changed",
      ),
    ).toHaveLength(0);
  });

  it("restores an immediately changed control when persistence returns false", async () => {
    const settings = createPreferencesState({ autoSave: false }).settings;
    fixture.eventBus.emit("preferences:loaded", { settings });
    const checkbox = document.getElementById("autoSaveCheckbox");
    checkbox.checked = true;
    detachHandlers.push(
      respond(fixture.eventBus, "preferences:set-setting", () => false),
    );

    await expect(ui.setSetting("autoSave", true)).resolves.toBe(false);

    expect(checkbox.checked).toBe(false);
    expect(ui.cache.preferences.autoSave).toBe(false);
  });

  it("restores an immediately changed control when persistence rejects", async () => {
    const settings = createPreferencesState({ autoSave: false }).settings;
    fixture.eventBus.emit("preferences:loaded", { settings });
    const checkbox = document.getElementById("autoSaveCheckbox");
    checkbox.checked = true;
    detachHandlers.push(
      respond(fixture.eventBus, "preferences:set-setting", () => {
        throw new Error("settings unavailable");
      }),
    );

    await expect(ui.setSetting("autoSave", true)).rejects.toThrow(
      "settings unavailable",
    );

    expect(checkbox.checked).toBe(false);
    expect(ui.cache.preferences.autoSave).toBe(false);
  });

  it("retains pending state and suppresses success effects when bulk persistence rejects", async () => {
    const settings = createPreferencesState({
      bindToAliasMode: false,
      bindsetsEnabled: false,
    }).settings;
    fixture.eventBus.emit("preferences:loaded", { settings });
    ui.pendingSettings = {
      bindToAliasMode: true,
      bindsetsEnabled: true,
    };
    detachHandlers.push(
      respond(fixture.eventBus, "preferences:set-settings", () => {
        throw new Error("settings unavailable");
      }),
    );
    fixture.eventBusFixture.clearEventHistory();

    const result = await ui.saveAllSettings(false).catch((error) => error);

    expect(result).toMatchObject({ message: "settings unavailable" });
    expect(ui.pendingSettings).toEqual({
      bindToAliasMode: true,
      bindsetsEnabled: true,
    });
    expect(fixture.eventBusFixture.getEventsOfType("modal:hide")).toHaveLength(
      0,
    );
    expect(
      fixture.eventBusFixture.getEventsOfType(
        "preferences:autosync-settings-changed",
      ),
    ).toHaveLength(0);
    expect(fixture.eventBusFixture.getEventsOfType("toast:show")).toHaveLength(
      0,
    );
  });

  it("catches and logs a rejected save-button action", async () => {
    const failure = new Error("settings unavailable");
    const saveAllSettings = vi
      .spyOn(ui, "saveAllSettings")
      .mockRejectedValue(failure);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    /** @type {(event: Event) => unknown} */
    let saveHandler = () => {};
    vi.spyOn(ui, "onDom").mockImplementation((target, _event, handler) => {
      if (target === "savePreferencesBtn") saveHandler = handler;
      return () => {};
    });
    ui.setupEventListeners();

    saveHandler(new MouseEvent("click"));

    await vi.waitFor(() => {
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to save preferences"),
        failure,
      );
    });
    expect(saveAllSettings).toHaveBeenCalledOnce();
  });

  it("updates the sync-folder display directly from cached state", async () => {
    fixture.eventBus.emit(
      "preferences:loaded",
      createPreferencesState({
        syncFolderName: "Ground Loadouts",
        syncFolderPath: "Selected folder: Ground Loadouts",
      }),
    );
    const request = vi.spyOn(ui, "request");

    await ui.updateFolderDisplay();

    expect(document.getElementById("currentSyncFolder").textContent).toBe(
      "Ground Loadouts",
    );
    expect(request).not.toHaveBeenCalled();
  });
});
