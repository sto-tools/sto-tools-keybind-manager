import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createImportPreferencesOwner } from "../../fixtures/services/projectRestore.js";
import ImportService from "../../../src/js/components/services/ImportService.js";
import { createImportServiceFixture } from "../../fixtures/index.js";

describe("ImportService project import persistence progress", () => {
  let fixture;
  let service;
  let preferences;

  beforeEach(async () => {
    fixture = createImportServiceFixture();
    preferences = await createImportPreferencesOwner(fixture);
    service = new ImportService({
      runPreferencesTransition: (source, operation) =>
        preferences.runExternalActivationTransition(source, operation),
      eventBus: fixture.eventBus,
      storage: fixture.storage,
    });
    service.init();
  });

  afterEach(() => {
    service.destroy();
    preferences.destroy();
    fixture.destroy();
  });

  it("reports no acknowledged stage progress when the first profile write is rejected", async () => {
    fixture.storage.saveProfile.mockReturnValueOnce(false);
    const result = await service.importProjectFile(
      JSON.stringify({
        type: "project",
        data: {
          profiles: {
            rejected: {
              name: "Rejected",
              builds: { space: { keys: {} }, ground: { keys: {} } },
            },
          },
        },
      }),
    );

    expect(result).toEqual({
      success: false,
      error: "storage_write_failed",
      params: { operation: "profile", profileId: "rejected" },
      partial: false,
      committed: { profiles: [], settings: false, project: false },
    });
    expect(fixture.storage.saveAllData).not.toHaveBeenCalled();
  });

  it.each(["false", "throw"])(
    "retains and reports an earlier sequential profile commit when a later profile write returns %s",
    async (failureMode) => {
      const saveProfile = fixture.storage.saveProfile.getMockImplementation();
      let profileWrites = 0;
      fixture.storage.saveProfile.mockImplementation((profileId, profile) => {
        profileWrites += 1;
        if (profileWrites === 2) {
          if (failureMode === "throw") {
            throw new Error("second profile write failed");
          }
          return false;
        }
        return saveProfile(profileId, profile);
      });
      const result = await service.importProjectFile(
        JSON.stringify({
          type: "project",
          data: {
            profiles: {
              first: { name: "First" },
              second: { name: "Second" },
              third: { name: "Third" },
            },
          },
        }),
      );

      expect(result).toEqual({
        success: false,
        error: "storage_write_failed",
        params: { operation: "profile", profileId: "second" },
        partial: true,
        committed: {
          profiles: ["first"],
          settings: false,
          project: false,
        },
      });
      expect(fixture.storage.getProfile("first")).toMatchObject({
        name: "First",
      });
      expect(fixture.storage.getProfile("second")).toBeNull();
      expect(fixture.storage.getProfile("third")).toBeNull();
    },
  );

  it("reports no acknowledged stage progress when a settings-only write is rejected", async () => {
    fixture.settingsRepository.replace.mockReturnValueOnce({
      status: "rejected",
      error: "invalid_data",
      write: { status: "not_attempted" },
      verification: { status: "not_attempted" },
    });
    const result = await service.importProjectFile(
      JSON.stringify({
        type: "project",
        data: { profiles: {}, settings: { theme: "default" } },
      }),
    );

    expect(result).toEqual({
      success: false,
      error: "storage_write_failed",
      params: { operation: "settings" },
      partial: false,
      committed: { profiles: [], settings: false, project: false },
    });
  });

  it.each(["false", "throw"])(
    "reports profile progress when the following settings write returns %s",
    async (failureMode) => {
      if (failureMode === "throw") {
        fixture.settingsRepository.replace.mockImplementationOnce(() => {
          throw new Error("settings write failed");
        });
      } else {
        fixture.settingsRepository.replace.mockReturnValueOnce({
          status: "rejected",
          error: "invalid_data",
          write: { status: "not_attempted" },
          verification: { status: "not_attempted" },
        });
      }
      const result = await service.importProjectFile(
        JSON.stringify({
          type: "project",
          data: {
            profiles: { first: { name: "First" } },
            settings: { theme: "light" },
          },
        }),
      );

      expect(result).toEqual({
        success: false,
        error: "storage_write_failed",
        params: { operation: "settings" },
        partial: true,
        committed: {
          profiles: ["first"],
          settings: false,
          project: false,
        },
      });
      expect(fixture.storage.getProfile("first")).toMatchObject({
        name: "First",
      });
    },
  );

  it("reports no acknowledged stage progress when the only project write is rejected", async () => {
    fixture.storage.saveAllData.mockReturnValueOnce(false);
    const result = await service.importProjectFile(
      JSON.stringify({
        type: "project",
        data: { profiles: {}, currentProfile: null },
      }),
    );

    expect(result).toEqual({
      success: false,
      error: "storage_write_failed",
      params: { operation: "project" },
      partial: false,
      committed: { profiles: [], settings: false, project: false },
    });
  });

  it.each(["false", "throw"])(
    "reports profile and settings progress when the final project write returns %s",
    async (failureMode) => {
      const saveAllData = fixture.storage.saveAllData.getMockImplementation();
      let projectWrites = 0;
      fixture.storage.saveAllData.mockImplementation((data) => {
        projectWrites += 1;
        if (projectWrites === 2) {
          if (failureMode === "throw") {
            throw new Error("final project write failed");
          }
          return false;
        }
        return saveAllData(data);
      });
      const result = await service.importProjectFile(
        JSON.stringify({
          type: "project",
          data: {
            profiles: { first: { name: "First" } },
            settings: { theme: "light" },
          },
        }),
      );

      expect(result).toEqual({
        success: false,
        error: "storage_write_failed",
        params: { operation: "project" },
        partial: true,
        committed: {
          profiles: ["first"],
          settings: true,
          project: false,
        },
      });
      expect(fixture.storage.getProfile("first")).toMatchObject({
        name: "First",
      });
      expect(fixture.settingsRepository.load().value).toMatchObject({
        theme: "light",
      });
    },
  );

  it("reports success only after the complete import is durable", async () => {
    const result = await service.importProjectFile(
      JSON.stringify({
        type: "project",
        data: {
          profiles: { complete: { name: "Complete" } },
          settings: { theme: "light" },
          currentProfile: "complete",
        },
      }),
    );

    expect(result).toMatchObject({
      success: true,
      imported: { profiles: 1, settings: true },
      currentProfile: "complete",
    });
    expect(fixture.storage.getProfile("complete")).toMatchObject({
      name: "Complete",
    });
    expect(fixture.settingsRepository.load().value).toMatchObject({
      theme: "light",
    });
    expect(fixture.storage.getAllData().currentProfile).toBe("complete");
    expect(preferences.getCurrentState().settings.theme).toBe("light");
    expect(fixture.settingsRepository.replace).toHaveBeenCalledOnce();
  });

  it("keeps the live owner unchanged when an acknowledged settings write fails readback verification", async () => {
    const before = preferences.getCurrentState();
    const browserStorage = fixture.storageFixture.localStorage;
    const getItem = browserStorage.getItem.getMockImplementation();
    browserStorage.getItem.mockImplementation((key) =>
      key === "sto_keybind_settings" ? null : getItem(key),
    );
    const result = await service.importProjectFile(
      JSON.stringify({
        type: "project",
        data: { settings: { theme: "light" } },
      }),
    );
    browserStorage.getItem.mockImplementation(getItem);

    expect(result).toEqual({
      success: false,
      error: "storage_write_failed",
      params: { operation: "settings" },
      partial: false,
      committed: { profiles: [], settings: false, project: false },
    });
    expect(
      JSON.parse(browserStorage.getItem("sto_keybind_settings")).theme,
    ).toBe("light");
    expect(
      fixture.settingsRepository.replace.mock.results[0].value,
    ).toMatchObject({
      status: "verification_failed",
      write: { status: "acknowledged" },
    });
    expect(preferences.getCurrentState()).toBe(before);
    expect(fixture.storage.saveAllData).not.toHaveBeenCalled();
  });

  it.each(["failure", "throw", "malformed"])(
    "reports standalone durable import honestly after activation %s without replay",
    async (mode) => {
      const originalRunner = service.runPreferencesTransition;
      const activate = vi.fn(async () => {
        if (mode === "throw") throw new Error("activation unavailable");
        if (mode === "malformed") return { success: true };
        return {
          success: false,
          error: "preferences_activation_failed",
          params: { reason: "activation unavailable" },
          retryable: true,
        };
      });
      service.runPreferencesTransition = (source, operation) =>
        originalRunner(source, (_activate, assertActive, persist) =>
          operation(activate, assertActive, persist),
        );
      const before = preferences.getCurrentState();
      const result = await service.importProjectFile(
        JSON.stringify({
          type: "project",
          data: {
            profiles: { imported: { name: "Imported" } },
            settings: { theme: "light" },
            currentProfile: "imported",
          },
        }),
      );

      expect(result).toEqual({
        success: false,
        error: "preferences_activation_failed",
        durable: true,
        imported: { profiles: 1, settings: true },
        currentProfile: "imported",
        params: {
          reason:
            mode === "malformed"
              ? "invalid_preferences_activation_result"
              : "activation unavailable",
        },
      });
      expect(fixture.settingsRepository.replace).toHaveBeenCalledOnce();
      expect(fixture.storage.saveProfile).toHaveBeenCalledOnce();
      expect(preferences.getCurrentState()).toBe(before);
      expect(fixture.settingsRepository.load().value.theme).toBe("light");
      expect(activate).toHaveBeenCalledOnce();
    },
  );

  it("rejects settings imports before writes without a transition runner while allowing non-settings imports", async () => {
    service.runPreferencesTransition = null;
    const result = await service.importProjectFile(
      JSON.stringify({
        type: "project",
        data: {
          profiles: { imported: { name: "Imported" } },
          settings: { theme: "light" },
        },
      }),
    );
    expect(result).toMatchObject({
      success: false,
      error: "storage_write_failed",
      partial: false,
      committed: { profiles: [], settings: false, project: false },
    });
    expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
    expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();
    await expect(
      service.importProjectFile(
        JSON.stringify({
          type: "project",
          data: { profiles: { imported: { name: "Imported" } } },
        }),
      ),
    ).resolves.toMatchObject({
      success: true,
      imported: { profiles: 1, settings: false },
    });
  });
});
