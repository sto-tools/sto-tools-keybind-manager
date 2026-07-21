import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import { createServiceFixture } from "../../fixtures/index.js";

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

const root = (profileId, name = profileId) => ({
  currentProfile: profileId,
  profiles: { [profileId]: profile(name) },
  settings: { theme: "dark" },
  version: "1.0.0",
  lastModified: `2026-07-21T00:00:0${profileId.length}.000Z`,
});

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("DataCoordinator initial-load ordering", () => {
  let fixture;
  let coordinator;
  let durableRoot;

  beforeEach(() => {
    localStorage.setItem("sto_keybind_manager_visited", "true");
    fixture = createServiceFixture();
    durableRoot = root("stale", "Stale");
    fixture.storage.getAllData.mockImplementation(() =>
      structuredClone(durableRoot),
    );
    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => key },
    });
  });

  afterEach(() => {
    if (!coordinator.destroyed) coordinator.destroy();
    fixture.destroy();
    localStorage.removeItem("sto_keybind_manager_visited");
    vi.restoreAllMocks();
  });

  function stateChangeReasons() {
    return fixture
      .getEventHistory()
      .filter(({ event }) => event === "data:state-changed")
      .map(({ data }) => data.reason);
  }

  it("does not expose or execute reload before initialization", async () => {
    expect(fixture.eventBus.hasListeners("rpc:data:reload-state")).toBe(false);

    await expect(coordinator.reloadState()).resolves.toEqual({
      success: false,
      error: "operation_cancelled",
    });
    expect(fixture.storage.getAllData).not.toHaveBeenCalled();
  });

  it("settles startup normalization before restore can replace durable and owner state", async () => {
    delete durableRoot.profiles.stale.migrationVersion;
    const pendingInitialWrite = deferred();
    const writeOrder = [];
    let saveCount = 0;
    fixture.storage.saveAllData.mockImplementation(async (draft) => {
      saveCount += 1;
      if (saveCount === 1) await pendingInitialWrite.promise;
      durableRoot = structuredClone(draft);
      writeOrder.push(saveCount === 1 ? "initial-normalization" : "reload");
      return true;
    });

    coordinator.init();
    await vi.waitFor(() => {
      expect(fixture.storage.saveAllData).toHaveBeenCalledTimes(1);
    });

    const importedRoot = root("imported", "Imported");
    let restoreStarted = false;
    const startupRestore = (async () => {
      await coordinator.initialStateReady;
      restoreStarted = true;
      durableRoot = structuredClone(importedRoot);
      writeOrder.push("startup-restore");
      return coordinator.reloadState();
    })();

    await Promise.resolve();
    expect(restoreStarted).toBe(false);
    expect(durableRoot.currentProfile).toBe("stale");

    pendingInitialWrite.resolve();

    await expect(startupRestore).resolves.toMatchObject({
      success: true,
      currentProfile: "imported",
    });
    expect(writeOrder).toEqual(["initial-normalization", "startup-restore"]);
    expect(durableRoot).toEqual(importedRoot);
    expect(coordinator.state.currentProfile).toBe("imported");
    expect(Object.keys(coordinator.state.profiles)).toEqual(["imported"]);
    expect(stateChangeReasons()).toEqual(["initial-load", "state-reloaded"]);
  });

  it("includes first-run default persistence in the startup barrier", async () => {
    localStorage.removeItem("sto_keybind_manager_visited");
    durableRoot = {
      currentProfile: null,
      profiles: {},
      settings: {},
      version: "1.0.0",
      lastModified: "2026-07-21T00:00:00.000Z",
    };
    coordinator.defaultProfileDefinitions = {
      default_space: profile("Default Space"),
    };
    const pendingDefaultWrite = deferred();
    fixture.storage.saveAllData.mockImplementationOnce(async (draft) => {
      await pendingDefaultWrite.promise;
      durableRoot = structuredClone(draft);
      return true;
    });

    coordinator.init();
    await vi.waitFor(() => {
      expect(fixture.storage.saveAllData).toHaveBeenCalledTimes(1);
    });

    const importedRoot = root("imported", "Imported");
    let restoreStarted = false;
    const startupRestore = (async () => {
      await coordinator.initialStateReady;
      restoreStarted = true;
      durableRoot = structuredClone(importedRoot);
      return coordinator.reloadState();
    })();

    await Promise.resolve();
    expect(restoreStarted).toBe(false);
    expect(durableRoot.profiles).toEqual({});

    pendingDefaultWrite.resolve();

    await expect(startupRestore).resolves.toMatchObject({
      success: true,
      currentProfile: "imported",
    });
    expect(durableRoot).toEqual(importedRoot);
    expect(coordinator.state.currentProfile).toBe("imported");
    expect(Object.keys(coordinator.state.profiles)).toEqual(["imported"]);
    expect(stateChangeReasons()).toEqual([
      "initial-load",
      "default-profiles-created",
      "state-reloaded",
    ]);
  });

  it("serializes reload behind a pending initial owner-state draft", async () => {
    const pendingNormalization = deferred();
    const normalize = vi
      .spyOn(coordinator, "normalizeAllProfiles")
      .mockImplementationOnce(() => pendingNormalization.promise)
      .mockResolvedValue(0);

    coordinator.init();
    await vi.waitFor(() => {
      expect(normalize).toHaveBeenCalledTimes(1);
    });

    durableRoot = root("fresh", "Fresh");
    const reload = coordinator.reloadState();

    await Promise.resolve();
    expect(fixture.storage.getAllData).toHaveBeenCalledTimes(1);
    expect(normalize).toHaveBeenCalledTimes(1);

    pendingNormalization.resolve(0);

    await expect(reload).resolves.toMatchObject({
      success: true,
      currentProfile: "fresh",
    });
    expect(coordinator.state.currentProfile).toBe("fresh");
    expect(Object.keys(coordinator.state.profiles)).toEqual(["fresh"]);
    expect(stateChangeReasons()).toEqual(["initial-load", "state-reloaded"]);
  });

  it("queues a reinitialized lifecycle behind the prior initial load", async () => {
    const firstNormalization = deferred();
    const normalize = vi
      .spyOn(coordinator, "normalizeAllProfiles")
      .mockImplementationOnce(() => firstNormalization.promise)
      .mockResolvedValue(0);

    coordinator.init();
    await vi.waitFor(() => {
      expect(normalize).toHaveBeenCalledTimes(1);
    });
    const firstReady = coordinator.initialStateReady;

    coordinator.destroy();
    durableRoot = root("fresh", "Fresh");
    coordinator.init();
    const secondReady = coordinator.initialStateReady;

    expect(secondReady).not.toBe(firstReady);
    await Promise.resolve();
    expect(normalize).toHaveBeenCalledTimes(1);
    expect(fixture.storage.getAllData).toHaveBeenCalledTimes(1);

    firstNormalization.resolve(0);

    await expect(firstReady).rejects.toThrow("operation_cancelled");
    await secondReady;
    expect(normalize).toHaveBeenCalledTimes(2);
    expect(coordinator.state.currentProfile).toBe("fresh");
    expect(Object.keys(coordinator.state.profiles)).toEqual(["fresh"]);
    expect(stateChangeReasons()).toEqual(["initial-load"]);
  });

  it("withholds mutation surfaces and stale ready state during reinitialization", async () => {
    coordinator.init();
    await coordinator.initialStateReady;
    expect(fixture.eventBus.getListenerCount("rpc:data:create-profile")).toBe(
      1,
    );
    expect(fixture.eventBus.getListenerCount("storage:data-reset")).toBe(1);
    const priorReadyState = coordinator.getCurrentState();

    coordinator.destroy();
    expect(coordinator.getCurrentState()).toMatchObject({ ready: false });
    expect(coordinator.getCurrentState()).not.toBe(priorReadyState);

    durableRoot = root("fresh", "Fresh");
    const pendingNormalization = deferred();
    vi.spyOn(coordinator, "normalizeAllProfiles").mockImplementationOnce(
      () => pendingNormalization.promise,
    );
    fixture.storage.saveProfile.mockClear();
    coordinator.init();
    const ready = coordinator.initialStateReady;
    await vi.waitFor(() => {
      expect(fixture.storage.getAllData).toHaveBeenCalledTimes(3);
    });

    expect(fixture.eventBus.getListenerCount("rpc:data:create-profile")).toBe(
      0,
    );
    expect(fixture.eventBus.getListenerCount("storage:data-reset")).toBe(0);
    expect(fixture.eventBus.getListenerCount("data:load-default")).toBe(0);

    const replies = [];
    const replyTopic = "component:registered:reply:LateConsumer:test";
    fixture.eventBus.on(replyTopic, (reply) => replies.push(reply));
    fixture.eventBus.emit("component:register", {
      name: "LateConsumer",
      replyTopic,
    });
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({
      sender: "DataCoordinator",
      state: { ready: false },
    });
    expect(replies[0].state).not.toBe(priorReadyState);

    fixture.eventBus.emit("rpc:data:create-profile", {
      requestId: "blocked-create",
      replyTopic: "rpc:test:blocked-create",
      payload: { name: "Blocked" },
    });
    fixture.eventBus.emit("storage:data-reset", {
      data: { currentProfile: null, profiles: {}, settings: {} },
    });
    expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
    expect(coordinator.state.currentProfile).toBe("stale");

    pendingNormalization.resolve(0);
    await ready;
    expect(coordinator.state.currentProfile).toBe("fresh");
    expect(fixture.eventBus.getListenerCount("rpc:data:create-profile")).toBe(
      1,
    );
    expect(fixture.eventBus.getListenerCount("storage:data-reset")).toBe(1);
    expect(fixture.eventBus.getListenerCount("data:load-default")).toBe(1);
  });

  it("exposes initial failure while settling the serialization tail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fixture.storage.getAllData.mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    coordinator.init();

    await expect(coordinator.initialStateReady).rejects.toThrow(
      "failed_to_load_profile_data",
    );
    await expect(coordinator.initialStateSettled).resolves.toBeUndefined();
    expect(coordinator.getCurrentState()).toMatchObject({
      ready: false,
      currentProfile: null,
      profiles: {},
    });
    expect(fixture.eventBus.getListenerCount("rpc:data:create-profile")).toBe(
      0,
    );
    expect(fixture.eventBus.getListenerCount("storage:data-reset")).toBe(0);
    await expect(coordinator.reloadState()).resolves.toEqual({
      success: false,
      error: "failed_to_load_profile_data",
    });
  });

  it("cancels a reload waiting on initialization when its lifecycle ends", async () => {
    const pendingNormalization = deferred();
    const normalize = vi
      .spyOn(coordinator, "normalizeAllProfiles")
      .mockImplementationOnce(() => pendingNormalization.promise)
      .mockResolvedValue(0);

    coordinator.init();
    await vi.waitFor(() => {
      expect(normalize).toHaveBeenCalledTimes(1);
    });

    const stateBefore = structuredClone(coordinator.state);
    const reload = coordinator.reloadState();
    coordinator.destroy();
    pendingNormalization.resolve(0);

    await expect(reload).resolves.toEqual({
      success: false,
      error: "operation_cancelled",
    });
    await coordinator.initialStateSettled;
    expect(coordinator.state).toEqual(stateBefore);
    expect(stateChangeReasons()).toEqual([]);
  });
});
