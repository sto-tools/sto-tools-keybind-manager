import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("PreferencesService explicit save contract", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new PreferencesService({
      storage: fixture.storage,
      eventBus: fixture.eventBus,
    });
    service.init();
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
    },
  );

  it("remains pending until asynchronous saved consumers settle", async () => {
    /** @type {() => void} */
    let releaseSavedConsumer = () => {};
    const savedConsumerReleased = new Promise((resolve) => {
      releaseSavedConsumer = resolve;
    });
    let savedConsumerStarted = false;
    const detachSavedConsumer = fixture.eventBus.on(
      "preferences:saved",
      async () => {
        savedConsumerStarted = true;
        await savedConsumerReleased;
      },
    );

    const save = fixture.eventBus.request("preferences:save-settings");
    let settled = false;
    void save.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    try {
      await vi.waitFor(() => {
        expect(savedConsumerStarted).toBe(true);
      });
      await Promise.resolve();

      expect(settled).toBe(false);
      expect(fixture.storage.saveSettings).toHaveBeenCalledOnce();
      expect(
        fixture.eventBusFixture.getEventsOfType("preferences:saved"),
      ).toHaveLength(1);

      releaseSavedConsumer();
      await expect(save).resolves.toBe(true);
    } finally {
      detachSavedConsumer();
      releaseSavedConsumer();
      await save.catch(() => undefined);
    }
  });
});
