import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServiceFixture } from "../../fixtures/index.js";
import StorageService from "../../../src/js/components/services/StorageService.js";
import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import { createProjectSettingsRepository } from "../../fixtures/services/projectRestore.js";

describe("StorageService", () => {
  let fixture, storageService, eventBusFixture, mockEventBus;
  let settingsRepository;
  let preferencesOwner;

  beforeEach(() => {
    // Ensure a clean slate before each test
    localStorage.clear();
    fixture = createServiceFixture();
    eventBusFixture = fixture.eventBusFixture;
    mockEventBus = fixture.eventBus;

    storageService = new StorageService({
      eventBus: mockEventBus,
      version: "test-1.0.0",
    });
    settingsRepository = createProjectSettingsRepository();
    preferencesOwner = null;
    // Trigger onInit via ComponentBase.init()
    storageService.init();
  });

  afterEach(() => {
    preferencesOwner?.destroy();
    vi.clearAllMocks();
    localStorage.clear();
    fixture.destroy();
  });

  async function startPreferencesOwner() {
    preferencesOwner = new PreferencesService({
      settingsRepository,
      eventBus: mockEventBus,
      defaults: storageService.getDefaultSettings(),
    });
    preferencesOwner.init();
    await preferencesOwner.initialStateReady;
    return preferencesOwner;
  }

  describe("Initialization", () => {
    it("should populate localStorage with default structure", () => {
      const raw = localStorage.getItem("sto_keybind_manager");
      expect(raw).toBeTruthy();
      const data = JSON.parse(raw);
      expect(data).toHaveProperty("currentProfile");
      expect(data).toHaveProperty("profiles");
      expect(data).toHaveProperty("settings");
      expect(data.version).toBe("test-1.0.0");
    });
  });

  describe("Data persistence", () => {
    it("should save modified data and emit change event", () => {
      const data = storageService.getAllData();
      data.settings.theme = "light";
      const ok = storageService.saveAllData(data);

      expect(ok).toBe(true);
      eventBusFixture.expectEvent("storage:data-changed");

      const persisted = JSON.parse(localStorage.getItem("sto_keybind_manager"));
      expect(persisted.settings.theme).toBe("light");
    });
  });

  describe("Profile operations", () => {
    it("should save and retrieve profiles", () => {
      const profileId = "test_profile";
      const profileData = {
        name: "Test Profile",
        builds: { space: { keys: {} }, ground: { keys: {} } },
        aliases: {},
      };

      const ok = storageService.saveProfile(profileId, profileData);
      expect(ok).toBe(true);

      const fetched = storageService.getProfile(profileId);
      expect(fetched).toBeTruthy();
      expect(fetched.name).toBe("Test Profile");
    });

    it("should delete profiles and update currentProfile", () => {
      const profileId = "delete_me";
      storageService.saveProfile(profileId, {
        name: "Delete Me",
        builds: { space: { keys: {} }, ground: { keys: {} } },
        aliases: {},
      });

      // Set the profile as current
      const data = storageService.getAllData();
      data.currentProfile = profileId;
      storageService.saveAllData(data);

      const ok = storageService.deleteProfile(profileId);
      expect(ok).toBe(true);

      const fetched = storageService.getProfile(profileId);
      expect(fetched).toBeNull();

      const updated = storageService.getAllData();
      expect(updated.currentProfile).not.toBe(profileId);
    });
  });

  describe("Settings operations", () => {
    it("loads standalone defaults through SettingsRepository without legacy delegates", () => {
      const settings = settingsRepository.load().value;
      expect(settings).toMatchObject({
        theme: "default",
        language: "en",
        autoSave: true,
      });
      expect(storageService.getSettings).toBeUndefined();
      expect(storageService.saveSettings).toBeUndefined();
      expect(storageService.clearSettings).toBeUndefined();
    });

    it("retains other settings when the Preferences owner changes one field", async () => {
      const owner = await startPreferencesOwner();
      const ok = await owner.setSetting("language", "es");
      expect(ok).toBe(true);

      const settings = settingsRepository.load().value;
      expect(settings.language).toBe("es");
      expect(settings.theme).toBe("default"); // Unchanged
    });

    it("replaces a complete authoritative settings snapshot through its owner", async () => {
      const owner = await startPreferencesOwner();
      await owner.setSettings({
        language: "de",
        "plugin:layout": "compact",
      });
      const replacement = {
        ...storageService.getDefaultSettings(),
        language: "fr",
      };
      eventBusFixture.clearEventHistory();

      const ok = await owner.setSettings(replacement);

      expect(ok).toBe(true);
      expect(JSON.parse(localStorage.getItem("sto_keybind_settings"))).toEqual(
        replacement,
      );
      expect(settingsRepository.load().value).not.toHaveProperty(
        "plugin:layout",
      );
    });

    it("clears only the standalone settings record", () => {
      settingsRepository.replace({
        ...storageService.getDefaultSettings(),
        theme: "dark",
      });
      storageService.createBackup("2026-07-26T00:00:00.000Z");
      const persistedRoot = localStorage.getItem(storageService.storageKey);
      const persistedBackup = localStorage.getItem(storageService.backupKey);

      expect(settingsRepository.clear().status).toBe("cleared");

      expect(localStorage.getItem("sto_keybind_settings")).toBeNull();
      expect(localStorage.getItem(storageService.storageKey)).toBe(
        persistedRoot,
      );
      expect(localStorage.getItem(storageService.backupKey)).toBe(
        persistedBackup,
      );
      expect(localStorage.getItem("sto_app_reset")).toBeNull();
    });

    it("returns indeterminate evidence when the standalone settings record cannot be cleared", () => {
      const failure = new Error("settings storage unavailable");
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const removeItem = vi
        .spyOn(localStorage, "removeItem")
        .mockImplementationOnce(() => {
          throw failure;
        });

      try {
        expect(settingsRepository.clear()).toEqual({
          status: "clear_failed",
          removal: {
            status: "indeterminate",
            error: "storage_write_failed",
            category: "unknown",
          },
        });
        expect(error).not.toHaveBeenCalled();
      } finally {
        removeItem.mockRestore();
        error.mockRestore();
      }
    });
  });

  describe("Error handling", () => {
    it("should return false when localStorage.setItem throws", async () => {
      const { createLocalStorageFixture } = await import(
        "../../fixtures/core/index.js"
      );
      const { destroy } = createLocalStorageFixture({ quotaError: true });

      const ok = storageService.saveAllData(storageService.getAllData());
      expect(ok).toBe(false);

      destroy();
    });
  });
});
