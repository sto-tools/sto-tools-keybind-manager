import { afterEach, beforeEach, describe, expect, it } from "vitest";

import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("PreferencesService explicit save contract", () => {
  let fixture;
  let service;

  beforeEach(async () => {
    fixture = createServiceFixture();
    service = new PreferencesService({
      storage: fixture.storage,
      eventBus: fixture.eventBus,
    });
    service.init();
    await service.initialStateReady;
    fixture.storage.saveSettings.mockClear();
    fixture.eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    if (service && !service.destroyed) service.destroy();
    fixture?.destroy();
  });

  it.each([true, false])(
    "returns the storage %s result from preferences:save-settings",
    async (accepted) => {
      const before = service.getCurrentState();
      fixture.storage.saveSettings.mockReturnValueOnce(accepted);

      await expect(
        fixture.eventBus.request("preferences:save-settings"),
      ).resolves.toBe(accepted);

      expect(fixture.storage.saveSettings).toHaveBeenCalledWith(
        before.settings,
        { replace: true },
      );
      expect(service.getCurrentState()).toEqual(before);
      expect(
        fixture.eventBusFixture.getEventsOfType("preferences:saved"),
      ).toHaveLength(accepted ? 1 : 0);
      expect(
        fixture.eventBusFixture.getEventsOfType("preferences:changed"),
      ).toHaveLength(0);
      expect(
        fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
      ).toHaveLength(0);
    },
  );
});
