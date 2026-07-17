import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BindsetSelectorService from "../../../src/js/components/services/BindsetSelectorService.js";
import { createServiceFixture } from "../../fixtures/index.js";

describe("BindsetSelectorService key lookup", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
    service = new BindsetSelectorService({ eventBus: fixture.eventBus });
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
  });

  it("does not expose its internal lookup helper as an RPC", () => {
    expect(
      fixture.eventBus.hasListeners("rpc:bindset-selector:find-key-in-bindset"),
    ).toBe(false);
  });

  it("owns retained responders and canonical selection across its lifecycle", () => {
    const retainedTopics = [
      "bindset-selector:add-key-to-bindset",
      "bindset-selector:remove-key-from-bindset",
      "bindset-selector:set-active-bindset",
    ];

    expect(fixture.eventBus.hasListeners("rpc:bindset-selector:set-key")).toBe(
      false,
    );
    for (const topic of retainedTopics) {
      expect(fixture.eventBus.getListenerCount(`rpc:${topic}`)).toBe(0);
    }

    service.init();
    for (const topic of retainedTopics) {
      expect(fixture.eventBus.getListenerCount(`rpc:${topic}`)).toBe(1);
    }

    service.updateKeyMembership = vi.fn();
    fixture.eventBus.emit("key-selected", {
      key: "F1",
      environment: "space",
      source: "SelectionService",
    });

    expect(service.cache.selectedKey).toBe("F1");
    expect(service.updateKeyMembership).toHaveBeenCalledTimes(1);
    expect(fixture.eventBus.hasListeners("rpc:bindset-selector:set-key")).toBe(
      false,
    );

    service.destroy();
    for (const topic of retainedTopics) {
      expect(fixture.eventBus.getListenerCount(`rpc:${topic}`)).toBe(0);
    }
    expect(fixture.eventBus.getListenerCount("key-selected")).toBe(0);

    service.init();
    for (const topic of retainedTopics) {
      expect(fixture.eventBus.getListenerCount(`rpc:${topic}`)).toBe(1);
    }
    expect(fixture.eventBus.getListenerCount("key-selected")).toBe(2);

    const replacement = new BindsetSelectorService({
      eventBus: fixture.eventBus,
    });
    service.destroy();
    replacement.init();

    for (const topic of retainedTopics) {
      expect(fixture.eventBus.getListenerCount(`rpc:${topic}`)).toBe(1);
    }
    expect(fixture.eventBus.getListenerCount("key-selected")).toBe(2);
    replacement.destroy();
  });

  it("preserves exact lookup for primary and named bindset membership", async () => {
    const primaryCommands = ["FireAll"];
    const namedCommands = ["Target_Enemy_Near"];

    expect(service.findKeyInBindset({ F1: primaryCommands }, "F1")).toBe(
      primaryCommands,
    );
    expect(service.findKeyInBindset({ F1: primaryCommands }, "F2")).toBeNull();
    expect(service.findKeyInBindset(undefined, "F1")).toBeNull();

    service.cache.selectedKey = "F1";
    service.cache.currentEnvironment = "space";
    service.cache.profile = {
      builds: { space: { keys: { F1: primaryCommands } } },
      bindsets: {
        Weapons: { space: { keys: { F1: namedCommands } } },
      },
    };

    await expect(service.keyExistsInBindset("Primary Bindset")).resolves.toBe(
      true,
    );
    await expect(service.keyExistsInBindset("Weapons")).resolves.toBe(true);
    await expect(service.keyExistsInBindset("Missing")).resolves.toBe(false);
  });

  it("clears stale membership when the canonical selection is cleared", () => {
    service.init();
    service.keyBindsetMembership.set("Primary Bindset", true);

    fixture.eventBus.emit("key-selected", {
      key: null,
      source: "SelectionService",
    });

    expect(service.cache.selectedKey).toBeNull();
    expect(service.keyBindsetMembership.size).toBe(0);
    expect(
      fixture.eventBusFixture.getEventsOfType(
        "bindset-selector:membership-updated",
      ),
    ).toEqual([
      {
        event: "bindset-selector:membership-updated",
        data: { key: null, membership: new Map() },
        timestamp: expect.any(Number),
      },
    ]);
  });
});
