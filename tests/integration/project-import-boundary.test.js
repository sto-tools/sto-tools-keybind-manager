import {
  createProjectSettingsRepository,
  createImportPreferencesOwner,
} from "../fixtures/services/projectRestore.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DataCoordinator from "../../src/js/components/services/DataCoordinator.js";
import ImportService from "../../src/js/components/services/ImportService.js";
import {
  createEventBusFixture,
  createLocalStorageFixture,
} from "../fixtures/core/index.js";
import { createProjectRepository } from "./helpers/projectRepository.js";

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
  let projectRepository;
  let coordinator;
  let service;
  let preferences;
  let settingsRepository;

  beforeEach(async () => {
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
      },
    });
    projectRepository = createProjectRepository();
    coordinator = new DataCoordinator({
      eventBus: eventBusFixture.eventBus,
      projectRepository,
      i18n: { t: (key) => key },
      defaultProfiles: {},
    });
    settingsRepository = createProjectSettingsRepository();
    preferences = await createImportPreferencesOwner({
      eventBus: eventBusFixture.eventBus,
      settingsRepository,
    });
    coordinator.init();
    await coordinator.initialStateReady;
    service = new ImportService({
      runPreferencesTransition: (source, operation) =>
        preferences.runExternalActivationTransition(source, operation),
      eventBus: eventBusFixture.eventBus,
      replaceProjectFromImport: (...args) =>
        coordinator.replaceProjectFromImport(...args),
    });
    service.init();
  });

  afterEach(() => {
    service?.destroy();
    preferences?.destroy();
    coordinator?.destroy();
    eventBusFixture?.destroy();
    localStorageFixture?.destroy();
    vi.restoreAllMocks();
  });

  it("validates every profile before the first persistence operation", async () => {
    const beforeRoot = projectRepository.load().value;
    const beforeSettings = localStorage.getItem("sto_keybind_settings");
    const commitProject = vi.spyOn(projectRepository, "commit");
    const saveSettings = vi.spyOn(settingsRepository, "replace");
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
    expect(commitProject).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
    expect(projectRepository.load().value).toEqual(beforeRoot);
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
      const beforeRoot = projectRepository.load().value;
      const beforeSettings = localStorage.getItem("sto_keybind_settings");
      const commitProject = vi.spyOn(projectRepository, "commit");
      const saveSettings = vi.spyOn(settingsRepository, "replace");
      const result = await service.importProjectFile(
        JSON.stringify({ type: "project", data }),
      );

      expect(result).toEqual({
        success: false,
        error: "invalid_project_file",
        params: { path },
      });
      expect(commitProject).not.toHaveBeenCalled();
      expect(saveSettings).not.toHaveBeenCalled();
      expect(projectRepository.load().value).toEqual(beforeRoot);
      expect(localStorage.getItem("sto_keybind_settings")).toBe(beforeSettings);
    },
  );

  it("rejects null project import options before the first persistence operation", async () => {
    const beforeRoot = projectRepository.load().value;
    const beforeSettings = localStorage.getItem("sto_keybind_settings");
    const commitProject = vi.spyOn(projectRepository, "commit");
    const saveSettings = vi.spyOn(settingsRepository, "replace");
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
    expect(commitProject).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
    expect(projectRepository.load().value).toEqual(beforeRoot);
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
    const project = projectRepository.load().value;
    const profile = project.profiles.ground_legacy;
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
    expect(project.currentProfile).toBe("ground_legacy");
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
    expect(projectRepository.load().value.currentProfile).toBe("existing");
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
        localStorage.removeItem("sto_keybind_settings");
      } else {
        localStorage.setItem(
          "sto_keybind_settings",
          JSON.stringify(standaloneSettings),
        );
      }
      preferences.destroy();
      preferences = await createImportPreferencesOwner({
        eventBus: eventBusFixture.eventBus,
        settingsRepository,
      });
      const beforeRoot = projectRepository.load().value;
      const saveSettings = vi.spyOn(settingsRepository, "replace");
      const commitProject = vi.spyOn(projectRepository, "commit");

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
        currentProfile: "existing",
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
        localStorage.getItem("sto_keybind_settings"),
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
      expect(commitProject).toHaveBeenCalledOnce();
      expect(projectRepository.load().value).toMatchObject({
        profiles: beforeRoot.profiles,
        currentProfile: beforeRoot.currentProfile,
        settings: beforeRoot.settings,
      });
    },
  );
});
