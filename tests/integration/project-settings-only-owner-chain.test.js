import { createProjectSettingsRepository } from "../fixtures/services/projectRestore.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import ProjectManagementService from "../../src/js/components/services/ProjectManagementService.js";
import {
  createEventBusFixture,
  createLocalStorageFixture,
} from "../fixtures/core/index.js";
import { destinationRoot } from "../fixtures/services/projectImportOwnerChain.js";
import { createProjectRepository } from "./helpers/projectRepository.js";

const projectRootKey = "sto_keybind_manager";

const embeddedSettings = {
  theme: "dark",
  language: "fr",
  legacyRootOnly: { preserved: true },
};

const settingsOnlyProject = {
  version: "1.0.0",
  exported: "2026-07-21T12:00:00.000Z",
  type: "project",
  data: {
    profiles: {},
    settings: {
      theme: "light",
      language: "de",
      compactView: true,
      "plugin:layout": { density: "compact" },
    },
    currentProfile: "existing",
  },
};

describe("settings-only project restore owner chain", () => {
  let eventBusFixture;
  let localStorageFixture;
  let projectRepository;
  let settingsRepository;
  let coordinator;
  let importer;
  let preferences;
  let projectManager;
  let preferencesI18n;

  async function restartPreferencesOwner() {
    preferences.destroy();
    preferencesI18n = {
      language: "en",
      t: (key) => key,
      changeLanguage: vi.fn(async (language) => {
        preferencesI18n.language = language;
      }),
    };
    preferences = new PreferencesService({
      eventBus: eventBusFixture.eventBus,
      settingsRepository,
      i18n: preferencesI18n,
      localizeCommands: vi.fn(),
      applyTranslations: vi.fn(),
    });
    preferences.init();
    await preferences.initialStateReady;
    return preferences;
  }

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    eventBusFixture = createEventBusFixture();
    localStorageFixture = createLocalStorageFixture({
      initialData: {
        sto_keybind_manager: {
          ...structuredClone(destinationRoot),
          settings: structuredClone(embeddedSettings),
        },
        sto_keybind_settings: {
          theme: "dark",
          language: "en",
          firstRun: false,
          version: "destination-version",
        },
        sto_keybind_manager_visited: "true",
      },
    });
    projectRepository = createProjectRepository();
    coordinator = new DataCoordinator({
      eventBus: eventBusFixture.eventBus,
      projectRepository,
      i18n: { t: (key) => key },
      defaultProfiles: {},
    });
    importer = new ImportService({
      eventBus: eventBusFixture.eventBus,
      replaceProjectFromImport: (...args) =>
        coordinator.replaceProjectFromImport(...args),
    });
    preferencesI18n = {
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
      localizeCommands: vi.fn(),
      applyTranslations: vi.fn(),
    });
    projectManager = new ProjectManagementService({
      importProjectWithinPreferencesTransition: (...args) =>
        importer.importProjectWithinPreferencesTransition(...args),
      eventBus: eventBusFixture.eventBus,
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
    coordinator.init();
    await coordinator.initialStateReady;
    await preferences.initialStateReady;
    importer.init();
    projectManager.init();
  });

  afterEach(() => {
    projectManager?.destroy();
    importer?.destroy();
    preferences?.destroy();
    coordinator?.destroy();
    eventBusFixture?.destroy();
    localStorageFixture?.destroy();
    document.documentElement.removeAttribute("data-theme");
    document.body.classList.remove("compact-view");
    vi.restoreAllMocks();
  });

  it("activates standalone settings without replacing embedded compatibility data", async () => {
    const embeddedBefore = JSON.stringify(
      projectRepository.load().value.settings,
    );
    const dataRevision = coordinator.getCurrentState().revision;
    const preferencesRevision = preferences.getCurrentState().revision;
    eventBusFixture.clearEventHistory();

    await expect(
      projectManager.restoreFromProjectContent(
        JSON.stringify(settingsOnlyProject),
        "settings-only.json",
      ),
    ).resolves.toEqual({
      success: true,
      currentProfile: "existing",
      imported: { profiles: 0, settings: true },
    });

    expect(coordinator.getCurrentState()).toMatchObject({
      ready: true,
      revision: dataRevision + 1,
      currentProfile: "existing",
      profiles: { existing: { name: "Existing" } },
    });
    expect(preferences.getCurrentState()).toMatchObject({
      ready: true,
      revision: preferencesRevision + 1,
      settings: {
        theme: "light",
        language: "de",
        compactView: true,
        firstRun: false,
        version: "destination-version",
        "plugin:layout": { density: "compact" },
      },
    });
    expect(preferencesI18n.language).toBe("de");
    expect(JSON.stringify(projectRepository.load().value.settings)).toBe(
      embeddedBefore,
    );
    expect(projectRepository.load().value.settings).toEqual(embeddedSettings);

    const preferenceStates = eventBusFixture.getEventsOfType(
      "preferences:state-changed",
    );
    expect(preferenceStates).toHaveLength(1);
    expect(preferenceStates[0].data.reason).toBe("project-settings-activated");
    expect(eventBusFixture.getEventsOfType("preferences:changed")).toHaveLength(
      1,
    );
    expect(eventBusFixture.getEventsOfType("preferences:saved")).toHaveLength(
      0,
    );
    expect(eventBusFixture.getEventsOfType("preferences:loaded")).toHaveLength(
      0,
    );
  });

  it("holds import and activation behind already-queued owner mutations", async () => {
    let releaseLanguage = () => {};
    const languageBlocked = new Promise((resolve) => {
      releaseLanguage = resolve;
    });
    preferencesI18n.changeLanguage.mockImplementationOnce(async (language) => {
      await languageBlocked;
      preferencesI18n.language = language;
    });
    const saveSettings = vi.spyOn(settingsRepository, "replace");

    const firstMutation = preferences.setSetting("language", "fr");
    await vi.waitFor(() => {
      expect(preferencesI18n.changeLanguage).toHaveBeenCalledWith("fr");
    });
    const queuedMutation = preferences.setSetting("theme", "default");
    const restore = projectManager.restoreFromProjectContent(
      JSON.stringify(settingsOnlyProject),
      "settings-only.json",
    );

    await Promise.resolve();
    expect(saveSettings).toHaveBeenCalledOnce();
    expect(
      JSON.parse(localStorage.getItem("sto_keybind_settings")),
    ).toMatchObject({
      theme: "dark",
      language: "fr",
    });

    releaseLanguage();
    await expect(firstMutation).resolves.toBe(true);
    await expect(queuedMutation).resolves.toBe(true);
    await expect(restore).resolves.toEqual({
      success: true,
      currentProfile: "existing",
      imported: { profiles: 0, settings: true },
    });

    expect(saveSettings).toHaveBeenCalledTimes(3);
    expect(
      JSON.parse(localStorage.getItem("sto_keybind_settings")),
    ).toMatchObject({
      theme: "light",
      language: "de",
      compactView: true,
      "plugin:layout": { density: "compact" },
    });
    expect(preferences.getCurrentState()).toMatchObject({
      ready: true,
      settings: {
        theme: "light",
        language: "de",
        compactView: true,
        "plugin:layout": { density: "compact" },
      },
    });
    expect(preferencesI18n.language).toBe("de");
  });

  it.each(["write-indeterminate", "verification-failed"])(
    "reports a real SettingsRepository %s boundary and converges on owner restart",
    async (mode) => {
      const beforeRoot = localStorage.getItem(projectRootKey);
      const beforeData = coordinator.getCurrentState();
      const beforePreferences = preferences.getCurrentState();
      const rootWrites = vi.spyOn(projectRepository, "commit");
      const originalSetItem = localStorage.setItem;
      const originalGetItem = localStorage.getItem;
      const previousSettings = originalGetItem.call(
        localStorage,
        "sto_keybind_settings",
      );
      let importedSettingsWritten = false;

      localStorage.setItem = (key, value) => {
        originalSetItem.call(localStorage, key, value);
        if (key !== "sto_keybind_settings") return;
        importedSettingsWritten = true;
        if (mode === "write-indeterminate") {
          throw new DOMException("quota after write", "QuotaExceededError");
        }
      };
      if (mode === "verification-failed") {
        localStorage.getItem = (key) => {
          if (key === "sto_keybind_settings" && importedSettingsWritten) {
            importedSettingsWritten = false;
            return previousSettings;
          }
          return originalGetItem.call(localStorage, key);
        };
      }

      let result;
      try {
        result = await projectManager.restoreFromProjectContent(
          JSON.stringify(settingsOnlyProject),
          "settings-only.json",
        );
      } finally {
        localStorage.setItem = originalSetItem;
        localStorage.getItem = originalGetItem;
      }

      expect(result).toEqual({
        success: false,
        error: "storage_write_failed",
        params: { operation: "settings" },
        partial: false,
        committed: { profiles: [], settings: false, project: false },
      });
      expect(rootWrites).not.toHaveBeenCalled();
      expect(localStorage.getItem(projectRootKey)).toBe(beforeRoot);
      expect(coordinator.getCurrentState()).toBe(beforeData);
      expect(preferences.getCurrentState()).toBe(beforePreferences);
      expect(settingsRepository.load().value).toMatchObject({
        theme: "light",
        language: "de",
      });

      const successor = await restartPreferencesOwner();
      expect(successor.getCurrentState()).toMatchObject({
        ready: true,
        settings: { theme: "light", language: "de" },
      });
      expect(localStorage.getItem(projectRootKey)).toBe(beforeRoot);
    },
  );

  it("recovers on Preferences restart after Data commits but settings activation fails", async () => {
    const beforePreferences = preferences.getCurrentState();
    const prepareTransition =
      preferences._prepareSettingsTransition.bind(preferences);
    let preparations = 0;
    vi.spyOn(preferences, "_prepareSettingsTransition").mockImplementation(
      (...args) => {
        preparations += 1;
        if (preparations === 2) throw new Error("activation blocked");
        return prepareTransition(...args);
      },
    );
    const rootWrites = vi.spyOn(projectRepository, "commit");
    const settingsWrites = vi.spyOn(settingsRepository, "replace");

    await expect(
      projectManager.restoreFromProjectContent(
        JSON.stringify(settingsOnlyProject),
        "settings-only.json",
      ),
    ).resolves.toEqual({
      success: false,
      error: "project_restore_reload_failed",
      params: { reason: "activation blocked" },
      durable: true,
      currentProfile: "existing",
      imported: { profiles: 0, settings: true },
      activation: { data: "complete", preferences: "pending" },
    });
    expect(rootWrites).toHaveBeenCalledOnce();
    expect(settingsWrites).toHaveBeenCalledOnce();
    expect(coordinator.getCurrentState()).toMatchObject({
      currentProfile: "existing",
    });
    expect(preferences.getCurrentState()).toBe(beforePreferences);

    const successor = await restartPreferencesOwner();
    expect(successor.getCurrentState()).toMatchObject({
      ready: true,
      settings: { theme: "light", language: "de" },
    });
    expect(rootWrites).toHaveBeenCalledOnce();
  });

  it("preserves the settings receipt when Data lifecycle cancellation precedes the root write", async () => {
    const beforeRoot = localStorage.getItem(projectRootKey);
    const beforePreferences = preferences.getCurrentState();
    const replaceSettings = settingsRepository.replace.bind(settingsRepository);
    const settingsWrites = vi
      .spyOn(settingsRepository, "replace")
      .mockImplementationOnce((...args) => {
        const result = replaceSettings(...args);
        coordinator.destroy();
        return result;
      });
    const rootWrites = vi.spyOn(projectRepository, "commit");

    await expect(
      projectManager.restoreFromProjectContent(
        JSON.stringify(settingsOnlyProject),
        "settings-only.json",
      ),
    ).resolves.toEqual({
      success: false,
      error: "storage_write_failed",
      params: { operation: "project" },
      partial: true,
      committed: { profiles: [], settings: true, project: false },
    });
    expect(settingsWrites).toHaveBeenCalledOnce();
    expect(rootWrites).not.toHaveBeenCalled();
    expect(localStorage.getItem(projectRootKey)).toBe(beforeRoot);
    expect(preferences.getCurrentState()).toBe(beforePreferences);
    expect(coordinator.getCurrentState()).toMatchObject({
      ready: false,
      currentProfile: "existing",
    });

    const successor = await restartPreferencesOwner();
    expect(successor.getCurrentState()).toMatchObject({
      ready: true,
      settings: { theme: "light", language: "de" },
    });
    expect(rootWrites).not.toHaveBeenCalled();
  });

  it("refuses retained Preferences activation after an intervening durable owner mutation", async () => {
    const prepareTransition =
      preferences._prepareSettingsTransition.bind(preferences);
    let preparations = 0;
    vi.spyOn(preferences, "_prepareSettingsTransition").mockImplementation(
      (...args) => {
        preparations += 1;
        if (preparations === 2) throw new Error("activation blocked");
        return prepareTransition(...args);
      },
    );
    const rootWrites = vi.spyOn(projectRepository, "commit");
    const settingsWrites = vi.spyOn(settingsRepository, "replace");

    await expect(
      projectManager.restoreFromProjectContent(
        JSON.stringify(settingsOnlyProject),
        "settings-only.json",
      ),
    ).resolves.toMatchObject({
      success: false,
      error: "project_restore_reload_failed",
      durable: true,
      activation: { data: "complete", preferences: "pending" },
    });
    expect(rootWrites).toHaveBeenCalledOnce();
    expect(settingsWrites).toHaveBeenCalledOnce();

    await expect(preferences.setSetting("theme", "default")).resolves.toBe(
      true,
    );
    const stateAfterInterveningMutation = preferences.getCurrentState();
    expect(settingsWrites).toHaveBeenCalledTimes(2);

    await expect(projectManager.retryRestoreActivation()).resolves.toEqual({
      success: false,
      error: "project_restore_reload_failed",
      params: { reason: "preferences_settings_fingerprint_mismatch" },
      durable: true,
      currentProfile: "existing",
      imported: { profiles: 0, settings: true },
      activation: { data: "complete", preferences: "pending" },
    });
    expect(rootWrites).toHaveBeenCalledOnce();
    expect(settingsWrites).toHaveBeenCalledTimes(2);
    expect(preferences.getCurrentState()).toBe(stateAfterInterveningMutation);
    expect(settingsRepository.load().value.theme).toBe("default");
  });
});
