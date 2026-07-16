import { afterEach, beforeEach, describe, expect, it } from "vitest";

import BindsetService from "../../../src/js/components/services/BindsetService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const responderTopics = [
  "bindset:create",
  "bindset:clone",
  "bindset:rename",
  "bindset:delete",
  "bindset:delete-with-keys",
  "bindset:get-key-commands",
];

describe("BindsetService responder lifecycle", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new BindsetService({ eventBus: fixture.eventBus });
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
  });

  it("owns all responders only while initialized", () => {
    for (const topic of responderTopics) {
      expect(fixture.eventBus.hasListeners(`rpc:${topic}`)).toBe(false);
    }

    service.init();

    expect(service._responseDetachFunctions).toHaveLength(
      responderTopics.length,
    );
    for (const topic of responderTopics) {
      expect(fixture.eventBus.hasListeners(`rpc:${topic}`)).toBe(true);
    }

    service.destroy();

    expect(service._responseDetachFunctions).toEqual([]);
    for (const topic of responderTopics) {
      expect(fixture.eventBus.hasListeners(`rpc:${topic}`)).toBe(false);
    }
  });

  it("restores one responder set when the same instance is reinitialized", () => {
    service.init();
    service.destroy();

    service.init();

    expect(service._responseDetachFunctions).toHaveLength(
      responderTopics.length,
    );
    for (const topic of responderTopics) {
      expect(fixture.eventBus.hasListeners(`rpc:${topic}`)).toBe(true);
    }
  });
});
