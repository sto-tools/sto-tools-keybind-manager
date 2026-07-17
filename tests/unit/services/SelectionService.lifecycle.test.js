import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ComponentBase from "../../../src/js/components/ComponentBase.js";
import SelectionService from "../../../src/js/components/services/SelectionService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createRealEventBusFixture } from "../../fixtures/core/eventBus.js";

const retiredSelectionActionTopics = [
  "selection:auto-select-first",
  "selection:clear",
  "selection:set-editing-context",
];

class SelectionLifecycleConsumer extends ComponentBase {
  constructor(eventBus) {
    super(eventBus);
    this.componentName = "SelectionLifecycleConsumer";
  }
}

function createProfile({
  environment = "space",
  selections = {},
  spaceKeys = {},
  groundKeys = {},
  aliases = {},
} = {}) {
  return {
    id: "profile-a",
    name: "profile-a",
    environment,
    currentEnvironment: environment,
    builds: {
      space: { keys: spaceKeys },
      ground: { keys: groundKeys },
    },
    aliases,
    selections,
  };
}

function nextTimer() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("SelectionService lifecycle", () => {
  let eventBusFixture;
  let eventBus;
  let service;
  let consumer;
  let detaches;

  beforeEach(async () => {
    eventBusFixture = await createRealEventBusFixture();
    eventBus = eventBusFixture.eventBus;
    detaches = [];

    service = new SelectionService({ eventBus });
    await service.init();
    consumer = new SelectionLifecycleConsumer(eventBus);
    consumer.init();
  });

  afterEach(() => {
    if (consumer && !consumer.destroyed) consumer.destroy();
    if (service && !service.destroyed) service.destroy();
    for (const detach of detaches) detach();
    eventBusFixture.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps internal selection actions off the RPC surface", () => {
    expect(eventBus.hasListeners("rpc:selection:select-key")).toBe(true);
    for (const topic of retiredSelectionActionTopics) {
      expect(eventBus.hasListeners(`rpc:${topic}`), topic).toBe(false);
    }
  });

  it("drops queued persistence and state commits after destruction", async () => {
    const profile = createProfile({
      selections: { space: "S0" },
      spaceKeys: { S0: [], S1: [], S2: [] },
    });
    await eventBus.emit("profile:switched", {
      fromProfile: null,
      toProfile: profile.id,
      profileId: profile.id,
      profile,
      environment: profile.environment,
      timestamp: Date.now(),
    });
    await nextTimer();

    const blockedWrite = createDeferred();
    const updateRequests = [];
    const snapshots = [];
    const keyEvents = [];
    detaches.push(
      respond(eventBus, "data:update-profile", async (payload) => {
        updateRequests.push(payload);
        await blockedWrite.promise;
        return { success: true, profile };
      }),
      eventBus.on("selection:state-changed", (payload) =>
        snapshots.push(payload),
      ),
      eventBus.on("key-selected", (payload) => keyEvents.push(payload)),
    );

    const firstSelection = service.selectKey("S1");
    const secondSelection = service.selectKey("S2");
    await vi.waitFor(() => expect(updateRequests).toHaveLength(1));

    service.destroy();
    blockedWrite.resolve();
    await Promise.all([firstSelection, secondSelection]);
    await nextTimer();

    expect(updateRequests).toHaveLength(1);
    expect(updateRequests[0].updates.properties.selections).toEqual({
      space: "S1",
    });
    expect(snapshots).toEqual([]);
    expect(keyEvents).toEqual([]);
    expect(service.cache.selectedKey).toBe("S0");
    expect(service.cachedSelections.space).toBe("S0");
    expect(service.cache.cachedSelections.space).toBe("S0");
    expect(service.cache.profile.selections.space).toBe("S0");
    expect(consumer.cache.cachedSelections.space).toBe("S0");
  });

  it("finishes a queued profile correction after destruction", async () => {
    const profile = createProfile({
      selections: { space: "S0" },
      spaceKeys: { S0: [], S1: [], S2: [] },
    });
    await eventBus.emit("profile:switched", {
      fromProfile: null,
      toProfile: profile.id,
      profileId: profile.id,
      profile,
      environment: profile.environment,
      timestamp: Date.now(),
    });
    await nextTimer();

    const blockedWrite = createDeferred();
    const updateRequests = [];
    const snapshots = [];
    const keyEvents = [];
    let durableSelections = { ...profile.selections };
    detaches.push(
      respond(eventBus, "data:update-profile", async (payload) => {
        updateRequests.push(payload);
        if (updateRequests.length === 1) await blockedWrite.promise;
        durableSelections = { ...payload.updates.properties.selections };
        return { success: true, profile };
      }),
      eventBus.on("selection:state-changed", (payload) =>
        snapshots.push(payload),
      ),
      eventBus.on("key-selected", (payload) => keyEvents.push(payload)),
    );

    const staleSelection = service.selectKey("S1");
    const queuedSelection = service.selectKey("S2");
    await vi.waitFor(() => expect(updateRequests).toHaveLength(1));

    const importedProfile = createProfile({
      selections: { space: "Imported" },
      spaceKeys: { Imported: [] },
    });
    await eventBus.emit("profile:updated", {
      profileId: profile.id,
      profile: importedProfile,
      source: "test",
    });
    await nextTimer();
    snapshots.length = 0;
    keyEvents.length = 0;

    service.destroy();
    blockedWrite.resolve();
    await Promise.all([staleSelection, queuedSelection]);
    await vi.waitFor(() => expect(updateRequests).toHaveLength(2));

    expect(updateRequests.map((request) => request.updates.properties)).toEqual(
      [{ selections: { space: "S1" } }, { selections: { space: "Imported" } }],
    );
    expect(durableSelections).toEqual({ space: "Imported" });
    expect(service.cache).toMatchObject({
      selectedKey: "Imported",
      cachedSelections: { space: "Imported" },
      profile: { selections: { space: "Imported" } },
    });
    expect(snapshots).toEqual([]);
    expect(keyEvents).toEqual([]);
  });

  it("does not schedule environment persistence after destruction", async () => {
    vi.useFakeTimers();

    const profile = createProfile({
      environment: "alias",
      selections: { ground: "G1", alias: "Alpha" },
      groundKeys: { G1: [] },
      aliases: { Alpha: { type: "user" } },
    });
    service.cache.currentProfile = profile.id;
    service.cache.profile = profile;
    service.cache.currentEnvironment = "alias";
    service.selectionEnvironment = "alias";
    service.cache.selectedAlias = "Alpha";
    service.cache.aliases = profile.aliases;
    service.cache.builds = profile.builds;
    service.cachedSelections = {
      space: null,
      ground: "G1",
      alias: "Alpha",
    };
    service.cache.cachedSelections = { ...service.cachedSelections };

    const updateRequests = [];
    detaches.push(
      respond(eventBus, "data:update-profile", (payload) => {
        updateRequests.push(payload);
        return { success: true, profile };
      }),
    );

    await service.switchEnvironment("ground", "alias");

    const requestsBeforeDestroy = updateRequests.length;
    expect(requestsBeforeDestroy).toBeGreaterThan(0);
    service.destroy();

    await vi.advanceTimersByTimeAsync(10);

    expect(updateRequests).toHaveLength(requestsBeforeDestroy);
  });
});
