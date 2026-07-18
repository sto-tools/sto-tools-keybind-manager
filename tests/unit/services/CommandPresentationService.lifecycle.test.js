import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommandPresentationService from "../../../src/js/components/services/CommandPresentationService.js";
import { createServiceFixture } from "../../fixtures/index.js";

function createStorage() {
  const entries = new Map();
  return {
    key: vi.fn((index) => [...entries.keys()][index] ?? null),
    getItem: vi.fn((key) => entries.get(key) ?? null),
    setItem: vi.fn((key, value) => entries.set(key, String(value))),
    removeItem: vi.fn((key) => entries.delete(key)),
    get length() {
      return entries.size;
    },
  };
}

const topics = [
  "command-presentation:toggle-category",
  "command-presentation:toggle-group",
];

function expectResponders(eventBus, expected) {
  for (const topic of topics) {
    expect(eventBus.hasListeners(`rpc:${topic}`), topic).toBe(expected);
  }
}

describe("CommandPresentationService lifecycle", () => {
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

  function createService() {
    const service = new CommandPresentationService({
      eventBus: fixture.eventBus,
      localStorage: createStorage(),
    });
    services.push(service);
    return service;
  }

  it("owns exactly one responder set across destroy and reinitialize", async () => {
    const service = createService();
    const constructionEpoch = service.getCurrentState().authorityEpoch;
    expect(service._responseDetachFunctions).toHaveLength(2);
    expectResponders(fixture.eventBus, true);

    service.init();
    const firstInitEpoch = service.getCurrentState().authorityEpoch;
    expect(firstInitEpoch).toBeGreaterThan(constructionEpoch);
    expect(service._responseDetachFunctions).toHaveLength(2);
    expectResponders(fixture.eventBus, true);
    await service.request("command-presentation:toggle-category", {
      categoryId: "system",
    });
    expect(service.getCurrentState().revision).toBe(1);

    service.destroy();
    expect(service._responseDetachFunctions).toEqual([]);
    expectResponders(fixture.eventBus, false);

    service.init();
    expect(service.getCurrentState()).toMatchObject({
      authorityEpoch: expect.any(Number),
      revision: 0,
      collapsedCategories: ["system"],
    });
    expect(service.getCurrentState().authorityEpoch).toBeGreaterThan(
      firstInitEpoch,
    );
    expect(service._responseDetachFunctions).toHaveLength(2);
    expectResponders(fixture.eventBus, true);
  });

  it("transfers responder ownership to a replacement instance", async () => {
    const predecessor = createService();
    const predecessorToggle = vi.spyOn(predecessor, "toggleGroup");
    predecessor.init();
    predecessor.destroy();

    const replacement = createService();
    const replacementToggle = vi.spyOn(replacement, "toggleGroup");
    replacement.init();

    expect(predecessor._responseDetachFunctions).toEqual([]);
    expect(replacement._responseDetachFunctions).toHaveLength(2);
    expectResponders(fixture.eventBus, true);
    await replacement.request("command-presentation:toggle-group", {
      groupType: "palindromic",
    });
    expect(predecessorToggle).not.toHaveBeenCalled();
    expect(replacementToggle).toHaveBeenCalledExactlyOnceWith("palindromic");
  });
});
