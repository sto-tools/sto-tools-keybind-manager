import LocalStorageVisitedStatePersistence from "../../src/js/components/storage/LocalStorageVisitedStatePersistence.js";
import { createProjectSettingsRepository } from "../fixtures/services/projectRestore.js";
import { createPreferencesState } from "../fixtures/core/componentState.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AutoSync from "../../src/js/components/services/AutoSync.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import ApplicationResetService from "../../src/js/components/services/ApplicationResetService.js";
import LocalStorageProjectRepository from "../../src/js/components/storage/LocalStorageProjectRepository.js";
import { request } from "../../src/js/core/requestResponse.js";
import { createServiceFixture } from "../fixtures/index.js";

const projectRootKey = "sto_keybind_manager";
const projectBackupKey = "sto_keybind_manager_backup";
const projectVersion = "test-reset-activation";

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

describe("application reset settings activation", () => {
  let fixture;
  let projectRepository;
  let settingsRepository;
  let coordinator;
  let preferences;
  let resetService;
  let autoSync;
  let i18n;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("sto_keybind_manager_visited", "true");
    fixture = createServiceFixture();
    i18n = {
      language: "en",
      t: (key) => key,
      changeLanguage: vi.fn(async (language) => {
        i18n.language = language;
      }),
    };
    settingsRepository = createProjectSettingsRepository();
    projectRepository = new LocalStorageProjectRepository({
      storage: localStorage,
      version: projectVersion,
      now: () => new Date().toISOString(),
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
    expect(root).not.toHaveProperty("settings");
    expect(
      projectRepository.commit(root, { verification: "required" }).status,
    ).toBe("committed");
    expect(
      settingsRepository.replace({
        ...createPreferencesState().settings,
        theme: "dark",
        language: "de",
        compactView: true,
        autoSync: true,
        autoSyncInterval: "change",
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

    autoSync = new AutoSync({
      eventBus: fixture.eventBus,
      syncManager: { syncProject: vi.fn() },
      i18n,
    });
    autoSync.init();
  });

  afterEach(() => {
    autoSync?.destroy();
    resetService?.destroy();
    preferences?.destroy();
    coordinator?.destroy();
    fixture?.destroy();
    document.documentElement.removeAttribute("data-theme");
    document.body.classList.remove("compact-view");
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("converges durable data, both runtime owners, consumers, and effects on defaults", async () => {
    expect(coordinator.state.currentProfile).toBe("captain");
    expect(preferences.getSettings()).toMatchObject({
      theme: "dark",
      language: "de",
      compactView: true,
      autoSync: true,
    });
    expect(autoSync.isEnabled).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.body.classList.contains("compact-view")).toBe(true);
    const revision = preferences.getCurrentState().revision;
    fixture.eventBusFixture.clearEventHistory();

    await expect(
      request(fixture.eventBus, "application:reset", {}, 0),
    ).resolves.toMatchObject({
      success: true,
      receipt: {
        rootClear: { status: "complete", committed: true },
        backupClear: { status: "complete", committed: true },
        resetSentinel: { status: "complete", committed: true },
        dataOwnerAdoption: { status: "complete", committed: true },
        settingsClear: { status: "complete", committed: true },
        settingsDefaults: { status: "complete", committed: true },
        preferencesOwnerAdoption: { status: "complete", committed: true },
      },
    });

    expect(localStorage.getItem(projectRootKey)).toBeNull();
    expect(localStorage.getItem(projectBackupKey)).toBeNull();
    expect(JSON.parse(localStorage.getItem("sto_keybind_settings"))).toEqual(
      preferences.getCurrentState().settings,
    );
    expect(localStorage.getItem("sto_app_reset")).toBe("true");
    expect(coordinator.state).toMatchObject({
      currentProfile: null,
      currentEnvironment: "space",
      profiles: {},
    });
    expect(preferences.getCurrentState()).toMatchObject({
      ready: true,
      revision: revision + 1,
      settings: {
        theme: "default",
        language: "en",
        compactView: false,
        autoSync: false,
      },
    });
    expect(autoSync.isEnabled).toBe(false);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(document.body.classList.contains("compact-view")).toBe(false);
    expect(i18n.language).toBe("en");

    const states = fixture.eventBusFixture.getEventsOfType(
      "preferences:state-changed",
    );
    expect(states).toHaveLength(1);
    expect(states[0].data.reason).toBe("settings-reset");
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:changed"),
    ).toHaveLength(1);
    expect(
      fixture.eventBusFixture.getEventsOfType("language:changed"),
    ).toHaveLength(1);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:saved"),
    ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:loaded"),
    ).toHaveLength(0);
    // The owner clears the standalone record inside its serialized reset
    // transition, then verifies persisted defaults before canonical adoption.
    expect(JSON.parse(localStorage.getItem("sto_keybind_settings"))).toEqual(
      preferences.getCurrentState().settings,
    );
  });

  it("keeps live Data unchanged on settings failure and reconciles the cleared root on owner restart", async () => {
    const dataBefore = coordinator.getCurrentState();
    const preferencesBefore = preferences.getCurrentState();
    vi.spyOn(settingsRepository, "replace").mockReturnValueOnce({
      status: "write_failed",
      error: "storage_write_failed",
      write: {
        status: "indeterminate",
        error: "storage_write_failed",
        category: "quota",
      },
      verification: { status: "not_attempted" },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    fixture.eventBusFixture.clearEventHistory();

    await expect(
      request(fixture.eventBus, "application:reset", {}, 0),
    ).resolves.toMatchObject({
      success: false,
      stage: "settingsDefaults",
      durable: true,
      receipt: {
        rootClear: { status: "complete", committed: true },
        settingsClear: { status: "complete", committed: true },
        settingsDefaults: {
          status: "failed",
          committed: "indeterminate",
        },
      },
    });

    expect(localStorage.getItem(projectRootKey)).toBeNull();
    expect(localStorage.getItem(projectBackupKey)).toBeNull();
    expect(localStorage.getItem("sto_keybind_settings")).toBeNull();
    expect(localStorage.getItem("sto_app_reset")).toBe("true");
    expect(coordinator.getCurrentState()).toBe(dataBefore);
    expect(coordinator.getCurrentState()).toMatchObject({
      ready: true,
      currentProfile: "captain",
      profiles: { captain: expect.any(Object) },
    });
    expect(preferences.getCurrentState()).toBe(preferencesBefore);
    expect(autoSync.isEnabled).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.body.classList.contains("compact-view")).toBe(true);
    expect(fixture.eventBusFixture.getEventsOfType("toast:show")).toHaveLength(
      0,
    );
    expect(
      fixture.eventBusFixture.getEventsOfType("data:state-changed"),
    ).toHaveLength(0);
    expect(
      fixture.eventBusFixture.getEventsOfType("profile:updated"),
    ).toHaveLength(0);

    const staleEpoch = preferencesBefore.authorityEpoch;
    preferences.destroy();
    coordinator.destroy();
    fixture.eventBusFixture.clearEventHistory();
    coordinator = new DataCoordinator({
      visitedState: new LocalStorageVisitedStatePersistence({
        storage: localStorage,
      }),
      eventBus: fixture.eventBus,
      projectRepository: new LocalStorageProjectRepository({
        storage: localStorage,
        version: projectVersion,
        now: () => new Date().toISOString(),
        settingsDefaults: createPreferencesState().settings,
      }),
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

    expect(coordinator.getCurrentState()).toMatchObject({
      ready: true,
      currentProfile: null,
      profiles: {},
    });

    expect(preferences.getCurrentState()).toMatchObject({
      authorityEpoch: staleEpoch + 1,
      ready: true,
      revision: 1,
      settings: {
        theme: "default",
        language: "en",
        compactView: false,
        autoSync: false,
      },
    });
    expect(autoSync.isEnabled).toBe(false);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(document.body.classList.contains("compact-view")).toBe(false);
    expect(JSON.parse(localStorage.getItem("sto_keybind_settings"))).toEqual(
      preferences.getCurrentState().settings,
    );
    expect(
      fixture.eventBusFixture.getEventsOfType("preferences:state-changed"),
    ).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ reason: "startup-loaded" }),
      }),
    ]);
  });

  it("clears defaults after already-queued preference mutations settle", async () => {
    let releaseLanguage = () => {};
    const languageBlocked = new Promise((resolve) => {
      releaseLanguage = resolve;
    });
    i18n.changeLanguage.mockImplementationOnce(async (language) => {
      await languageBlocked;
      i18n.language = language;
    });
    const saveSettings = vi.spyOn(settingsRepository, "replace");
    fixture.eventBusFixture.clearEventHistory();

    const firstMutation = preferences.setSetting("language", "fr");
    await vi.waitFor(() => {
      expect(i18n.changeLanguage).toHaveBeenCalledWith("fr");
    });
    const queuedMutation = preferences.setSetting("theme", "default");
    const reset = request(fixture.eventBus, "application:reset", {}, 0);

    await Promise.resolve();
    expect(localStorage.getItem(projectRootKey)).not.toBeNull();
    expect(
      fixture.eventBusFixture.getEventsOfType("data:state-changed"),
    ).toHaveLength(0);
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
    await expect(reset).resolves.toMatchObject({ success: true });

    expect(saveSettings).toHaveBeenCalledTimes(3);
    expect(JSON.parse(localStorage.getItem("sto_keybind_settings"))).toEqual(
      preferences.getCurrentState().settings,
    );
    expect(preferences.getCurrentState()).toMatchObject({
      ready: true,
      settings: {
        theme: "default",
        language: "en",
        compactView: false,
        autoSync: false,
      },
    });
    expect(autoSync.isEnabled).toBe(false);
    expect(i18n.language).toBe("en");
    expect(
      fixture.eventBusFixture
        .getEventsOfType("preferences:state-changed")
        .map(({ data }) => data.reason),
    ).toEqual(["setting-committed", "setting-committed", "settings-reset"]);
  });
});
