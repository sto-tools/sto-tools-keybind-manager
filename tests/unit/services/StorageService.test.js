import { afterEach, describe, expect, it } from "vitest";

import StorageService from "../../../src/js/components/services/StorageService.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";

describe("StorageService retirement shell", () => {
  let fixture;
  let service;

  afterEach(() => {
    if (service && !service.destroyed) service.destroy();
    fixture?.destroy();
    localStorage.clear();
  });

  it("retains only ComponentBase lifecycle compatibility", () => {
    fixture = createEventBusFixture();
    service = new StorageService({ eventBus: fixture.eventBus });

    expect(service.componentName).toBe("StorageService");
    expect(service.isInitialized()).toBe(false);
    service.init();
    expect(service.isInitialized()).toBe(true);
    service.destroy();
    expect(service.destroyed).toBe(true);
  });
});
