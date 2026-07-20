import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import ProjectManagementService from "../../src/js/components/services/ProjectManagementService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import {
  createEventBusFixture,
  createLocalStorageFixture,
} from "../fixtures/core/index.js";

const destinationRoot = {
  version: "1.0.0",
  created: "2026-01-01T00:00:00.000Z",
  lastModified: "2026-01-01T00:00:00.000Z",
  currentProfile: "existing",
  profiles: {
    existing: {
      name: "Existing",
      description: "Destination profile",
      currentEnvironment: "space",
      migrationVersion: "2.1.1",
      builds: { space: { keys: {} }, ground: { keys: {} } },
      aliases: {},
    },
  },
  globalAliases: {},
  settings: {},
};

const importedProject = {
  version: "1.0.0",
  exported: "2026-07-17T00:00:00.000Z",
  type: "project",
  data: {
    profiles: {
      imported: {
        id: "imported",
        name: "Imported",
        description: "Authoritative reload target",
        currentEnvironment: "ground",
        migrationVersion: "2.1.1",
        builds: {
          space: { keys: {} },
          ground: { keys: { G: ["Sprint", "Aim"] } },
        },
        aliases: {},
      },
    },
    settings: { theme: "light", language: "de" },
    currentProfile: "imported",
  },
};

describe("project import authoritative owner chain", () => {
  let eventBusFixture;
  let localStorageFixture;
  let storage;
  let coordinator;
  let importer;
  let projectManager;

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    eventBusFixture = createEventBusFixture();
    localStorageFixture = createLocalStorageFixture({
      initialData: {
        sto_keybind_manager: destinationRoot,
        sto_keybind_settings: {
          theme: "dark",
          language: "en",
          firstRun: false,
          version: "destination-version",
        },
        sto_keybind_manager_visited: "true",
      },
    });
    storage = new StorageService({
      eventBus: eventBusFixture.eventBus,
      version: "1.0.0",
    });
    coordinator = new DataCoordinator({
      eventBus: eventBusFixture.eventBus,
      storage,
      i18n: { t: (key) => key },
      defaultProfiles: {},
    });
    importer = new ImportService({
      eventBus: eventBusFixture.eventBus,
      storage,
    });
    projectManager = new ProjectManagementService({
      eventBus: eventBusFixture.eventBus,
      storage,
      ui: { showToast: vi.fn() },
      i18n: { t: (key) => key },
    });

    storage.init();
    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
    importer.init();
    projectManager.init();
  });

  afterEach(() => {
    projectManager?.destroy();
    importer?.destroy();
    coordinator?.destroy();
    storage?.destroy();
    eventBusFixture?.destroy();
    localStorageFixture?.destroy();
    vi.restoreAllMocks();
  });

  it("reloads and publishes a valid wrapped project through the authoritative owner", async () => {
    const stateEvents = [];
    const switchedProfiles = [];
    eventBusFixture.eventBus.on("data:state-changed", (event) => {
      stateEvents.push(event);
    });
    eventBusFixture.eventBus.on("profile:switched", ({ profileId }) => {
      switchedProfiles.push(profileId);
    });
    const beforeRevision = coordinator.getCurrentState().revision;

    const result = await projectManager.restoreFromProjectContent(
      JSON.stringify(importedProject),
      "project.json",
    );

    expect(result).toEqual({
      success: true,
      currentProfile: "imported",
      imported: { profiles: 1, settings: true },
    });
    expect(stateEvents).toHaveLength(1);
    expect(stateEvents[0]).toMatchObject({
      reason: "state-reloaded",
      state: {
        ready: true,
        revision: beforeRevision + 1,
        currentProfile: "imported",
        currentEnvironment: "ground",
        profiles: {
          existing: { name: "Existing" },
          imported: { name: "Imported" },
        },
        currentProfileData: {
          id: "imported",
          name: "Imported",
          environment: "ground",
          builds: {
            ground: { keys: { G: ["Sprint", "Aim"] } },
          },
        },
      },
    });
    expect(stateEvents[0].state).toBe(coordinator.getCurrentState());
    expect(switchedProfiles).toEqual(["imported"]);
    expect(storage.getAllData()).toMatchObject({
      currentProfile: "imported",
      profiles: {
        existing: { name: "Existing" },
        imported: { name: "Imported" },
      },
    });
    expect(storage.getSettings()).toMatchObject({
      theme: "light",
      language: "de",
      version: "destination-version",
      firstRun: false,
    });
    expect(projectManager.ui.showToast).toHaveBeenCalledWith(
      "backup_restored_successfully",
      "success",
    );
  });

  it("reports the acknowledged partial commit when quota blocks the final root write", async () => {
    const beforeState = coordinator.getCurrentState();
    const stateChanged = vi.fn();
    eventBusFixture.eventBus.on("data:state-changed", stateChanged);

    const setItem = localStorage.setItem.bind(localStorage);
    let projectRootWrites = 0;
    localStorage.setItem = (key, value) => {
      if (key === "sto_keybind_manager" && ++projectRootWrites === 2) {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      }
      setItem(key, value);
    };

    const result = await importer.importProjectFile(
      JSON.stringify({
        ...importedProject,
        data: {
          profiles: importedProject.data.profiles,
          currentProfile: importedProject.data.currentProfile,
        },
      }),
    );

    expect(result).toEqual({
      success: false,
      error: "storage_write_failed",
      params: { operation: "project" },
      partial: true,
      committed: {
        profiles: ["imported"],
        settings: false,
        project: false,
      },
    });
    const durableRoot = JSON.parse(localStorage.getItem("sto_keybind_manager"));
    expect(durableRoot).toMatchObject({
      currentProfile: "existing",
      profiles: {
        existing: { name: "Existing" },
        imported: { name: "Imported" },
      },
    });
    expect(storage.getAllData()).toMatchObject(durableRoot);
    expect(coordinator.getCurrentState()).toBe(beforeState);
    expect(stateChanged).not.toHaveBeenCalled();
  });
});
