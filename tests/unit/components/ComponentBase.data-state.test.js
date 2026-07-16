import { afterEach, describe, expect, it } from "vitest";

import ComponentBase from "../../../src/js/components/ComponentBase.js";
import eventBus from "../../../src/js/core/eventBus.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";

class DataCoordinator extends ComponentBase {
  constructor(bus, state) {
    super(bus);
    this.state = state;
  }

  getCurrentState() {
    return this.state;
  }
}

class DataStateConsumer extends ComponentBase {}

/**
 * @param {string} id
 * @param {string} [environment]
 * @returns {import('../../../src/js/components/services/serviceTypes.js').ProfileData}
 */
function profile(id, environment = "space") {
  return {
    id,
    environment,
    builds: {
      space: { keys: { F1: [`${id}-space`] } },
      ground: { keys: { G: [`${id}-ground`] } },
    },
    aliases: { [`${id}-alias`]: { commands: [`${id}-command`] } },
  };
}

/**
 * @param {number} revision
 * @param {string | null} [id]
 * @param {string} [environment]
 * @param {number} [authorityEpoch]
 */
function snapshot(
  revision,
  id = `profile-${revision}`,
  environment = "space",
  authorityEpoch = 1,
) {
  const currentProfileData = id ? profile(id, environment) : null;
  return createDataCoordinatorState({
    authorityEpoch,
    ready: true,
    revision,
    currentProfile: id,
    currentEnvironment: environment,
    currentProfileData,
    profiles: id && currentProfileData ? { [id]: currentProfileData } : {},
    settings: { marker: `settings-${revision}` },
    metadata: { lastModified: `revision-${revision}` },
  });
}

