import { afterEach, describe, expect, it, vi } from "vitest";

import ComponentBase from "../../src/js/components/ComponentBase.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import DataService from "../../src/js/components/services/DataService.js";
import { request } from "../../src/js/core/requestResponse.js";
import { createRealServiceFixture } from "../fixtures/index.js";

class DataStateConsumer extends ComponentBase {
  constructor(eventBus, name) {
    super(eventBus);
    this.componentName = name;
  }
}

const coordinatorTopics = [
  "data:switch-profile",
  "data:create-profile",
  "data:clone-profile",
  "data:rename-profile",
  "data:delete-profile",
  "data:update-profile",
  "data:set-environment",
  "data:update-settings",
  "data:load-default-data",
  "data:reload-state",
];

const retiredProjectionTopics = [
  "data:get-current-state",
  "data:get-all-profiles",
  "data:get-keys",
  "data:get-key-commands",
];

const createProfile = (name, currentEnvironment = "space") => ({
  name,
  description: `${name} profile`,
  currentEnvironment,
  builds: {
    space: { keys: { F1: [`${name}-space`] } },
    ground: { keys: { F2: [`${name}-ground`] } },
  },
  aliases: { engage: { commands: [`${name}-engage`] } },
  keybindMetadata: {},
  aliasMetadata: {},
  bindsetMetadata: {},
  bindsets: {},
  migrationVersion: "2.1.1",
});

const createStorageData = (profiles, currentProfile = null) => ({
  sto_keybind_manager: {
    currentProfile,
    profiles,
    settings: {},
    version: "1.0.0",
    lastModified: "2026-07-16T00:00:00.000Z",
  },
  sto_keybind_settings: {},
});

