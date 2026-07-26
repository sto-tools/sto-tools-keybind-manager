import { expect, vi } from "vitest";

import SyncService from "../../../src/js/components/services/SyncService.js";

export const destinationRoot = {
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

export const importedProject = {
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

export async function assertResetSerializesProjectRestore({
  storage,
  projectManager,
  coordinator,
  preferences,
}) {
  const saveProfile = storage.saveProfile.bind(storage);
  let releaseProfileWrite = () => {};
  const profileWriteBlocked = new Promise((resolve) => {
    releaseProfileWrite = resolve;
  });
  vi.spyOn(storage, "saveProfile").mockImplementationOnce(
    async (...arguments_) => {
      await profileWriteBlocked;
      return saveProfile(...arguments_);
    },
  );
  const clearAllData = vi.spyOn(storage, "clearAllData");

  const restore = projectManager.restoreFromProjectContent(
    JSON.stringify(importedProject),
    "project.json",
  );
  await vi.waitFor(() => {
    expect(storage.saveProfile).toHaveBeenCalledOnce();
  });

  const reset = storage.handleAppReset();
  await Promise.resolve();
  expect(clearAllData).not.toHaveBeenCalled();

  releaseProfileWrite();
  await expect(restore).resolves.toEqual({
    success: true,
    currentProfile: "imported",
    imported: { profiles: 1, settings: true },
  });
  await expect(reset).resolves.toBe(true);

  expect(clearAllData).toHaveBeenCalledOnce();
  expect(localStorage.getItem(storage.storageKey)).toBeNull();
  expect(localStorage.getItem(storage.backupKey)).toBeNull();
  expect(localStorage.getItem(storage.settingsKey)).toBeNull();
  expect(storage.getAllData()).toMatchObject({
    currentProfile: null,
    profiles: {},
  });
  expect(coordinator.getCurrentState()).toMatchObject({
    currentProfile: null,
    profiles: {},
  });
  expect(preferences.getCurrentState()).toMatchObject({
    settings: { theme: "default", language: "en" },
  });
}

export async function assertSyncRetriesOnlyDurableActivation({
  eventBusFixture,
  storage,
  coordinator,
  importer,
  projectManager,
  preferences,
}) {
  const content = JSON.stringify(importedProject);
  const text = vi.fn().mockResolvedValue(content);
  const getFile = vi.fn().mockResolvedValue({
    size: new TextEncoder().encode(content).byteLength,
    text,
  });
  const getFileHandle = vi.fn().mockResolvedValue({
    kind: "file",
    name: "project.json",
    getFile,
  });
  const queryPermission = vi.fn().mockResolvedValue("granted");
  const requestPermission = vi.fn().mockResolvedValue("granted");
  const directory = {
    kind: "directory",
    name: "Fleet Builds",
    queryPermission,
    requestPermission,
    getDirectoryHandle: vi.fn(),
    getFileHandle,
  };
  const getSyncDirectoryState = vi.fn().mockResolvedValue({
    handle: directory,
    transitionPending: false,
  });
  const ui = { showToast: vi.fn() };
  const sync = new SyncService({
    eventBus: eventBusFixture.eventBus,
    fs: { getSyncDirectoryState },
    ui,
    i18n: {
      t: (key, params) => (params?.error ? `${key}:${params.error}` : key),
    },
  });
  sync.init();

  const restoreFromProjectContent = vi.spyOn(
    projectManager,
    "restoreFromProjectContent",
  );
  const importProjectFile = vi.spyOn(importer, "importProjectFile");
  const saveProfile = vi.spyOn(storage, "saveProfile");
  const saveSettings = vi.spyOn(storage, "saveSettings");
  const saveAllData = vi.spyOn(storage, "saveAllData");
  const realReloadState = coordinator.reloadState.bind(coordinator);
  const reloadState = vi
    .spyOn(coordinator, "reloadState")
    .mockResolvedValueOnce({ success: false, error: "reload blocked" })
    .mockImplementation(realReloadState);
  const publications = [];
  eventBusFixture.eventBus.on("data:state-changed", ({ reason }) => {
    if (reason === "state-reloaded") publications.push("state");
  });
  eventBusFixture.eventBus.on("profile:switched", () => {
    publications.push("profile");
  });
  eventBusFixture.eventBus.on("environment:changed", () => {
    publications.push("environment");
  });
  const beforeState = coordinator.getCurrentState();

  sync.stagePendingSyncDecision("import", null);
  await sync.applyPendingSyncDecision();

  await expect(
    restoreFromProjectContent.mock.results[0].value,
  ).resolves.toEqual({
    success: false,
    error: "project_restore_reload_failed",
    params: { reason: "reload blocked" },
    durable: true,
    currentProfile: "imported",
    imported: { profiles: 1, settings: true },
    activation: { data: "pending", preferences: "pending" },
  });
  expect(getSyncDirectoryState).toHaveBeenCalledOnce();
  expect(queryPermission).toHaveBeenCalledOnce();
  expect(requestPermission).not.toHaveBeenCalled();
  expect(getFileHandle).toHaveBeenCalledOnce();
  expect(getFile).toHaveBeenCalledOnce();
  expect(text).toHaveBeenCalledOnce();
  expect(restoreFromProjectContent).toHaveBeenCalledOnce();
  expect(importProjectFile).toHaveBeenCalledOnce();
  expect(saveProfile).toHaveBeenCalledOnce();
  expect(saveSettings).toHaveBeenCalledOnce();
  expect(saveAllData).toHaveBeenCalledTimes(2);
  expect(reloadState).toHaveBeenCalledOnce();
  expect(coordinator.getCurrentState()).toBe(beforeState);
  expect(publications).toEqual([]);
  expect(sync.pendingSyncAction).toBe("import");
  expect(sync.awaitingSyncDecisionApply).toBe(true);
  expect(storage.getAllData()).toMatchObject({
    currentProfile: "imported",
    profiles: { imported: { name: "Imported" } },
  });

  getSyncDirectoryState.mockResolvedValue({
    handle: null,
    transitionPending: false,
  });
  queryPermission.mockResolvedValue("denied");
  text.mockResolvedValue("changed after durable import");

  await sync.applyPendingSyncDecision();

  expect(reloadState).toHaveBeenCalledTimes(2);
  expect(getSyncDirectoryState).toHaveBeenCalledOnce();
  expect(queryPermission).toHaveBeenCalledOnce();
  expect(requestPermission).not.toHaveBeenCalled();
  expect(getFileHandle).toHaveBeenCalledOnce();
  expect(getFile).toHaveBeenCalledOnce();
  expect(text).toHaveBeenCalledOnce();
  expect(restoreFromProjectContent).toHaveBeenCalledOnce();
  expect(importProjectFile).toHaveBeenCalledOnce();
  expect(saveProfile).toHaveBeenCalledOnce();
  expect(saveSettings).toHaveBeenCalledOnce();
  expect(saveAllData).toHaveBeenCalledTimes(2);
  expect(publications).toEqual(["state", "profile", "environment"]);
  expect(preferences.getCurrentState()).toMatchObject({
    settings: { theme: "light", language: "de" },
  });
  expect(coordinator.getCurrentState()).toMatchObject({
    currentProfile: "imported",
    currentEnvironment: "ground",
  });
  expect(sync.pendingSyncAction).toBeNull();
  expect(sync.awaitingSyncDecisionApply).toBe(false);
  expect(sync.deferredImportContent).toBeNull();
  expect(ui.showToast.mock.calls).toEqual([
    ["failed_to_import_project:reload blocked", "error"],
    ["project_imported_from_sync_folder", "success"],
  ]);

  return sync;
}
