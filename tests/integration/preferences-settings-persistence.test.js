import { afterEach, beforeEach, describe, expect, it } from "vitest";

import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import { createServiceFixture } from "../fixtures/index.js";

describe("preferences authoritative snapshot persistence", () => {
  let fixture;
  let storageService;
  let preferencesService;

  beforeEach(() => {
    localStorage.clear();
    fixture = createServiceFixture();
    storageService = new StorageService({
      eventBus: fixture.eventBus,
      version: "test-settings-snapshot",
    });
    storageService.init();
    preferencesService = new PreferencesService({
      eventBus: fixture.eventBus,
      storage: storageService,
    });
    preferencesService.init();
  });

  afterEach(() => {
    preferencesService?.destroy();
    storageService?.destroy();
    fixture?.destroy();
    localStorage.clear();
  });

  it("does not resurrect an omitted extension setting after reload", () => {
    preferencesService.setExtensionSetting("plugin:layout", "compact");
    expect(storageService.getSettings()).toHaveProperty(
      "plugin:layout",
      "compact",
    );

    preferencesService.setSettings({ autoSave: false });

    const persisted = JSON.parse(localStorage.getItem("sto_keybind_settings"));
    expect(persisted).toEqual(preferencesService.getSettings());
    expect(persisted).not.toHaveProperty("plugin:layout");

    preferencesService.loadSettings();

    expect(preferencesService.getSettings()).toEqual(persisted);
    expect(preferencesService.getSettings()).not.toHaveProperty(
      "plugin:layout",
    );
  });
});
