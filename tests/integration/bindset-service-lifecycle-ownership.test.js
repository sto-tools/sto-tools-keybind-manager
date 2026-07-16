import { afterEach, describe, expect, it, vi } from "vitest";

import BindsetService from "../../src/js/components/services/BindsetService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import { request, respond } from "../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../fixtures/index.js";
import { createDataCoordinatorState } from "../fixtures/core/componentState.js";

const profile = {
  id: "captain",
  name: "Captain",
  currentEnvironment: "space",
  builds: {
    space: { keys: {} },
    ground: { keys: {} },
  },
  aliases: {},
  bindsets: {},
  keybindMetadata: {},
  aliasMetadata: {},
  bindsetMetadata: {},
  migrationVersion: "2.1.1",
};

const profileWithBindset = (name) => ({
  ...structuredClone(profile),
  bindsets: {
    [name]: {
      space: { keys: {} },
      ground: { keys: {} },
    },
  },
});

describe("BindsetService replacement ownership", () => {
  let fixture;
  let oldService;
  let replacementService;
  let oldCoordinator;
  let replacementCoordinator;
  let detachUpdateResponder;

  afterEach(() => {
    if (replacementService && !replacementService.destroyed) {
      replacementService.destroy();
    }
    if (oldService && !oldService.destroyed) oldService.destroy();
    if (replacementCoordinator && !replacementCoordinator.destroyed) {
      replacementCoordinator.destroy();
    }
    if (oldCoordinator && !oldCoordinator.destroyed) oldCoordinator.destroy();
    detachUpdateResponder?.();
    fixture?.destroy();
    localStorage.removeItem("sto_keybind_manager_visited");
    vi.restoreAllMocks();
  });

  function wireCoordinatorStorage(initialProfile) {
    let durableRoot = {
      currentProfile: "captain",
      profiles: { captain: structuredClone(initialProfile) },
      settings: {},
      version: "1.0.0",
      lastModified: "2026-07-16T00:00:00.000Z",
    };
    fixture.storage.getAllData.mockImplementation(() =>
      structuredClone(durableRoot),
    );
    fixture.storage.getProfile.mockImplementation((profileId) =>
      structuredClone(durableRoot.profiles[profileId] || null),
    );
    fixture.storage.saveAllData.mockImplementation((data) => {
      durableRoot = structuredClone(data);
      return true;
    });
    fixture.storage.saveProfile.mockImplementation((profileId, nextProfile) => {
      durableRoot.profiles[profileId] = structuredClone(nextProfile);
      return true;
    });
    return {
      replaceProfile(nextProfile) {
        durableRoot.profiles.captain = structuredClone(nextProfile);
      },
    };
  }

  function createCoordinator() {
    return new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
  }

  async function waitForReady(coordinator) {
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
  }

  it("routes a mutation only to the live replacement authority", async () => {
    fixture = createServiceFixture();
    const updateProfile = vi.fn(async ({ profileId, updates }) => ({
      success: true,
      profile: {
        ...structuredClone(profile),
        bindsets: structuredClone(updates.add.bindsets),
      },
      profileId,
    }));
    detachUpdateResponder = respond(
      fixture.eventBus,
      "data:update-profile",
      updateProfile,
    );

    oldService = new BindsetService({ eventBus: fixture.eventBus });
    oldService.init();
    fixture.eventBus.emit(
      "data:state-changed",
      {
        reason: "initial-load",
        state: createDataCoordinatorState({ currentProfileData: profile }),
      },
      { synchronous: true },
    );
    const oldCreate = vi.spyOn(oldService, "createBindset");

    oldService.destroy();

    replacementService = new BindsetService({ eventBus: fixture.eventBus });
    replacementService.init();
    fixture.eventBus.emit(
      "data:state-changed",
      {
        reason: "initial-load",
        state: createDataCoordinatorState({
          authorityEpoch: 2,
          currentProfileData: profile,
        }),
      },
      { synchronous: true },
    );
    const replacementCreate = vi.spyOn(replacementService, "createBindset");

    await expect(
      request(fixture.eventBus, "bindset:create", { name: "Weapons" }),
    ).resolves.toMatchObject({ success: true });

    expect(oldCreate).not.toHaveBeenCalled();
    expect(replacementCreate).toHaveBeenCalledTimes(1);
    expect(updateProfile).toHaveBeenCalledTimes(1);
    expect(updateProfile).toHaveBeenCalledWith({
      profileId: "captain",
      updates: {
        add: {
          bindsets: {
            Weapons: {
              space: { keys: {} },
              ground: { keys: {} },
            },
          },
        },
      },
    });

    replacementService.destroy();
    expect(() =>
      request(fixture.eventBus, "bindset:create", { name: "Science" }),
    ).toThrow('No handler registered for topic "bindset:create"');
  });

  it("hydrates derived bindset names when the consumer starts before the owner", async () => {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    fixture = createServiceFixture();
    wireCoordinatorStorage(profileWithBindset("Tactical"));

    oldService = new BindsetService({ eventBus: fixture.eventBus });
    oldService.init();
    oldCoordinator = createCoordinator();
    oldCoordinator.init();
    await waitForReady(oldCoordinator);

    expect(oldService.cache.profile?.bindsets).toHaveProperty("Tactical");
    expect(oldService.cache.bindsetNames).toEqual([
      "Primary Bindset",
      "Tactical",
    ]);
  });

  it("projects pre-ready state and then admits the ready revision from the same authority", () => {
    fixture = createServiceFixture();
    oldService = new BindsetService({ eventBus: fixture.eventBus });
    oldService.init();
    const changed = vi.fn();
    fixture.eventBus.on("bindsets:changed", changed);

    const loading = createDataCoordinatorState({
      authorityEpoch: 10,
      ready: false,
      revision: 0,
      currentProfileData: profileWithBindset("LoadingOnly"),
    });
    fixture.eventBus.emit(
      "data:state-changed",
      { reason: "initial-load", state: loading },
      { synchronous: true },
    );

    expect(oldService.cache.bindsetNames).toEqual(["Primary Bindset"]);
    expect(oldService._bindsetDataAuthorityEpoch).toBe(10);
    expect(oldService._bindsetDataRevision).toBe(0);
    expect(changed).not.toHaveBeenCalled();

    const ready = createDataCoordinatorState({
      authorityEpoch: 10,
      ready: true,
      revision: 1,
      currentProfileData: profileWithBindset("Tactical"),
    });
    fixture.eventBus.emit(
      "data:state-changed",
      { reason: "initial-load", state: ready },
      { synchronous: true },
    );

    expect(oldService.cache.bindsetNames).toEqual([
      "Primary Bindset",
      "Tactical",
    ]);
    expect(oldService._bindsetDataRevision).toBe(1);
    expect(changed).toHaveBeenCalledOnce();
  });

  it("tracks every accepted revision and emits only for an ordered name change", () => {
    fixture = createServiceFixture();
    oldService = new BindsetService({ eventBus: fixture.eventBus });
    oldService.init();
    const changed = vi.fn();
    fixture.eventBus.on("bindsets:changed", changed);

    const emitState = (revision, nextProfile) => {
      fixture.eventBus.emit(
        "data:state-changed",
        {
          reason: "profile-updated",
          state: createDataCoordinatorState({
            authorityEpoch: 20,
            revision,
            currentProfileData: nextProfile,
          }),
        },
        { synchronous: true },
      );
    };

    emitState(1, {
      ...profileWithBindset("Tactical"),
      bindsets: {
        Tactical: profileWithBindset("Tactical").bindsets.Tactical,
        Science: profileWithBindset("Science").bindsets.Science,
      },
    });
    expect(changed).toHaveBeenCalledOnce();
    changed.mockClear();

    emitState(2, {
      ...profileWithBindset("Tactical"),
      description: "Property-only commit",
      bindsets: {
        Tactical: profileWithBindset("Tactical").bindsets.Tactical,
        Science: profileWithBindset("Science").bindsets.Science,
      },
    });
    expect(oldService._bindsetDataRevision).toBe(2);
    expect(changed).not.toHaveBeenCalled();

    emitState(3, {
      ...profileWithBindset("Science"),
      bindsets: {
        Science: profileWithBindset("Science").bindsets.Science,
        Tactical: profileWithBindset("Tactical").bindsets.Tactical,
      },
    });
    expect(oldService.cache.bindsetNames).toEqual([
      "Primary Bindset",
      "Science",
      "Tactical",
    ]);
    expect(oldService._bindsetDataRevision).toBe(3);
    expect(changed).toHaveBeenCalledOnce();
  });

  it("adopts a replacement owner and rejects a delayed high-revision predecessor", async () => {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    fixture = createServiceFixture();
    const storage = wireCoordinatorStorage(profileWithBindset("Tactical"));

    oldCoordinator = createCoordinator();
    oldCoordinator.init();
    await waitForReady(oldCoordinator);
    oldService = new BindsetService({ eventBus: fixture.eventBus });
    oldService.init();
    expect(oldService.cache.bindsetNames).toEqual([
      "Primary Bindset",
      "Tactical",
    ]);

    const predecessor = structuredClone(oldCoordinator.getCurrentState());
    predecessor.revision += 100;
    oldCoordinator.destroy();
    storage.replaceProfile(profileWithBindset("Science"));

    replacementCoordinator = createCoordinator();
    replacementCoordinator.init();
    await waitForReady(replacementCoordinator);
    const replacementState = replacementCoordinator.getCurrentState();
    expect(oldService.cache.bindsetNames).toEqual([
      "Primary Bindset",
      "Science",
    ]);

    fixture.eventBus.emit(
      "data:state-changed",
      { reason: "profile-updated", state: predecessor },
      { synchronous: true },
    );

    expect(oldService.cache.dataState).toBe(replacementState);
    expect(oldService.cache.bindsetNames).toEqual([
      "Primary Bindset",
      "Science",
    ]);
  });

  it("rehydrates derived bindset names when the same service is reinitialized", async () => {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    fixture = createServiceFixture();
    wireCoordinatorStorage(profileWithBindset("Tactical"));
    oldCoordinator = createCoordinator();
    oldCoordinator.init();
    await waitForReady(oldCoordinator);

    oldService = new BindsetService({ eventBus: fixture.eventBus });
    oldService.init();
    expect(oldService.cache.bindsetNames).toContain("Tactical");

    oldService.destroy();
    oldService.cache.bindsetNames = ["stale"];
    oldService.init();

    expect(oldService.cache.bindsetNames).toEqual([
      "Primary Bindset",
      "Tactical",
    ]);
  });
});
