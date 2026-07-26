import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AutoSync from "../../src/js/components/services/AutoSync.js";
import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import { createServiceFixture } from "../fixtures/index.js";

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
  let storage;
  let coordinator;
  let preferences;
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
    storage = new StorageService({
      eventBus: fixture.eventBus,
      version: "test-reset-activation",
      i18n,
    });
    storage.init();

    const root = storage.getEmptyData();
    root.currentProfile = "captain";
    root.profiles = { captain: createProfile() };
    // The embedded compatibility field deliberately diverges. Runtime settings
    // continue to come only from the standalone authority.
    root.settings = { ...root.settings, theme: "default", language: "fr" };
    expect(storage.saveAllData(root)).toBe(true);
    expect(
      storage.saveSettings({
        theme: "dark",
        language: "de",
        compactView: true,
        autoSync: true,
        autoSyncInterval: "change",
      }),
    ).toBe(true);

    coordinator = new DataCoordinator({
      eventBus: fixture.eventBus,
      storage,
      i18n,
      defaultProfiles: {},
    });
    coordinator.init();
    await coordinator.initialStateReady;

    preferences = new PreferencesService({
      eventBus: fixture.eventBus,
      storage,
      i18n,
      localizeCommands: vi.fn(),
      applyTranslations: vi.fn(),
    });
    preferences.init();
    await preferences.initialStateReady;
    storage.setPreferencesTransitionRunner((source, operation) =>
      preferences.runExternalActivationTransition(source, operation),
    );

    autoSync = new AutoSync({
      eventBus: fixture.eventBus,
      syncManager: { syncProject: vi.fn() },
      i18n,
    });
    autoSync.init();
  });

  afterEach(() => {
    autoSync?.destroy();
    preferences?.destroy();
    coordinator?.destroy();
    storage?.destroy();
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

    await expect(storage.handleAppReset()).resolves.toBe(true);

    expect(localStorage.getItem(storage.storageKey)).toBeNull();
    expect(localStorage.getItem(storage.backupKey)).toBeNull();
    expect(localStorage.getItem(storage.settingsKey)).toBeNull();
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
    // transition, then keeps defaults as the in-memory canonical snapshot.
    expect(localStorage.getItem(storage.settingsKey)).toBeNull();
  });

  it("keeps the reset durable and recovers stale Preferences state on owner restart", async () => {
    const dataRevision = coordinator.getCurrentState().revision;
    const preferencesBefore = preferences.getCurrentState();
    const readFailure = new Error("standalone settings unavailable");
    vi.spyOn(storage, "getSettings").mockImplementationOnce(() => {
      throw readFailure;
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    fixture.eventBusFixture.clearEventHistory();

    await expect(storage.handleAppReset()).resolves.toBe(false);

    expect(localStorage.getItem(storage.storageKey)).toBeNull();
    expect(localStorage.getItem(storage.backupKey)).toBeNull();
    expect(localStorage.getItem(storage.settingsKey)).toBeNull();
    expect(localStorage.getItem("sto_app_reset")).toBe("true");
    expect(coordinator.getCurrentState()).toMatchObject({
      ready: true,
      revision: dataRevision + 1,
      currentProfile: null,
      profiles: {},
    });
    expect(preferences.getCurrentState()).toBe(preferencesBefore);
    expect(autoSync.isEnabled).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.body.classList.contains("compact-view")).toBe(true);
    expect(fixture.eventBusFixture.getEventsOfType("toast:show")).toHaveLength(
      0,
    );

    const staleEpoch = preferencesBefore.authorityEpoch;
    preferences.destroy();
    fixture.eventBusFixture.clearEventHistory();
    preferences = new PreferencesService({
      eventBus: fixture.eventBus,
      storage,
      i18n,
      localizeCommands: vi.fn(),
      applyTranslations: vi.fn(),
    });
    preferences.init();
    await preferences.initialStateReady;

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
    expect(localStorage.getItem(storage.settingsKey)).toBeNull();
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
    const saveSettings = vi.spyOn(storage, "saveSettings");
    fixture.eventBusFixture.clearEventHistory();

    const firstMutation = preferences.setSetting("language", "fr");
    await vi.waitFor(() => {
      expect(i18n.changeLanguage).toHaveBeenCalledWith("fr");
    });
    const queuedMutation = preferences.setSetting("theme", "default");
    const reset = storage.handleAppReset();

    await Promise.resolve();
    expect(localStorage.getItem(storage.storageKey)).not.toBeNull();
    expect(
      fixture.eventBusFixture.getEventsOfType("storage:data-reset"),
    ).toHaveLength(0);
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
    await expect(reset).resolves.toBe(true);

    expect(saveSettings).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(storage.settingsKey)).toBeNull();
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