describe("DataCoordinator lifecycle and state ownership", () => {
  let fixture;
  const components = [];

  afterEach(() => {
    for (const component of components.reverse()) {
      if (!component.destroyed) component.destroy();
    }
    components.length = 0;
    fixture?.destroy();
    fixture = null;
    localStorage.removeItem("sto_keybind_manager_visited");
    vi.restoreAllMocks();
  });

  async function createCoordinator({ firstRun = false, defaultProfiles } = {}) {
    if (firstRun) {
      localStorage.removeItem("sto_keybind_manager_visited");
    } else {
      localStorage.setItem("sto_keybind_manager_visited", "true");
    }

    fixture = await createRealServiceFixture({
      initialStorageData: createStorageData(
        firstRun ? {} : { alpha: createProfile("Alpha") },
        firstRun ? null : "alpha",
      ),
    });
    const coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
      defaultProfiles,
    });
    components.push(coordinator);
    return coordinator;
  }

  async function waitForReady(coordinator) {
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
  }

  it("detaches every request responder and rejects post-destroy mutations", async () => {
    const coordinator = await createCoordinator();
    coordinator.init();
    await waitForReady(coordinator);

    const publishedAfterDestroy = [];
    fixture.eventBus.on("data:state-changed", (event) => {
      publishedAfterDestroy.push(event);
    });
    const stateAtDestroy = coordinator.getCurrentState();
    const expectedState = structuredClone(stateAtDestroy);
    fixture.storage.saveAllData.mockClear();
    fixture.storage.saveProfile.mockClear();
    fixture.storage.deleteProfile.mockClear();
    fixture.storage.saveSettings.mockClear();

    for (const topic of retiredProjectionTopics) {
      expect(fixture.eventBus.hasListeners(`rpc:${topic}`)).toBe(false);
    }

    coordinator.destroy();

    for (const topic of coordinatorTopics) {
      expect(fixture.eventBus.hasListeners(`rpc:${topic}`)).toBe(false);
      expect(() => request(fixture.eventBus, topic, undefined, 10)).toThrow(
        `No handler registered for topic "${topic}"`,
      );
    }

    expect(coordinator.getCurrentState()).toBe(stateAtDestroy);
    expect(coordinator.getCurrentState()).toEqual(expectedState);
    expect(fixture.storage.saveAllData).not.toHaveBeenCalled();
    expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
    expect(fixture.storage.deleteProfile).not.toHaveBeenCalled();
    expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
    expect(publishedAfterDestroy).toEqual([]);
  });

  it("isolates owner state and same-revision snapshots from legacy listeners", async () => {
    const coordinator = await createCoordinator();
    coordinator.init();
    await waitForReady(coordinator);

    let published;
    let legacyPayload;
    fixture.eventBus.on("data:state-changed", ({ state }) => {
      published = state;
    });
    fixture.eventBus.on("profile:updated", (payload) => {
      legacyPayload = payload;
      payload.profile.name = "mutated by listener";
      payload.profile.builds.space.keys.F9.push("listener command");
    });

    await coordinator.updateProfile("alpha", {
      add: { builds: { space: { keys: { F9: ["committed command"] } } } },
    });

    expect(legacyPayload.profile.name).toBe("mutated by listener");
    expect(coordinator.state.profiles.alpha.name).toBe("Alpha");
    expect(coordinator.state.profiles.alpha.builds.space.keys.F9).toEqual([
      "committed command",
    ]);
    expect(published.profiles.alpha.name).toBe("Alpha");
    expect(published.currentProfileData.keys.F9).toEqual(["committed command"]);
    expect(coordinator.getCurrentState()).toBe(published);
    expect(coordinator.getCurrentState().revision).toBe(2);
  });

  it("converges legacy caches after snapshots without sharing mutable data", async () => {
    const coordinator = await createCoordinator();
    const first = new DataStateConsumer(fixture.eventBus, "FirstConsumer");
    const second = new DataStateConsumer(fixture.eventBus, "SecondConsumer");
    components.push(first, second);
    first.init();
    second.init();
    coordinator.init();
    await waitForReady(coordinator);

    const eventOrder = [];
    let published;
    let legacyProfile;
    fixture.eventBus.on("data:state-changed", ({ state }) => {
      eventOrder.push("snapshot");
      published = state;
    });
    fixture.eventBus.on("profile:updated", ({ profile }) => {
      eventOrder.push("legacy");
      legacyProfile = profile;
    });

    await coordinator.updateProfile("alpha", {
      add: { builds: { space: { keys: { F9: ["committed command"] } } } },
    });

    expect(eventOrder).toEqual(["snapshot", "legacy"]);
    expect(first.cache.dataState).toBe(published);
    expect(second.cache.dataState).toBe(published);
    expect(published).toBe(coordinator.getCurrentState());
    expect(Object.isFrozen(published)).toBe(true);
    expect(Object.isFrozen(published.currentProfileData.keys.F9)).toBe(true);

    expect(first.cache.profile).toEqual(published.currentProfileData);
    expect(first.cache.profile).not.toBe(published.currentProfileData);
    expect(first.cache.profile).not.toBe(second.cache.profile);
    expect(first.cache.profile).not.toBe(legacyProfile);
    expect(first.cache.keys).not.toBe(published.currentProfileData.keys);

    first.cache.profile.name = "first consumer only";
    first.cache.keys.F9.push("first consumer command");

    expect(second.cache.profile.name).toBe("Alpha");
    expect(second.cache.keys.F9).toEqual(["committed command"]);
    expect(legacyProfile.name).toBe("Alpha");
    expect(legacyProfile.builds.space.keys.F9).toEqual(["committed command"]);
    expect(coordinator.state.profiles.alpha.name).toBe("Alpha");
    expect(coordinator.state.profiles.alpha.builds.space.keys.F9).toEqual([
      "committed command",
    ]);
    expect(published.currentProfileData.keys.F9).toEqual(["committed command"]);
  });

  it("replaces a destroyed coordinator while a consumer survives", async () => {
    const firstCoordinator = await createCoordinator();
    const survivor = new DataStateConsumer(
      fixture.eventBus,
      "SurvivingConsumer",
    );
    components.push(survivor);
    survivor.init();
    firstCoordinator.init();
    await waitForReady(firstCoordinator);

    await firstCoordinator.updateProfile("alpha", {
      properties: { description: "persisted before owner replacement" },
    });
    const firstState = survivor.cache.dataState;
    if (!firstState) throw new Error("Expected the first owner snapshot");
    expect(firstState).toMatchObject({ revision: 2 });

    firstCoordinator.destroy();
    const replacement = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    components.push(replacement);
    replacement.init();
    await waitForReady(replacement);

    const replacementState = replacement.getCurrentState();
    expect(replacementState).toMatchObject({
      ready: true,
      revision: 1,
      currentProfile: "alpha",
      profiles: {
        alpha: { description: "persisted before owner replacement" },
      },
    });
    expect(replacementState.authorityEpoch).toBeGreaterThan(
      firstState.authorityEpoch,
    );
    expect(survivor.cache.dataState).toBe(replacementState);
    expect(survivor.cache.dataState?.authorityEpoch).toBe(
      replacementState.authorityEpoch,
    );
    expect(survivor._lastDataStateRevision).toBe(1);

    const lateJoiner = new DataStateConsumer(fixture.eventBus, "LateJoiner");
    components.push(lateJoiner);
    lateJoiner.init();
    expect(lateJoiner.cache.dataState).toBe(replacementState);
  });

  it.each(["data-service-first", "coordinator-first"])(
    "creates first-run defaults once in exact publication order (%s)",
    async (startupOrder) => {
      const coordinator = await createCoordinator({
        firstRun: true,
        defaultProfiles: {
          default_space: createProfile("Default Space"),
        },
      });
      const dataService = new DataService({
        eventBus: fixture.eventBus,
        data: {
          defaultProfiles: {
            ignored_data_service_profile: createProfile("Ignored"),
          },
        },
      });
      components.push(dataService);

      const states = [];
      const eventOrder = [];
      fixture.eventBus.on("data:state-changed", ({ reason, state }) => {
        states.push({ reason, state });
        eventOrder.push(`state:${reason}:${state.revision}`);
      });
      fixture.eventBus.on("profiles:initialized", () => {
        eventOrder.push("profiles:initialized");
      });
      fixture.eventBus.on("profile:switched", () => {
        eventOrder.push("profile:switched");
      });

      if (startupOrder === "data-service-first") {
        dataService.init();
        coordinator.init();
      } else {
        coordinator.init();
        await vi.waitFor(() => {
          expect(coordinator.getCurrentState()).toMatchObject({
            ready: true,
            revision: 2,
            currentProfile: "default_space",
          });
        });
        dataService.init();
      }

      await vi.waitFor(() => {
        expect(coordinator.needsDefaultProfiles).toBe(false);
        expect(coordinator.getCurrentState()).toMatchObject({
          ready: true,
          revision: 2,
          currentProfile: "default_space",
        });
      });

      expect(states).toHaveLength(2);
      expect(coordinator.getCurrentState().profiles).not.toHaveProperty(
        "ignored_data_service_profile",
      );
      expect(states[0]).toMatchObject({
        reason: "initial-load",
        state: {
          ready: true,
          revision: 1,
          currentProfile: null,
          profiles: {},
        },
      });
      expect(states[1]).toMatchObject({
        reason: "default-profiles-created",
        state: {
          ready: true,
          revision: 2,
          currentProfile: "default_space",
          profiles: { default_space: { name: "Default Space" } },
        },
      });
      expect(eventOrder).toEqual([
        "state:initial-load:1",
        "state:default-profiles-created:2",
        "profiles:initialized",
        "profile:switched",
      ]);
    },
  );
});
