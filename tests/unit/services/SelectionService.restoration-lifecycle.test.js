import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SelectionService from "../../../src/js/components/services/SelectionService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";
import { createRealEventBusFixture } from "../../fixtures/core/eventBus.js";

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

describe("SelectionService restoration lifecycle", () => {
  let eventBusFixture;
  let eventBus;
  let service;
  let services;
  let detaches;

  beforeEach(async () => {
    eventBusFixture = await createRealEventBusFixture();
    eventBus = eventBusFixture.eventBus;
    detaches = [];
    services = [];

    service = new SelectionService({ eventBus });
    services.push(service);
    await service.init();
  });

  afterEach(() => {
    for (const instance of services) {
      if (!instance.destroyed) instance.destroy();
    }
    for (const detach of detaches) detach();
    eventBusFixture.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function activateProfile(profile) {
    await eventBus.emit(
      "data:state-changed",
      {
        reason: "profile-switched",
        state: createDataCoordinatorState({
          authorityEpoch: 1,
          revision: 1,
          currentProfile: profile.id,
          currentEnvironment: profile.environment,
          currentProfileData: profile,
          profiles: { [profile.id]: profile },
        }),
      },
      { synchronous: true },
    );
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

  function recordSelectionPublications() {
    const publications = [];
    detaches.push(
      eventBus.on("key-selected", ({ key }) =>
        publications.push(["key-selected", key]),
      ),
      eventBus.on("alias-selected", ({ name }) =>
        publications.push(["alias-selected", name]),
      ),
      eventBus.on("selection:state-changed", (state) =>
        publications.push([
          "selection:state-changed",
          state.currentEnvironment,
          state.selectedKey,
          state.selectedAlias,
        ]),
      ),
    );
    return publications;
  }

  it("publishes compatibility clears, canonical state, and targets in order across key and alias environments", async () => {
    const profile = createProfile({
      selections: { space: "S1", alias: "Alpha" },
      spaceKeys: { S1: [] },
      aliases: { Alpha: { type: "user" } },
    });
    await activateProfile(profile);
    detaches.push(
      respond(eventBus, "data:update-profile", () => ({
        success: true,
        profile,
      })),
    );
    const publications = recordSelectionPublications();

    await service.switchEnvironment("alias", "space");

    expect(publications).toEqual([
      ["key-selected", null],
      ["selection:state-changed", "alias", null, "Alpha"],
      ["alias-selected", "Alpha"],
    ]);

    publications.length = 0;
    await service.switchEnvironment("space", "alias");

    expect(publications).toEqual([
      ["alias-selected", null],
      ["selection:state-changed", "space", "S1", null],
      ["key-selected", "S1"],
    ]);
  });

  it("keeps the newest environment authoritative through a rapid space-ground-space transition", async () => {
    const profile = createProfile({
      selections: { space: "S1", ground: "G1" },
      spaceKeys: { S1: [] },
      groundKeys: { G1: [] },
    });
    await activateProfile(profile);

    const firstWrite = createDeferred();
    const updateRequests = [];
    detaches.push(
      respond(eventBus, "data:update-profile", async (payload) => {
        updateRequests.push(payload);
        if (updateRequests.length === 1) await firstWrite.promise;
        return { success: true, profile };
      }),
    );
    const publications = recordSelectionPublications();

    const switchToGround = service.switchEnvironment("ground", "space");
    await vi.waitFor(() => expect(updateRequests).toHaveLength(1));
    const switchBackToSpace = service.switchEnvironment("space", "ground");

    expect(service.getCurrentState()).toMatchObject({
      currentEnvironment: "space",
      selectedKey: "S1",
      selectedAlias: null,
    });
    expect(publications).toEqual([
      ["alias-selected", null],
      ["selection:state-changed", "ground", "G1", null],
      ["key-selected", "G1"],
      ["alias-selected", null],
      ["selection:state-changed", "space", "S1", null],
      ["key-selected", "S1"],
    ]);

    firstWrite.resolve();
    await Promise.all([switchToGround, switchBackToSpace]);

    expect(updateRequests).toHaveLength(2);
    expect(updateRequests.map((request) => request.updates.properties)).toEqual(
      [
        { selections: { space: "S1", ground: "G1" } },
        { selections: { space: "S1", ground: "G1" } },
      ],
    );
    expect(service.getCurrentState()).toMatchObject({
      currentEnvironment: "space",
      selectedKey: "S1",
      selectedAlias: null,
      cachedSelections: { space: "S1", ground: "G1" },
    });
    expect(publications).toHaveLength(6);
  });

  it("cancels a destroyed predecessor restore while its replacement publishes once", async () => {
    vi.useFakeTimers();
    const profile = createProfile({
      selections: { space: "S1" },
      spaceKeys: { S1: [] },
    });
    const publications = recordSelectionPublications();

    await eventBus.emit("profile:switched", {
      fromProfile: null,
      toProfile: profile.id,
      profileId: profile.id,
      profile,
      environment: "space",
      timestamp: Date.now(),
    });
    service.destroy();

    const replacement = new SelectionService({ eventBus });
    services.push(replacement);
    await replacement.init();
    await eventBus.emit("profile:switched", {
      fromProfile: null,
      toProfile: profile.id,
      profileId: profile.id,
      profile,
      environment: "space",
      timestamp: Date.now(),
    });

    await vi.runAllTimersAsync();

    expect(publications).toEqual([
      ["selection:state-changed", "space", "S1", null],
      ["key-selected", "S1"],
    ]);
    expect(replacement.getCurrentState()).toMatchObject({
      currentEnvironment: "space",
      selectedKey: "S1",
      selectedAlias: null,
    });
  });

  it("clears an invalid inactive slot without publishing null before selecting its insertion-order fallback", async () => {
    const profile = createProfile({
      selections: { space: "S1", ground: "Missing" },
      spaceKeys: { S1: [] },
      groundKeys: { G2: [], G1: [] },
    });
    await activateProfile(profile);

    const updateRequests = [];
    detaches.push(
      respond(eventBus, "data:update-profile", (payload) => {
        updateRequests.push(payload);
        return { success: true, profile };
      }),
    );
    const keyEvents = [];
    detaches.push(
      eventBus.on("key-selected", ({ key, environment }) =>
        keyEvents.push({ key, environment }),
      ),
    );

    await service.validateAndRestoreSelection("ground", "Missing");

    expect(updateRequests).toHaveLength(1);
    expect(updateRequests[0].updates.properties.selections).toEqual({
      space: "S1",
      ground: "G2",
    });
    expect(keyEvents).toEqual([{ key: "G2", environment: "ground" }]);
    expect(service.cachedSelections).toMatchObject({
      space: "S1",
      ground: "G2",
    });
  });

  it("replaces a removed active selection from a newer same-profile snapshot", async () => {
    const profile = createProfile({
      selections: { space: "F1" },
      spaceKeys: { F1: [], F2: [] },
    });
    await activateProfile(profile);

    const updatedProfile = createProfile({
      selections: { space: "F1" },
      spaceKeys: { F2: [] },
    });
    const updateRequests = [];
    const keyEvents = [];
    detaches.push(
      respond(eventBus, "data:update-profile", (payload) => {
        updateRequests.push(payload);
        return { success: true, profile: updatedProfile };
      }),
      eventBus.on("key-selected", ({ key }) => keyEvents.push(key)),
    );

    await eventBus.emit(
      "data:state-changed",
      {
        reason: "profile-updated",
        state: createDataCoordinatorState({
          authorityEpoch: 1,
          revision: 2,
          currentProfile: updatedProfile.id,
          currentEnvironment: "space",
          currentProfileData: updatedProfile,
          profiles: { [updatedProfile.id]: updatedProfile },
        }),
      },
      { synchronous: true },
    );
    await eventBus.emit("profile:updated", {
      profileId: updatedProfile.id,
      profile: updatedProfile,
      source: "test",
    });

    await vi.waitFor(() => expect(service.cache.selectedKey).toBe("F2"));

    expect(keyEvents).toEqual([null, "F2"]);
    expect(updateRequests).toHaveLength(1);
    expect(updateRequests[0].updates.properties.selections).toEqual({
      space: "F2",
    });
    expect(service.getCurrentState()).toMatchObject({
      currentEnvironment: "space",
      selectedKey: "F2",
      selectedAlias: null,
      cachedSelections: { space: "F2" },
    });
  });
});
