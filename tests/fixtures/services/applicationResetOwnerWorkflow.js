import { expect, vi } from "vitest";
import ApplicationResetService from "../../../src/js/components/services/ApplicationResetService.js";
import DataCoordinator from "../../../src/js/components/services/DataCoordinator.js";
import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import LocalStorageProjectRepository from "../../../src/js/components/storage/LocalStorageProjectRepository.js";
import LocalStorageSettingsRepository from "../../../src/js/components/storage/LocalStorageSettingsRepository.js";
import LocalStorageVisitedStatePersistence from "../../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { createPreferencesState } from "../core/componentState.js";
import { createServiceFixture } from "../index.js";

const ROOT_KEY = "sto_keybind_manager";
const BACKUP_KEY = "sto_keybind_manager_backup";
const SETTINGS_KEY = "sto_keybind_settings";
const RESET_KEY = "sto_app_reset";
const PROJECT_VERSION = "test-reset-failure-matrix";
export function createProfile() {
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

export function rawPersistence() {
  return {
    root: localStorage.getItem(ROOT_KEY),
    backup: localStorage.getItem(BACKUP_KEY),
    settings: localStorage.getItem(SETTINGS_KEY),
    resetSentinel: localStorage.getItem(RESET_KEY),
  };
}

export async function createResetOwnerWorkflowFixture() {
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
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
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
    visitedState: new LocalStorageVisitedStatePersistence({
      storage: localStorage,
    }),
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
    runPreferencesResetTransition: (operation, checkpoint) =>
      preferences.runApplicationResetTransition(operation, checkpoint),
    runDataResetTransition: (operation, checkpoint) =>
      coordinator.runApplicationResetTransition(operation, checkpoint),
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
  return {
    fixture,
    repositoryStorage,
    projectRepository,
    settingsRepository,
    coordinator,
    preferences,
    resetService,
    initialRaw,
    defaultSettingsRaw,
    i18n,
    createCoordinator,
    createPreferences,
  };
}

export function destroyResetOwnerWorkflowFixture({
  fixture,
  resetService,
  preferences,
  coordinator,
  repositoryStorage,
}) {
  resetService?.destroy();
  if (preferences && !preferences.destroyed) preferences.destroy();
  if (coordinator && !coordinator.destroyed) coordinator.destroy();
  fixture?.destroy();
  repositoryStorage?.clearFault();
  document.documentElement.removeAttribute("data-theme");
  document.body.classList.remove("compact-view");
  localStorage.clear();
  vi.restoreAllMocks();
}
