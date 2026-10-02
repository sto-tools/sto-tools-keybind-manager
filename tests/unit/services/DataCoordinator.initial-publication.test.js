import LocalStorageVisitedStatePersistence from "../../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import LocalStorageProjectRepository from "../../../src/js/components/storage/LocalStorageProjectRepository.js";
import eventBus from "../../../src/js/core/eventBus.js";
import { createStorageFixture } from "../../fixtures/core/storage.js";

const profile = (name) => ({
  name,
  currentEnvironment: "space",
  builds: {
    space: { keys: { F1: ["FireAll"] } },
    ground: { keys: {} },
  },
  aliases: {},
  bindsets: {},
  keybindMetadata: {},
  aliasMetadata: {},
  bindsetMetadata: {},
  migrationVersion: "2.1.1",
});

function deferred() {
  let resolve = () => {};
  /** @type {Promise<void>} */
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("DataCoordinator initial publication settlement", () => {
  let coordinator;
  let storageFixture;

  beforeEach(() => {
    eventBus.clear();
    localStorage.setItem("sto_keybind_manager_visited", "true");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    storageFixture = createStorageFixture();
  });

  afterEach(() => {
    if (coordinator && !coordinator.destroyed) coordinator.destroy();
    eventBus.clear();
    storageFixture?.destroy();
    localStorage.removeItem("sto_keybind_manager_visited");
    vi.restoreAllMocks();
  });

  it("keeps loaded initial state unready until its state publication settles", async () => {
    storageFixture.projectRepository.load.mockReturnValue({
      status: "current",
      value: {
        currentProfile: "alpha",
        profiles: { alpha: profile("Alpha") },
        globalAliases: {},
        version: "1.0.0",
        lastModified: "2026-07-21T00:00:00.000Z",
      },
    });
    const stateGate = deferred();
    const settled = [];
    let stateInvocations = 0;

    eventBus.on("data:state-changed", ({ reason }) => {
      if (reason !== "initial-load") return undefined;
      stateInvocations += 1;
      return stateGate.promise.then(() => settled.push("initial-load"));
    });

    coordinator = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus,
      projectRepository: storageFixture.projectRepository,
      i18n: { t: (key) => key },
      defaultProfiles: {},
    });
    coordinator.init();
    const ready = coordinator.initialStateReady;
    let readySettled = false;
    void ready.then(() => {
      readySettled = true;
    });

    await vi.waitFor(() => expect(stateInvocations).toBe(1));
    await tick();
    expect(readySettled).toBe(false);
    expect(eventBus.hasListeners("rpc:data:create-profile")).toBe(false);

    stateGate.resolve();

    await expect(ready).resolves.toBeUndefined();
    expect(readySettled).toBe(true);
    expect(settled).toEqual(["initial-load"]);
    expect(eventBus.hasListeners("rpc:data:create-profile")).toBe(true);
  });

  it("settles initial and default-profile publications before exposing readiness", async () => {
    localStorage.removeItem("sto_keybind_manager_visited");
    let durableRoot = {
      currentProfile: null,
      profiles: {},
      globalAliases: {},
      version: "1.0.0",
      lastModified: "2026-07-21T00:00:00.000Z",
    };
    storageFixture.projectRepository.load.mockImplementation(() => ({
      status: "current",
      value: structuredClone(durableRoot),
    }));

    const invoked = [];
    storageFixture.projectRepository.commit.mockImplementation((draft) => {
      invoked.push("persist-defaults");
      durableRoot = {
        ...structuredClone(draft),
        lastModified: "2026-07-21T00:00:01.000Z",
      };
      return { status: "committed", value: structuredClone(durableRoot) };
    });
    const initialStateGate = deferred();
    const defaultStateGate = deferred();
    const profileGate = deferred();
    const settled = [];
    const environmentChanged = vi.fn();

    eventBus.on("data:state-changed", ({ reason }) => {
      invoked.push(`state:${reason}`);
      if (reason === "initial-load") {
        return initialStateGate.promise.then(() =>
          settled.push("state:initial-load"),
        );
      }
      if (reason === "default-profiles-created") {
        return defaultStateGate.promise.then(() =>
          settled.push("state:default-profiles-created"),
        );
      }
      return undefined;
    });
    eventBus.on("profile:switched", () => {
      invoked.push("profile:switched");
      return profileGate.promise.then(() => settled.push("profile:switched"));
    });
    eventBus.on("environment:changed", environmentChanged);

    coordinator = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus,
      projectRepository: storageFixture.projectRepository,
      i18n: { t: (key) => key },
      defaultProfiles: { default_space: profile("Default Space") },
    });
    coordinator.init();
    const ready = coordinator.initialStateReady;
    let readySettled = false;
    void ready.then(() => {
      readySettled = true;
    });

    await vi.waitFor(() => {
      expect(invoked).toEqual([
        "persist-defaults",
        "state:initial-load",
        "state:default-profiles-created",
        "profile:switched",
      ]);
    });
    await tick();
    expect(readySettled).toBe(false);
    expect(storageFixture.projectRepository.commit).toHaveBeenCalledTimes(1);
    expect(readySettled).toBe(false);
    expect(eventBus.hasListeners("rpc:data:create-profile")).toBe(false);

    initialStateGate.resolve();
    await tick();
    expect(readySettled).toBe(false);
    profileGate.resolve();
    await tick();
    expect(readySettled).toBe(false);
    defaultStateGate.resolve();

    await expect(ready).resolves.toBeUndefined();
    expect(settled).toEqual([
      "state:initial-load",
      "profile:switched",
      "state:default-profiles-created",
    ]);
    expect(environmentChanged).not.toHaveBeenCalled();
    expect(coordinator.getCurrentState()).toMatchObject({
      ready: true,
      revision: 2,
      currentProfile: "default_space",
    });
    expect(eventBus.hasListeners("rpc:data:create-profile")).toBe(true);
  });

  it.each(["write_failed", "readback_failed"])(
    "blocks all startup ready publications when automatic defaults %s",
    async (failure) => {
      localStorage.removeItem("sto_keybind_manager_visited");
      const rootKey = "sto_keybind_manager";
      const data = new Map([
        [
          rootKey,
          JSON.stringify({
            currentProfile: null,
            profiles: {},
            globalAliases: {},
            version: "1.0.0",
            lastModified: "2026-07-21T00:00:00.000Z",
          }),
        ],
      ]);
      let defaultsWritten = false;
      const storage = {
        getItem: vi.fn((key) => {
          if (
            key === rootKey &&
            defaultsWritten &&
            failure === "readback_failed"
          )
            throw new Error("blocked readback");
          return data.get(key) ?? null;
        }),
        setItem: vi.fn((key, raw) => {
          const writingDefaults =
            key === rootKey && Object.keys(JSON.parse(raw).profiles).length > 0;
          if (writingDefaults && failure === "write_failed")
            throw new Error("blocked write");
          data.set(key, raw);
          if (writingDefaults) defaultsWritten = true;
        }),
        removeItem: vi.fn((key) => data.delete(key)),
      };
      const states = vi.fn();
      const storageChanges = vi.fn();
      const profiles = vi.fn();
      eventBus.on("data:state-changed", states);
      eventBus.on("storage:data-changed", storageChanges);
      eventBus.on("profile:switched", profiles);
      coordinator = new DataCoordinator({
        visitedState: new LocalStorageVisitedStatePersistence({
          storage: localStorage,
        }),
        eventBus,
        projectRepository: new LocalStorageProjectRepository({
          storage,
          version: "1.0.0",
          now: () => "2026-10-02T18:00:00.000Z",
        }),
        i18n: { t: (key) => key },
        defaultProfiles: { default_space: profile("Default Space") },
      });
      coordinator.init();
      await expect(coordinator.initialStateReady).rejects.toThrow(
        "failed_to_load_profile_data",
      );
      expect(coordinator.getCurrentState()).toMatchObject({
        ready: false,
        revision: 0,
        currentProfile: null,
        profiles: {},
      });
      expect(states).not.toHaveBeenCalled();
      expect(storageChanges).not.toHaveBeenCalled();
      expect(profiles).not.toHaveBeenCalled();
      expect(eventBus.hasListeners("rpc:data:create-profile")).toBe(false);
      expect(coordinator.needsDefaultProfiles).toBe(true);
    },
  );

  it("publishes an empty durable initial state when the automatic default catalog is empty", async () => {
    localStorage.removeItem("sto_keybind_manager_visited");
    storageFixture.projectRepository.load.mockReturnValue({
      status: "current",
      value: {
        currentProfile: null,
        profiles: {},
        globalAliases: {},
        version: "1.0.0",
        lastModified: "2026-07-21T00:00:00.000Z",
      },
    });
    const states = vi.fn();
    eventBus.on("data:state-changed", states);
    coordinator = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus,
      projectRepository: storageFixture.projectRepository,
      i18n: { t: (key) => key },
      defaultProfiles: {},
    });
    coordinator.init();
    await coordinator.initialStateReady;
    expect(states).toHaveBeenCalledTimes(1);
    expect(states.mock.calls[0][0]).toMatchObject({
      reason: "initial-load",
      state: { ready: true, revision: 1, profiles: {} },
    });
    expect(storageFixture.projectRepository.commit).not.toHaveBeenCalled();
  });

  it("allows an initial-publication listener to await reload without a readiness cycle", async () => {
    storageFixture.projectRepository.load.mockReturnValue({
      status: "current",
      value: {
        currentProfile: "alpha",
        profiles: { alpha: profile("Alpha") },
        globalAliases: {},
        version: "1.0.0",
        lastModified: "2026-07-21T00:00:00.000Z",
      },
    });
    const reasons = [];
    const reloadResults = [];
    eventBus.on("data:state-changed", async ({ reason }) => {
      reasons.push(reason);
      if (reason === "initial-load") {
        reloadResults.push(await coordinator.reloadState());
      }
    });
    coordinator = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus,
      projectRepository: storageFixture.projectRepository,
      i18n: { t: (key) => key },
      defaultProfiles: {},
    });
    coordinator.init();
    await coordinator.initialStateReady;
    expect(reasons).toEqual(["initial-load", "state-reloaded"]);
    expect(reloadResults).toEqual([
      {
        success: true,
        profiles: 1,
        currentProfile: "alpha",
        environment: "space",
      },
    ]);
    expect(eventBus.hasListeners("rpc:data:create-profile")).toBe(true);
  });
});
