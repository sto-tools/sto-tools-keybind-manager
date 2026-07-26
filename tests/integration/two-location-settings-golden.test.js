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
      storage,
      i18n,
      localizeCommands: vi.fn(),
      applyTranslations: vi.fn(),
    });
    preferences.init();
    await preferences.initialStateReady;
    return preferences;
  }

  it("uses standalone settings for runtime and export while preserving the embedded record", async () => {
    const rootText = localStorage.getItem(storage.storageKey);
    const settingsText = localStorage.getItem(storage.settingsKey);

    await startPreferences();

    expect(preferences.getSettings()).toEqual(golden.standalone);
    expect(storage.getAllData().settings).toEqual(golden.root.settings);

    const artifact = JSON.parse(
      serializeProjectArtifact(storage.getAllData(), storage.getSettings(), {
        version: "1.0.0",
        exported: "2026-07-21T12:00:00.000Z",
      }),
    );
    expect(artifact.data).toEqual({
      profiles: storage.getAllData().profiles,
      settings: golden.standalone,
      currentProfile: "canonical-profile",
    });
    expect(artifact.data.settings.currentProfile).toBe("canonical-profile");

    const compatibilityArtifact = JSON.parse(
      serializeProjectArtifact(storage.getAllData(), null, {
        version: "1.0.0",
        exported: "2026-07-21T12:00:00.000Z",
      }),
    );
    expect(compatibilityArtifact.data.settings).toEqual(golden.root.settings);
    expect(localStorage.getItem(storage.storageKey)).toBe(rootText);
    expect(localStorage.getItem(storage.settingsKey)).toBe(settingsText);
  });

  it.each([
    ["absent", null],
    ["corrupt", '{"theme":'],
  ])(
    "restarts from defaults rather than embedded settings when standalone data is %s",
    async (_condition, standaloneText) => {
      if (standaloneText === null) {
        localStorage.removeItem(storage.settingsKey);
      } else {
        localStorage.setItem(storage.settingsKey, standaloneText);
        vi.spyOn(console, "error").mockImplementation(() => {});
      }

      await startPreferences();

      expect(preferences.getSettings()).toEqual(golden.defaults);
      expect(storage.getAllData().settings).toEqual(golden.root.settings);
      expect(localStorage.getItem(storage.settingsKey)).toBe(standaloneText);
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
      storage.settingsKey,
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
