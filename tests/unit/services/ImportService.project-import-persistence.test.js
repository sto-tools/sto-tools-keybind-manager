import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportService from "../../../src/js/components/services/ImportService.js";
import { createImportServiceFixture } from "../../fixtures/index.js";

describe("ImportService project import persistence progress", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createImportServiceFixture();
    service = new ImportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
    });
    service.init();
  });

  afterEach(() => {
    service.destroy();
    fixture.destroy();
  });

  it("reports no partial progress when the first profile write is rejected", async () => {
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
      const markAppModified = vi.spyOn(service, "markAppModified");

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
      expect(markAppModified).not.toHaveBeenCalled();
    },
  );

  it("reports no partial progress when a settings-only write is rejected", async () => {
    fixture.storage.saveSettings.mockReturnValueOnce(false);
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
        fixture.storage.saveSettings.mockImplementationOnce(() => {
          throw new Error("settings write failed");
        });
      } else {
        fixture.storage.saveSettings.mockReturnValueOnce(false);
      }
      const markAppModified = vi.spyOn(service, "markAppModified");

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
      expect(markAppModified).not.toHaveBeenCalled();
    },
  );

  it("reports no partial progress when the only project write is rejected", async () => {
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
      const markAppModified = vi.spyOn(service, "markAppModified");

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
      expect(fixture.storage.getSettings()).toMatchObject({ theme: "light" });
      expect(markAppModified).not.toHaveBeenCalled();
    },
  );

  it("marks the application modified only after the complete import succeeds", async () => {
    const markAppModified = vi.spyOn(service, "markAppModified");

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

    expect(result.success).toBe(true);
    expect(markAppModified).toHaveBeenCalledTimes(1);
  });
});
