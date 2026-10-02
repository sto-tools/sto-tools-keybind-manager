import { createProjectSettingsRepository } from "../fixtures/services/projectRestore.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import { runStorageSchemaMigration } from "../../src/js/components/storage/storageSchemaMigration.js";
import { serializeProjectArtifact } from "../../src/js/components/services/projectArtifact.js";
import {
  createEventBusFixture,
  createLocalStorageFixture,
} from "../fixtures/core/index.js";
import { createProjectRepository } from "./helpers/projectRepository.js";

const projectRootKey = "sto_keybind_manager";

const golden = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      "tests/fixtures/storage/two-location-settings-golden.json",
    ),
    "utf8",
  ),
);

describe("two-location settings authority golden", () => {
  let eventBusFixture;
  let localStorageFixture;
  let projectRepository;
  let preferences;
  let i18n;

  beforeEach(() => {
    eventBusFixture = createEventBusFixture();
    localStorageFixture = createLocalStorageFixture({
      initialData: {
        sto_keybind_manager: golden.root,
        sto_keybind_settings: golden.standalone,
        sto_keybind_manager_visited: "true",
      },
    });
    projectRepository = createProjectRepository();
    i18n = {
      language: "en",
      t: (key) => key,
      changeLanguage: vi.fn(async (language) => {
        i18n.language = language;
      }),
    };
  });

  afterEach(() => {
    preferences?.destroy();
    eventBusFixture?.destroy();
    localStorageFixture?.destroy();
    document.documentElement.removeAttribute("data-theme");
    document.body.classList.remove("compact-view");
    vi.restoreAllMocks();
  });

  async function startPreferences() {
    const settingsRepository = createProjectSettingsRepository();
    const startupMigration = runStorageSchemaMigration({
      settingsRepository,
      settingsInspection: settingsRepository.createMigrationInspectionPort(),
      projectMigration: projectRepository.createSchemaMigrationPort(),
      defaults: golden.defaults,
      version: "1.0.0",
      now: () => "2026-10-02T17:00:00.000Z",
    });
    expect(["absent", "complete"]).toContain(startupMigration.status);
    preferences = new PreferencesService({
      eventBus: eventBusFixture.eventBus,
      settingsRepository,
      startupMigration,
      i18n,
      localizeCommands: vi.fn(),
      applyTranslations: vi.fn(),
    });
    preferences.init();
    await preferences.initialStateReady;
    return preferences;
  }

  it("migrates the exact legacy backup, exports standalone settings, and preserves project extensions", async () => {
    const rootText = localStorage.getItem(projectRootKey);
    const settingsText = localStorage.getItem("sto_keybind_settings");

    await startPreferences();

    expect(preferences.getSettings()).toEqual(golden.standalone);
    const project = projectRepository.load().value;
    const expectedRoot = structuredClone(golden.root);
    delete expectedRoot.settings;
    expect(project).toEqual(expectedRoot);
    expect(project).not.toHaveProperty("settings");

    const artifact = JSON.parse(
      serializeProjectArtifact(
        {
          profiles: project.profiles,
          currentProfile: project.currentProfile,
        },
        preferences.getCurrentState().settings,
        {
          version: "1.0.0",
          exported: "2026-07-21T12:00:00.000Z",
        },
      ),
    );
    expect(artifact.data).toEqual({
      profiles: project.profiles,
      settings: golden.standalone,
      currentProfile: "canonical-profile",
    });
    expect(artifact.data.settings.currentProfile).toBe("canonical-profile");

    expect(() =>
      serializeProjectArtifact(
        {
          profiles: project.profiles,
          currentProfile: project.currentProfile,
        },
        null,
        {
          version: "1.0.0",
          exported: "2026-07-21T12:00:00.000Z",
        },
      ),
    ).toThrowError("canonical_settings_required");
    expect(JSON.parse(localStorage.getItem(projectRootKey))).toEqual(
      expectedRoot,
    );
    expect(
      JSON.parse(localStorage.getItem("sto_keybind_manager_backup")).data,
    ).toBe(rootText);
    expect(localStorage.getItem("sto_keybind_settings")).toBe(settingsText);
  });

  it.each([
    ["absent", null],
    ["corrupt", '{"theme":'],
  ])(
    "restarts from defaults rather than embedded settings when standalone data is %s",
    async (_condition, standaloneText) => {
      if (standaloneText === null) {
        localStorage.removeItem("sto_keybind_settings");
      } else {
        localStorage.setItem("sto_keybind_settings", standaloneText);
        vi.spyOn(console, "error").mockImplementation(() => {});
      }

      await startPreferences();

      expect(preferences.getSettings()).toEqual(golden.defaults);
      expect(projectRepository.load().value).not.toHaveProperty("settings");
      expect(projectRepository.load().value.profiles).toEqual(
        golden.root.profiles,
      );
      expect(localStorage.getItem("sto_keybind_settings")).toBe(
        JSON.stringify(golden.defaults),
      );
    },
  );

  it("converges a replacement owner on the latest standalone record", async () => {
    const first = await startPreferences();
    expect(first.getSettings()).toEqual(golden.standalone);
    const firstEpoch = first.getCurrentState().authorityEpoch;
    first.destroy();

    const successorSettings = {
      ...golden.standalone,
      theme: "dark",
      language: "fr",
      "plugin:layout": { density: "comfortable" },
    };
    localStorage.setItem(
      "sto_keybind_settings",
      JSON.stringify(successorSettings),
    );
    preferences = null;
    const successor = await startPreferences();

    expect(successor.getCurrentState()).toMatchObject({
      authorityEpoch: firstEpoch + 1,
      ready: true,
      revision: 1,
      settings: successorSettings,
    });
    expect(projectRepository.load().value).not.toHaveProperty("settings");
    expect(projectRepository.load().value.profiles).toEqual(
      golden.root.profiles,
    );
  });
});
