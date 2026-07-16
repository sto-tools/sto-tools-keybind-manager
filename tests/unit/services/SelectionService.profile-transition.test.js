import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ComponentBase from "../../../src/js/components/ComponentBase.js";
import SelectionService from "../../../src/js/components/services/SelectionService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createRealEventBusFixture } from "../../fixtures/core/eventBus.js";

class ProfileTransitionConsumer extends ComponentBase {
  constructor(eventBus) {
    super(eventBus);
    this.componentName = "ProfileTransitionConsumer";
    this.keySelections = [];
  }

  onInit() {
    this.addEventListener("key-selected", ({ key, source }) => {
      if (source !== "SelectionService") return;
      this.keySelections.push({
        key,
        profileId: this.cache.currentProfile,
      });
    });
  }
}

function createProfile({
  id,
  environment = "space",
  selections = {},
  spaceKeys = {},
  groundKeys = {},
  aliases = {},
}) {
  return {
    id,
    name: id,
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

const dataStateRevisions = new WeakMap();

async function emitProfileSwitch(eventBus, fromProfile, profile) {
  const revision = (dataStateRevisions.get(eventBus) || 0) + 1;
  dataStateRevisions.set(eventBus, revision);
  await eventBus.emit(
    "data:state-changed",
    {
      reason: "profile-switched",
      state: createDataCoordinatorState({
        revision,
        currentProfile: profile.id,
        currentEnvironment: profile.environment,
        currentProfileData: profile,
        profiles: { [profile.id]: profile },
      }),
    },
    { synchronous: true },
  );
  return eventBus.emit("profile:switched", {
    fromProfile,
    toProfile: profile.id,
    profileId: profile.id,
    profile,
    environment: profile.environment,
    timestamp: Date.now(),
  });
}

function waitForEvent(eventBus, topic) {
  return new Promise((resolve) => {
    const detach = eventBus.on(topic, (payload) => {
      detach();
      resolve(payload);
    });
  });
}

function nextTimer() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("SelectionService profile transitions", () => {
  let eventBusFixture;
  let eventBus;
  let service;
  let consumer;
  let detaches;

  beforeEach(async () => {
    eventBusFixture = await createRealEventBusFixture();
    eventBus = eventBusFixture.eventBus;
    detaches = [];
  });

  afterEach(() => {
    if (consumer && !consumer.destroyed) consumer.destroy();
    if (service && !service.destroyed) service.destroy();
    for (const detach of detaches) detach();
    eventBusFixture.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function initServiceBeforeConsumer() {
    service = new SelectionService({ eventBus });
    await service.init();

    consumer = new ProfileTransitionConsumer(eventBus);
    consumer.init();
  }

  it("publishes a profile selection only after late consumers cache the new profile", async () => {
    await initServiceBeforeConsumer();

    const profileA = createProfile({
      id: "profile-a",
      selections: { space: "F1" },
      spaceKeys: { F1: [] },
    });
    const profileB = createProfile({
      id: "profile-b",
      selections: { space: "F2" },
      spaceKeys: { F2: [] },
    });

    await emitProfileSwitch(eventBus, null, profileA);
    await nextTimer();
    consumer.keySelections.length = 0;

    await emitProfileSwitch(eventBus, profileA.id, profileB);

    expect(consumer.cache.currentProfile).toBe(profileB.id);
    expect(consumer.keySelections).toEqual([]);

    await nextTimer();

    expect(consumer.keySelections).toEqual([
      { key: "F2", profileId: profileB.id },
    ]);
    expect(consumer.cache.selectedKey).toBe("F2");
  });

  it("discards a blocked profile A auto-selection after switching to profile B", async () => {
    await initServiceBeforeConsumer();

    const profileA = createProfile({
      id: "profile-a",
      selections: { space: null },
      spaceKeys: { F1: [] },
    });
    const profileB = createProfile({
      id: "profile-b",
      selections: { space: "F2" },
      spaceKeys: { F2: [] },
    });
    const profiles = {
      [profileA.id]: profileA,
      [profileB.id]: profileB,
    };

    let markUpdateStarted;
    const updateStarted = new Promise((resolve) => {
      markUpdateStarted = resolve;
    });
    let releaseProfileAUpdate;
    const profileAUpdateBlocked = new Promise((resolve) => {
      releaseProfileAUpdate = resolve;
    });
    const updateRequests = [];

    detaches.push(
      respond(eventBus, "data:update-profile", async (payload) => {
        updateRequests.push(payload);
        if (payload.profileId === profileA.id) {
          markUpdateStarted();
          await profileAUpdateBlocked;
        }
        return {
          success: true,
          profile: profiles[payload.profileId],
        };
      }),
    );

    await emitProfileSwitch(eventBus, null, profileA);
    await updateStarted;
    consumer.keySelections.length = 0;

    await emitProfileSwitch(eventBus, profileA.id, profileB);
    await nextTimer();

    expect(consumer.cache).toMatchObject({
      currentProfile: profileB.id,
      selectedKey: "F2",
      cachedSelections: { space: "F2" },
    });

    releaseProfileAUpdate();
    await nextTimer();

    expect(updateRequests).toHaveLength(1);
    expect(updateRequests[0].profileId).toBe(profileA.id);
    expect(consumer.keySelections).toEqual([
      { key: "F2", profileId: profileB.id },
    ]);
    expect(consumer.cache).toMatchObject({
      currentProfile: profileB.id,
      selectedKey: "F2",
      cachedSelections: { space: "F2" },
    });
    expect(service.cache.selectedKey).toBe("F2");
    expect(service.cachedSelections.space).toBe("F2");
  });

  it("preserves the cached alias when switching to ground before profile readiness", async () => {
    await initServiceBeforeConsumer();

    const aliasReady = waitForEvent(eventBus, "environment:switched");
    await eventBus.emit("environment:changed", {
      environment: "alias",
      fromEnvironment: "space",
      source: "test",
    });
    await aliasReady;

    await service.selectAlias("Alpha", { skipPersistence: true });
    expect(service.cache.currentProfile).toBe(null);
    expect(service.cache.profile).toBe(null);
    expect(consumer.cache.cachedSelections.alias).toBe("Alpha");

    const aliasEvents = [];
    const snapshots = [];
    detaches.push(
      eventBus.on("alias-selected", (payload) => aliasEvents.push(payload)),
      eventBus.on("selection:state-changed", (payload) =>
        snapshots.push(payload),
      ),
    );

    const groundReady = waitForEvent(eventBus, "environment:switched");
    await eventBus.emit("environment:changed", {
      environment: "ground",
      fromEnvironment: "alias",
      source: "test",
    });
    await groundReady;

    expect(aliasEvents).toContainEqual({
      name: null,
      source: "SelectionService",
    });
    expect(snapshots).toContainEqual(
      expect.objectContaining({
        selectedAlias: null,
        currentEnvironment: "ground",
        cachedSelections: expect.objectContaining({ alias: "Alpha" }),
      }),
    );
    expect(consumer.cache).toMatchObject({
      currentEnvironment: "ground",
      selectedAlias: null,
      cachedSelections: { alias: "Alpha" },
    });
  });

  it("restores the cached ground target from an initialization event without a previous environment", async () => {
    await initServiceBeforeConsumer();

    const profile = createProfile({
      id: "profile-a",
      selections: { space: "S1", ground: "G1" },
      spaceKeys: { S1: [] },
      groundKeys: { G1: [] },
    });
    detaches.push(
      respond(eventBus, "data:update-profile", () => ({
        success: true,
        profile,
      })),
    );

    await emitProfileSwitch(eventBus, null, profile);
    await nextTimer();

    const groundReady = waitForEvent(eventBus, "environment:switched");
    await eventBus.emit("environment:changed", {
      environment: "ground",
      source: "InterfaceMode",
    });
    await groundReady;

    expect(service.selectionEnvironment).toBe("ground");
    expect(service.cache).toMatchObject({
      selectedKey: "G1",
      cachedSelections: { space: "S1", ground: "G1" },
    });
    expect(consumer.cache).toMatchObject({
      currentEnvironment: "ground",
      selectedKey: "G1",
      cachedSelections: { space: "S1", ground: "G1" },
    });
  });

  it("ignores a delayed environment event from the previous profile mode", async () => {
    await initServiceBeforeConsumer();

    const profileA = createProfile({
      id: "profile-a",
      environment: "ground",
      selections: { space: "AS", ground: "AG" },
      spaceKeys: { AS: [] },
      groundKeys: { AG: [] },
    });
    const profileB = createProfile({
      id: "profile-b",
      environment: "space",
      selections: { space: "BS", ground: "BG" },
      spaceKeys: { BS: [] },
      groundKeys: { BG: [] },
    });

    await emitProfileSwitch(eventBus, null, profileA);
    await nextTimer();
    await emitProfileSwitch(eventBus, profileA.id, profileB);
    await nextTimer();

    await eventBus.emit("environment:changed", {
      environment: "space",
      fromEnvironment: "ground",
      source: "InterfaceMode",
    });
    await nextTimer();

    expect(service.selectionEnvironment).toBe("space");
    expect(service.cache).toMatchObject({
      currentProfile: profileB.id,
      currentEnvironment: "space",
      selectedKey: "BS",
      cachedSelections: { space: "BS", ground: "BG" },
    });
    expect(consumer.cache).toMatchObject({
      currentProfile: profileB.id,
      currentEnvironment: "space",
      selectedKey: "BS",
      cachedSelections: { space: "BS", ground: "BG" },
    });
  });

  it("does not activate an invalid inactive alias after a space profile update", async () => {
    await initServiceBeforeConsumer();

    const profile = createProfile({
      id: "profile-a",
      selections: { space: "S1", alias: "OldAlias" },
      spaceKeys: { S1: [] },
      aliases: { OldAlias: { type: "user" } },
    });
    await emitProfileSwitch(eventBus, null, profile);
    await nextTimer();

    const aliasEvents = [];
    detaches.push(
      eventBus.on("alias-selected", (payload) => aliasEvents.push(payload)),
    );
    const updatedProfile = createProfile({
      id: profile.id,
      selections: { space: "S1", alias: "OldAlias" },
      spaceKeys: { S1: [] },
      aliases: { NewAlias: { type: "user" } },
    });

    await eventBus.emit("profile:updated", {
      profileId: profile.id,
      profile: updatedProfile,
      source: "test",
    });
    await nextTimer();

    expect(aliasEvents).toEqual([]);
    expect(service.selectionEnvironment).toBe("space");
    expect(service.cache).toMatchObject({
      selectedKey: "S1",
      selectedAlias: null,
      cachedSelections: { space: "S1", alias: "OldAlias" },
    });
    expect(consumer.cache).toMatchObject({
      selectedKey: "S1",
      selectedAlias: null,
      cachedSelections: { space: "S1", alias: "OldAlias" },
    });
  });

  it("keeps the restored target active when previous-slot persistence rejects", async () => {
    await initServiceBeforeConsumer();

    const profile = createProfile({
      id: "profile-a",
      selections: { space: "S1", ground: "G1" },
      spaceKeys: { S1: [] },
      groundKeys: { G1: [] },
    });
    await emitProfileSwitch(eventBus, null, profile);
    await nextTimer();

    const compatibilityTopics = [];
    detaches.push(
      respond(eventBus, "data:update-profile", () => {
        throw new Error("write rejected");
      }),
      eventBus.on("key-selected", () =>
        compatibilityTopics.push("key-selected"),
      ),
      eventBus.on("alias-selected", () =>
        compatibilityTopics.push("alias-selected"),
      ),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const groundReady = waitForEvent(eventBus, "environment:switched");
    await eventBus.emit("environment:changed", {
      environment: "ground",
      fromEnvironment: "space",
      source: "test",
    });
    await groundReady;

    expect(compatibilityTopics.at(-1)).toBe("key-selected");
    expect(service.cache).toMatchObject({
      currentEnvironment: "ground",
      selectedKey: "G1",
      cachedSelections: { space: "S1", ground: "G1" },
    });
    expect(consumer.cache).toMatchObject({
      currentEnvironment: "ground",
      selectedKey: "G1",
      cachedSelections: { space: "S1", ground: "G1" },
    });
  });

  it("serializes rapid same-profile writes so the newest selection is durable", async () => {
    await initServiceBeforeConsumer();

    const profile = createProfile({
      id: "profile-a",
      selections: { space: "S0" },
      spaceKeys: { S0: [], S1: [], S2: [] },
    });
    await emitProfileSwitch(eventBus, null, profile);
    await nextTimer();

    const firstWrite = createDeferred();
    const updateRequests = [];
    let durableSelections = { ...profile.selections };
    detaches.push(
      respond(eventBus, "data:update-profile", async (payload) => {
        updateRequests.push(payload);
        if (updateRequests.length === 1) await firstWrite.promise;
        durableSelections = {
          ...payload.updates.properties.selections,
        };
        return { success: true, profile };
      }),
    );

    const firstSelection = service.selectKey("S1");
    const secondSelection = service.selectKey("S2");
    await vi.waitFor(() => expect(updateRequests).toHaveLength(1));

    firstWrite.resolve();
    await Promise.all([firstSelection, secondSelection]);

    expect(updateRequests).toHaveLength(2);
    expect(updateRequests.map((request) => request.updates.properties)).toEqual(
      [{ selections: { space: "S1" } }, { selections: { space: "S2" } }],
    );
    expect(durableSelections).toEqual({ space: "S2" });
    expect(service.cache.selectedKey).toBe("S2");
    expect(consumer.cache.selectedKey).toBe("S2");
  });

  it("rebases queued cross-environment writes to preserve both newest slots", async () => {
    await initServiceBeforeConsumer();

    const profile = createProfile({
      id: "profile-a",
      selections: { space: "S0", ground: "G0" },
      spaceKeys: { S0: [], S1: [] },
      groundKeys: { G0: [], G1: [] },
    });
    await emitProfileSwitch(eventBus, null, profile);
    await nextTimer();

    const firstWrite = createDeferred();
    const updateRequests = [];
    let durableSelections = { ...profile.selections };
    detaches.push(
      respond(eventBus, "data:update-profile", async (payload) => {
        updateRequests.push(payload);
        if (updateRequests.length === 1) await firstWrite.promise;
        durableSelections = {
          ...payload.updates.properties.selections,
        };
        return { success: true, profile };
      }),
    );

    const spaceSelection = service.selectKey("S1", "space");
    const groundSelection = service.selectKey("G1", "ground");
    await vi.waitFor(() => expect(updateRequests).toHaveLength(1));

    firstWrite.resolve();
    await Promise.all([spaceSelection, groundSelection]);

    expect(updateRequests).toHaveLength(2);
    expect(updateRequests[0].updates.properties.selections).toEqual({
      space: "S1",
      ground: "G0",
    });
    expect(updateRequests[1].updates.properties.selections).toEqual({
      space: "S1",
      ground: "G1",
    });
    expect(durableSelections).toEqual({ space: "S1", ground: "G1" });
    expect(service.cachedSelections).toMatchObject({
      space: "S1",
      ground: "G1",
    });
  });
});
