import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StorageService from "../../../src/js/components/services/StorageService.js";
import { createEventBusFixture } from "../../fixtures/core/eventBus.js";

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

  it("preserves every known current root, profile, and settings field", () => {
    const originalRoot = readFixtureJson("complete-current-root.json");
    const settings = readFixtureJson("complete-current-settings.json");
    const rawRoot = JSON.stringify(originalRoot);

    localStorage.setItem(STORAGE_KEY, rawRoot);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

    const service = startStorage();
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
    expect(service.getSettings()).toEqual(settings);
    expect(readPersistedJson(SETTINGS_KEY)).toEqual(settings);
    expect(readPersistedJson(BACKUP_KEY)).toEqual({
      data: rawRoot,
      timestamp: MIGRATION_TIME,
      version: STORAGE_VERSION,
    });
  });

  it.each([
    {
      environment: "space",
      inputFile: "legacy-space-root.json",
      expectedFile: "legacy-space-expected-root.json",
      profileId: "legacy-space",
      droppedFields: [
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
      droppedFields: [],
    },
  ])(
    "migrates the legacy mode+keys $environment fixture to its golden output",
    ({ inputFile, expectedFile, profileId, droppedFields }) => {
      const inputRoot = readFixtureJson(inputFile);
      const expectedRoot = readFixtureJson(expectedFile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inputRoot));

      startStorage();

      const persistedRoot = readPersistedJson(STORAGE_KEY);
      const migratedProfile = persistedRoot.profiles[profileId];
      expect(persistedRoot).toEqual(expectedRoot);
      expect(migratedProfile).not.toHaveProperty("mode");
      expect(migratedProfile).not.toHaveProperty("keys");
      for (const field of droppedFields) {
        expect(migratedProfile).not.toHaveProperty(field);
      }
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

  it("falls back from corrupt separate settings without repairing them until save", () => {
    const root = readFixtureJson("complete-current-root.json");
    const corruptSettings = readFixtureText("corrupt-settings.txt");
    const expectedDefaults = readFixtureJson(
      "recovered-empty-root.json",
    ).settings;
    vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
    localStorage.setItem(SETTINGS_KEY, corruptSettings);

    const service = startStorage();

    expect(service.getSettings()).toEqual(expectedDefaults);
    expect(localStorage.getItem(SETTINGS_KEY)).toBe(corruptSettings);

    expect(service.saveSettings({ theme: "dark", bindsetsEnabled: true })).toBe(
      true,
    );
    expect(readPersistedJson(SETTINGS_KEY)).toEqual({
      ...expectedDefaults,
      theme: "dark",
      bindsetsEnabled: true,
    });
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

  it("writes and consumes the reset sentinel while preserving unrelated local state", () => {
    const root = readFixtureJson("complete-current-root.json");
    const settings = readFixtureJson("complete-current-settings.json");
    const sentinel = readFixtureJson("reset-sentinel.json");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem("sto_keybind_manager_visited", "true");
    localStorage.setItem("keyViewMode", "categorized");

    const resettingService = startStorage();
    expect(resettingService.clearAllData()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(BACKUP_KEY)).toBeNull();
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
    expect(localStorage.getItem(sentinel.key)).toBe(sentinel.value);

    resettingService.destroy();
    const restartedService = startStorage();

    expect(localStorage.getItem(sentinel.key)).toBeNull();
    expect(readPersistedJson(STORAGE_KEY)).toEqual(
      readFixtureJson("recovered-empty-root.json"),
    );
    expect(localStorage.getItem(BACKUP_KEY)).toBeNull();
    expect(localStorage.getItem("sto_keybind_manager_visited")).toBe("true");
    expect(localStorage.getItem("keyViewMode")).toBe("categorized");
    expect(restartedService.getAllData().profiles).toEqual({});
  });
});
