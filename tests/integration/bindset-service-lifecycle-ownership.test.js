import { afterEach, describe, expect, it, vi } from "vitest";

import BindsetService from "../../src/js/components/services/BindsetService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import { request, respond } from "../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../fixtures/index.js";

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
    oldService.cache.currentProfile = profile.id;
    oldService.cache.profile = structuredClone(profile);
    const oldCreate = vi.spyOn(oldService, "createBindset");

    oldService.destroy();

    replacementService = new BindsetService({ eventBus: fixture.eventBus });
    replacementService.init();
    replacementService.cache.currentProfile = profile.id;
    replacementService.cache.profile = structuredClone(profile);
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
