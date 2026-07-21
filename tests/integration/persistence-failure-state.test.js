import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import eventBus from "../../src/js/core/eventBus.js";
import { createLocalStorageFixture } from "../fixtures/core/index.js";

const root = {
  version: "1.0.0",
  created: "2026-01-01T00:00:00.000Z",
  lastModified: "2026-01-01T00:00:00.000Z",
  currentProfile: "captain",
  profiles: {
    captain: {
      name: "Captain",
      currentEnvironment: "space",
      migrationVersion: "2.1.1",
      builds: {
        space: { keys: { F1: ["FireAll"] } },
        ground: { keys: {} },
      },
      aliases: {},
    },
    first_officer: {
      name: "First Officer",
      currentEnvironment: "ground",
      migrationVersion: "2.1.1",
      builds: {
        space: { keys: {} },
        ground: { keys: { G: ["Aim"] } },
      },
      aliases: {},
    },
  },
  globalAliases: {},
  settings: { theme: "default", autoSave: true },
};

describe("Persistence failure state integration", () => {
  let localStorageFixture;
  let storage;
  let coordinator;
  let preferences;

  beforeEach(async () => {
    localStorageFixture = createLocalStorageFixture({
      initialData: { sto_keybind_manager: root },
      quotaError: true,
    });
    storage = new StorageService({ eventBus, version: "1.0.0" });
    coordinator = new DataCoordinator({
      eventBus,
      storage,
      i18n: { t: (key) => key },
    });

    storage.init();
    await coordinator.init();
    preferences = new PreferencesService({ eventBus, storage });
    preferences.init();
  });

  afterEach(() => {
    preferences?.destroy();
    coordinator?.destroy();
    storage?.destroy();
    eventBus.clear();
    localStorageFixture?.destroy();
    vi.restoreAllMocks();
  });

  it("keeps persisted and in-memory profile state aligned after quota failure", async () => {
    const profileUpdated = vi.fn();
    eventBus.on("profile:updated", profileUpdated);
    const beforeMemory = structuredClone(coordinator.state.profiles.captain);
    const beforeDisk = JSON.parse(localStorage.getItem("sto_keybind_manager"))
      .profiles.captain;

    await expect(
      coordinator.updateProfile("captain", {
        add: { builds: { space: { keys: { F2: ["Jump"] } } } },
      }),
    ).rejects.toThrow("failed_to_save_profile");

    expect(coordinator.state.profiles.captain).toEqual(beforeMemory);
    expect(
      JSON.parse(localStorage.getItem("sto_keybind_manager")).profiles.captain,
    ).toEqual(beforeDisk);
    expect(profileUpdated).not.toHaveBeenCalled();
  });

  it("keeps PreferencesService and durable settings unchanged after quota failure", async () => {
    const saved = vi.fn();
    const changed = vi.fn();
    eventBus.on("preferences:saved", saved);
    eventBus.on("preferences:changed", changed);
    const before = preferences.getCurrentState();

    await expect(preferences.setSetting("theme", "dark")).resolves.toBe(false);

    expect(preferences.getCurrentState()).toEqual(before);
    expect(localStorage.getItem("sto_keybind_settings")).toBeNull();
    expect(storage.getAllData().settings).toEqual(root.settings);
    expect(saved).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it("keeps profile state and the storage cache intact after delete failure", async () => {
    const stateChanged = vi.fn();
    eventBus.on("data:state-changed", stateChanged);

    await expect(coordinator.deleteProfile("captain")).rejects.toThrow(
      "failed_to_delete_profile",
    );

    expect(Object.keys(coordinator.state.profiles)).toEqual([
      "captain",
      "first_officer",
    ]);
    expect(Object.keys(storage.getAllData().profiles)).toEqual([
      "captain",
      "first_officer",
    ]);
    expect(
      Object.keys(
        JSON.parse(localStorage.getItem("sto_keybind_manager")).profiles,
      ),
    ).toEqual(["captain", "first_officer"]);
    expect(stateChanged).not.toHaveBeenCalled();
  });
});
