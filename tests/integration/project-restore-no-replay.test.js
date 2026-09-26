import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import ProjectManagementService from "../../src/js/components/services/ProjectManagementService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import SyncService from "../../src/js/components/services/SyncService.js";
import {
  createEventBusFixture,
  createLocalStorageFixture,
} from "../fixtures/core/index.js";
import { createRequestBackedPreferencesTransition } from "../fixtures/services/projectRestore.js";
import { importedProject } from "../fixtures/services/projectImportOwnerChain.js";

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

const rootOnlyProject = JSON.stringify({
  version: "1.0.0",
  exported: "2026-07-21T00:00:00.000Z",
  type: "project",
  data: { profiles: {}, currentProfile: null },
});

const profileProject = JSON.stringify({
  ...importedProject,
  data: {
    profiles: importedProject.data.profiles,
    currentProfile: importedProject.data.currentProfile,
  },
});

describe("project restore no-replay boundary", () => {
  let eventBusFixture;
  let localStorageFixture;
  let storage;
  let coordinator;
  let importer;
  let projectManager;
  let sync;

  beforeEach(() => {
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
          version: "1.0.0",
        },
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
      replaceProjectFromImport: (...args) =>
        coordinator.replaceProjectFromImport(...args),
    });
    projectManager = new ProjectManagementService({
      importProjectWithinPreferencesTransition: (...args) =>
        importer.importProjectWithinPreferencesTransition(...args),
      eventBus: eventBusFixture.eventBus,
      i18n: { t: (key) => key },
      runPreferencesTransition: createRequestBackedPreferencesTransition(
        () => projectManager,
      ),
      activateProjectFromImport: (...args) =>
        coordinator.activateProjectFromImport(...args),
    });
    sync = null;

    storage.init();
    coordinator.init();
    importer.init();
    projectManager.init();
  });

  afterEach(() => {
    if (sync && !sync.destroyed) sync.destroy();
    projectManager?.destroy();
    importer?.destroy();
    coordinator?.destroy();
    storage?.destroy();
    eventBusFixture?.destroy();
    localStorageFixture?.destroy();
    vi.restoreAllMocks();
  });

  it("does not replay when backup succeeds before the project root write fails", async () => {
    const rootBefore = localStorage.getItem("sto_keybind_manager");
    const originalSetItem = localStorage.setItem.bind(localStorage);
    let backupWrites = 0;
    let rootWriteAttempts = 0;
    localStorage.setItem = (key, value) => {
      if (key === "sto_keybind_manager_backup") {
        backupWrites += 1;
        originalSetItem(key, value);
        return;
      }
      if (key === "sto_keybind_manager") {
        rootWriteAttempts += 1;
        throw new DOMException("quota exceeded", "QuotaExceededError");
      }
      originalSetItem(key, value);
    };

    const text = vi.fn().mockResolvedValue(rootOnlyProject);
    const getFile = vi.fn().mockResolvedValue({
      size: new TextEncoder().encode(rootOnlyProject).byteLength,
      text,
    });
    const getFileHandle = vi.fn().mockResolvedValue({
      kind: "file",
      name: "project.json",
      getFile,
    });
    const directory = {
      kind: "directory",
      name: "Fleet Builds",
      queryPermission: vi.fn().mockResolvedValue("granted"),
      requestPermission: vi.fn().mockResolvedValue("granted"),
      getDirectoryHandle: vi.fn(),
      getFileHandle,
    };
    const ui = { showToast: vi.fn() };
    sync = new SyncService({
      eventBus: eventBusFixture.eventBus,
      fs: {
        getSyncDirectoryState: vi.fn().mockResolvedValue({
          handle: directory,
          transitionPending: false,
        }),
      },
      ui,
      i18n: {
        t: (key, params) => (params?.error ? `${key}:${params.error}` : key),
      },
    });
    sync.init();

    const restore = vi.spyOn(projectManager, "restoreFromProjectContent");
    const importProject = vi.spyOn(
      importer,
      "importProjectWithinPreferencesTransition",
    );
    const ownerReplace = vi.spyOn(coordinator, "replaceProjectFromImport");
    const profileWrites = vi.spyOn(storage, "saveProfile");

    sync.stagePendingSyncDecision("import", null);
    await sync.applyPendingSyncDecision();

    await expect(restore.mock.results[0].value).resolves.toEqual({
      success: false,
      error: "storage_write_failed",
      params: { operation: "project" },
      partial: false,
      committed: { profiles: [], settings: false, project: false },
    });
    expect(restore).toHaveBeenCalledOnce();
    expect(importProject).toHaveBeenCalledOnce();
    expect(ownerReplace).toHaveBeenCalledOnce();
    expect(profileWrites).not.toHaveBeenCalled();
    expect(getFileHandle).toHaveBeenCalledOnce();
    expect(getFile).toHaveBeenCalledOnce();
    expect(text).toHaveBeenCalledOnce();
    expect(backupWrites).toBe(1);
    expect(rootWriteAttempts).toBe(1);

    const backup = JSON.parse(
      localStorage.getItem("sto_keybind_manager_backup"),
    );
    expect(backup).toMatchObject({
      data: rootBefore,
      version: "1.0.0",
    });
    expect(JSON.parse(backup.data)).toEqual(JSON.parse(rootBefore));
    expect(localStorage.getItem("sto_keybind_manager")).toBe(rootBefore);
    expect(sync.pendingSyncAction).toBeNull();
    expect(sync.deferredImportContent).toBeNull();
    expect(ui.showToast).toHaveBeenCalledWith(
      "failed_to_import_project:storage_write_failed",
      "error",
    );

    await sync.applyPendingSyncDecision();

    expect(restore).toHaveBeenCalledOnce();
    expect(importProject).toHaveBeenCalledOnce();
    expect(ownerReplace).toHaveBeenCalledOnce();
    expect(profileWrites).not.toHaveBeenCalled();
    expect(getFileHandle).toHaveBeenCalledOnce();
    expect(text).toHaveBeenCalledOnce();
    expect(backupWrites).toBe(1);
    expect(rootWriteAttempts).toBe(1);
  });

  it("retries only durable activation after a sync import adoption failure", async () => {
    const text = vi.fn().mockResolvedValue(rootOnlyProject);
    const getFile = vi.fn().mockResolvedValue({
      size: new TextEncoder().encode(rootOnlyProject).byteLength,
      text,
    });
    const getFileHandle = vi.fn().mockResolvedValue({
      kind: "file",
      name: "project.json",
      getFile,
    });
    const getSyncDirectoryState = vi.fn().mockResolvedValue({
      handle: {
        kind: "directory",
        name: "Fleet Builds",
        queryPermission: vi.fn().mockResolvedValue("granted"),
        requestPermission: vi.fn().mockResolvedValue("granted"),
        getDirectoryHandle: vi.fn(),
        getFileHandle,
      },
      transitionPending: false,
    });
    sync = new SyncService({
      eventBus: eventBusFixture.eventBus,
      fs: { getSyncDirectoryState },
      ui: { showToast: vi.fn() },
      i18n: {
        t: (key, params) => (params?.error ? `${key}:${params.error}` : key),
      },
    });
    sync.init();

    const restore = vi.spyOn(projectManager, "restoreFromProjectContent");
    const retry = vi.spyOn(projectManager, "retryRestoreActivation");
    const saveAllData = storage.saveAllData.bind(storage);
    let projectRootCommitted = false;
    const rootWrites = vi
      .spyOn(storage, "saveAllData")
      .mockImplementation(async (...args) => {
        const result = await saveAllData(...args);
        projectRootCommitted = true;
        return result;
      });
    const getAllData = storage.getAllData.bind(storage);
    let rejectAdoption = true;
    vi.spyOn(storage, "getAllData").mockImplementation((...args) => {
      if (projectRootCommitted && rejectAdoption) {
        rejectAdoption = false;
        throw new Error("reload blocked");
      }
      return getAllData(...args);
    });

    sync.stagePendingSyncDecision("import", null);
    await sync.applyPendingSyncDecision();
    expect(sync.pendingSyncAction).toBe("import");

    await sync.applyPendingSyncDecision();

    expect(restore).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledOnce();
    await expect(retry.mock.results[0].value).resolves.toMatchObject({
      success: true,
      currentProfile: "existing",
    });
    expect(storage.getAllData(true).currentProfile).toBe("existing");
    expect(rootWrites).toHaveBeenCalledOnce();
    expect(getSyncDirectoryState).toHaveBeenCalledOnce();
    expect(getFileHandle).toHaveBeenCalledOnce();
    expect(getFile).toHaveBeenCalledOnce();
    expect(text).toHaveBeenCalledOnce();
    expect(sync.pendingSyncAction).toBeNull();
  });

  it("adopts the durable project on a fresh DataCoordinator lifecycle without replay", async () => {
    const before = coordinator.getCurrentState();
    const saveAllData = storage.saveAllData.bind(storage);
    const rootWrites = vi
      .spyOn(storage, "saveAllData")
      .mockImplementationOnce((...args) => {
        const result = saveAllData(...args);
        coordinator.destroy();
        return result;
      });

    await expect(
      projectManager.restoreFromProjectContent(profileProject, "project.json"),
    ).resolves.toEqual({
      success: false,
      error: "project_restore_reload_failed",
      params: { reason: "failed_to_load_profile_data" },
      durable: true,
      currentProfile: "imported",
      imported: { profiles: 1, settings: false },
      activation: { data: "pending", preferences: "not-required" },
    });
    expect(coordinator.getCurrentState()).toMatchObject({
      ready: false,
      revision: before.revision,
      currentProfile: before.currentProfile,
      profiles: before.profiles,
    });
    expect(rootWrites).toHaveBeenCalledOnce();

    coordinator = new DataCoordinator({
      eventBus: eventBusFixture.eventBus,
      storage,
      i18n: { t: (key) => key },
      defaultProfiles: {},
    });
    coordinator.init();
    await coordinator.initialStateReady;

    expect(coordinator.getCurrentState()).toMatchObject({
      ready: true,
      currentProfile: "imported",
      currentEnvironment: "ground",
      profiles: { imported: { name: "Imported" } },
    });
    expect(rootWrites).toHaveBeenCalledOnce();
  });

  it("refuses activation-only retry after an intervening durable owner mutation", async () => {
    const saveAllData = vi.spyOn(storage, "saveAllData");
    const getAllData = storage.getAllData.bind(storage);
    let rejectImportedAdoption = true;
    vi.spyOn(storage, "getAllData").mockImplementation((...args) => {
      const root = getAllData(...args);
      if (rejectImportedAdoption && root.currentProfile === "imported") {
        rejectImportedAdoption = false;
        throw new Error("reload blocked");
      }
      return root;
    });

    await expect(
      projectManager.restoreFromProjectContent(profileProject, "project.json"),
    ).resolves.toMatchObject({
      success: false,
      error: "project_restore_reload_failed",
      durable: true,
      activation: { data: "pending", preferences: "not-required" },
    });
    expect(saveAllData).toHaveBeenCalledOnce();

    await coordinator.updateProfile("existing", {
      properties: { description: "intervening owner mutation" },
    });
    const stateAfterInterveningMutation = coordinator.getCurrentState();
    expect(saveAllData).toHaveBeenCalledTimes(2);

    await expect(projectManager.retryRestoreActivation()).resolves.toEqual({
      success: false,
      error: "project_restore_reload_failed",
      params: { reason: "invalid_project_activation" },
      durable: true,
      currentProfile: "imported",
      imported: { profiles: 1, settings: false },
      activation: { data: "pending", preferences: "not-required" },
    });
    expect(saveAllData).toHaveBeenCalledTimes(2);
    expect(coordinator.getCurrentState()).toBe(stateAfterInterveningMutation);
    expect(storage.getAllData(true)).toMatchObject({
      currentProfile: "imported",
      profiles: {
        existing: { description: "intervening owner mutation" },
        imported: { name: "Imported" },
      },
    });
  });
});
