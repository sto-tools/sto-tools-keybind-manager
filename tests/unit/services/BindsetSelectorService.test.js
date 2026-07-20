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

  it("adds the selected key before publishing the retained bindset events", async () => {
    service.init();
    service.cache.selectedKey = "F1";
    service.cache.currentEnvironment = "space";
    service.cache.profile = { id: "profile-1" };
    fixture.eventBus.mockResponse("data:update-profile", () => ({
      success: true,
    }));
    fixture.eventBusFixture.clearEventHistory();

    await expect(service.addKeyToBindset("Weapons")).resolves.toEqual({
      success: true,
    });

    expect(service.keyBindsetMembership.get("Weapons")).toBe(true);
    expect(
      fixture.eventBusFixture
        .getEventHistory()
        .filter(({ event }) =>
          [
            "bindset-selector:active-changed",
            "bindset-selector:key-added",
          ].includes(event),
        )
        .map(({ event, data }) => ({ event, data })),
    ).toEqual([
      {
        event: "bindset-selector:active-changed",
        data: { bindset: "Weapons" },
      },
      {
        event: "bindset-selector:key-added",
        data: { key: "F1", bindset: "Weapons", environment: "space" },
      },
    ]);
    expect(
      fixture.eventBusFixture.getEventsOfType("bindset-operation:started"),
    ).toEqual([]);
    expect(
      fixture.eventBusFixture.getEventsOfType("bindset-operation:completed"),
    ).toEqual([]);
  });

  it("owns the active-bindset reset after removing the selected key", async () => {
    service.init();
    service.cache.selectedKey = "F1";
    service.cache.currentEnvironment = "space";
    service.cache.activeBindset = "Weapons";
    service.cache.profile = { id: "profile-1" };
    fixture.eventBus.mockResponse("data:update-profile", () => ({
      success: true,
    }));
    fixture.eventBusFixture.clearEventHistory();

    await expect(service.removeKeyFromBindset("Weapons")).resolves.toEqual({
      success: true,
    });

    expect(service.cache.activeBindset).toBe("Primary Bindset");
    expect(service.keyBindsetMembership.get("Weapons")).toBe(false);
    expect(
      fixture.eventBusFixture
        .getEventHistory()
        .filter(({ event }) =>
          [
            "bindset-selector:key-removed",
            "bindset-selector:active-changed",
          ].includes(event),
        )
        .map(({ event, data }) => ({ event, data })),
    ).toEqual([
      {
        event: "bindset-selector:key-removed",
        data: { key: "F1", bindset: "Weapons", environment: "space" },
      },
      {
        event: "bindset-selector:active-changed",
        data: { bindset: "Primary Bindset" },
      },
    ]);
  });

  it("does not reset the active bindset when key removal is rejected", async () => {
    service.init();
    service.cache.selectedKey = "F1";
    service.cache.currentEnvironment = "space";
    service.cache.activeBindset = "Weapons";
    service.cache.profile = { id: "profile-1" };
    fixture.eventBus.mockResponse("data:update-profile", () => ({
      success: false,
      error: "persistence_failed",
    }));
    fixture.eventBusFixture.clearEventHistory();

    await expect(service.removeKeyFromBindset("Weapons")).resolves.toEqual({
      success: false,
      error: "persistence_failed",
    });

    expect(service.cache.activeBindset).toBe("Weapons");
    expect(
      fixture.eventBusFixture
        .getEventHistory()
        .filter(({ event }) => event.startsWith("bindset-selector:")),
    ).toEqual([]);
  });

  it("resets active bindset state directly when the profile changes", () => {
    service.init();
    service.cache.activeBindset = "Weapons";
    service.updateKeyMembership = vi.fn();
    fixture.eventBusFixture.clearEventHistory();

    fixture.eventBus.emit("profile:switched", {
      profileId: "profile-2",
      profile: {
        id: "profile-2",
        builds: { space: { keys: {} }, ground: { keys: {} } },
        aliases: {},
      },
      environment: "space",
    });

    expect(service.cache.activeBindset).toBe("Primary Bindset");
    expect(service.updateKeyMembership).toHaveBeenCalledOnce();
    expect(
      fixture.eventBusFixture.getEventsOfType(
        "bindset-selector:active-changed",
      ),
    ).toHaveLength(1);
  });
});
