import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportService from "../../src/js/components/services/ImportService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import {
  createEventBusFixture,
  createLocalStorageFixture,
} from "../fixtures/core/index.js";

const destinationRoot = {
  version: "1.0.0",
  created: "2026-01-01T00:00:00.000Z",
  lastModified: "2026-01-01T00:00:00.000Z",
  currentProfile: "existing",
  profiles: {
    existing: {
      name: "Existing",
      currentEnvironment: "space",
      migrationVersion: "2.1.1",
      builds: { space: { keys: {} }, ground: { keys: {} } },
      aliases: {},
    },
  },
  globalAliases: {},
  settings: {},
};

describe("project import boundary", () => {
  let eventBusFixture;
  let localStorageFixture;
  let storage;
  let service;

  beforeEach(() => {
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
      },
    });
    storage = new StorageService({
      eventBus: eventBusFixture.eventBus,
      version: "1.0.0",
    });
    storage.init();
    service = new ImportService({
      eventBus: eventBusFixture.eventBus,
      storage,
    });
    service.init();
  });

  afterEach(() => {
    service?.destroy();
    storage?.destroy();
    eventBusFixture?.destroy();
    localStorageFixture?.destroy();
    vi.restoreAllMocks();
  });

  it("validates every profile before the first persistence operation", async () => {
    const beforeRoot = localStorage.getItem("sto_keybind_manager");
    const beforeSettings = localStorage.getItem("sto_keybind_settings");
    const saveProfile = vi.spyOn(storage, "saveProfile");
    const saveSettings = vi.spyOn(storage, "saveSettings");
    const saveAllData = vi.spyOn(storage, "saveAllData");
    const result = await service.importProjectFile(
      JSON.stringify({
        type: "project",
        data: {
          profiles: {
            valid: {
              name: "Valid",
              builds: { space: { keys: { F1: ["FireAll"] } } },
            },
            invalid: {
              name: "Invalid",
              builds: { ground: { keys: { G: 42 } } },
            },
          },
          settings: { theme: "light" },
        },
      }),
    );

    expect(result).toEqual({
      success: false,
      error: "invalid_project_file",
      params: { path: "$.data.profiles.invalid.builds.ground.keys.G" },
    });
    expect(saveProfile).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
    expect(saveAllData).not.toHaveBeenCalled();
    expect(localStorage.getItem("sto_keybind_manager")).toBe(beforeRoot);
    expect(localStorage.getItem("sto_keybind_settings")).toBe(beforeSettings);
  });

  it.each([
    [
      "canonical top-level",
      {
        profiles: { candidate: { name: "Candidate" } },
        currentProfile: "missing",
      },
      "$.data.currentProfile",
    ],
    [
      "legacy settings",
      {
        profiles: { candidate: { name: "Candidate" } },
        settings: { currentProfile: "missing", theme: "light" },
      },
      "$.data.settings.currentProfile",
    ],
  ])(
    "rejects a dangling %s profile reference before the first persistence operation",
    async (_label, data, path) => {
      const beforeRoot = localStorage.getItem("sto_keybind_manager");
      const beforeSettings = localStorage.getItem("sto_keybind_settings");
      const saveProfile = vi.spyOn(storage, "saveProfile");
      const saveSettings = vi.spyOn(storage, "saveSettings");
      const saveAllData = vi.spyOn(storage, "saveAllData");
      const result = await service.importProjectFile(
        JSON.stringify({ type: "project", data }),
      );

      expect(result).toEqual({
        success: false,
        error: "invalid_project_file",
        params: { path },
      });
      expect(saveProfile).not.toHaveBeenCalled();
      expect(saveSettings).not.toHaveBeenCalled();
      expect(saveAllData).not.toHaveBeenCalled();
      expect(localStorage.getItem("sto_keybind_manager")).toBe(beforeRoot);
      expect(localStorage.getItem("sto_keybind_settings")).toBe(beforeSettings);
    },
  );

  it("rejects null project import options before the first persistence operation", async () => {
    const beforeRoot = localStorage.getItem("sto_keybind_manager");
    const beforeSettings = localStorage.getItem("sto_keybind_settings");
    const saveProfile = vi.spyOn(storage, "saveProfile");
    const saveSettings = vi.spyOn(storage, "saveSettings");
    const saveAllData = vi.spyOn(storage, "saveAllData");
    const result = await service.importProjectFile(
      JSON.stringify({
        type: "project",
        data: {
          profiles: { candidate: { name: "Candidate" } },
          settings: { theme: "light" },
        },
      }),
      null,
    );

    expect(result).toEqual({
      success: false,
      error: "invalid_project_options",
      params: { path: "$.options" },
    });
    expect(saveProfile).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
    expect(saveAllData).not.toHaveBeenCalled();
    expect(localStorage.getItem("sto_keybind_manager")).toBe(beforeRoot);
    expect(localStorage.getItem("sto_keybind_settings")).toBe(beforeSettings);
  });

  it("normalizes a legacy ground profile without losing compatible fields", async () => {
    const result = await service.importProjectFile(
      JSON.stringify({
        type: "project",
        data: {
          profiles: {
            ground_legacy: {
              name: "Ground Legacy",
              mode: "Ground Mode",
              keys: { G: "Sprint $$ Aim" },
              keybindMetadata: {
                G: { stabilizeExecutionOrder: true },
              },
              legacyExtension: { retained: true },
            },
          },
          currentProfile: "ground_legacy",
        },
      }),
    );

    expect(result).toMatchObject({
      success: true,
      imported: { profiles: 1, settings: false },
      currentProfile: "ground_legacy",
    });
    const profile = storage.getProfile("ground_legacy");
    expect(profile).toMatchObject({
      name: "Ground Legacy",
      currentEnvironment: "ground",
      builds: { ground: { keys: { G: ["Sprint", "Aim"] } } },
      keybindMetadata: {
        ground: { G: { stabilizeExecutionOrder: true } },
      },
      legacyExtension: { retained: true },
    });
    expect(profile).not.toHaveProperty("mode");
    expect(profile).not.toHaveProperty("keys");
    expect(storage.getAllData().currentProfile).toBe("ground_legacy");
  });

  it("validates skipped settings while preserving settings and legacy selection", async () => {
    const beforeSettings = localStorage.getItem("sto_keybind_settings");
    const invalid = await service.importProjectFile(
      JSON.stringify({
        type: "project",
        data: {
          settings: { currentProfile: "existing", autoSave: "yes" },
        },
      }),
      { importSettings: false },
    );
    expect(invalid).toEqual({
      success: false,
      error: "invalid_project_file",
      params: { path: "$.data.settings.autoSave" },
    });

    const valid = await service.importProjectFile(
      JSON.stringify({
        type: "project",
        data: {
          settings: {
            currentProfile: "existing",
            theme: "light",
            "plugin:layout": { density: "compact" },
          },
        },
      }),
      { importSettings: false },
    );
    expect(valid).toMatchObject({
      success: true,
      imported: { profiles: 0, settings: false },
      currentProfile: "existing",
    });
    expect(localStorage.getItem("sto_keybind_settings")).toBe(beforeSettings);
    expect(storage.getAllData().currentProfile).toBe("existing");
  });

  it.each([
    ["are absent", null, undefined],
    [
      "contain ordinary preferences only",
      { theme: "dark", language: "en" },
      undefined,
    ],
    [
      "contain no compatibility fields and the project supplies a version",
      { theme: "dark", language: "en" },
      "project-version",
    ],
  ])(
    "imports a settings patch when standalone settings %s",
    async (_condition, standaloneSettings, projectVersion) => {
      if (standaloneSettings === null) {
        localStorage.removeItem(storage.settingsKey);
      } else {
        localStorage.setItem(
          storage.settingsKey,
          JSON.stringify(standaloneSettings),
        );
      }
      const beforeRoot = localStorage.getItem(storage.storageKey);
      const saveSettings = vi.spyOn(storage, "saveSettings");

      const result = await service.importProjectFile(
        JSON.stringify({
          type: "project",
          data: {
            settings: {
              theme: "light",
              firstRun: true,
              ...(projectVersion === undefined
                ? {}
                : { version: projectVersion }),
              "plugin:layout": { density: "compact" },
            },
          },
        }),
      );

      expect(result).toEqual({
        success: true,
        message: "project_imported_successfully",
        imported: { profiles: 0, settings: true },
        currentProfile: null,
      });
      expect(saveSettings).toHaveBeenCalledOnce();
      const [settingsPayload] = saveSettings.mock.calls[0];
      expect(settingsPayload).toMatchObject({
        theme: "light",
        language: "en",
        "plugin:layout": { density: "compact" },
      });
      if (projectVersion === undefined) {
        expect(Object.hasOwn(settingsPayload, "version")).toBe(false);
      } else {
        expect(settingsPayload.version).toBe(projectVersion);
      }
      expect(Object.hasOwn(settingsPayload, "firstRun")).toBe(false);
      const persistedSettings = JSON.parse(
        localStorage.getItem(storage.settingsKey),
      );
      expect(persistedSettings).toMatchObject({
        theme: "light",
        language: "en",
        "plugin:layout": { density: "compact" },
      });
      if (projectVersion === undefined) {
        expect(persistedSettings).not.toHaveProperty("version");
      } else {
        expect(persistedSettings.version).toBe(projectVersion);
      }
      expect(persistedSettings).not.toHaveProperty("firstRun");
      expect(localStorage.getItem(storage.storageKey)).toBe(beforeRoot);
    },
  );
});
