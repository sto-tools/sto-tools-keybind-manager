import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServiceFixture } from "../../fixtures/index.js";
import StorageService from "../../../src/js/components/services/StorageService.js";

describe("StorageService", () => {
  let fixture, storageService, eventBusFixture, mockEventBus;
  let originalStoUI;

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
    originalStoUI = window.stoUI;
    // Trigger onInit via ComponentBase.init()
    storageService.init();
  });

  afterEach(() => {
    if (originalStoUI === undefined) delete window.stoUI;
    else window.stoUI = originalStoUI;
    vi.clearAllMocks();
    localStorage.clear();
    fixture.destroy();
  });

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
    it("should return default settings", () => {
      const settings = storageService.getSettings();
      expect(settings).toMatchObject({
        theme: "default",
        language: "en",
        autoSave: true,
      });
    });

    it("should save settings and merge with existing", () => {
      const ok = storageService.saveSettings({ language: "es" });
      expect(ok).toBe(true);

      const settings = storageService.getSettings();
      expect(settings.language).toBe("es");
      expect(settings.theme).toBe("default"); // Unchanged
    });

    it("should replace a complete authoritative settings snapshot", () => {
      storageService.saveSettings({
        language: "de",
        "plugin:layout": "compact",
      });
      const replacement = {
        ...storageService.getDefaultSettings(),
        language: "fr",
      };
      eventBusFixture.clearEventHistory();

      const ok = storageService.saveSettings(replacement, { replace: true });

      expect(ok).toBe(true);
      expect(JSON.parse(localStorage.getItem("sto_keybind_settings"))).toEqual(
        replacement,
      );
      expect(storageService.getSettings()).not.toHaveProperty("plugin:layout");
    });
  });

  describe("Application reset", () => {
    it("clears persisted and cached state before publishing the canonical reset snapshot", async () => {
      const showToast = vi.fn();
      window.stoUI = { showToast };
      storageService.saveAllData({
        ...storageService.getAllData(),
        currentProfile: "captain",
        profiles: {
          captain: {
            id: "captain",
            name: "Captain",
            builds: { space: { keys: {} }, ground: { keys: {} } },
            aliases: {},
          },
        },
      });
      storageService.saveSettings({ theme: "dark" });
      expect(storageService.getAllData().currentProfile).toBe("captain");
      eventBusFixture.clearEventHistory();

      const result = await storageService.handleAppReset();

      expect(result).toBe(true);
      expect(localStorage.getItem(storageService.storageKey)).toBeNull();
      expect(localStorage.getItem(storageService.backupKey)).toBeNull();
      expect(localStorage.getItem(storageService.settingsKey)).toBeNull();
      expect(localStorage.getItem("sto_app_reset")).toBe("true");
      const [reset] = eventBusFixture.getEventsOfType("storage:data-reset");
      expect(storageService.data).toEqual(reset.data.data);
      expect(storageService.getAllData()).toBe(reset.data.data);
      expect(reset.data.data).toMatchObject({
        version: "test-1.0.0",
        currentProfile: null,
        profiles: {},
        globalAliases: {},
        settings: storageService.getDefaultSettings(),
      });
      expect(reset.data.data.created).toEqual(expect.any(String));
      expect(reset.data.data.lastModified).toEqual(expect.any(String));
      expect(showToast).toHaveBeenCalledWith(
        "application_reset_successfully",
        "success",
      );
    });

    it("returns false without publishing reset state when clearing is rejected", async () => {
      const showToast = vi.fn();
      window.stoUI = { showToast };
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(storageService, "clearAllData").mockReturnValue(false);
      eventBusFixture.clearEventHistory();

      await expect(storageService.handleAppReset()).resolves.toBe(false);

      expect(
        eventBusFixture.getEventsOfType("storage:data-reset"),
      ).toHaveLength(0);
      expect(showToast).not.toHaveBeenCalled();
    });

    it("returns false without publishing reset state when clearing throws", async () => {
      const failure = new Error("storage unavailable");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(storageService, "clearAllData").mockImplementation(() => {
        throw failure;
      });
      eventBusFixture.clearEventHistory();

      await expect(storageService.handleAppReset()).resolves.toBe(false);

      expect(errorSpy).toHaveBeenCalledWith(
        "[StorageService] Error during application reset:",
        failure,
      );
      expect(
        eventBusFixture.getEventsOfType("storage:data-reset"),
      ).toHaveLength(0);
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
