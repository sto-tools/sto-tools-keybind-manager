import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ApplicationResetService from "../../src/js/components/services/ApplicationResetService.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import LocalStorageProjectRepository from "../../src/js/components/storage/LocalStorageProjectRepository.js";
import LocalStorageSettingsRepository from "../../src/js/components/storage/LocalStorageSettingsRepository.js";
import { request } from "../../src/js/core/requestResponse.js";
import { createPreferencesState } from "../fixtures/core/componentState.js";
import { createServiceFixture } from "../fixtures/index.js";

const ROOT_KEY = "sto_keybind_manager";
const BACKUP_KEY = "sto_keybind_manager_backup";
const SETTINGS_KEY = "sto_keybind_settings";
const RESET_KEY = "sto_app_reset";
const PROJECT_VERSION = "test-reset-failure-matrix";
const RECEIPT_STAGES = [
  "validation",
  "rootClear",
  "backupClear",
  "resetSentinel",
  "settingsClear",
  "settingsDefaults",
  "dataOwnerAdoption",
  "preferencesOwnerAdoption",
];

const complete = ["complete", true];
const pending = ["pending", false];
const skipped = ["skipped", false];
const failedIndeterminate = ["failed", "indeterminate"];
const failed = ["failed", false];

function createProfile() {
  return {
    id: "captain",
    name: "Captain",
    currentEnvironment: "space",
    migrationVersion: "2.1.1",
    builds: {
      space: { keys: { F1: ["FireAll"] } },
      ground: { keys: {} },
    },
    aliases: {},
  };
}

function createFaultingStorage() {
  let fault = null;
  const trigger = (method, key, phase) => {
    if (
      !fault ||
      fault.method !== method ||
      fault.key !== key ||
      fault.phase !== phase
    ) {
      return;
    }
    const current = fault;
    fault = null;
    current.onTrigger?.();
    if (current.throw) {
      throw new DOMException("injected quota failure", "QuotaExceededError");
    }
  };

  return {
    getItem(key) {
      trigger("getItem", key, "before");
      const value = localStorage.getItem(key);
      trigger("getItem", key, "after");
      return value;
    },
    setItem(key, value) {
      trigger("setItem", key, "before");
      localStorage.setItem(key, value);
      trigger("setItem", key, "after");
    },
    removeItem(key) {
      trigger("removeItem", key, "before");
      localStorage.removeItem(key);
      trigger("removeItem", key, "after");
    },
    arm(nextFault) {
      fault = nextFault;
    },
    clearFault() {
      fault = null;
    },
  };
}

function rawPersistence() {
  return {
    root: localStorage.getItem(ROOT_KEY),
    backup: localStorage.getItem(BACKUP_KEY),
    settings: localStorage.getItem(SETTINGS_KEY),
    resetSentinel: localStorage.getItem(RESET_KEY),
  };
}

function compactReceipt(receipt) {
  return Object.fromEntries(
    RECEIPT_STAGES.map((stage) => [
      stage,
      [receipt[stage].status, receipt[stage].committed],
    ]),
  );
}

