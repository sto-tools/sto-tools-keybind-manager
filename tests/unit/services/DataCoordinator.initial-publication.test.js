import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
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
    storageFixture.storageService.getAllData.mockReturnValue({
      currentProfile: "alpha",
      profiles: { alpha: profile("Alpha") },
      settings: { theme: "dark" },
      version: "1.0.0",
      lastModified: "2026-07-21T00:00:00.000Z",
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
      eventBus,
      storage: storageFixture.storageService,
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
      settings: {},
      version: "1.0.0",
      lastModified: "2026-07-21T00:00:00.000Z",
    };
    storageFixture.storageService.getAllData.mockImplementation(() =>
      structuredClone(durableRoot),
    );

    const invoked = [];
    storageFixture.storageService.saveAllData.mockImplementation((draft) => {
      invoked.push("persist-defaults");
      durableRoot = structuredClone(draft);
      return true;
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
      eventBus,
      storage: storageFixture.storageService,
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
        "state:initial-load",
        "persist-defaults",
        "state:default-profiles-created",
        "profile:switched",
      ]);
    });
    await tick();
    expect(readySettled).toBe(false);
    expect(storageFixture.storageService.saveAllData).toHaveBeenCalledTimes(1);
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
});
