import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ComponentBase from "../../../src/js/components/ComponentBase.js";
import SelectionService from "../../../src/js/components/services/SelectionService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createRealEventBusFixture } from "../../fixtures/core/eventBus.js";

class ProfileUpdateRaceConsumer extends ComponentBase {
  constructor(eventBus) {
    super(eventBus);
    this.componentName = "ProfileUpdateRaceConsumer";
  }
}

function createProfile({
  environment = "space",
  selections = {},
  spaceKeys = {},
  aliases = {},
} = {}) {
  return {
    id: "profile-a",
    name: "profile-a",
    environment,
    currentEnvironment: environment,
    builds: {
      space: { keys: spaceKeys },
      ground: { keys: {} },
    },
    aliases,
    selections,
  };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function nextTimer() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SelectionService profile update races", () => {
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
    consumer = new ProfileUpdateRaceConsumer(eventBus);
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

  it("keeps a valid pending selection across an unrelated profile update", async () => {
    const profile = createProfile({
      selections: { space: "S0" },
      spaceKeys: { S0: [], S1: [] },
    });
    await activateProfile(profile);

    const blockedWrite = createDeferred();
    const updateRequests = [];
    detaches.push(
      respond(eventBus, "data:update-profile", async (payload) => {
        updateRequests.push(payload);
        await blockedWrite.promise;
        return { success: true, profile };
      }),
    );

    const pendingSelection = service.selectKey("S1");
    await vi.waitFor(() => expect(updateRequests).toHaveLength(1));

    const renamedProfile = { ...profile, name: "renamed-profile" };
    await eventBus.emit("profile:updated", {
      profileId: profile.id,
      profile: renamedProfile,
      source: "test",
    });
    await nextTimer();

    expect(updateRequests).toHaveLength(1);
    blockedWrite.resolve();
    await expect(pendingSelection).resolves.toBe("S1");
    await nextTimer();

    expect(updateRequests).toHaveLength(1);
    expect(updateRequests[0].updates.properties.selections).toEqual({
      space: "S1",
    });
    expect(service.cache).toMatchObject({
      selectedKey: "S1",
      cachedSelections: { space: "S1" },
      profile: { name: "renamed-profile", selections: { space: "S1" } },
    });
    expect(service.cachedSelections.space).toBe("S1");
    expect(consumer.cache).toMatchObject({
      selectedKey: "S1",
      cachedSelections: { space: "S1" },
    });
  });

  it("does not restore a pending key deleted by a profile update", async () => {
    const profile = createProfile({
      selections: { space: "F1" },
      spaceKeys: { F1: [], F2: [] },
    });
    await activateProfile(profile);

    const oldWrite = createDeferred();
    const updateRequests = [];
    const snapshots = [];
    const keyEvents = [];
    let durableSelections = { ...profile.selections };
    let currentProfile = profile;
    detaches.push(
      respond(eventBus, "data:update-profile", async (payload) => {
        updateRequests.push(payload);
        if (updateRequests.length === 1) await oldWrite.promise;
        durableSelections = { ...payload.updates.properties.selections };
        return { success: true, profile: currentProfile };
      }),
      eventBus.on("selection:state-changed", (payload) =>
        snapshots.push(payload),
      ),
      eventBus.on("key-selected", (payload) => keyEvents.push(payload)),
    );

    const pendingSelection = service.selectKey("F2");
    await vi.waitFor(() => expect(updateRequests).toHaveLength(1));

    currentProfile = createProfile({
      selections: { space: "F1" },
      spaceKeys: { F1: [] },
    });
    durableSelections = { ...currentProfile.selections };
    await eventBus.emit("profile:updated", {
      profileId: currentProfile.id,
      profile: currentProfile,
      source: "test",
    });
    await nextTimer();

    oldWrite.resolve();
    await expect(pendingSelection).resolves.toBe("F1");
    await vi.waitFor(() => expect(updateRequests).toHaveLength(2));
    await vi.waitFor(() => expect(durableSelections).toEqual({ space: "F1" }));

    expect(updateRequests[0].updates.properties.selections).toEqual({
      space: "F2",
    });
    expect(updateRequests[1].updates.properties.selections).toEqual({
      space: "F1",
    });
    expect(service.cache).toMatchObject({
      selectedKey: "F1",
      cachedSelections: { space: "F1" },
      profile: { selections: { space: "F1" } },
    });
    expect(consumer.cache).toMatchObject({
      selectedKey: "F1",
      cachedSelections: { space: "F1" },
    });
    expect(snapshots).not.toContainEqual(
      expect.objectContaining({ selectedKey: "F2" }),
    );
    expect(snapshots).not.toContainEqual(
      expect.objectContaining({ cachedSelections: { space: "F2" } }),
    );
    expect(keyEvents).not.toContainEqual(
      expect.objectContaining({ key: "F2" }),
    );
    expect(durableSelections).toEqual({ space: "F1" });
  });

  it("does not restore a pending alias deleted by a profile update", async () => {
    const profile = createProfile({
      environment: "alias",
      selections: { alias: "Alpha" },
      aliases: {
        Alpha: { type: "user" },
        Beta: { type: "user" },
      },
    });
    await activateProfile(profile);

    const oldWrite = createDeferred();
    const updateRequests = [];
    const snapshots = [];
    const aliasEvents = [];
    let durableSelections = { ...profile.selections };
    let currentProfile = profile;
    detaches.push(
      respond(eventBus, "data:update-profile", async (payload) => {
        updateRequests.push(payload);
        if (updateRequests.length === 1) await oldWrite.promise;
        durableSelections = { ...payload.updates.properties.selections };
        return { success: true, profile: currentProfile };
      }),
      eventBus.on("selection:state-changed", (payload) =>
        snapshots.push(payload),
      ),
      eventBus.on("alias-selected", (payload) => aliasEvents.push(payload)),
    );

    const pendingSelection = service.selectAlias("Beta");
    await vi.waitFor(() => expect(updateRequests).toHaveLength(1));

    currentProfile = createProfile({
      environment: "alias",
      selections: { alias: "Alpha" },
      aliases: { Alpha: { type: "user" } },
    });
    durableSelections = { ...currentProfile.selections };
    await eventBus.emit("profile:updated", {
      profileId: currentProfile.id,
      profile: currentProfile,
      source: "test",
    });
    await nextTimer();

    oldWrite.resolve();
    await expect(pendingSelection).resolves.toBe("Alpha");
    await vi.waitFor(() => expect(updateRequests).toHaveLength(2));
    await vi.waitFor(() =>
      expect(durableSelections).toEqual({ alias: "Alpha" }),
    );

    expect(updateRequests[0].updates.properties.selections).toEqual({
      alias: "Beta",
    });
    expect(updateRequests[1].updates.properties.selections).toEqual({
      alias: "Alpha",
    });
    expect(service.cache).toMatchObject({
      selectedKey: null,
      selectedAlias: "Alpha",
      cachedSelections: { alias: "Alpha" },
      profile: { selections: { alias: "Alpha" } },
    });
    expect(consumer.cache).toMatchObject({
      selectedKey: null,
      selectedAlias: "Alpha",
      cachedSelections: { alias: "Alpha" },
    });
    expect(snapshots).not.toContainEqual(
      expect.objectContaining({ selectedAlias: "Beta" }),
    );
    expect(snapshots).not.toContainEqual(
      expect.objectContaining({ cachedSelections: { alias: "Beta" } }),
    );
    expect(aliasEvents).not.toContainEqual(
      expect.objectContaining({ name: "Beta" }),
    );
    expect(durableSelections).toEqual({ alias: "Alpha" });
  });
});