const cases = [
  {
    stage: "rootClear",
    fault: {
      method: "removeItem",
      key: ROOT_KEY,
      phase: "before",
      throw: true,
    },
    raw: "unchanged",
    receipt: {
      validation: complete,
      rootClear: failedIndeterminate,
      backupClear: pending,
      resetSentinel: pending,
      settingsClear: pending,
      settingsDefaults: pending,
      dataOwnerAdoption: pending,
      preferencesOwnerAdoption: pending,
    },
    dataPublished: false,
    restartedProject: "captain",
    restartedTheme: "dark",
  },
  {
    stage: "backupClear",
    fault: {
      method: "removeItem",
      key: BACKUP_KEY,
      phase: "before",
      throw: true,
    },
    raw: "root-cleared",
    receipt: {
      validation: complete,
      rootClear: complete,
      backupClear: failedIndeterminate,
      resetSentinel: pending,
      settingsClear: pending,
      settingsDefaults: pending,
      dataOwnerAdoption: pending,
      preferencesOwnerAdoption: pending,
    },
    dataPublished: false,
    restartedProject: null,
    restartedTheme: "dark",
  },
  {
    stage: "resetSentinel",
    fault: { method: "setItem", key: RESET_KEY, phase: "before", throw: true },
    raw: "project-cleared",
    receipt: {
      validation: complete,
      rootClear: complete,
      backupClear: complete,
      resetSentinel: failedIndeterminate,
      settingsClear: pending,
      settingsDefaults: pending,
      dataOwnerAdoption: pending,
      preferencesOwnerAdoption: pending,
    },
    dataPublished: false,
    restartedProject: null,
    restartedTheme: "dark",
  },
  {
    stage: "dataOwnerAdoption",
    ownerFailure: "data",
    raw: "project-reset",
    receipt: {
      validation: complete,
      rootClear: complete,
      backupClear: complete,
      resetSentinel: complete,
      settingsClear: pending,
      settingsDefaults: pending,
      dataOwnerAdoption: failed,
      preferencesOwnerAdoption: pending,
    },
    dataPublished: false,
    restartedProject: null,
    restartedTheme: "dark",
  },
  {
    stage: "settingsClear",
    fault: {
      method: "removeItem",
      key: SETTINGS_KEY,
      phase: "before",
      throw: true,
    },
    raw: "project-reset",
    receipt: {
      validation: complete,
      rootClear: complete,
      backupClear: complete,
      resetSentinel: complete,
      settingsClear: failedIndeterminate,
      settingsDefaults: skipped,
      dataOwnerAdoption: pending,
      preferencesOwnerAdoption: skipped,
    },
    dataPublished: false,
    restartedProject: null,
    restartedTheme: "dark",
  },
  {
    stage: "settingsDefaults",
    fault: {
      method: "setItem",
      key: SETTINGS_KEY,
      phase: "before",
      throw: true,
    },
    raw: "settings-cleared",
    receipt: {
      validation: complete,
      rootClear: complete,
      backupClear: complete,
      resetSentinel: complete,
      settingsClear: complete,
      settingsDefaults: failedIndeterminate,
      dataOwnerAdoption: pending,
      preferencesOwnerAdoption: skipped,
    },
    dataPublished: false,
    restartedProject: null,
    restartedTheme: "default",
  },
  {
    stage: "preferencesOwnerAdoption",
    ownerFailure: "preferences",
    raw: "defaults-written",
    receipt: {
      validation: complete,
      rootClear: complete,
      backupClear: complete,
      resetSentinel: complete,
      settingsClear: complete,
      settingsDefaults: complete,
      dataOwnerAdoption: pending,
      preferencesOwnerAdoption: failed,
    },
    dataPublished: false,
    restartedProject: null,
    restartedTheme: "default",
  },
];

