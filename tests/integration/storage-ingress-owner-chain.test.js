import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import { createEventBusFixture } from "../fixtures/core/eventBus.js";
import { createLocalStorageFixture } from "../fixtures/core/storage.js";

const FIXTURE_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/storage",
);
const STORAGE_KEY = "sto_keybind_manager";
const BACKUP_KEY = "sto_keybind_manager_backup";

function readFixture(fileName) {
  return JSON.parse(readFileSync(join(FIXTURE_DIRECTORY, fileName), "utf8"));
}

describe("persisted storage ingress owner chain", () => {
  let eventBusFixture;
  let storage;
  let coordinator;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("sto_keybind_manager_visited", "true");
    eventBusFixture = createEventBusFixture();
  });

  afterEach(() => {
    coordinator?.destroy();
    storage?.destroy();
    eventBusFixture?.destroy();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  async function startOwnerChain(version = "2.0.0") {
    storage = new StorageService({
      eventBus: eventBusFixture.eventBus,
      version,
    });
    coordinator = new DataCoordinator({
      eventBus: eventBusFixture.eventBus,
      storage,
      i18n: { t: (key) => key },
    });
    storage.init();
    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
  }

  it("keeps the exact legacy source backup through structural and owner normalization", async () => {
    const legacyRoot = readFixture("legacy-space-root.json");
    const rawRoot = JSON.stringify(legacyRoot);
    localStorage.setItem(STORAGE_KEY, rawRoot);

    await startOwnerChain();

    const backup = JSON.parse(localStorage.getItem(BACKUP_KEY));
    const durable = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const ownerProfile = coordinator.getCurrentState().profiles["legacy-space"];
    expect(backup).toMatchObject({ data: rawRoot, version: "2.0.0" });
    expect(durable.lastBackup).toBe(backup.timestamp);
    expect(ownerProfile).toMatchObject({
      currentEnvironment: "space",
      migrationVersion: "2.1.1",
      bindsets: {
        "Lost Bindset": { space: { keys: { F3: ["FireMines"] } } },
      },
      aliasMetadata: {
        LegacyAttack: { stabilizeExecutionOrder: true },
      },
      selections: { space: "F1", ground: null, alias: "LegacyAttack" },
      vertigoSettings: { showPlayerSay: true },
      legacyExtension: { lost: true },
    });
    expect(durable.profiles["legacy-space"]).toEqual(ownerProfile);
    expect(
      eventBusFixture
        .getEventsOfType("data:state-changed")
        .map(({ data }) => data.reason),
    ).toEqual(["initial-load"]);
  });

  it("publishes only the recovered empty owner state after an invalid root", async () => {
    const invalidRoot = readFixture("invalid-profile-root.json");
    const rawRoot = JSON.stringify(invalidRoot);
    localStorage.setItem(STORAGE_KEY, rawRoot);

    await startOwnerChain();

    const state = coordinator.getCurrentState();
    expect(state).toMatchObject({
      ready: true,
      currentProfile: null,
      profiles: {},
    });
    expect(JSON.parse(localStorage.getItem(BACKUP_KEY)).data).toBe(rawRoot);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toMatchObject({
      currentProfile: null,
      profiles: {},
    });
    const stateChanges = eventBusFixture.getEventsOfType("data:state-changed");
    expect(stateChanges).toHaveLength(1);
    expect(stateChanges[0].data).toEqual({
      reason: "initial-load",
      state,
    });
  });

  it("does not publish owner state when required startup repair cannot persist", async () => {
    const legacyRoot = readFixture("legacy-space-root.json");
    const rawRoot = JSON.stringify(legacyRoot);
    const localStorageFixture = createLocalStorageFixture({
      initialData: {
        [STORAGE_KEY]: rawRoot,
        sto_keybind_manager_visited: "true",
      },
      quotaError: true,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    storage = new StorageService({
      eventBus: eventBusFixture.eventBus,
      version: "2.0.0",
    });
    coordinator = new DataCoordinator({
      eventBus: eventBusFixture.eventBus,
      storage,
      i18n: { t: (key) => key },
    });

    try {
      expect(() => storage.init()).toThrow("storage_write_failed");
      expect(storage.isInitialized()).toBe(false);
      expect(storage.getCurrentState().isReady).toBe(false);
      expect(eventBusFixture.eventBus.hasListeners("component:register")).toBe(
        false,
      );
      await expect(coordinator.loadInitialState()).rejects.toThrow(
        "failed_to_load_profile_data",
      );

      expect(coordinator.getCurrentState()).toMatchObject({
        ready: false,
        currentProfile: null,
        profiles: {},
      });
      expect(
        eventBusFixture.getEventsOfType("data:state-changed"),
      ).toHaveLength(0);
      expect(localStorage.getItem(STORAGE_KEY)).toBe(rawRoot);
      expect(localStorage.getItem(BACKUP_KEY)).toBeNull();
    } finally {
      localStorageFixture.destroy();
    }
  });
});
