import { createProjectSettingsRepository } from "../fixtures/services/projectRestore.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import ProjectManagementService from "../../src/js/components/services/ProjectManagementService.js";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import { MAX_PROJECT_JSON_BYTES } from "../../src/js/components/services/jsonDataBoundary.js";
import HeaderMenuUI from "../../src/js/components/ui/HeaderMenuUI.js";
import {
  createEventBusFixture,
  createLocalStorageFixture,
} from "../fixtures/core/index.js";
import { createRealEventBusFixture } from "../fixtures/core/eventBus.js";
import { rejectFinalProjectRootWrite } from "../fixtures/services/projectRestore.js";
import {
  destinationRoot,
  importedProject,
} from "../fixtures/services/projectImportOwnerChain.js";

describe("project import authoritative owner chain", () => {
  let eventBusFixture;
  let localStorageFixture;
  let storage;
  let settingsRepository;
  let coordinator;
  let importedProjectOwnerAction;
  let importer;
  let projectManager;
  let preferences;

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
    importedProjectOwnerAction = vi.fn((...args) =>
      coordinator.replaceProjectFromImport(...args),
    );
    importer = new ImportService({
      eventBus: eventBusFixture.eventBus,
      replaceProjectFromImport: importedProjectOwnerAction,
    });
    const preferencesI18n = {
      language: "en",
      t: (key) => key,
      changeLanguage: vi.fn(async (language) => {
        preferencesI18n.language = language;
      }),
    };
    settingsRepository = createProjectSettingsRepository();
    preferences = new PreferencesService({
      eventBus: eventBusFixture.eventBus,
      settingsRepository,
      i18n: preferencesI18n,
      localizeCommands: () => {},
      applyTranslations: () => {},
    });
    projectManager = new ProjectManagementService({
      importProjectWithinPreferencesTransition: (...args) =>
        importer.importProjectWithinPreferencesTransition(...args),
      eventBus: eventBusFixture.eventBus,
      ui: { showToast: vi.fn() },
      i18n: { t: (key) => key },
      runPreferencesTransition: (source, operation) =>
        preferences.runExternalActivationTransition(source, operation),
      activateProjectFromImport: (...args) =>
        coordinator.activateProjectFromImport(...args),
      activateImportedSettings: (...args) =>
        preferences.activateImportedSettings(...args),
    });

    preferences.init();
    await preferences.initialStateReady;
    storage.init();
    coordinator.init();
    await vi.waitFor(() => {
      expect(coordinator.getCurrentState().ready).toBe(true);
    });
    await preferences.initialStateReady;
    storage.setPreferencesTransitionRunner((source, operation) =>
      preferences.runExternalActivationTransition(source, operation),
    );
    importer.init();
    projectManager.init();
  });

  afterEach(() => {
    projectManager?.destroy();
    importer?.destroy();
    preferences?.destroy();
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
    expect(importedProjectOwnerAction).toHaveBeenCalledOnce();
    expect(importedProjectOwnerAction.mock.calls[0][0]).toMatchObject(
      importedProject.data,
    );
    expect(importedProjectOwnerAction.mock.calls[0][0]).not.toBe(
      importedProject.data,
    );
    expect(storage.getAllData()).toMatchObject({
      currentProfile: "imported",
      profiles: {
        existing: { name: "Existing" },
        imported: { name: "Imported" },
      },
    });
    expect(settingsRepository.load().value).toMatchObject({
      theme: "light",
      language: "de",
      version: "destination-version",
      firstRun: false,
    });
    expect(preferences.getCurrentState()).toMatchObject({
      settings: { theme: "light", language: "de" },
    });
    expect(projectManager.ui.showToast).not.toHaveBeenCalled();
  });

  it("serializes application reset behind an in-flight project restore", async () => {
    const saveAllData = storage.saveAllData.bind(storage);
    let releaseRootWrite = () => {};
    let markRootWriteStarted = () => {};
    const rootWriteStarted = new Promise((resolve) => {
      markRootWriteStarted = resolve;
    });
    const rootWriteBlocked = new Promise((resolve) => {
      releaseRootWrite = resolve;
    });
    const rootWrites = vi
      .spyOn(storage, "saveAllData")
      .mockImplementationOnce(async (...args) => {
        markRootWriteStarted();
        await rootWriteBlocked;
        return saveAllData(...args);
      });
    const profileWrites = vi.spyOn(storage, "saveProfile");
    const clearAllData = vi.spyOn(storage, "clearAllData");

    const restore = projectManager.restoreFromProjectContent(
      JSON.stringify(importedProject),
      "project.json",
    );
    await rootWriteStarted;

    const reset = storage.handleAppReset();
    await Promise.resolve();
    expect(clearAllData).not.toHaveBeenCalled();

    releaseRootWrite();
    await expect(restore).resolves.toEqual({
      success: true,
      currentProfile: "imported",
      imported: { profiles: 1, settings: true },
    });
    await expect(reset).resolves.toBe(true);

    expect(rootWrites).toHaveBeenCalledOnce();
    expect(profileWrites).not.toHaveBeenCalled();
    expect(clearAllData).toHaveBeenCalledOnce();
    expect(localStorage.getItem(storage.storageKey)).toBeNull();
    expect(localStorage.getItem(storage.backupKey)).toBeNull();
    expect(coordinator.getCurrentState()).toMatchObject({
      currentProfile: null,
      profiles: {},
    });
    expect(preferences.getCurrentState()).toMatchObject({
      settings: { theme: "default", language: "en" },
    });
  });

  it("rejects an oversized project at the direct chooser before reading or importing it", async () => {
    document.body.innerHTML = '<button id="openProjectBtn"></button>';
    const realEventBusFixture = await createRealEventBusFixture();
    const showToast = vi.fn();
    const chooserOwner = new ProjectManagementService({
      importProjectWithinPreferencesTransition: (...args) =>
        importer.importProjectWithinPreferencesTransition(...args),
      eventBus: realEventBusFixture.eventBus,
      ui: { showToast },
      i18n: { t: (key) => key },
      runPreferencesTransition: (source, operation) =>
        preferences.runExternalActivationTransition(source, operation),
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
    const beforeSettings = localStorage.getItem("sto_keybind_settings");
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
      expect(localStorage.getItem("sto_keybind_settings")).toBe(beforeSettings);
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
      partial: false,
      committed: {
        profiles: [],
        settings: false,
        project: false,
      },
    });
    const durableRoot = JSON.parse(localStorage.getItem("sto_keybind_manager"));
    expect(durableRoot).toMatchObject({
      currentProfile: "existing",
      profiles: {
        existing: { name: "Existing" },
      },
    });
    expect(durableRoot.profiles).not.toHaveProperty("imported");
    expect(storage.getAllData()).toMatchObject(durableRoot);
    expect(coordinator.getCurrentState()).toBe(beforeState);
    expect(stateChanged).not.toHaveBeenCalled();
    expect(projectManager.ui.showToast).not.toHaveBeenCalled();
  });

  it("keeps acknowledged mundane settings after final-root failure and activates them on restart", async () => {
    const beforeRoot = localStorage.getItem(storage.storageKey);
    const beforeDataState = coordinator.getCurrentState();
    const beforePreferencesState = preferences.getCurrentState();
    const dataPublications = vi.fn();
    eventBusFixture.eventBus.on("data:state-changed", dataPublications);
    rejectFinalProjectRootWrite(storage);

    await expect(
      projectManager.restoreFromProjectContent(JSON.stringify(importedProject)),
    ).resolves.toEqual({
      success: false,
      error: "storage_write_failed",
      params: { operation: "project" },
      partial: true,
      committed: { profiles: [], settings: true, project: false },
    });

    expect(localStorage.getItem(storage.storageKey)).toBe(beforeRoot);
    expect(coordinator.getCurrentState()).toBe(beforeDataState);
    expect(preferences.getCurrentState()).toBe(beforePreferencesState);
    expect(dataPublications).not.toHaveBeenCalled();
    expect(settingsRepository.load().value).toMatchObject({
      theme: "light",
      language: "de",
    });

    preferences.destroy();
    const successorI18n = {
      language: "en",
      t: (key) => key,
      changeLanguage: vi.fn(async (language) => {
        successorI18n.language = language;
      }),
    };
    const successor = new PreferencesService({
      eventBus: eventBusFixture.eventBus,
      settingsRepository,
      i18n: successorI18n,
      localizeCommands: () => {},
      applyTranslations: () => {},
    });
    successor.init();
    await successor.initialStateReady;
    preferences = successor;

    expect(successor.getCurrentState()).toMatchObject({
      ready: true,
      settings: { theme: "light", language: "de" },
    });
    expect(localStorage.getItem(storage.storageKey)).toBe(beforeRoot);
  });

  it("reports durable import evidence when owner reload fails and converges on retry", async () => {
    const beforeState = coordinator.getCurrentState();
    const stateChanged = vi.fn();
    eventBusFixture.eventBus.on("data:state-changed", stateChanged);
    const saveAllData = vi.spyOn(storage, "saveAllData");
    const settingsWrites = vi.spyOn(settingsRepository, "replace");
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
    const content = JSON.stringify(importedProject);

    await expect(
      projectManager.restoreFromProjectContent(content, "project.json"),
    ).resolves.toEqual({
      success: false,
      error: "project_restore_reload_failed",
      params: { reason: "failed_to_load_profile_data" },
      durable: true,
      currentProfile: "imported",
      imported: { profiles: 1, settings: true },
      activation: { data: "pending", preferences: "pending" },
    });
    expect(importedProjectOwnerAction).toHaveBeenCalledOnce();
    expect(saveAllData).toHaveBeenCalledOnce();
    expect(settingsWrites).toHaveBeenCalledOnce();
    expect(coordinator.getCurrentState()).toBe(beforeState);
    expect(stateChanged).not.toHaveBeenCalled();
    expect(storage.getAllData()).toMatchObject({
      currentProfile: "imported",
      profiles: { imported: { name: "Imported" } },
    });

    await expect(projectManager.retryRestoreActivation()).resolves.toEqual({
      success: true,
      currentProfile: "imported",
      imported: { profiles: 1, settings: true },
    });
    expect(importedProjectOwnerAction).toHaveBeenCalledOnce();
    expect(saveAllData).toHaveBeenCalledOnce();
    expect(settingsWrites).toHaveBeenCalledOnce();
    expect(stateChanged).toHaveBeenCalledOnce();
    expect(coordinator.getCurrentState()).toMatchObject({
      currentProfile: "imported",
      currentEnvironment: "ground",
    });
    expect(projectManager.ui.showToast).not.toHaveBeenCalled();
  });
});
