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

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

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
    fixture.storage.getAllData.mockImplementation(() =>
      structuredClone(durableRoot),
    );
    fixture.storage.getProfile.mockImplementation((profileId) =>
      structuredClone(durableRoot.profiles[profileId] || null),
    );
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
    fixture.eventBusFixture.clearEventHistory();
    fixture.storage.saveAllData.mockClear();
    fixture.storage.saveProfile.mockClear();
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

  function holdWrite(method) {
    const pending = deferred();
    fixture.storage[method].mockImplementationOnce(() => pending.promise);
    return pending;
  }

  async function expectDestroyToCancel(method, perform) {
    const stateBefore = structuredClone(coordinator.state);
    const snapshotBefore = coordinator.getCurrentState();
    const pending = holdWrite(method);

    const result = perform();
    await vi.waitFor(() => {
      expect(fixture.storage[method]).toHaveBeenCalledTimes(1);
    });
    coordinator.destroy();
    pending.resolve(true);

    await expect(result).rejects.toThrow();
    expect(coordinator.state).toEqual(stateBefore);
    expect(coordinator.getCurrentState()).toEqual({
      ...snapshotBefore,
      ready: false,
    });
    expect(coordinator.getCurrentState()).not.toBe(snapshotBefore);
    expect(emittedMutations()).toEqual([]);
  }

  it("does not adopt or publish an in-flight structural profile update after destroy", async () => {
    await expectDestroyToCancel("saveProfile", () =>
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
    ["profile switch", "saveAllData", (owner) => owner.switchProfile("beta")],
    ["profile create", "saveProfile", (owner) => owner.createProfile("Gamma")],
    [
      "profile clone",
      "saveProfile",
      (owner) => owner.cloneProfile("alpha", "Alpha Copy"),
    ],
    [
      "profile rename",
      "saveProfile",
      (owner) => owner.renameProfile("alpha", "Renamed"),
    ],
    ["profile delete", "saveAllData", (owner) => owner.deleteProfile("beta")],
    [
      "default profile batch",
      "saveAllData",
      (owner) =>
        owner.createDefaultProfilesFromData({
          default_space: profile("Default"),
        }),
    ],
    [
      "fallback profile batch",
      "saveAllData",
      (owner) => owner.createFallbackProfiles(),
    ],
  ])(
    "cancels an in-flight %s after teardown",
    async (_label, method, perform) => {
      await expectDestroyToCancel(method, () => perform(coordinator));
    },
  );

  it("does not complete an explicit default-profile load after teardown", async () => {
    const stateBefore = structuredClone(coordinator.state);
    const pendingWrite = holdWrite("saveAllData");

    const result = coordinator.loadDefaultData();
    await vi.waitFor(() => {
      expect(fixture.storage.saveAllData).toHaveBeenCalledTimes(1);
    });
    coordinator.destroy();
    pendingWrite.resolve(true);

    await expect(result).resolves.toEqual({
      success: false,
      error: "operation_cancelled",
    });
    expect(coordinator.state).toEqual(stateBefore);
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
    const pendingWrite = holdWrite("saveAllData");

    const result = coordinator.normalizeAllProfiles(staleProfiles, {
      rootData: {
        ...structuredClone(durableRoot),
        currentProfile: "legacy",
        profiles: structuredClone(staleProfiles),
      },
    });
    await vi.waitFor(() => {
      expect(fixture.storage.saveAllData).toHaveBeenCalledTimes(1);
    });
    expect(fixture.storage.saveAllData.mock.calls[0][1]).toEqual({
      preserveBackup: true,
    });
    coordinator.destroy();
    pendingWrite.resolve(true);

    await expect(result).rejects.toThrow("operation_cancelled");
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
    fixture.storage.saveProfile.mockImplementation((profileId, draft) => {
      durableRoot.profiles[profileId] = {
        ...structuredClone(draft),
        lastModified: durableTimestamp,
      };
      return true;
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
    expect(fixture.storage.saveProfile.mock.calls[0][1].lastModified).not.toBe(
      durableTimestamp,
    );
    expect(updates).toEqual({
      add: { aliases: { engage: { commands: ["FireAll"] } } },
    });

    result.profile.name = "caller mutation";
    expect(coordinator.state.profiles.alpha.name).toBe("Alpha");
  });
});
