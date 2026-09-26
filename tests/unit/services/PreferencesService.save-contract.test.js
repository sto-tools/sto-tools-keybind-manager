import { afterEach, beforeEach, describe, expect, it } from "vitest";

import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("PreferencesService explicit save contract", () => {
  let fixture;
  let service;

  beforeEach(async () => {
    fixture = createServiceFixture();
    service = new PreferencesService({
      settingsRepository: fixture.settingsRepository,
      eventBus: fixture.eventBus,
    });
    service.init();
    await service.initialStateReady;
    fixture.settingsRepository.replace.mockClear();
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
      fixture.settingsRepository.replace.mockReturnValueOnce(
        accepted
          ? {
              status: "committed",
              value: structuredClone(before.settings),
              write: { status: "acknowledged" },
              verification: { status: "verified" },
            }
          : {
              status: "rejected",
              error: "invalid_data",
              write: { status: "not_attempted" },
              verification: { status: "not_attempted" },
            },
      );

      await expect(
        fixture.eventBus.request("preferences:save-settings"),
      ).resolves.toBe(accepted);

      expect(fixture.settingsRepository.replace).toHaveBeenCalledWith(
        before.settings,
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

  it("adopts a changed verified repository result before its saved receipt", async () => {
    const before = service.getCurrentState();
    const accepted = {
      ...service.getSettings(),
      maxUndoSteps: 75,
      normalizedExtension: { revision: 1 },
    };
    fixture.settingsRepository.replace.mockReturnValueOnce({
      status: "committed",
      value: accepted,
      write: { status: "acknowledged" },
      verification: { status: "verified" },
    });
    const order = [];
    fixture.eventBus.on("preferences:state-changed", () => order.push("state"));
    fixture.eventBus.on("preferences:saved", ({ settings }) => {
      order.push("saved");
      expect(service.getSettings()).toEqual(accepted);
      expect(service.getCurrentState().settings).toEqual(settings);
    });
    await expect(service.saveSettings()).resolves.toBe(true);
    expect(service.getCurrentState().revision).toBe(before.revision + 1);
    expect(service.getCurrentState().settings).toEqual(accepted);
    expect(order).toEqual(["state", "saved"]);
    accepted.normalizedExtension.revision = 99;
    expect(service.getSetting("normalizedExtension")).toEqual({ revision: 1 });
  });
});