describe("ComponentBase DataCoordinator state cache", () => {
  const components = [];

  afterEach(() => {
    for (const component of components.reverse()) {
      if (!component.destroyed) component.destroy();
    }
    components.length = 0;
    eventBus.clear();
  });

  it("atomically replaces a detached complete late-join snapshot", () => {
    const initial = snapshot(1, "captain", "ground");
    const extension = { density: "compact" };
    initial.settings.extension = extension;
    const initialProfile = initial.currentProfileData;
    if (!initialProfile) throw new Error("Expected current profile fixture");
    const coordinator = new DataCoordinator(eventBus, initial);
    const consumer = new DataStateConsumer(eventBus);
    const ownedProfiles = { exportOwned: profile("export-owned") };
    consumer.cache.profiles = ownedProfiles;
    components.push(coordinator, consumer);

    coordinator.init();
    consumer.init();

    expect(consumer.cache.dataState).toEqual(initial);
    expect(consumer.cache.dataState).not.toBe(initial);
    expect(consumer.cache.dataState?.currentProfileData).not.toBe(
      initial.currentProfileData,
    );
    expect(consumer.cache).toMatchObject({
      currentProfile: "captain",
      currentEnvironment: "ground",
      keys: { G: ["captain-ground"] },
      aliases: { "captain-alias": { commands: ["captain-command"] } },
    });
    expect(consumer.cache.builds).toEqual(initialProfile.builds);
    expect(consumer.cache.profiles).toBe(ownedProfiles);

    consumer.cache.keys.G.push("compatibility mutation");
    expect(
      consumer.cache.dataState?.currentProfileData?.builds?.ground?.keys?.G,
    ).toEqual(["captain-ground"]);
    expect(
      consumer.cache.dataState?.profiles.captain.builds?.ground?.keys?.G,
    ).toEqual(["captain-ground"]);

    initialProfile.builds?.ground?.keys?.G?.push("producer-mutation");
    initial.profiles.captain.name = "Producer mutation";
    extension.density = "producer-mutation";

    expect(consumer.cache.keys.G).toEqual([
      "captain-ground",
      "compatibility mutation",
    ]);
    expect(consumer.cache.dataState?.profiles.captain.name).toBeUndefined();
    expect(consumer.cache.dataState?.settings.extension).toEqual({
      density: "compact",
    });
  });

  it("replaces complete live state without retaining omitted fields", () => {
    const consumer = new DataStateConsumer(eventBus);
    const ownedProfiles = { retained: profile("retained") };
    consumer.cache.profiles = ownedProfiles;
    components.push(consumer);
    consumer.init();

    const first = snapshot(1, "first");
    first.settings.staleExtension = true;
    first.profiles.staleProfile = profile("stale-profile");
    eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: first,
    });

    const second = snapshot(2, "second", "ground");
    eventBus.emit("data:state-changed", {
      reason: "profile-switched",
      state: second,
    });

    expect(consumer.cache.dataState).toEqual(second);
    expect(consumer.cache.dataState?.settings).not.toHaveProperty(
      "staleExtension",
    );
    expect(consumer.cache.dataState?.profiles).not.toHaveProperty(
      "staleProfile",
    );
    expect(consumer.cache.profiles).toBe(ownedProfiles);
    expect(consumer.cache).toMatchObject({
      currentProfile: "second",
      currentEnvironment: "ground",
      keys: { G: ["second-ground"] },
    });
  });

  it("accepts revision-zero late join while suppressing duplicate and stale state", () => {
    const initial = snapshot(0, "initial");
    initial.ready = false;
    const coordinator = new DataCoordinator(eventBus, initial);
    const consumer = new DataStateConsumer(eventBus);
    components.push(coordinator, consumer);
    coordinator.init();
    consumer.init();

    expect(consumer.cache.currentProfile).toBe("initial");
    expect(consumer.cache.dataState?.ready).toBe(false);
    expect(consumer._lastDataStateRevision).toBe(0);

    eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: snapshot(0, "equal-duplicate"),
    });
    expect(consumer.cache.currentProfile).toBe("initial");

    eventBus.emit("data:state-changed", {
      reason: "profile-updated",
      state: snapshot(2, "current"),
    });
    const currentState = consumer.cache.dataState;
    eventBus.emit("data:state-changed", {
      reason: "profile-updated",
      state: snapshot(1, "stale"),
    });

    expect(consumer.cache.dataState).toBe(currentState);
    expect(consumer.cache.currentProfile).toBe("current");
    expect(consumer._lastDataStateRevision).toBe(2);
  });

  it("accepts a replacement authority and rejects delayed predecessor state", () => {
    const consumer = new DataStateConsumer(eventBus);
    components.push(consumer);
    consumer.init();

    eventBus.emit("data:state-changed", {
      reason: "profile-updated",
      state: snapshot(2, "first-owner", "space", 10),
    });
    expect(consumer.cache.dataState).toMatchObject({
      authorityEpoch: 10,
      revision: 2,
      currentProfile: "first-owner",
    });

    eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: snapshot(1, "replacement-owner", "ground", 11),
    });
    const replacementState = consumer.cache.dataState;
    expect(replacementState).toMatchObject({
      authorityEpoch: 11,
      revision: 1,
      currentProfile: "replacement-owner",
    });

    eventBus.emit("data:state-changed", {
      reason: "profile-updated",
      state: snapshot(99, "delayed-predecessor", "space", 10),
    });
    eventBus.emit("data:state-changed", {
      reason: "profile-updated",
      state: snapshot(1, "same-authority-duplicate", "space", 11),
    });

    expect(consumer.cache.dataState).toBe(replacementState);
    expect(consumer.cache.currentProfile).toBe("replacement-owner");
    expect(consumer.cache.dataState?.authorityEpoch).toBe(11);
    expect(consumer._lastDataStateRevision).toBe(1);
  });

  it("clears every profile compatibility field for a null snapshot", () => {
    const consumer = new DataStateConsumer(eventBus);
    components.push(consumer);
    consumer.init();
    eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: snapshot(1, "captain", "ground"),
    });

    const cleared = snapshot(2, null, "space");
    eventBus.emit("data:state-changed", {
      reason: "storage-reset",
      state: cleared,
    });

    expect(consumer.cache.dataState).toEqual(cleared);
    expect(consumer.cache).toMatchObject({
      currentProfile: null,
      currentEnvironment: "space",
      profile: null,
      builds: null,
      keys: {},
      aliases: {},
    });
    expect(consumer._currentProfileId).toBeNull();
    expect(consumer._currentEnvironment).toBe("space");
  });

  it("retains nested builds when a switched profile also has flattened keys", () => {
    const consumer = new DataStateConsumer(eventBus);
    components.push(consumer);
    consumer.init();
    consumer.cache.builds = { stale: { keys: {} } };
    const switchedProfile = profile("captain");
    switchedProfile.keys = { F9: ["Flattened"] };

    eventBus.emit("profile:switched", {
      fromProfile: null,
      toProfile: "captain",
      profileId: "captain",
      profile: switchedProfile,
      environment: "space",
      timestamp: 1,
    });

    expect(consumer.cache.keys).toEqual(switchedProfile.keys);
    expect(consumer.cache.keys).not.toBe(switchedProfile.keys);
    expect(consumer.cache.builds).toEqual(switchedProfile.builds);
    expect(consumer.cache.builds).not.toBe(switchedProfile.builds);
  });

  it("detaches legacy profile payloads from both producers and dataState", () => {
    const consumer = new DataStateConsumer(eventBus);
    components.push(consumer);
    consumer.init();
    eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: snapshot(1, "captain"),
    });
    const legacyProfile = profile("captain");
    legacyProfile.keys = { F9: ["Legacy"] };

    eventBus.emit("profile:updated", {
      profileId: "captain",
      profile: legacyProfile,
      timestamp: 1,
    });

    consumer.cache.keys.F9.push("local mutation");
    expect(legacyProfile.keys.F9).toEqual(["Legacy"]);
    expect(
      consumer.cache.dataState?.currentProfileData?.keys?.F9,
    ).toBeUndefined();
    expect(consumer.cache.dataState?.revision).toBe(1);
  });

  it("detaches the live state listener during teardown", () => {
    const consumer = new DataStateConsumer(eventBus);
    components.push(consumer);
    consumer.init();
    eventBus.emit("data:state-changed", {
      reason: "initial-load",
      state: snapshot(1, "before-destroy"),
    });
    const stateAtDestroy = consumer.cache.dataState;

    consumer.destroy();
    expect(eventBus.hasListeners("data:state-changed")).toBe(false);
    eventBus.emit("data:state-changed", {
      reason: "profile-updated",
      state: snapshot(2, "after-destroy"),
    });

    expect(consumer.cache.dataState).toBe(stateAtDestroy);
    expect(consumer.cache.currentProfile).toBe("before-destroy");
  });
});
