import { createProjectSettingsRepository } from "../fixtures/services/projectRestore.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PreferencesService from "../../src/js/components/services/PreferencesService.js";
import StorageService from "../../src/js/components/services/StorageService.js";
import { serializeProjectArtifact } from "../../src/js/components/services/projectArtifact.js";
import {
  createEventBusFixture,
  createLocalStorageFixture,
} from "../fixtures/core/index.js";

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
  let storage;
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
    storage = new StorageService({
      eventBus: eventBusFixture.eventBus,
      version: "1.0.0",
    });
    storage.init();
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
    storage?.destroy();
    eventBusFixture?.destroy();
    localStorageFixture?.destroy();
    document.documentElement.removeAttribute("data-theme");
    document.body.classList.remove("compact-view");
    vi.restoreAllMocks();
  });

  async function startPreferences() {
    preferences = new PreferencesService({
      eventBus: eventBusFixture.eventBus,
      settingsRepository: createProjectSettingsRepository(),
      i18n,
      localizeCommands: vi.fn(),
      applyTranslations: vi.fn(),
    });
    preferences.init();
    await preferences.initialStateReady;
    return preferences;
  }

  it("uses standalone settings for export, refuses embedded fallback, and preserves both records", async () => {
    const rootText = localStorage.getItem(storage.storageKey);
    const settingsText = localStorage.getItem("sto_keybind_settings");

    await startPreferences();

    expect(preferences.getSettings()).toEqual(golden.standalone);
    expect(storage.getAllData().settings).toEqual(golden.root.settings);

    const artifact = JSON.parse(
      serializeProjectArtifact(
        {
          profiles: storage.getAllData().profiles,
          currentProfile: storage.getAllData().currentProfile,
        },
        preferences.getCurrentState().settings,
        {
          version: "1.0.0",
          exported: "2026-07-21T12:00:00.000Z",
        },
      ),
    );
    expect(artifact.data).toEqual({
      profiles: storage.getAllData().profiles,
      settings: golden.standalone,
      currentProfile: "canonical-profile",
    });
    expect(artifact.data.settings.currentProfile).toBe("canonical-profile");

    expect(() =>
      serializeProjectArtifact(
        {
          profiles: storage.getAllData().profiles,
          currentProfile: storage.getAllData().currentProfile,
        },
        null,
        {
          version: "1.0.0",
          exported: "2026-07-21T12:00:00.000Z",
        },
      ),
    ).toThrowError("canonical_settings_required");
    expect(localStorage.getItem(storage.storageKey)).toBe(rootText);
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
      expect(storage.getAllData().settings).toEqual(golden.root.settings);
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
    expect(storage.getAllData().settings).toEqual(golden.root.settings);
  });
});
