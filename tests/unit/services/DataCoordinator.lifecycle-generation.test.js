import LocalStorageVisitedStatePersistence from "../../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import { request } from "../../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../../fixtures/index.js";

const profile = (name, currentEnvironment = "space") => ({
  name,
  currentEnvironment,
  builds: {
    space: { keys: { F1: ["FireAll"] } },
    ground: { keys: { F2: ["Jump"] } },
  },
  aliases: {},
  bindsets: {},
  keybindMetadata: {},
  aliasMetadata: {},
  bindsetMetadata: {},
  migrationVersion: "2.1.1",
});

const mutationEvents = new Set([
  "data:state-changed",
  "environment:changed",
  "profile:switched",
  "profile:updated",
]);

const responderTopics = [
  "data:switch-profile",
  "data:create-profile",
  "data:clone-profile",
  "data:rename-profile",
  "data:delete-profile",
  "data:update-profile",
  "data:reload-state",
];

const retiredTopics = [
  "data:get-current-state",
  "data:get-all-profiles",
  "data:get-keys",
  "data:get-key-commands",
  "data:set-environment",
  "data:update-settings",
  "data:load-default-data",
];

describe("DataCoordinator lifecycle generation", () => {
  let fixture;
  let coordinator;
  let durableRoot;

  beforeEach(async () => {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    fixture = createServiceFixture();
    durableRoot = {
      currentProfile: "alpha",
      profiles: {
        alpha: profile("Alpha"),
        beta: profile("Beta", "ground"),
      },
      settings: { theme: "dark" },
      version: "1.0.0",
      lastModified: "2026-07-16T00:00:00.000Z",
    };
    fixture.projectRepository.load.mockImplementation(() => ({
      status: "current",
      value: structuredClone(durableRoot),
    }));
    fixture.projectRepository.commit.mockImplementation((candidate) => {
      durableRoot = structuredClone(candidate);
      return { status: "committed", value: structuredClone(durableRoot) };
    });
    coordinator = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus: fixture.eventBus,
      projectRepository: fixture.projectRepository,
      i18n: { t: (key) => key },
    });
    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
    fixture.eventBusFixture.clearEventHistory();
    fixture.projectRepository.commit.mockClear();
  });

  afterEach(() => {
    if (!coordinator.destroyed) coordinator.destroy();
    fixture.destroy();
    localStorage.removeItem("sto_keybind_manager_visited");
    vi.restoreAllMocks();
  });

  function emittedMutations() {
    return fixture
      .getEventHistory()
      .filter(({ event }) => mutationEvents.has(event));
  }

  async function expectDestroyToCancel(perform) {
    const stateBefore = structuredClone(coordinator.state);
    const snapshotBefore = coordinator.getCurrentState();
    fixture.projectRepository.commit.mockImplementationOnce((candidate) => {
      durableRoot = structuredClone(candidate);
      coordinator.destroy();
      return { status: "committed", value: structuredClone(durableRoot) };
    });

    const result = perform();

    await expect(result).rejects.toThrow();
    expect(fixture.projectRepository.commit).toHaveBeenCalledTimes(1);
    expect(coordinator.state).toEqual(stateBefore);
    expect(coordinator.getCurrentState()).toEqual({
      ...snapshotBefore,
      ready: false,
    });
    expect(coordinator.getCurrentState()).not.toBe(snapshotBefore);
    expect(emittedMutations()).toEqual([]);
  }

  it("does not adopt or publish an in-flight structural profile update after destroy", async () => {
    await expectDestroyToCancel(() =>
      coordinator.updateProfile("alpha", {
        add: { aliases: { engage: { commands: ["FireAll"] } } },
      }),
    );
  });

  it("restores exactly one functional responder set across reinitialization cycles", async () => {
    const reloadState = vi.spyOn(coordinator, "reloadState");
    let expectedCalls = 0;

    for (const topic of responderTopics) {
      expect(fixture.eventBus.hasListeners(`rpc:${topic}`)).toBe(true);
    }
    for (const topic of retiredTopics) {
      expect(fixture.eventBus.hasListeners(`rpc:${topic}`)).toBe(false);
    }

    for (let cycle = 0; cycle < 2; cycle += 1) {
      const revisionBefore = coordinator.getCurrentState().revision;
      const generationBefore = coordinator._lifecycleGeneration;
      coordinator.destroy();

      expect(coordinator._lifecycleGeneration).toBe(generationBefore + 1);
      for (const topic of responderTopics) {
        expect(fixture.eventBus.hasListeners(`rpc:${topic}`)).toBe(false);
      }

      coordinator.init();
      await vi.waitFor(() => {
        expect(coordinator.getCurrentState().revision).toBeGreaterThan(
          revisionBefore,
        );
      });
      for (const topic of responderTopics) {
        expect(fixture.eventBus.hasListeners(`rpc:${topic}`)).toBe(true);
      }
      for (const topic of retiredTopics) {
        expect(fixture.eventBus.hasListeners(`rpc:${topic}`)).toBe(false);
      }

      await expect(
        request(fixture.eventBus, "data:reload-state"),
      ).resolves.toMatchObject({ success: true, currentProfile: "alpha" });
      expectedCalls += 1;
      expect(reloadState).toHaveBeenCalledTimes(expectedCalls);
    }
  });

  it.each([
    ["profile switch", (owner) => owner.switchProfile("beta")],
    ["profile create", (owner) => owner.createProfile("Gamma")],
    ["profile clone", (owner) => owner.cloneProfile("alpha", "Alpha Copy")],
    ["profile rename", (owner) => owner.renameProfile("alpha", "Renamed")],
    ["profile delete", (owner) => owner.deleteProfile("beta")],
    [
      "default profile batch",
      (owner) =>
        owner.createDefaultProfilesFromData({
          default_space: profile("Default"),
        }),
    ],
    ["fallback profile batch", (owner) => owner.createFallbackProfiles()],
  ])("cancels an in-flight %s after teardown", async (_label, perform) => {
    await expectDestroyToCancel(() => perform(coordinator));
  });

  it("does not complete an explicit default-profile load after teardown", async () => {
    const stateBefore = structuredClone(coordinator.state);
    fixture.projectRepository.commit.mockImplementationOnce((candidate) => {
      durableRoot = structuredClone(candidate);
      coordinator.destroy();
      return { status: "committed", value: structuredClone(durableRoot) };
    });

    const result = coordinator.loadDefaultData();

    await expect(result).resolves.toEqual({
      success: false,
      error: "operation_cancelled",
    });
    expect(coordinator.state).toEqual(stateBefore);
    expect(fixture.projectRepository.commit).toHaveBeenCalledTimes(1);
    expect(emittedMutations()).toEqual([]);
  });

  it("does not adopt an in-flight normalization after teardown", async () => {
    const staleProfiles = {
      legacy: profile("Legacy"),
    };
    delete staleProfiles.legacy.migrationVersion;
    const profilesBefore = structuredClone(staleProfiles);
    const stateBefore = structuredClone(coordinator.state);
    const snapshotBefore = coordinator.getCurrentState();
    coordinator._projectRoot = {
      ...structuredClone(durableRoot),
      currentProfile: "legacy",
      profiles: structuredClone(staleProfiles),
    };
    fixture.projectRepository.commit.mockImplementationOnce((candidate) => {
      durableRoot = structuredClone(candidate);
      coordinator.destroy();
      return { status: "committed", value: structuredClone(durableRoot) };
    });

    const result = coordinator.normalizeAllProfiles(staleProfiles);
    await expect(result).rejects.toThrow("failed_to_save_profile");
    expect(fixture.projectRepository.commit).toHaveBeenCalledTimes(1);
    expect(fixture.projectRepository.commit.mock.calls[0][1]).toEqual({
      verification: "not_requested",
    });
    expect(staleProfiles).toEqual(profilesBefore);
    expect(coordinator.state).toEqual(stateBefore);
    expect(coordinator.getCurrentState()).toEqual({
      ...snapshotBefore,
      ready: false,
    });
    expect(coordinator.getCurrentState()).not.toBe(snapshotBefore);
    expect(emittedMutations()).toEqual([]);
  });

  it("adopts and returns the exact detached profile persisted by storage", async () => {
    const durableTimestamp = "2099-01-01T00:00:00.000Z";
    fixture.projectRepository.commit.mockImplementation((candidate) => {
      durableRoot = structuredClone(candidate);
      durableRoot.profiles.alpha = {
        ...durableRoot.profiles.alpha,
        lastModified: durableTimestamp,
      };
      return { status: "committed", value: structuredClone(durableRoot) };
    });
    const updates = {
      add: { aliases: { engage: { commands: ["FireAll"] } } },
    };

    const result = await coordinator.updateProfile("alpha", updates);

    expect(result.profile.lastModified).toBe(durableTimestamp);
    expect(coordinator.state.profiles.alpha.lastModified).toBe(
      durableTimestamp,
    );
    expect(coordinator.getCurrentState().profiles.alpha.lastModified).toBe(
      durableTimestamp,
    );
    expect(
      fixture.projectRepository.commit.mock.calls[0][0].profiles.alpha
        .lastModified,
    ).not.toBe(durableTimestamp);
    expect(updates).toEqual({
      add: { aliases: { engage: { commands: ["FireAll"] } } },
    });

    result.profile.name = "caller mutation";
    expect(coordinator.state.profiles.alpha.name).toBe("Alpha");
  });
});
