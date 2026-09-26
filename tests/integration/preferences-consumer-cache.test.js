import { afterEach, describe, expect, it } from "vitest";

import ImportService from "../../src/js/components/services/ImportService.js";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import ImportUI from "../../src/js/components/ui/ImportUI.js";
import { createServiceFixture } from "../fixtures/index.js";

describe("preferences consumer cache lifecycle", () => {
  let fixture;
  let preferencesService;
  let importService;
  let importUI;

  afterEach(() => {
    importUI?.destroy();
    preferencesService?.destroy();
    importService?.destroy();
    fixture?.destroy();
  });

  it("hydrates consumers initialized on either side of the settings owner", async () => {
    fixture = createServiceFixture();
    fixture.storageFixture.localStorage.setItem(
      "sto_keybind_settings",
      JSON.stringify({
        bindsetsEnabled: false,
        language: "en",
      }),
    );

    // A consumer initialized before the owner still receives its startup
    // publication; production normally takes the late-join path below.
    importService = new ImportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
    });
    importService.init();
    expect(importService.cache.preferences.bindsetsEnabled).toBeUndefined();

    preferencesService = new PreferencesService({
      eventBus: fixture.eventBus,
      settingsRepository: fixture.settingsRepository,
    });
    preferencesService.init();
    await preferencesService.initialStateReady;
    expect(importService.cache.preferences.bindsetsEnabled).toBe(false);

    // ImportUI starts after PreferencesService in production. Its registration
    // handshake receives the owner's current snapshot even though it missed
    // the startup publication.
    importUI = new ImportUI({ eventBus: fixture.eventBus, document });
    importUI.init();
    expect(importUI.cache.preferences.bindsetsEnabled).toBe(false);
    expect(importUI.isBindsetsEnabled()).toBe(false);

    await expect(
      preferencesService.setExtensionSetting("plugin:layout", {
        panels: [{ id: "commands", visible: true }],
      }),
    ).resolves.toBe(true);
    importService.cache.preferences["plugin:layout"].panels[0].visible = false;
    expect(importUI.cache.preferences["plugin:layout"]).toEqual({
      panels: [{ id: "commands", visible: true }],
    });
    expect(preferencesService.getSetting("plugin:layout")).toEqual({
      panels: [{ id: "commands", visible: true }],
    });

    expect(fixture.eventBus.hasListeners("rpc:preferences:get-settings")).toBe(
      false,
    );
    expect(
      fixture
        .getEventHistory()
        .filter(({ event }) => event === "rpc:preferences:get-settings"),
    ).toHaveLength(0);
  });
});
