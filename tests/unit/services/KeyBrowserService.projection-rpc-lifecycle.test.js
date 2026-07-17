import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import KeyBrowserService from "../../../src/js/components/services/KeyBrowserService.js";
import { createServiceFixture } from "../../fixtures/index.js";

const responderTopics = [
  "bindset:toggle-collapse",
  "key:categorize-by-command",
  "key:categorize-by-type",
  "key:sort",
  "key:toggle-category",
];

const retiredTopics = [
  "key:compare",
  "key:filter",
  "key:show-all",
  "key:get-all",
  "bindset:get-available",
  "bindset:get-collapsed-state",
  "key:get-all-sectional",
  "key:get-category-state",
];

const expectResponderState = (eventBus, topics, expected) => {
  for (const topic of topics) {
    expect(eventBus.hasListeners(`rpc:${topic}`)).toBe(expected);
  }
};

describe("KeyBrowserService projection responder lifecycle", () => {
  let fixture;
  let services;

  beforeEach(() => {
    fixture = createServiceFixture();
    services = [];
  });

  afterEach(() => {
    for (const service of services.reverse()) {
      if (!service.destroyed) service.destroy();
    }
    fixture.destroy();
    vi.restoreAllMocks();
  });

  const createService = () => {
    const service = new KeyBrowserService({
      eventBus: fixture.eventBus,
      i18n: { t: (key) => key },
    });
    services.push(service);
    return service;
  };

  it("never restores retired routes while reinitializing one responder set", async () => {
    const service = createService();
    const sortKeys = vi.spyOn(service, "sortKeys");

    expectResponderState(fixture.eventBus, retiredTopics, false);

    service.init();

    expect(service._responseDetachFunctions).toHaveLength(
      responderTopics.length,
    );
    expectResponderState(fixture.eventBus, responderTopics, true);
    expectResponderState(fixture.eventBus, retiredTopics, false);
    await service.request("key:sort", { keys: ["F2", "F1"] });
    expect(sortKeys).toHaveBeenCalledOnce();

    service.destroy();

    expect(service._responseDetachFunctions).toEqual([]);
    expectResponderState(fixture.eventBus, responderTopics, false);
    expectResponderState(fixture.eventBus, retiredTopics, false);

    service.init();

    expect(service._responseDetachFunctions).toHaveLength(
      responderTopics.length,
    );
    expectResponderState(fixture.eventBus, responderTopics, true);
    expectResponderState(fixture.eventBus, retiredTopics, false);
    await service.request("key:sort", { keys: ["F4", "F3"] });
    expect(sortKeys).toHaveBeenCalledTimes(2);
  });

  it("transfers the remaining responder ownership to a replacement instance", async () => {
    const predecessor = createService();
    const predecessorSort = vi.spyOn(predecessor, "sortKeys");
    predecessor.init();

    predecessor.destroy();
    const replacement = createService();
    const replacementSort = vi.spyOn(replacement, "sortKeys");
    replacement.init();

    expect(predecessor._responseDetachFunctions).toEqual([]);
    expect(replacement._responseDetachFunctions).toHaveLength(
      responderTopics.length,
    );
    expectResponderState(fixture.eventBus, responderTopics, true);
    expectResponderState(fixture.eventBus, retiredTopics, false);

    await replacement.request("key:sort", { keys: ["F10", "F2"] });

    expect(predecessorSort).not.toHaveBeenCalled();
    expect(replacementSort).toHaveBeenCalledOnce();
  });
});
