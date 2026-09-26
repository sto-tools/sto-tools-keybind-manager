import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StorageService from "../../../src/js/components/services/StorageService.js";
import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { createProjectSettingsRepository } from "../../fixtures/services/projectRestore.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";
import { createLocalStorageFixture } from "../../fixtures/core/storage.js";

const FIXTURE_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/storage",
);
const STORAGE_KEY = "sto_keybind_manager";
const BACKUP_KEY = "sto_keybind_manager_backup";
const SETTINGS_KEY = "sto_keybind_settings";
const STORAGE_VERSION = "2.0.0";
const MIGRATION_TIME = "2026-07-15T12:00:00.000Z";

function readFixtureText(fileName) {
  return readFileSync(join(FIXTURE_DIRECTORY, fileName), "utf8").trim();
}

function readFixtureJson(fileName) {
  return JSON.parse(readFixtureText(fileName));
}

function readPersistedJson(key) {
  const value = localStorage.getItem(key);
  expect(value).not.toBeNull();
  return JSON.parse(value);
}

describe("StorageService persisted-format characterization", () => {
  let eventBusFixture;
  let services;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(MIGRATION_TIME));
    vi.spyOn(console, "log").mockImplementation(() => {});
    eventBusFixture = createEventBusFixture();
    services = [];
  });

  afterEach(() => {
    for (const service of services) {
      if (!service.destroyed) service.destroy();
    }
    eventBusFixture.destroy();
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function startStorage() {
    const service = new StorageService({
      eventBus: eventBusFixture.eventBus,
      version: STORAGE_VERSION,
    });
    services.push(service);
    service.init();
    return service;
  }

  async function startPreferences() {
    const owner = new PreferencesService({
      settingsRepository: createProjectSettingsRepository(),
      eventBus: eventBusFixture.eventBus,
    });
    services.push(owner);
    owner.init();
    await owner.initialStateReady;
    return owner;
  }

  it("preserves every known current root, profile, and settings field", () => {
    const originalRoot = readFixtureJson("complete-current-root.json");
    const settings = readFixtureJson("complete-current-settings.json");
    const rawRoot = JSON.stringify(originalRoot);

    localStorage.setItem(STORAGE_KEY, rawRoot);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

    startStorage();
    const persistedRoot = readPersistedJson(STORAGE_KEY);

    expect(persistedRoot).toEqual({
      ...originalRoot,
      lastModified: MIGRATION_TIME,
      lastBackup: MIGRATION_TIME,
    });
    expect(persistedRoot.profiles["complete-profile"]).toEqual(
      originalRoot.profiles["complete-profile"],
    );
    expect(persistedRoot.settings).toEqual(settings);
    expect(createProjectSettingsRepository().load().value).toEqual(settings);
    expect(readPersistedJson(SETTINGS_KEY)).toEqual(settings);
    expect(readPersistedJson(BACKUP_KEY)).toEqual({
      data: rawRoot,
      timestamp: MIGRATION_TIME,
      version: STORAGE_VERSION,
    });
  });

  // Standalone settings removal is no longer a Storage-owned reset stage.
  // PreferencesService clear-failure coverage now owns that requirement.
  it.each([
    {
      environment: "space",
      inputFile: "legacy-space-root.json",
      expectedFile: "legacy-space-expected-root.json",
      profileId: "legacy-space",
      preservedFields: [
        "bindsets",
        "aliasMetadata",
        "bindsetMetadata",
        "selections",
        "migrationVersion",
        "vertigoSettings",
        "legacyExtension",
      ],
    },
    {
      environment: "ground",
      inputFile: "legacy-ground-root.json",
      expectedFile: "legacy-ground-expected-root.json",
      profileId: "legacy-ground",
      preservedFields: [],
    },
  ])(
    "migrates the legacy mode+keys $environment fixture to its golden output",
    ({ inputFile, expectedFile, profileId, preservedFields }) => {
      const inputRoot = readFixtureJson(inputFile);
      const expectedRoot = readFixtureJson(expectedFile);
      const rawRoot = JSON.stringify(inputRoot);
      localStorage.setItem(STORAGE_KEY, rawRoot);

      startStorage();

      const persistedRoot = readPersistedJson(STORAGE_KEY);
      const migratedProfile = persistedRoot.profiles[profileId];
      expect(persistedRoot).toEqual(expectedRoot);
      expect(migratedProfile).not.toHaveProperty("mode");
      expect(migratedProfile).not.toHaveProperty("keys");
      expect(migratedProfile).not.toHaveProperty("keybinds");
      for (const field of preservedFields) {
        expect(migratedProfile[field]).toEqual(
          expectedRoot.profiles[profileId][field],
        );
      }
      expect(readPersistedJson(BACKUP_KEY)).toEqual({
        data: rawRoot,
        timestamp: MIGRATION_TIME,
        version: STORAGE_VERSION,
      });
      expect(
        eventBusFixture.getEventsOfType("storage:data-changed"),
      ).toHaveLength(1);
    },
  );

  it("does not repeat profile migration on a second initialization", () => {
    const legacyRoot = readFixtureJson("legacy-space-root.json");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyRoot));

    const firstService = startStorage();
    const firstPersistedRoot = readPersistedJson(STORAGE_KEY);
    const firstMigratedProfile = structuredClone(
      firstPersistedRoot.profiles["legacy-space"],
    );
    firstService.destroy();

    const secondInitializationTime = "2026-07-15T13:00:00.000Z";
    vi.setSystemTime(new Date(secondInitializationTime));
    startStorage();

    const secondPersistedRoot = readPersistedJson(STORAGE_KEY);
    expect(secondPersistedRoot.profiles["legacy-space"]).toEqual(
      firstMigratedProfile,
    );
    expect(secondPersistedRoot).toEqual({
      ...firstPersistedRoot,
      lastModified: secondInitializationTime,
      lastBackup: secondInitializationTime,
    });
    expect(readPersistedJson(BACKUP_KEY)).toEqual({
      data: JSON.stringify(firstPersistedRoot),
      timestamp: secondInitializationTime,
      version: STORAGE_VERSION,
    });
  });

  it.each([
    ["malformed JSON", "malformed-root.txt", false],
    ["a missing profiles section", "missing-profiles-root.json", true],
    ["an invalid profiles section", "invalid-profiles-root.json", true],
    ["an invalid profile", "invalid-profile-root.json", true],
  ])(
    "replaces %s with the recovered empty-root golden",
    (_case, file, json) => {
      const rawRoot = json
        ? JSON.stringify(readFixtureJson(file))
        : readFixtureText(file);
      const expectedRoot = readFixtureJson("recovered-empty-root.json");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      localStorage.setItem(STORAGE_KEY, rawRoot);

      startStorage();

      expect(readPersistedJson(STORAGE_KEY)).toEqual(expectedRoot);
      expect(readPersistedJson(BACKUP_KEY)).toEqual({
        data: rawRoot,
        timestamp: MIGRATION_TIME,
        version: STORAGE_VERSION,
      });
      if (file === "malformed-root.txt") {
        expect(errorSpy).toHaveBeenCalledWith(
          "Error loading data from storage:",
          expect.any(SyntaxError),
        );
      }
    },
  );

  it("recovers corrupt standalone settings read-only, then verifies repair before owner readiness", async () => {
    const root = readFixtureJson("complete-current-root.json");
    const corruptSettings = readFixtureText("corrupt-settings.txt");
    const expectedDefaults = readFixtureJson(
      "recovered-empty-root.json",
    ).settings;
    vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
    localStorage.setItem(SETTINGS_KEY, corruptSettings);

    startStorage();

    expect(createProjectSettingsRepository().load().value).toEqual(
      expectedDefaults,
    );
    expect(localStorage.getItem(SETTINGS_KEY)).toBe(corruptSettings);

    const owner = await startPreferences();
    expect(readPersistedJson(SETTINGS_KEY)).toEqual(expectedDefaults);
    expect(
      await owner.setSettings({ theme: "dark", bindsetsEnabled: true }),
    ).toBe(true);
    expect(readPersistedJson(SETTINGS_KEY)).toEqual({
      ...expectedDefaults,
      theme: "dark",
      bindsetsEnabled: true,
    });
  });

  it("recovers stored settings field by field and verifies repair through Preferences", async () => {
    const root = readFixtureJson("complete-current-root.json");
    const unsafeSettings = JSON.parse(
      '{"theme":42,"language":"fr","currentProfile":7,"plugin:layout":{"density":"compact"},"plugin:unsafe":{"nested":{"constructor":true}}}',
    );
    const rawSettings = JSON.stringify(unsafeSettings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
    localStorage.setItem(SETTINGS_KEY, rawSettings);

    startStorage();
    const recovered = createProjectSettingsRepository().load().value;

    expect(recovered).toMatchObject({
      theme: "default",
      language: "fr",
      "plugin:layout": { density: "compact" },
    });
    expect(recovered).not.toHaveProperty("currentProfile");
    expect(recovered).not.toHaveProperty("plugin:unsafe");
    expect(localStorage.getItem(SETTINGS_KEY)).toBe(rawSettings);
    expect({}.polluted).toBeUndefined();

    const owner = await startPreferences();
    expect(readPersistedJson(SETTINGS_KEY)).toEqual(recovered);
    expect(await owner.setSetting("compactView", true)).toBe(true);
    expect(readPersistedJson(SETTINGS_KEY)).toEqual({
      ...recovered,
      compactView: true,
    });
  });

  it("rejects unsafe settings writes without changing durable settings", () => {
    const root = readFixtureJson("complete-current-root.json");
    const settings = readFixtureJson("complete-current-settings.json");
    const rawSettings = JSON.stringify(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
    localStorage.setItem(SETTINGS_KEY, rawSettings);
    startStorage();
    const repository = createProjectSettingsRepository();

    const cyclic = {};
    cyclic.self = cyclic;
    expect(
      repository.replace({ ...settings, "plugin:cyclic": cyclic }).status,
    ).toBe("rejected");
    expect(repository.replace({ ...settings, theme: 42 }).status).toBe(
      "rejected",
    );
    expect(
      repository.replace({
        ...settings,
        ...JSON.parse('{"constructor":{"unsafe":true}}'),
      }).status,
    ).toBe("rejected");
    expect(localStorage.getItem(SETTINGS_KEY)).toBe(rawSettings);
  });

  it("installs the same recovered cache for syntax and schema failures", () => {
    const originalRoot = readFixtureJson("complete-current-root.json");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(originalRoot));
    const service = startStorage();

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(readFixtureJson("invalid-profile-root.json")),
    );
    const schemaRecovery = service.getAllData(true);
    expect(schemaRecovery.profiles).toEqual({});
    expect(service.getAllData()).toBe(schemaRecovery);

    vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, readFixtureText("malformed-root.txt"));
    const syntaxRecovery = service.getAllData(true);
    expect(syntaxRecovery.profiles).toEqual({});
    expect(service.getAllData()).toBe(syntaxRecovery);
  });

  it("does not expose a migrated cache when its required startup write fails", () => {
    const legacyRoot = readFixtureJson("legacy-space-root.json");
    const rawRoot = JSON.stringify(legacyRoot);
    const localFixture = createLocalStorageFixture({
      initialData: { [STORAGE_KEY]: rawRoot },
      quotaError: true,
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = new StorageService({
      eventBus: eventBusFixture.eventBus,
      version: STORAGE_VERSION,
    });
    services.push(service);

    try {
      expect(() => service.init()).toThrow("storage_write_failed");
      expect(localStorage.getItem(STORAGE_KEY)).toBe(rawRoot);
      expect(localStorage.getItem(BACKUP_KEY)).toBeNull();
      expect(
        eventBusFixture.getEventsOfType("storage:data-changed"),
      ).toHaveLength(0);
      expect(service._cachedData).toBeNull();
      expect(service.isInitialized()).toBe(false);
      expect(service.getCurrentState().isReady).toBe(false);
      expect(eventBusFixture.eventBus.hasListeners("component:register")).toBe(
        false,
      );
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      localFixture.destroy();
    }
  });

  it("keeps saving the primary root when automatic backup creation fails", () => {
    const originalRoot = readFixtureJson("complete-current-root.json");
    const localFixture = createLocalStorageFixture({
      initialData: { [STORAGE_KEY]: originalRoot },
      setItemErrorKeys: [BACKUP_KEY],
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const service = new StorageService({
      eventBus: eventBusFixture.eventBus,
      version: STORAGE_VERSION,
    });
    services.push(service);

    try {
      expect(() => service.init()).not.toThrow();
      expect(readPersistedJson(STORAGE_KEY)).toMatchObject({
        currentProfile: "complete-profile",
        version: STORAGE_VERSION,
        lastModified: MIGRATION_TIME,
      });
      expect(localStorage.getItem(BACKUP_KEY)).toBeNull();
    } finally {
      localFixture.destroy();
    }
  });

  it("repairs a stale currentProfile to the first persisted profile", () => {
    const originalRoot = readFixtureJson("stale-current-profile-root.json");
    const rawRoot = JSON.stringify(originalRoot);
    localStorage.setItem(STORAGE_KEY, rawRoot);

    const service = startStorage();
    const persistedRoot = readPersistedJson(STORAGE_KEY);

    expect(persistedRoot).toEqual({
      ...originalRoot,
      currentProfile: "alpha",
      lastModified: MIGRATION_TIME,
      lastBackup: MIGRATION_TIME,
    });
    expect(service.getAllData()).toEqual(persistedRoot);
    expect(readPersistedJson(BACKUP_KEY)).toEqual({
      data: rawRoot,
      timestamp: MIGRATION_TIME,
      version: STORAGE_VERSION,
    });
  });

  it("invalidates cached reads without mutating persistent storage", () => {
    const originalRoot = readFixtureJson("complete-current-root.json");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(originalRoot));

    const service = startStorage();
    const cachedRoot = service.getAllData();
    const replacementRoot = {
      ...originalRoot,
      currentProfile: null,
      profiles: {},
      lastModified: "2026-07-15T13:00:00.000Z",
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(replacementRoot));
    const persistedBeforeInvalidation = localStorage.getItem(STORAGE_KEY);

    expect(service.getAllData()).toBe(cachedRoot);

    service.invalidateCache();

    expect(localStorage.getItem(STORAGE_KEY)).toBe(persistedBeforeInvalidation);
    expect(service.getAllData()).toMatchObject(replacementRoot);
  });
});
