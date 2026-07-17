import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ComponentBase from "../../../src/js/components/ComponentBase.js";
import SelectionService from "../../../src/js/components/services/SelectionService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createRealEventBusFixture } from "../../fixtures/core/eventBus.js";

class SelectionRaceConsumer extends ComponentBase {
  constructor(eventBus) {
    super(eventBus);
    this.componentName = "SelectionRaceConsumer";
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

describe("SelectionService intent races", () => {
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
    consumer = new SelectionRaceConsumer(eventBus);
    consumer.init();
  });

  afterEach(() => {
    if (consumer && !consumer.destroyed) consumer.destroy();
    if (service && !service.destroyed) service.destroy();
    for (const detach of detaches) detach();
    eventBusFixture.destroy();
    vi.restoreAllMocks();
  });

  async function activateProfile(profile) {
    await eventBus.emit("profile:switched", {
      fromProfile: null,
      toProfile: profile.id,
      profileId: profile.id,
      profile,
      environment: profile.environment,
      timestamp: Date.now(),
    });
    await nextTimer();
  }

  it("reuses an in-flight selection write when switching environments", async () => {
    const profile = createProfile({
      selections: { space: "S0", ground: "G0" },
      spaceKeys: { S0: [], S1: [] },
      groundKeys: { G0: [] },
    });
    await activateProfile(profile);

    const blockedWrite = createDeferred();
    const updateRequests = [];
    let durableSelections = { ...profile.selections };
    detaches.push(
      respond(eventBus, "data:update-profile", async (payload) => {
        updateRequests.push(payload);
        await blockedWrite.promise;
        durableSelections = { ...payload.updates.properties.selections };
        return { success: true, profile };
      }),
    );

    const pendingSelection = service.selectKey("S1");
    await vi.waitFor(() => expect(updateRequests).toHaveLength(1));

    const environmentSwitch = eventBus.emit(
      "environment:changed",
      {
        environment: "ground",
        fromEnvironment: "space",
        source: "test",
      },
      { synchronous: true },
    );
    expect(updateRequests).toHaveLength(1);

    blockedWrite.resolve();
    await Promise.all([pendingSelection, environmentSwitch]);
    await nextTimer();

    expect(updateRequests).toHaveLength(1);
    expect(updateRequests[0].updates.properties.selections).toEqual({
      space: "S1",
      ground: "G0",
    });
    expect(durableSelections).toEqual({ space: "S1", ground: "G0" });
    expect(service.cache).toMatchObject({
      currentEnvironment: "ground",
      selectedKey: "G0",
      cachedSelections: { space: "S1", ground: "G0" },
      profile: { selections: { space: "S1", ground: "G0" } },
    });
    expect(consumer.cache).toMatchObject({
      currentEnvironment: "ground",
      selectedKey: "G0",
      cachedSelections: { space: "S1", ground: "G0" },
    });
  });

  it("restores the last successful key after the newest write fails", async () => {
    const profile = createProfile({
      selections: { space: "S0" },
      spaceKeys: { S0: [], S1: [], S2: [] },
    });
    await activateProfile(profile);

    const updateRequests = [];
    const snapshots = [];
    const keyEvents = [];
    let durableSelections = { ...profile.selections };
    detaches.push(
      respond(eventBus, "data:update-profile", (payload) => {
        updateRequests.push(payload);
        if (updateRequests.length === 2) throw new Error("write rejected");
        durableSelections = { ...payload.updates.properties.selections };
        return { success: true, profile };
      }),
      eventBus.on("selection:state-changed", (payload) =>
        snapshots.push(payload),
      ),
      eventBus.on("key-selected", (payload) => keyEvents.push(payload)),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const firstSelection = service.selectKey("S1");
    const newestSelection = service.selectKey("S2");
    await Promise.all([firstSelection, newestSelection]);

    expect(updateRequests).toHaveLength(2);
    expect(durableSelections).toEqual({ space: "S1" });
    expect(service.cache).toMatchObject({
      selectedKey: "S1",
      cachedSelections: { space: "S1" },
      profile: { selections: { space: "S1" } },
    });
    expect(consumer.cache).toMatchObject({
      selectedKey: "S1",
      cachedSelections: { space: "S1" },
    });
    expect(snapshots.at(-1)).toMatchObject({
      selectedKey: "S1",
      cachedSelections: { space: "S1" },
    });
    expect(keyEvents.at(-1)).toEqual({
      key: "S1",
      environment: "space",
      bindset: null,
      source: "SelectionService",
    });
    expect(snapshots).not.toContainEqual(
      expect.objectContaining({ selectedKey: "S2" }),
    );
    expect(keyEvents).not.toContainEqual(
      expect.objectContaining({ key: "S2" }),
    );
  });

  it("restores the last successful alias after the newest write fails", async () => {
    const profile = createProfile({
      environment: "alias",
      selections: { alias: "Alpha" },
      aliases: {
        Alpha: { type: "user" },
        Beta: { type: "user" },
        Gamma: { type: "user" },
      },
    });
    await activateProfile(profile);

    const updateRequests = [];
    const snapshots = [];
    const aliasEvents = [];
    let durableSelections = { ...profile.selections };
    detaches.push(
      respond(eventBus, "data:update-profile", (payload) => {
        updateRequests.push(payload);
        if (updateRequests.length === 2) throw new Error("write rejected");
        durableSelections = { ...payload.updates.properties.selections };
        return { success: true, profile };
      }),
      eventBus.on("selection:state-changed", (payload) =>
        snapshots.push(payload),
      ),
      eventBus.on("alias-selected", (payload) => aliasEvents.push(payload)),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const firstSelection = service.selectAlias("Beta");
    const newestSelection = service.selectAlias("Gamma");
    await Promise.all([firstSelection, newestSelection]);

    expect(updateRequests).toHaveLength(2);
    expect(durableSelections).toEqual({ alias: "Beta" });
    expect(service.cache).toMatchObject({
      selectedKey: null,
      selectedAlias: "Beta",
      cachedSelections: { alias: "Beta" },
      profile: { selections: { alias: "Beta" } },
    });
    expect(consumer.cache).toMatchObject({
      selectedKey: null,
      selectedAlias: "Beta",
      cachedSelections: { alias: "Beta" },
    });
    expect(snapshots.at(-1)).toMatchObject({
      selectedAlias: "Beta",
      cachedSelections: { alias: "Beta" },
    });
    expect(aliasEvents.at(-1)).toEqual({
      name: "Beta",
      source: "SelectionService",
    });
    expect(snapshots).not.toContainEqual(
      expect.objectContaining({ selectedAlias: "Gamma" }),
    );
    expect(aliasEvents).not.toContainEqual(
      expect.objectContaining({ name: "Gamma" }),
    );
  });
});
