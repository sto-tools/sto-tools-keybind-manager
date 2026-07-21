import { afterEach, describe, expect, it, vi } from "vitest";

import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import SyncService from "../../src/js/components/services/SyncService.js";
import eventBus from "../../src/js/core/eventBus.js";
import { createLocalStorageFixture } from "../fixtures/core/index.js";
import { createProjectRestoreSuccess } from "../fixtures/services/projectRestore.js";
import { addSyncTransitionMethods } from "../fixtures/services/syncFileSystem.js";

function createHandle(projectContent = null, name = "Fleet Builds") {
  return {
    kind: "directory",
    name,
    queryPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
    getDirectoryHandle: vi.fn(),
    getFileHandle:
      projectContent === null
        ? vi
            .fn()
            .mockRejectedValue(new DOMException("not found", "NotFoundError"))
        : vi.fn().mockResolvedValue({
            kind: "file",
            name: "project.json",
            getFile: vi.fn().mockResolvedValue({
              size: new TextEncoder().encode(projectContent).byteLength,
              text: vi.fn().mockResolvedValue(projectContent),
            }),
          }),
  };
}

describe("sync folder settings owner integration", () => {
  let localStorageFixture;
  let storage;
  let preferences;
  let sync;
  let ui;
  let fs;

  function setup({ rejectSettingsWrite = false, handle, priorHandle = null }) {
    localStorageFixture = createLocalStorageFixture({
      initialData: {
        sto_keybind_settings: {
          theme: "dark",
          language: "en",
          autoSync: false,
          autoSyncInterval: "change",
        },
      },
      setItemErrorKeys: rejectSettingsWrite ? ["sto_keybind_settings"] : [],
    });
    ui = { showToast: vi.fn() };
    let storedHandle = priorHandle;
    fs = {
      saveDirectoryHandle: vi.fn().mockImplementation(async (_key, value) => {
        storedHandle = value;
      }),
      getDirectoryHandle: vi.fn().mockImplementation(async () => storedHandle),
      deleteDirectoryHandle: vi.fn().mockImplementation(async () => {
        storedHandle = null;
      }),
    };
    addSyncTransitionMethods(fs);
    storage = new StorageService({ eventBus });
    sync = new SyncService({
      eventBus,
      ui,
      fs,
      i18n: {
        t: (key, params) => (params?.error ? `${key}:${params.error}` : key),
      },
    });
    preferences = new PreferencesService({ storage, eventBus });

    storage.init();
    // Preserve the production startup order: SyncService is live before the
    // Preferences owner announces its complete initial snapshot.
    sync.init();
    preferences.init();
    vi.spyOn(sync, "isFirefox").mockReturnValue(false);
    vi.spyOn(sync, "isSecureContext").mockReturnValue(true);
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(handle));
  }

  afterEach(() => {
    if (preferences && !preferences.destroyed) preferences.destroy();
    if (sync && !sync.destroyed) sync.destroy();
    if (storage && !storage.destroyed) storage.destroy();
    eventBus.clear();
    localStorageFixture?.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("preserves a concurrent owner mutation and defers import until explicit save", async () => {
    const projectContent = '{"type":"project","data":{}}';
    const handle = createHandle(projectContent);
    setup({ handle });
    /** @type {(value: boolean) => void} */
    let resolveImportDecision = () => {};
    const importDecision = new Promise((resolve) => {
      resolveImportDecision = resolve;
    });
    const confirm = vi.fn().mockReturnValueOnce(importDecision);
    vi.stubGlobal("confirmDialog", { confirm });
    sync.invokeRequest = vi
      .fn()
      .mockResolvedValue(createProjectRestoreSuccess());
    const publicationOrder = [];
    let cacheAtFolderSet;
    eventBus.on("preferences:loaded", () => {
      publicationOrder.push("preferences:loaded");
    });
    eventBus.on("sync:folder-set", () => {
      publicationOrder.push("sync:folder-set");
      cacheAtFolderSet = structuredClone(sync.cache.preferences);
    });

    const selection = sync.setSyncFolder(true);
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());

    await expect(
      preferences.setExtensionSetting("plugin:concurrent", {
        density: "compact",
      }),
    ).resolves.toBe(true);
    expect(sync.invokeRequest).not.toHaveBeenCalled();

    resolveImportDecision(true);
    await expect(selection).resolves.toBe(handle);

    expect(sync.pendingSyncAction).toBe("import");
    expect(sync.awaitingSyncDecisionApply).toBe(true);
    expect(sync.invokeRequest).not.toHaveBeenCalled();
    expect(publicationOrder).toEqual(["preferences:loaded", "sync:folder-set"]);
    expect(cacheAtFolderSet).toEqual(
      expect.objectContaining({
        "plugin:concurrent": { density: "compact" },
        syncFolderName: "Fleet Builds",
        autoSync: true,
      }),
    );
    expect(preferences.getSettings()).toEqual(
      expect.objectContaining({
        "plugin:concurrent": { density: "compact" },
        syncFolderName: "Fleet Builds",
        syncFolderPath: "Selected folder: Fleet Builds",
        syncFolderFallback: false,
        autoSync: true,
      }),
    );
    expect(storage.getSettings()).toEqual(
      expect.objectContaining({
        "plugin:concurrent": { density: "compact" },
        syncFolderName: "Fleet Builds",
        autoSync: true,
      }),
    );

    await expect(preferences.saveSettings()).resolves.toBe(true);
    expect(sync.invokeRequest).toHaveBeenCalledOnce();
    expect(sync.invokeRequest).toHaveBeenCalledWith(
      "project:restore-from-content",
      { content: projectContent, fileName: "project.json" },
      0,
    );
    expect(sync.pendingSyncAction).toBeNull();
    expect(sync.awaitingSyncDecisionApply).toBe(false);
  });

  it("keeps the preferences owner silent when real storage rejects the folder mutation", async () => {
    const handle = createHandle();
    const priorHandle = createHandle(null, "Prior Folder");
    setup({ rejectSettingsWrite: true, handle, priorHandle });
    const beforeOwner = preferences.getCurrentState();
    const beforeDisk = localStorage.getItem("sto_keybind_settings");
    const folderSet = vi.fn();
    const loaded = vi.fn();
    const saved = vi.fn();
    const changed = vi.fn();
    eventBus.on("sync:folder-set", folderSet);
    eventBus.on("preferences:loaded", loaded);
    eventBus.on("preferences:saved", saved);
    eventBus.on("preferences:changed", changed);

    await expect(sync.setSyncFolder(true)).resolves.toBeNull();

    expect(preferences.getCurrentState()).toEqual(beforeOwner);
    expect(localStorage.getItem("sto_keybind_settings")).toBe(beforeDisk);
    expect(sync.pendingSyncAction).toBeNull();
    expect(sync.awaitingSyncDecisionApply).toBe(false);
    expect(sync.deferredImportContent).toBeNull();
    expect(folderSet).not.toHaveBeenCalled();
    expect(loaded).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(ui.showToast).not.toHaveBeenCalledWith("sync_folder_set", "success");
    expect(ui.showToast).toHaveBeenCalledWith(
      "failed_to_set_sync_folder:storage_write_failed",
      "error",
    );
    expect(fs.saveDirectoryHandle.mock.calls).toEqual([
      ["sync-folder", handle],
      ["sync-folder", priorHandle],
    ]);
    await expect(fs.getDirectoryHandle("sync-folder")).resolves.toBe(
      priorHandle,
    );
    expect(fs.deleteDirectoryHandle).not.toHaveBeenCalled();
  });

  it("removes a newly selected capability when the owner rejects its first settings write", async () => {
    const handle = createHandle();
    setup({ rejectSettingsWrite: true, handle });
    const beforeOwner = preferences.getCurrentState();

    await expect(sync.setSyncFolder(true)).resolves.toBeNull();

    expect(preferences.getCurrentState()).toEqual(beforeOwner);
    expect(fs.saveDirectoryHandle).toHaveBeenCalledOnce();
    expect(fs.saveDirectoryHandle).toHaveBeenCalledWith("sync-folder", handle);
    expect(fs.deleteDirectoryHandle).toHaveBeenCalledOnce();
    expect(fs.deleteDirectoryHandle).toHaveBeenCalledWith("sync-folder");
    await expect(fs.getDirectoryHandle("sync-folder")).resolves.toBeNull();
  });

  it("consumes one staged decision once across overlapping saved publications", async () => {
    const handle = createHandle();
    setup({ handle, priorHandle: handle });
    /** @type {(value: ReturnType<typeof createHandle>) => void} */
    let releaseHandle = () => {};
    fs.getDirectoryHandle.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseHandle = resolve;
        }),
    );
    sync.stagePendingSyncDecision("overwrite", null);
    sync.invokeRequest = vi.fn().mockResolvedValue(undefined);

    const firstSaved = eventBus.emit(
      "preferences:saved",
      { settings: preferences.getSettings() },
      { synchronous: true },
    );
    await vi.waitFor(() => {
      expect(fs.getDirectoryHandle).toHaveBeenCalledOnce();
    });
    const secondSaved = eventBus.emit(
      "preferences:saved",
      { settings: preferences.getSettings() },
      { synchronous: true },
    );
    await secondSaved;
    expect(sync.invokeRequest).not.toHaveBeenCalled();

    releaseHandle(handle);
    await firstSaved;

    expect(sync.invokeRequest).toHaveBeenCalledOnce();
    expect(sync.invokeRequest).toHaveBeenCalledWith(
      "export:sync-to-folder",
      { dirHandle: handle },
      0,
    );
    expect(sync.pendingSyncAction).toBeNull();
    expect(sync.awaitingSyncDecisionApply).toBe(false);
  });
});
