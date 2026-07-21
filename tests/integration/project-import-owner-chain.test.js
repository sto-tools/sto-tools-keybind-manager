import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import ProjectManagementService from "../../src/js/components/services/ProjectManagementService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import SyncService from "../../src/js/components/services/SyncService.js";
import { MAX_PROJECT_JSON_BYTES } from "../../src/js/components/services/jsonDataBoundary.js";
import HeaderMenuUI from "../../src/js/components/ui/HeaderMenuUI.js";
import {
  createEventBusFixture,
  createLocalStorageFixture,
} from "../fixtures/core/index.js";
import { createRealEventBusFixture } from "../fixtures/core/eventBus.js";
import {
  assertMundaneSettingsFinalRootFailure,
  rejectFinalProjectRootWrite,
} from "../fixtures/services/projectRestore.js";

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
  let sync;

  beforeEach(async () => {
    sync = null;
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
    if (sync && !sync.destroyed) sync.destroy();
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
    const changedEnvironments = [];
    const switchProfile = vi.spyOn(coordinator, "switchProfile");
    eventBusFixture.eventBus.on("data:state-changed", (event) => {
      stateEvents.push(event);
    });
    eventBusFixture.eventBus.on("profile:switched", ({ profileId }) => {
      switchedProfiles.push(profileId);
    });
    eventBusFixture.eventBus.on("environment:changed", (event) => {
      changedEnvironments.push(event);
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
    expect(changedEnvironments).toEqual([
      expect.objectContaining({
        fromEnvironment: null,
        toEnvironment: "ground",
        environment: "ground",
      }),
    ]);
    expect(switchProfile).not.toHaveBeenCalled();
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
    expect(projectManager.ui.showToast).not.toHaveBeenCalled();
  });

  it("rejects an oversized project at the direct chooser before reading or importing it", async () => {
    document.body.innerHTML = '<button id="openProjectBtn"></button>';
    const realEventBusFixture = await createRealEventBusFixture();
    const showToast = vi.fn();
    const chooserOwner = new ProjectManagementService({
      eventBus: realEventBusFixture.eventBus,
      storage,
      ui: { showToast },
      i18n: { t: (key) => key },
    });
    const headerMenu = new HeaderMenuUI({
      eventBus: realEventBusFixture.eventBus,
      document,
      i18n: { t: (key) => key },
    });
    /** @type {HTMLInputElement | undefined} */
    let chooser;
    const inputClick = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(function captureProjectChooser() {
        chooser = this;
      });
    const restoreApplicationState = vi.spyOn(
      chooserOwner,
      "restoreApplicationState",
    );
    const restoreFromProjectContent = vi.spyOn(
      chooserOwner,
      "restoreFromProjectContent",
    );
    const busEmit = vi.spyOn(realEventBusFixture.eventBus, "emit");
    const beforeRoot = localStorage.getItem(storage.storageKey);
    const beforeSettings = localStorage.getItem(storage.settingsKey);
    const beforeState = coordinator.getCurrentState();

    try {
      chooserOwner.init();
      headerMenu.init();
      const openProjectButton = document.getElementById("openProjectBtn");
      expect(openProjectButton).toBeInstanceOf(HTMLButtonElement);
      if (!(openProjectButton instanceof HTMLButtonElement)) {
        throw new Error("Project restore button is unavailable");
      }
      openProjectButton.click();

      expect(restoreApplicationState).toHaveBeenCalledOnce();
      expect(chooser).toBeInstanceOf(HTMLInputElement);
      if (!(chooser instanceof HTMLInputElement)) {
        throw new Error("Project restore chooser was not created");
      }
      expect(chooser).toMatchObject({
        type: "file",
        accept: ".json,application/json",
      });

      const oversizedProject = new File(["{}"], "oversized-project.json", {
        type: "application/json",
      });
      const fileText = vi.fn().mockResolvedValue("must not be read");
      Object.defineProperties(oversizedProject, {
        size: { configurable: true, value: MAX_PROJECT_JSON_BYTES + 1 },
        text: { configurable: true, value: fileText },
      });
      Object.defineProperty(chooser, "files", {
        configurable: true,
        value: [oversizedProject],
      });
      chooser.dispatchEvent(new Event("change", { bubbles: true }));

      await expect(
        restoreApplicationState.mock.results[0].value,
      ).resolves.toEqual({
        success: false,
        error: "invalid_project_file",
        params: { path: "$" },
      });
      expect(fileText).not.toHaveBeenCalled();
      expect(restoreFromProjectContent).not.toHaveBeenCalled();
      expect(
        busEmit.mock.calls.filter(
          ([topic]) => topic === "rpc:import:project-file",
        ),
      ).toEqual([]);
      expect(showToast).toHaveBeenCalledOnce();
      expect(showToast).toHaveBeenCalledWith("backup_restore_failed", "error");
      expect(localStorage.getItem(storage.storageKey)).toBe(beforeRoot);
      expect(localStorage.getItem(storage.settingsKey)).toBe(beforeSettings);
      expect(coordinator.getCurrentState()).toBe(beforeState);
    } finally {
      headerMenu.destroy();
      chooserOwner.destroy();
      realEventBusFixture.destroy();
      inputClick.mockRestore();
      document.getElementById("openProjectBtn")?.remove();
    }
  });

  it("reports the acknowledged partial commit when quota blocks the final root write", async () => {
    const beforeState = coordinator.getCurrentState();
    const stateChanged = vi.fn();
    eventBusFixture.eventBus.on("data:state-changed", stateChanged);

    rejectFinalProjectRootWrite(storage);

    const result = await projectManager.restoreFromProjectContent(
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
    expect(projectManager.ui.showToast).not.toHaveBeenCalled();
  });

  it("keeps acknowledged mundane settings when quota blocks the final root write", async () => {
    await assertMundaneSettingsFinalRootFailure({
      storage,
      coordinator,
      eventBus: eventBusFixture.eventBus,
      projectManager,
      importedProject,
    });
  });

  it("reports durable import evidence when owner reload fails and converges on retry", async () => {
    const beforeState = coordinator.getCurrentState();
    const stateChanged = vi.fn();
    eventBusFixture.eventBus.on("data:state-changed", stateChanged);
    const reloadState = vi
      .spyOn(coordinator, "reloadState")
      .mockResolvedValueOnce({ success: false, error: "reload blocked" });
    const content = JSON.stringify(importedProject);

    await expect(
      projectManager.restoreFromProjectContent(content, "project.json"),
    ).resolves.toEqual({
      success: false,
      error: "project_restore_reload_failed",
      params: { reason: "reload blocked" },
      durable: true,
      currentProfile: "imported",
      imported: { profiles: 1, settings: true },
    });
    expect(reloadState).toHaveBeenCalledOnce();
    expect(coordinator.getCurrentState()).toBe(beforeState);
    expect(stateChanged).not.toHaveBeenCalled();
    expect(storage.getAllData()).toMatchObject({
      currentProfile: "imported",
      profiles: { imported: { name: "Imported" } },
    });

    await expect(
      projectManager.restoreFromProjectContent(content, "project.json"),
    ).resolves.toEqual({
      success: true,
      currentProfile: "imported",
      imported: { profiles: 1, settings: true },
    });
    expect(reloadState).toHaveBeenCalledTimes(2);
    expect(stateChanged).toHaveBeenCalledOnce();
    expect(coordinator.getCurrentState()).toMatchObject({
      currentProfile: "imported",
      currentEnvironment: "ground",
    });
    expect(projectManager.ui.showToast).not.toHaveBeenCalled();
  });

  it("retries only durable activation after a sync import reload failure", async () => {
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
    sync = new SyncService({
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
  });
});
