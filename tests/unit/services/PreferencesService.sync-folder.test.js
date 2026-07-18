import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ComponentBase from "../../../src/js/components/ComponentBase.js";
import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { createServiceFixture } from "../../fixtures/index.js";

class PreferenceSnapshotConsumer extends ComponentBase {
  constructor(eventBus) {
    super(eventBus);
    this.componentName = "PreferenceSnapshotConsumer";
  }
}

const mutation = {
  syncFolderName: "Fleet Builds",
  syncFolderPath: "Selected folder: Fleet Builds",
  syncFolderFallback: false,
  autoSync: true,
};

describe("PreferencesService sync folder mutation", () => {
  let fixture;
  let service;
  let consumers;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new PreferencesService({
      storage: fixture.storage,
      eventBus: fixture.eventBus,
    });
    consumers = [];
    service.init();
    fixture.storage.saveSettings.mockClear();
    fixture.eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    for (const consumer of consumers.reverse()) {
      if (!consumer.destroyed) consumer.destroy();
    }
    if (service && !service.destroyed) service.destroy();
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it("persists, adopts, and publishes a full cache snapshot without applying or saving", async () => {
    service.settings["plugin:layout"] = { density: "compact" };
    const applySettings = vi.spyOn(service, "applySettings");

    await expect(
      fixture.eventBus.request(
        "preferences:persist-sync-folder-settings",
        mutation,
      ),
    ).resolves.toBe(true);

    expect(fixture.storage.saveSettings).toHaveBeenCalledOnce();
    expect(fixture.storage.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        ...mutation,
        "plugin:layout": { density: "compact" },
      }),
      { replace: true },
    );
    expect(service.getSettings()).toEqual(
      expect.objectContaining({
        ...mutation,
        "plugin:layout": { density: "compact" },
      }),
    );
    expect(applySettings).not.toHaveBeenCalled();
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:loaded"),
    ).toHaveLength(1);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:saved"),
    ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toHaveLength(0);

    const consumer = new PreferenceSnapshotConsumer(fixture.eventBus);
    consumers.push(consumer);
    consumer.init();
    expect(consumer.cache.preferences).toEqual(service.getSettings());
  });

  it.each([
    ["returns false", () => false, "resolves", false],
    [
      "throws",
      () => {
        throw new Error("quota exhausted");
      },
      "rejects",
      "quota exhausted",
    ],
  ])(
    "leaves owner state and publications unchanged when persistence %s",
    async (_label, persistSettings, outcome, expected) => {
      const before = service.getCurrentState();
      fixture.storage.saveSettings.mockImplementationOnce(persistSettings);

      const request = fixture.eventBus.request(
        "preferences:persist-sync-folder-settings",
        mutation,
      );
      if (outcome === "resolves") {
        await expect(request).resolves.toBe(expected);
      } else {
        await expect(request).rejects.toThrow(expected);
      }

      expect(service.getCurrentState()).toEqual(before);
      expect(
        fixture.eventBusFixture.getEventsOfType("preferences:loaded"),
      ).toHaveLength(0);
      expect(
        fixture.eventBusFixture.getEventsOfType("preferences:saved"),
      ).toHaveLength(0);
      expect(
        fixture.eventBusFixture.getEventsOfType("preferences:changed"),
      ).toHaveLength(0);
    },
  );

  it.each([
    ["missing folder name", { ...mutation, syncFolderName: undefined }],
    ["wrong fallback flag", { ...mutation, syncFolderFallback: true }],
    ["extra field", { ...mutation, language: "de" }],
  ])("rejects %s before persistence", async (_label, payload) => {
    const before = service.getCurrentState();

    await expect(
      fixture.eventBus.request(
        "preferences:persist-sync-folder-settings",
        payload,
      ),
    ).rejects.toThrow("Invalid sync folder settings mutation");

    expect(service.getCurrentState()).toEqual(before);
    expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
  });
});
