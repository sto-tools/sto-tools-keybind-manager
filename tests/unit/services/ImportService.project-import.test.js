import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../src/i18n/en.json";
import ImportService from "../../../src/js/components/services/ImportService.js";
import { respond } from "../../../src/js/core/requestResponse.js";
import { createImportServiceFixture } from "../../fixtures/index.js";

describe("ImportService project import", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createImportServiceFixture();
    service = new ImportService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
    });
    service.init();

    respond(
      fixture.eventBus,
      "parser:parse-command-string",
      ({ commandString }) => ({ commands: [{ command: commandString }] }),
    );
  });

  afterEach(() => {
    service.destroy();
    fixture.destroy();
  });

  describe("importProjectFile", () => {
    it("should accept valid project files with correct type and data", async () => {
      const validProjectContent = JSON.stringify({
        type: "project",
        data: {
          profiles: {},
          settings: {},
        },
      });

      const result = await service.importProjectFile(validProjectContent);
      expect(result.success).toBe(true);
    });

    it("should reject project files with incorrect type", async () => {
      const invalidProjectContent = JSON.stringify({
        type: "other",
        data: {
          profiles: {},
          settings: {},
        },
      });

      const result = await service.importProjectFile(invalidProjectContent);
      expect(result.success).toBe(false);
      expect(result.error).toBe("invalid_project_file");
    });

    it("should reject project files with missing data property", async () => {
      const noDataProjectContent = JSON.stringify({
        type: "project",
        // missing data property
      });

      const result = await service.importProjectFile(noDataProjectContent);
      expect(result.success).toBe(false);
      expect(result.error).toBe("invalid_project_file");
    });

    it("should reject project files with null data property", async () => {
      const nullDataProjectContent = JSON.stringify({
        type: "project",
        data: null,
      });

      const result = await service.importProjectFile(nullDataProjectContent);
      expect(result.success).toBe(false);
      expect(result.error).toBe("invalid_project_file");
    });

    it("should reject project files with undefined data property", async () => {
      const undefinedDataProjectContent = JSON.stringify({
        type: "project",
        data: undefined,
      });

      const result = await service.importProjectFile(
        undefinedDataProjectContent,
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe("invalid_project_file");
    });

    it("should accept project files with empty data object", async () => {
      const emptyDataProjectContent = JSON.stringify({
        type: "project",
        data: {},
      });

      // Empty object should still be accepted as it has truthy value
      const result = await service.importProjectFile(emptyDataProjectContent);
      expect(result.success).toBe(true);
    });

    it.each([
      ["null options", null, "$.options"],
      [
        "a non-boolean importSettings option",
        { importSettings: "yes" },
        "$.options.importSettings",
      ],
    ])("rejects %s before any persistence", async (_label, options, path) => {
      const markAppModified = vi.spyOn(service, "markAppModified");
      const result = await service.importProjectFile(
        JSON.stringify({
          type: "project",
          data: {
            profiles: { candidate: { name: "Candidate" } },
            settings: { theme: "light" },
          },
        }),
        options,
      );

      expect(result).toEqual({
        success: false,
        error: "invalid_project_options",
        params: { path },
      });
      expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
      expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
      expect(fixture.storage.saveAllData).not.toHaveBeenCalled();
      expect(markAppModified).not.toHaveBeenCalled();
    });

    it("publishes the project-options failure translation key in English", () => {
      expect(en.invalid_project_options).toBe("Invalid project import options");
    });

    it("treats an own undefined importSettings option like omission", async () => {
      const result = await service.importProjectFile(
        JSON.stringify({
          type: "project",
          data: { settings: { theme: "light" } },
        }),
        { importSettings: undefined },
      );

      expect(result).toMatchObject({
        success: true,
        imported: { profiles: 0, settings: true },
      });
      expect(fixture.storage.getSettings()).toMatchObject({ theme: "light" });
    });

    it("should reject malformed JSON content", async () => {
      const malformedContent = '{ "type": "project", "data": {} '; // missing closing brace

      const result = await service.importProjectFile(malformedContent);
      expect(result.success).toBe(false);
      expect(result.error).toBe("import_failed_invalid_json");
    });

    it("should handle case-sensitive type checking correctly", async () => {
      const wrongCaseContent = JSON.stringify({
        type: "Project", // capitalized instead of lowercase
        data: {
          profiles: {},
          settings: {},
        },
      });

      const result = await service.importProjectFile(wrongCaseContent);
      expect(result.success).toBe(false);
      expect(result.error).toBe("invalid_project_file");
    });

    it("should import project files with actual profile data", async () => {
      const projectWithProfileContent = JSON.stringify({
        type: "project",
        data: {
          profiles: {
            "test-profile": {
              name: "Test Profile",
              builds: {
                space: { keys: { k: ["cmd1"] } },
                ground: { keys: {} },
              },
            },
          },
          settings: {
            currentProfile: "test-profile",
          },
        },
      });

      const result = await service.importProjectFile(projectWithProfileContent);
      expect(result.success).toBe(true);
      expect(result.imported.profiles).toBe(1);
      expect(result.currentProfile).toBe("test-profile");
    });

    it("should sanitize imported profile data correctly", async () => {
      // Test with legacy profile format (keys instead of builds)
      const legacyProfileContent = JSON.stringify({
        type: "project",
        data: {
          profiles: {
            "legacy-profile": {
              name: "Legacy Profile",
              // Legacy format - keys at root level instead of builds
              keys: { k: ["legacy_cmd"] },
              aliases: { test_alias: ["test_command"] },
            },
          },
          settings: {},
        },
      });

      const result = await service.importProjectFile(legacyProfileContent);
      expect(result.success).toBe(true);
      expect(result.imported.profiles).toBe(1);

      // Verify the profile was sanitized to new format
      const savedProfile = fixture.storage.getProfile("legacy-profile");
      expect(savedProfile).toBeDefined();
      expect(savedProfile.builds).toBeDefined();
      expect(savedProfile.builds.space.keys).toEqual({ k: ["legacy_cmd"] });
      expect(savedProfile.aliases).toEqual({
        test_alias: { commands: ["test_command"] },
      });
    });

    it("should return currentProfile from imported settings", async () => {
      const projectWithCurrentProfile = JSON.stringify({
        type: "project",
        data: {
          profiles: {
            "test-profile": {
              name: "Test Profile",
              builds: { space: { keys: {} }, ground: { keys: {} } },
            },
          },
          settings: {
            currentProfile: "test-profile",
          },
        },
      });

      const result = await service.importProjectFile(projectWithCurrentProfile);
      expect(result.success).toBe(true);
      expect(result.currentProfile).toBe("test-profile");
    });

    it("should restore top-level currentProfile into project storage", async () => {
      const projectContent = JSON.stringify({
        type: "project",
        data: {
          profiles: {
            "active-profile": {
              name: "Active Profile",
              builds: { space: { keys: {} }, ground: { keys: {} } },
            },
          },
          settings: {},
          currentProfile: "active-profile",
        },
      });

      const result = await service.importProjectFile(projectContent);

      expect(result).toMatchObject({
        success: true,
        currentProfile: "active-profile",
      });
      expect(fixture.storage.getAllData().currentProfile).toBe(
        "active-profile",
      );
    });

    it("prefers the canonical top-level current profile over the legacy setting", async () => {
      const result = await service.importProjectFile(
        JSON.stringify({
          type: "project",
          data: {
            profiles: {
              canonical: { name: "Canonical" },
              legacy: { name: "Legacy" },
            },
            settings: { currentProfile: "legacy" },
            currentProfile: "canonical",
          },
        }),
      );

      expect(result).toMatchObject({
        success: true,
        currentProfile: "canonical",
      });
      expect(fixture.storage.getAllData().currentProfile).toBe("canonical");
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
      [
        "legacy settings behind a valid canonical selection",
        {
          profiles: { canonical: { name: "Canonical" } },
          currentProfile: "canonical",
          settings: { currentProfile: "missing" },
        },
        "$.data.settings.currentProfile",
      ],
    ])(
      "rejects a dangling %s current profile before any persistence",
      async (_label, data, path) => {
        const markAppModified = vi.spyOn(service, "markAppModified");
        const result = await service.importProjectFile(
          JSON.stringify({ type: "project", data }),
        );

        expect(result).toEqual({
          success: false,
          error: "invalid_project_file",
          params: { path },
        });
        expect(fixture.storage.saveProfile).not.toHaveBeenCalled();
        expect(fixture.storage.saveSettings).not.toHaveBeenCalled();
        expect(fixture.storage.saveAllData).not.toHaveBeenCalled();
        expect(markAppModified).not.toHaveBeenCalled();
      },
    );

    it("accepts a canonical current profile already present in the destination", async () => {
      const result = await service.importProjectFile(
        JSON.stringify({
          type: "project",
          data: { currentProfile: "default_space" },
        }),
      );

      expect(result).toMatchObject({
        success: true,
        currentProfile: "default_space",
      });
      expect(fixture.storage.getAllData().currentProfile).toBe("default_space");
    });

    it("preserves destination version and first-run settings during overlay", async () => {
      fixture.storage.saveSettings({
        theme: "dark",
        version: "destination-version",
        firstRun: false,
      });

      const result = await service.importProjectFile(
        JSON.stringify({
          type: "project",
          data: {
            settings: {
              theme: "light",
              version: "imported-version",
              firstRun: true,
              "plugin:layout": { density: "compact" },
            },
          },
        }),
      );

      expect(result).toMatchObject({
        success: true,
        imported: { profiles: 0, settings: true },
      });
      expect(fixture.storage.getSettings()).toMatchObject({
        theme: "light",
        version: "destination-version",
        firstRun: false,
        "plugin:layout": { density: "compact" },
      });
    });
  });
});
