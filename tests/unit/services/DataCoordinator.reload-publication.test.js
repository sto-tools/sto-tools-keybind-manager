import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import eventBus from "../../../src/js/core/eventBus.js";
import { request } from "../../../src/js/core/requestResponse.js";
import { createStorageFixture } from "../../fixtures/core/storage.js";

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

function deferred() {
  let resolve = () => {};
  let reject = () => {};
  /** @type {Promise<void>} */
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = () => resolvePromise();
    reject = (reason) => rejectPromise(reason);
  });
  return { promise, reject, resolve };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("DataCoordinator reload publication acknowledgement", () => {
  let coordinator;
  let replacement;
  let storageFixture;
  let storage;

  beforeEach(async () => {
    eventBus.clear();
    localStorage.setItem("sto_keybind_manager_visited", "true");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    storageFixture = createStorageFixture();
    storage = storageFixture.storageService;
    storage.getAllData.mockImplementation(() => ({
      currentProfile: "alpha",
      profiles: { alpha: profile("Alpha") },
      settings: { theme: "dark" },
      version: "1.0.0",
      lastModified: "2026-07-21T00:00:00.000Z",
    }));
    coordinator = new DataCoordinator({
      eventBus,
      storage,
      i18n: { t: (key) => key },
      defaultProfiles: {},
    });
    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
  });

  afterEach(() => {
    if (coordinator && !coordinator.destroyed) coordinator.destroy();
    if (replacement && !replacement.destroyed) replacement.destroy();
    eventBus.clear();
    storageFixture?.destroy();
    localStorage.removeItem("sto_keybind_manager_visited");
    vi.restoreAllMocks();
  });

  function useReloadedRoot() {
    storage.getAllData.mockImplementation(() => ({
      currentProfile: "beta",
      profiles: { beta: profile("Beta", "ground") },
      settings: { theme: "light" },
      version: "1.0.0",
      lastModified: "2026-07-21T01:00:00.000Z",
    }));
  }

  function replaceCoordinator() {
    coordinator.destroy();
    replacement = new DataCoordinator({
      eventBus,
      storage,
      i18n: { t: (key) => key },
      defaultProfiles: {},
    });
    replacement.init();
  }

  it("resolves its RPC only after all reload publications settle", async () => {
    useReloadedRoot();
    const stateGate = deferred();
    const profileGate = deferred();
    const environmentGate = deferred();
    const invoked = [];
    const settled = [];

    eventBus.on("data:state-changed", ({ reason }) => {
      if (reason !== "state-reloaded") return undefined;
      invoked.push("state-reloaded");
      return stateGate.promise.then(() => settled.push("state-reloaded"));
    });
    eventBus.on("profile:switched", () => {
      invoked.push("profile:switched");
      return profileGate.promise.then(() => settled.push("profile:switched"));
    });
    eventBus.on("environment:changed", () => {
      invoked.push("environment:changed");
      return environmentGate.promise.then(() =>
        settled.push("environment:changed"),
      );
    });

    let responseSettled = false;
    const response = request(eventBus, "data:reload-state");
    void response.then(
      () => {
        responseSettled = true;
      },
      () => {
        responseSettled = true;
      },
    );

    await vi.waitFor(() => {
      expect(invoked).toEqual([
        "state-reloaded",
        "profile:switched",
        "environment:changed",
      ]);
    });
    expect(responseSettled).toBe(false);

    environmentGate.resolve();
    await tick();
    expect(responseSettled).toBe(false);
    stateGate.resolve();
    await tick();
    expect(responseSettled).toBe(false);
    profileGate.resolve();

    await expect(response).resolves.toEqual({
      success: true,
      profiles: 1,
      currentProfile: "beta",
      environment: "ground",
    });
    expect(settled).toEqual([
      "environment:changed",
      "state-reloaded",
      "profile:switched",
    ]);
    expect(invoked).toHaveLength(3);
  });

  it("treats an async listener rejection as settled publication work", async () => {
    useReloadedRoot();
    const profileGate = deferred();
    let profileInvocations = 0;

    eventBus.on("profile:switched", () => {
      profileInvocations += 1;
      return profileGate.promise;
    });

    let responseSettled = false;
    const response = request(eventBus, "data:reload-state");
    void response.then(
      () => {
        responseSettled = true;
      },
      () => {
        responseSettled = true;
      },
    );
    await vi.waitFor(() => expect(profileInvocations).toBe(1));
    expect(responseSettled).toBe(false);

    profileGate.reject(new Error("consumer rejected"));

    await expect(response).resolves.toMatchObject({
      success: true,
      currentProfile: "beta",
      environment: "ground",
    });
    expect(profileInvocations).toBe(1);
  });

  it("cancels an acknowledged reload when its owner is destroyed while listeners settle", async () => {
    useReloadedRoot();
    const environmentGate = deferred();
    let environmentInvocations = 0;

    eventBus.on("environment:changed", () => {
      environmentInvocations += 1;
      return environmentGate.promise;
    });

    let responseSettled = false;
    const response = request(eventBus, "data:reload-state");
    void response.then(
      () => {
        responseSettled = true;
      },
      () => {
        responseSettled = true;
      },
    );
    await vi.waitFor(() => expect(environmentInvocations).toBe(1));

    coordinator.destroy();
    await tick();
    expect(responseSettled).toBe(false);

    environmentGate.resolve();

    await expect(response).resolves.toEqual({
      success: false,
      error: "operation_cancelled",
    });
    expect(environmentInvocations).toBe(1);
  });

  it("stops compatibility publication when the state listener replaces its owner", async () => {
    useReloadedRoot();
    const switched = vi.fn();
    const environmentChanged = vi.fn();
    eventBus.on("data:state-changed", ({ reason }) => {
      if (reason === "state-reloaded") replaceCoordinator();
    });
    eventBus.on("profile:switched", switched);
    eventBus.on("environment:changed", environmentChanged);

    await expect(request(eventBus, "data:reload-state")).resolves.toEqual({
      success: false,
      error: "operation_cancelled",
    });
    expect(switched).not.toHaveBeenCalled();
    expect(environmentChanged).not.toHaveBeenCalled();
    await replacement.initialStateReady;
  });

  it("stops environment publication when the profile listener replaces its owner", async () => {
    useReloadedRoot();
    const environmentChanged = vi.fn();
    eventBus.on("profile:switched", replaceCoordinator);
    eventBus.on("environment:changed", environmentChanged);

    await expect(request(eventBus, "data:reload-state")).resolves.toEqual({
      success: false,
      error: "operation_cancelled",
    });
    expect(environmentChanged).not.toHaveBeenCalled();
    await replacement.initialStateReady;
  });
});
