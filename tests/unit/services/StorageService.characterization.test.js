import { afterEach, describe, expect, it, vi } from "vitest";

import StorageService from "../../../src/js/components/services/StorageService.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";

const RETIRED_PROJECT_METHODS = [
  "getAllData",
  "saveAllData",
  "getProfile",
  "saveProfile",
  "deleteProfile",
  "invalidateCache",
  "getDefaultData",
  "migrateData",
];

describe("StorageService retired project authority", () => {
  let fixture;
  let service;

  afterEach(() => {
    if (service && !service.destroyed) service.destroy();
    fixture?.destroy();
    localStorage.clear();
  });

  it("exposes no project-root, profile, settings, or cache operations", () => {
    fixture = createEventBusFixture();
    service = new StorageService({ eventBus: fixture.eventBus });

    for (const method of RETIRED_PROJECT_METHODS) {
      expect(service[method], method).toBeUndefined();
    }
    expect(service.getSettings).toBeUndefined();
    expect(service.saveSettings).toBeUndefined();
    expect(service.clearSettings).toBeUndefined();
  });

  it("initializes without reading, writing, or publishing persisted state", () => {
    fixture = createEventBusFixture();
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    service = new StorageService({ eventBus: fixture.eventBus });

    service.init();

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(fixture.getEventsOfType("storage:data-changed")).toEqual([]);
  });
});
