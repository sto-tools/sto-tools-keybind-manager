import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import ProjectManagementService from "../../src/js/components/services/ProjectManagementService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import {
  createEventBusFixture,
  createLocalStorageFixture,
} from "../fixtures/core/index.js";
import { destinationRoot } from "../fixtures/services/projectImportOwnerChain.js";

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
  let storage;
  let coordinator;
  let importer;
  let preferences;
  let projectManager;
  let preferencesI18n;

  beforeEach(async () => {
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
    preferencesI18n = {
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
      localizeCommands: vi.fn(),
      applyTranslations: vi.fn(),
    });
    projectManager = new ProjectManagementService({
      eventBus: eventBusFixture.eventBus,
      storage,
      i18n: { t: (key) => key },
      runPreferencesTransition: (source, operation) =>
        preferences.runExternalActivationTransition(source, operation),
    });

    storage.init();
    coordinator.init();
    preferences.init();
    await coordinator.initialStateReady;
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
    document.documentElement.removeAttribute("data-theme");
    document.body.classList.remove("compact-view");
    vi.restoreAllMocks();
  });

  it("activates standalone settings without replacing embedded compatibility data", async () => {
    const embeddedBefore = JSON.stringify(storage.getAllData().settings);
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
    expect(JSON.stringify(storage.getAllData().settings)).toBe(embeddedBefore);
    expect(storage.getAllData().settings).toEqual(embeddedSettings);

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
    const saveSettings = vi.spyOn(storage, "saveSettings");

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
    expect(JSON.parse(localStorage.getItem(storage.settingsKey))).toMatchObject(
      {
        theme: "dark",
        language: "fr",
      },
    );

    releaseLanguage();
    await expect(firstMutation).resolves.toBe(true);
    await expect(queuedMutation).resolves.toBe(true);
    await expect(restore).resolves.toEqual({
      success: true,
      currentProfile: "existing",
      imported: { profiles: 0, settings: true },
    });

    expect(saveSettings).toHaveBeenCalledTimes(3);
    expect(JSON.parse(localStorage.getItem(storage.settingsKey))).toMatchObject(
      {
        theme: "light",
        language: "de",
        compactView: true,
        "plugin:layout": { density: "compact" },
      },
    );
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
});
