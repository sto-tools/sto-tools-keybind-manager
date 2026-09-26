import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createImportPreferencesOwner } from "../../fixtures/services/projectRestore.js";
import { createProjectImportOwnerAction } from "../../fixtures/services/importProjectOwner.js";
import ImportService from "../../../src/js/components/services/ImportService.js";
import { createImportServiceFixture } from "../../fixtures/index.js";

describe("ImportService complete-root project import persistence", () => {
  let fixture;
  let service;
  let preferences;
  let replaceProjectFromImport;

  beforeEach(async () => {
    fixture = createImportServiceFixture();
    preferences = await createImportPreferencesOwner(fixture);
    replaceProjectFromImport = createProjectImportOwnerAction(fixture);
    service = new ImportService({
      runPreferencesTransition: (source, operation) =>
        preferences.runExternalActivationTransition(source, operation),
      eventBus: fixture.eventBus,
      replaceProjectFromImport,
    });
    service.init();
  });

  afterEach(() => {
    service.destroy();
    preferences.destroy();
    fixture.destroy();
  });

  it.each(["false", "throw"])(
    "reports no profile progress when the single complete-root action returns %s",
    async (failureMode) => {
      if (failureMode === "throw") {
        fixture.storage.saveAllData.mockImplementationOnce(() => {
          throw new Error("complete root write failed");
        });
      } else {
        fixture.storage.saveAllData.mockReturnValueOnce(false);
      }

      const result = await service.importProjectFile(
        JSON.stringify({
          type: "project",
          data: {
            profiles: {
              first: { name: "First" },
              second: { name: "Second" },
            },
            currentProfile: "first",
          },
        }),
      );

      expect(result).toEqual({
        success: false,
        error: "storage_write_failed",
        params: { operation: "project" },
        partial: false,
        committed: { profiles: [], settings: false, project: false },
      });
      expect(replaceProjectFromImport).toHaveBeenCalledOnce();
      expect(fixture.storage.saveAllData).toHaveBeenCalledOnce();
      expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
      expect(fixture.storage.getProfile("first")).toBeNull();
      expect(fixture.storage.getProfile("second")).toBeNull();
    },
  );

  it("reports no acknowledged progress when the Preferences-owned settings stage is rejected", async () => {
    fixture.settingsRepository.replace.mockReturnValueOnce({
      status: "rejected",
      error: "invalid_data",
      write: { status: "not_attempted" },
      verification: { status: "not_attempted" },
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
      params: { operation: "settings" },
      partial: false,
      committed: { profiles: [], settings: false, project: false },
    });
    expect(replaceProjectFromImport).toHaveBeenCalledOnce();
    expect(fixture.storage.saveAllData).not.toHaveBeenCalled();
    expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
  });

  it.each(["false", "throw"])(
    "reports only the acknowledged settings stage when the complete-root write returns %s",
    async (failureMode) => {
      if (failureMode === "throw") {
        fixture.storage.saveAllData.mockImplementationOnce(() => {
          throw new Error("complete root write failed");
        });
      } else {
        fixture.storage.saveAllData.mockReturnValueOnce(false);
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
        params: { operation: "project" },
        partial: true,
        committed: { profiles: [], settings: true, project: false },
      });
      expect(replaceProjectFromImport).toHaveBeenCalledOnce();
      expect(fixture.settingsRepository.load().value).toMatchObject({
        theme: "light",
      });
      expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
      expect(fixture.storage.getProfile("first")).toBeNull();
    },
  );

  it("maps a rejected owner action onto the frozen complete-root failure arm", async () => {
    replaceProjectFromImport.mockRejectedValueOnce(
      new Error("owner action unavailable"),
    );

    await expect(
      service.importProjectFile(
        JSON.stringify({
          type: "project",
          data: { profiles: { candidate: { name: "Candidate" } } },
        }),
      ),
    ).resolves.toEqual({
      success: false,
      error: "storage_write_failed",
      params: { operation: "project" },
      partial: false,
      committed: { profiles: [], settings: false, project: false },
    });
    expect(replaceProjectFromImport).toHaveBeenCalledOnce();
    expect(fixture.storage.saveAllData).not.toHaveBeenCalled();
    expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
  });

  it("reports success only after the owner acknowledges one durable complete root", async () => {
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

    expect(result).toEqual({
      success: true,
      message: "project_imported_successfully",
      imported: { profiles: 1, settings: true },
      currentProfile: "complete",
    });
    expect(replaceProjectFromImport).toHaveBeenCalledWith(
      expect.objectContaining({ currentProfile: "complete" }),
      { persistImportedSettings: expect.any(Function) },
    );
    expect(fixture.storage.saveAllData).toHaveBeenCalledOnce();
    expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
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

  it("keeps both live owners unchanged when an acknowledged settings write fails verification", async () => {
    const before = preferences.getCurrentState();
    const browserStorage = fixture.storageFixture.localStorage;
    const getItem = browserStorage.getItem.getMockImplementation();
    browserStorage.getItem.mockImplementation((key) =>
      key === "sto_keybind_settings" ? null : getItem(key),
    );

    const result = await service.importProjectFile(
      JSON.stringify({
        type: "project",
        data: {
          profiles: { candidate: { name: "Candidate" } },
          settings: { theme: "light" },
        },
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
      fixture.settingsRepository.replace.mock.results[0].value,
    ).toMatchObject({
      status: "verification_failed",
      write: { status: "acknowledged" },
    });
    expect(preferences.getCurrentState()).toBe(before);
    expect(fixture.storage.saveAllData).not.toHaveBeenCalled();
    expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
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
      expect(replaceProjectFromImport).toHaveBeenCalledOnce();
      expect(fixture.storage.saveAllData).toHaveBeenCalledOnce();
      expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
      expect(fixture.settingsRepository.replace).toHaveBeenCalledOnce();
      expect(preferences.getCurrentState()).toBe(before);
      expect(fixture.settingsRepository.load().value.theme).toBe("light");
      expect(activate).toHaveBeenCalledOnce();
    },
  );

  it("requires the Preferences transition only for settings imports", async () => {
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

    expect(result).toEqual({
      success: false,
      error: "storage_write_failed",
      params: { operation: "settings" },
      partial: false,
      committed: { profiles: [], settings: false, project: false },
    });
    expect(replaceProjectFromImport).not.toHaveBeenCalled();
    expect(fixture.storage.saveAllData).not.toHaveBeenCalled();
    expect(fixture.settingsRepository.replace).not.toHaveBeenCalled();

    await expect(
      service.importProjectFile(
        JSON.stringify({
          type: "project",
          data: {
            profiles: { imported: { name: "Imported" } },
            currentProfile: "imported",
          },
        }),
      ),
    ).resolves.toEqual({
      success: true,
      message: "project_imported_successfully",
      imported: { profiles: 1, settings: false },
      currentProfile: "imported",
    });
    expect(replaceProjectFromImport).toHaveBeenCalledOnce();
    expect(fixture.storage.saveAllData).toHaveBeenCalledOnce();
  });
});
