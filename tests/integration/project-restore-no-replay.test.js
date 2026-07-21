import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportService from "../../src/js/components/services/ImportService.js";
import ProjectManagementService from "../../src/js/components/services/ProjectManagementService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import SyncService from "../../src/js/components/services/SyncService.js";
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

const rootOnlyProject = JSON.stringify({
  version: "1.0.0",
  exported: "2026-07-21T00:00:00.000Z",
  type: "project",
  data: { profiles: {}, currentProfile: null },
});

describe("project restore no-replay boundary", () => {
  let eventBusFixture;
  let localStorageFixture;
  let storage;
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
    importer = new ImportService({
      eventBus: eventBusFixture.eventBus,
      storage,
    });
    projectManager = new ProjectManagementService({
      eventBus: eventBusFixture.eventBus,
      storage,
      i18n: { t: (key) => key },
    });
    sync = null;

    storage.init();
    importer.init();
    projectManager.init();
  });

  afterEach(() => {
    if (sync && !sync.destroyed) sync.destroy();
    projectManager?.destroy();
    importer?.destroy();
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
    const importProject = vi.spyOn(importer, "importProjectFile");

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
    expect(getFileHandle).toHaveBeenCalledOnce();
    expect(text).toHaveBeenCalledOnce();
    expect(backupWrites).toBe(1);
    expect(rootWriteAttempts).toBe(1);
  });
});
