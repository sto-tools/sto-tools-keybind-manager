import { afterEach, beforeEach, describe, expect, it } from "vitest";

import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import { createServiceFixture } from "../fixtures/index.js";

describe("preferences authoritative snapshot persistence", () => {
  let fixture;
  let preferencesService;

  beforeEach(async () => {
    localStorage.clear();
    fixture = createServiceFixture();
    preferencesService = new PreferencesService({
      eventBus: fixture.eventBus,
      settingsRepository: fixture.settingsRepository,
    });
    preferencesService.init();
    await preferencesService.initialStateReady;
  });

  afterEach(() => {
    preferencesService?.destroy();
    fixture?.destroy();
    localStorage.clear();
  });

  it("does not resurrect an omitted extension setting after reload", async () => {
    expect(
      await preferencesService.setExtensionSetting("plugin:layout", "compact"),
    ).toBe(true);
    expect(fixture.settingsRepository.load().value).toHaveProperty(
      "plugin:layout",
      "compact",
    );

    expect(await preferencesService.setSettings({ autoSave: false })).toBe(
      true,
    );

    const persisted = JSON.parse(
      fixture.storageFixture.localStorage.getItem("sto_keybind_settings"),
    );
    expect(persisted).toEqual(preferencesService.getSettings());
    expect(persisted).not.toHaveProperty("plugin:layout");

    preferencesService.destroy();
    preferencesService = new PreferencesService({
      eventBus: fixture.eventBus,
      settingsRepository: fixture.settingsRepository,
    });
    preferencesService.init();
    await preferencesService.initialStateReady;

    expect(preferencesService.getSettings()).toEqual(persisted);
    expect(preferencesService.getSettings()).not.toHaveProperty(
      "plugin:layout",
    );
  });
});