describe("application reset durable failure and restart matrix", () => {
  let fixture;
  let repositoryStorage;
  let projectRepository;
  let settingsRepository;
  let coordinator;
  let preferences;
  let resetService;
  let initialRaw;
  let defaultSettingsRaw;
  let i18n;

  const createCoordinator = async () => {
    const next = new DataCoordinator({
      eventBus: fixture.eventBus,
      projectRepository: new LocalStorageProjectRepository({
        storage: repositoryStorage,
        version: PROJECT_VERSION,
        now: () => "2026-09-26T12:00:00.000Z",
        settingsDefaults: createPreferencesState().settings,
      }),
      i18n,
      defaultProfiles: {},
    });
    next.init();
    await next.initialStateReady;
    return next;
  };

  const createPreferences = async () => {
    const next = new PreferencesService({
      eventBus: fixture.eventBus,
      settingsRepository: new LocalStorageSettingsRepository({
        storage: repositoryStorage,
        defaults: createPreferencesState().settings,
      }),
      i18n,
      localizeCommands: vi.fn(),
      applyTranslations: vi.fn(),
    });
    next.init();
    await next.initialStateReady;
    return next;
  };

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("sto_keybind_manager_visited", "true");
    fixture = createServiceFixture();
    repositoryStorage = createFaultingStorage();
    i18n = {
      language: "en",
      t: (key) => key,
      changeLanguage: vi.fn(async (language) => {
        i18n.language = language;
      }),
    };
    projectRepository = new LocalStorageProjectRepository({
      storage: repositoryStorage,
      version: PROJECT_VERSION,
      now: () => "2026-09-26T12:00:00.000Z",
      settingsDefaults: createPreferencesState().settings,
    });
    const defaults = projectRepository.load();
    expect(defaults.status).toBe("repair_required");
    expect(
      projectRepository.commit(defaults.value, { verification: "required" })
        .status,
    ).toBe("committed");
    const root = projectRepository.load().value;
    root.currentProfile = "captain";
    root.profiles = { captain: createProfile() };
    expect(
      projectRepository.commit(root, { verification: "required" }).status,
    ).toBe("committed");

    settingsRepository = new LocalStorageSettingsRepository({
      storage: repositoryStorage,
      defaults: createPreferencesState().settings,
    });
    expect(
      settingsRepository.replace({
        ...createPreferencesState().settings,
        theme: "dark",
        language: "de",
        compactView: true,
      }).status,
    ).toBe("committed");

    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      projectRepository,
      i18n,
      defaultProfiles: {},
    });
    coordinator.init();
    await coordinator.initialStateReady;

    preferences = new PreferencesService({
      eventBus: fixture.eventBus,
      settingsRepository,
      i18n,
      localizeCommands: vi.fn(),
      applyTranslations: vi.fn(),
    });
    preferences.init();
    await preferences.initialStateReady;

    resetService = new ApplicationResetService({
      eventBus: fixture.eventBus,
      runPreferencesResetTransition: (operation) =>
        preferences.runApplicationResetTransition(operation),
      runDataResetTransition: (operation) =>
        coordinator.runApplicationResetTransition(operation),
    });
    resetService.init();

    initialRaw = rawPersistence();
    defaultSettingsRaw = JSON.stringify(createPreferencesState().settings);
    expect(initialRaw).toEqual({
      root: expect.any(String),
      backup: expect.any(String),
      settings: expect.any(String),
      resetSentinel: null,
    });
    expect(JSON.parse(initialRaw.root).currentProfile).toBe("captain");
    expect(JSON.parse(initialRaw.settings)).toMatchObject({ theme: "dark" });
    fixture.eventBusFixture.clearEventHistory();
  });

  afterEach(() => {
    resetService?.destroy();
    if (preferences && !preferences.destroyed) preferences.destroy();
    if (coordinator && !coordinator.destroyed) coordinator.destroy();
    fixture?.destroy();
    repositoryStorage?.clearFault();
    document.documentElement.removeAttribute("data-theme");
    document.body.classList.remove("compact-view");
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it.each(cases)(
    "records exact persistence and restarts safely after $stage failure",
    async (testCase) => {
      const resetProjectOperation =
        projectRepository.reset.bind(projectRepository);
      const resetProject = vi.spyOn(projectRepository, "reset");
      if (testCase.fault) repositoryStorage.arm(testCase.fault);
      if (testCase.ownerFailure === "data") {
        resetProject.mockImplementationOnce(() => {
          const result = resetProjectOperation();
          coordinator.destroy();
          return result;
        });
      }
      if (testCase.ownerFailure === "preferences") {
        repositoryStorage.arm({
          method: "setItem",
          key: SETTINGS_KEY,
          phase: "after",
          throw: false,
          onTrigger: () => preferences.destroy(),
        });
      }

      const result = await request(
        fixture.eventBus,
        "application:reset",
        {},
        0,
      );

      expect(result).toMatchObject({ success: false, stage: testCase.stage });
      expect(compactReceipt(result.receipt)).toEqual(testCase.receipt);
      expect(resetProject).toHaveBeenCalledOnce();

      const expectedRaw = {
        unchanged: initialRaw,
        "root-cleared": { ...initialRaw, root: null },
        "project-cleared": {
          ...initialRaw,
          root: null,
          backup: null,
        },
        "project-reset": {
          ...initialRaw,
          root: null,
          backup: null,
          resetSentinel: "true",
        },
        "settings-cleared": {
          root: null,
          backup: null,
          settings: null,
          resetSentinel: "true",
        },
        "defaults-written": {
          root: null,
          backup: null,
          settings: defaultSettingsRaw,
          resetSentinel: "true",
        },
      }[testCase.raw];
      expect(rawPersistence()).toEqual(expectedRaw);

      const expectedDataPublications = testCase.dataPublished ? 1 : 0;
      expect(
        fixture.eventBusFixture.getEventsOfType("data:state-changed"),
      ).toHaveLength(expectedDataPublications);
      expect(
        fixture.eventBusFixture.getEventsOfType("profile:updated"),
      ).toHaveLength(expectedDataPublications);
      expect(
        fixture.eventBusFixture.getEventsOfType("profile:switched"),
      ).toHaveLength(expectedDataPublications);
      expect(
        fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
      ).toHaveLength(0);
      expect(
        fixture.eventBusFixture.getEventsOfType("preferences:changed"),
      ).toHaveLength(0);
      expect(
        fixture.eventBusFixture.getEventsOfType("toast:show"),
      ).toHaveLength(0);
      expect(coordinator.getCurrentState()).toMatchObject({
        ready: testCase.ownerFailure === "data" ? false : true,
        currentProfile: "captain",
        profiles: { captain: expect.any(Object) },
      });

      resetService.destroy();
      if (!preferences.destroyed) preferences.destroy();
      if (!coordinator.destroyed) coordinator.destroy();
      repositoryStorage.clearFault();
      fixture.eventBusFixture.clearEventHistory();

      coordinator = await createCoordinator();
      preferences = await createPreferences();

      expect(coordinator.getCurrentState()).toMatchObject({
        ready: true,
        currentProfile: testCase.restartedProject,
      });
      if (testCase.restartedProject === null) {
        expect(coordinator.getCurrentState().profiles).toEqual({});
      } else {
        expect(coordinator.getCurrentState().profiles).toHaveProperty(
          testCase.restartedProject,
        );
      }
      expect(preferences.getCurrentState()).toMatchObject({
        ready: true,
        settings: { theme: testCase.restartedTheme },
      });
    },
  );
});
