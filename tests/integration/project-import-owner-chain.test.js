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
import {
  assertMundaneSettingsFinalRootFailure,
  rejectFinalProjectRootWrite,
} from "../fixtures/services/projectRestore.js";
import {
  assertResetSerializesProjectRestore,
  assertSyncRetriesOnlyDurableActivation,
  destinationRoot,
  importedProject,
} from "../fixtures/services/projectImportOwnerChain.js";

describe("project import authoritative owner chain", () => {
  let eventBusFixture;
  let localStorageFixture;
  let storage;
  let coordinator;
  let importer;
  let projectManager;
  let preferences;
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
    const preferencesI18n = {
      language: "en",
      t: (key) => key,
      changeLanguage: vi.fn(async (language) => {
        preferencesI18n.language = language;
      }),
    };
    preferences = new PreferencesService({
      eventBus: eventBusFixture.eventBus,
      storage,
      i18n: preferencesI18n,
      localizeCommands: () => {},
      applyTranslations: () => {},
    });
    projectManager = new ProjectManagementService({
      eventBus: eventBusFixture.eventBus,
      storage,
      ui: { showToast: vi.fn() },
      i18n: { t: (key) => key },
      runPreferencesTransition: (source, operation) =>
        preferences.runExternalActivationTransition(source, operation),
    });

    storage.init();
    coordinator.init();
    preferences.init();
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
    if (sync && !sync.destroyed) sync.destroy();
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
    expect(preferences.getCurrentState()).toMatchObject({
      settings: { theme: "light", language: "de" },
    });
    expect(projectManager.ui.showToast).not.toHaveBeenCalled();
  });

  it("serializes application reset behind an in-flight project restore", async () => {
    await assertResetSerializesProjectRestore({
      storage,
      projectManager,
      coordinator,
      preferences,
    });
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

  it("keeps acknowledged mundane settings after final-root failure and activates them on restart", async () => {
    preferences = await assertMundaneSettingsFinalRootFailure({
      storage,
      coordinator,
      eventBus: eventBusFixture.eventBus,
      projectManager,
      importedProject,
      preferences,
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
      activation: { data: "pending", preferences: "pending" },
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
    sync = await assertSyncRetriesOnlyDurableActivation({
      eventBusFixture,
      storage,
      coordinator,
      importer,
      projectManager,
      preferences,
    });
  });
});
