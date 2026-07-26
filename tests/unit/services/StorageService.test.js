import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServiceFixture } from "../../fixtures/index.js";
import StorageService from "../../../src/js/components/services/StorageService.js";
import { respond } from "../../../src/js/core/requestResponse.js";

describe("StorageService", () => {
  let fixture, storageService, eventBusFixture, mockEventBus;
  let detachPreferencesActivation;
  let detachPreferencesTransition;
  let runPreferencesTransition;

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
    detachPreferencesActivation = respond(
      mockEventBus,
      "preferences:activate-persisted-settings",
      () => {
        expect(storageService.clearSettings()).toBe(true);
        return {
          success: true,
          changed: true,
          revision: 2,
          effects: "applied",
        };
      },
    );
    runPreferencesTransition = vi.fn((source, operation) =>
      operation(
        () =>
          storageService.request(
            "preferences:activate-persisted-settings",
            { source },
            0,
          ),
        () => {},
      ),
    );
    detachPreferencesTransition = storageService.setPreferencesTransitionRunner(
      runPreferencesTransition,
    );
    // Trigger onInit via ComponentBase.init()
    storageService.init();
  });

  afterEach(() => {
    detachPreferencesTransition();
    detachPreferencesActivation();
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

    it("clears only the standalone settings record", () => {
      storageService.saveSettings({ theme: "dark" });
      storageService.createBackup("2026-07-26T00:00:00.000Z");
      const persistedRoot = localStorage.getItem(storageService.storageKey);
      const persistedBackup = localStorage.getItem(storageService.backupKey);

      expect(storageService.clearSettings()).toBe(true);

      expect(localStorage.getItem(storageService.settingsKey)).toBeNull();
      expect(localStorage.getItem(storageService.storageKey)).toBe(
        persistedRoot,
      );
      expect(localStorage.getItem(storageService.backupKey)).toBe(
        persistedBackup,
      );
      expect(localStorage.getItem("sto_app_reset")).toBeNull();
    });

    it("returns false when the standalone settings record cannot be cleared", () => {
      const failure = new Error("settings storage unavailable");
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const removeItem = vi
        .spyOn(localStorage, "removeItem")
        .mockImplementationOnce(() => {
          throw failure;
        });

      try {
        expect(storageService.clearSettings()).toBe(false);
        expect(error).toHaveBeenCalledWith("Error clearing settings:", failure);
      } finally {
        removeItem.mockRestore();
        error.mockRestore();
      }
    });
  });

  describe("Application reset", () => {
    it("clears persisted and cached state before publishing the canonical reset snapshot", async () => {
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
      expect(runPreferencesTransition).toHaveBeenCalledWith(
        "application-reset",
        expect.any(Function),
      );
      expect(eventBusFixture.getEventsOfType("toast:show")).toEqual([
        expect.objectContaining({
          data: {
            message: "application_reset_successfully",
            type: "success",
          },
        }),
      ]);
    });

    it.each([
      {
        label: "owner failure",
        reply: {
          success: false,
          error: "preferences_activation_failed",
          params: { reason: "effect application failed" },
          retryable: true,
        },
      },
      { label: "malformed owner reply", reply: { success: true } },
    ])(
      "retains the durable data reset and prior settings when coordination reports $label",
      async ({ reply }) => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(storageService, "request").mockResolvedValue(reply);
        storageService.saveSettings({ theme: "dark" });
        eventBusFixture.clearEventHistory();

        await expect(storageService.handleAppReset()).resolves.toBe(false);

        expect(localStorage.getItem(storageService.storageKey)).toBeNull();
        expect(
          JSON.parse(localStorage.getItem(storageService.settingsKey)),
        ).toMatchObject({ theme: "dark" });
        expect(localStorage.getItem("sto_app_reset")).toBe("true");
        expect(
          eventBusFixture.getEventsOfType("storage:data-reset"),
        ).toHaveLength(1);
        expect(eventBusFixture.getEventsOfType("toast:show")).toHaveLength(0);
      },
    );

    it("retains the durable reset when settings activation transport rejects", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(storageService, "request").mockRejectedValue(
        new Error("owner unavailable"),
      );
      eventBusFixture.clearEventHistory();

      await expect(storageService.handleAppReset()).resolves.toBe(false);

      expect(localStorage.getItem(storageService.storageKey)).toBeNull();
      expect(localStorage.getItem(storageService.settingsKey)).toBeNull();
      expect(localStorage.getItem("sto_app_reset")).toBe("true");
      expect(
        eventBusFixture.getEventsOfType("storage:data-reset"),
      ).toHaveLength(1);
      expect(eventBusFixture.getEventsOfType("toast:show")).toHaveLength(0);
    });

    it("returns false without publishing reset state when clearing is rejected", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(storageService, "clearAllData").mockReturnValue(false);
      const request = vi.spyOn(storageService, "request");
      eventBusFixture.clearEventHistory();

      await expect(storageService.handleAppReset()).resolves.toBe(false);

      expect(
        eventBusFixture.getEventsOfType("storage:data-reset"),
      ).toHaveLength(0);
      expect(request).not.toHaveBeenCalled();
      expect(eventBusFixture.getEventsOfType("toast:show")).toHaveLength(0);
    });

    it("returns false without publishing reset state when clearing throws", async () => {
      const failure = new Error("storage unavailable");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(storageService, "clearAllData").mockImplementation(() => {
        throw failure;
      });
      const request = vi.spyOn(storageService, "request");
      eventBusFixture.clearEventHistory();

      await expect(storageService.handleAppReset()).resolves.toBe(false);

      expect(errorSpy).toHaveBeenCalledWith(
        "[StorageService] Error during application reset:",
        failure,
      );
      expect(
        eventBusFixture.getEventsOfType("storage:data-reset"),
      ).toHaveLength(0);
      expect(request).not.toHaveBeenCalled();
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
