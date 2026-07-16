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
        return undefined;
      }),
      respond(fixture.eventBus, "preferences:save-settings", () => true),
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
      "preferences:save-settings",
    ]);
    expect(
      fixture
        .getEventHistory()
        .filter(({ event }) => event === "rpc:preferences:get-settings"),
    ).toHaveLength(0);
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
