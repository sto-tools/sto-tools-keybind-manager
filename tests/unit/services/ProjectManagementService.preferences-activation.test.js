import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ImportService from "../../../src/js/components/services/ImportService.js";
import ProjectManagementService from "../../../src/js/components/services/ProjectManagementService.js";
import { createServiceFixture } from "../../fixtures/index.js";
import { createProjectImportOwnerAction } from "../../fixtures/services/importProjectOwner.js";

const projectText = (settings = true) =>
  JSON.stringify({
    type: "project",
    data: {
      profiles: {
        "profile-42": { name: "Profile 42" },
        secondary: { name: "Secondary" },
      },
      currentProfile: "profile-42",
      ...(settings ? { settings: { theme: "light" } } : {}),
    },
  });

describe("ProjectManagementService Preferences activation", () => {
  let fixture;
  let importer;
  let service;
  let replaceProjectFromImport;
  let activatePersistedSettings;
  let persistImportedSettings;
  let runPreferencesTransition;

  beforeEach(() => {
    fixture = createServiceFixture();
    replaceProjectFromImport = createProjectImportOwnerAction(fixture);
    activatePersistedSettings = vi.fn(async () => ({
      success: true,
      changed: true,
      revision: 2,
      effects: "applied",
    }));
    persistImportedSettings = vi.fn(async (settings) => ({
      status: "committed",
      value: structuredClone(settings),
      write: { status: "acknowledged" },
      verification: { status: "verified" },
    }));
    runPreferencesTransition = vi.fn((_source, operation) =>
      operation(activatePersistedSettings, () => {}, persistImportedSettings),
    );
    importer = new ImportService({
      eventBus: fixture.eventBus,
      replaceProjectFromImport,
    });
    service = new ProjectManagementService({
      eventBus: fixture.eventBus,
      i18n: {
        t: (key, params = {}) =>
          key === "failed_to_load_profile_data"
            ? "Failed to load profile data"
            : key === "import_failed"
              ? `Import failed: ${params.error}`
              : key,
      },
      runPreferencesTransition,
      importProjectWithinPreferencesTransition:
        importer.importProjectWithinPreferencesTransition.bind(importer),
    });
    service.init();
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    importer.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it.each([
    [
      "acknowledged failure",
      {
        success: false,
        error: "preferences_activation_failed",
        params: { reason: "settings activation unavailable" },
        retryable: true,
      },
      "settings activation unavailable",
    ],
    ["malformed reply", { success: true }, "Failed to load profile data"],
    [
      "transport failure",
      new Error("preferences responder unavailable"),
      "preferences responder unavailable",
    ],
  ])(
    "retains only Preferences activation after the owner action for the %s case",
    async (_label, preferencesReply, reason) => {
      activatePersistedSettings.mockImplementationOnce(async () => {
        if (preferencesReply instanceof Error) throw preferencesReply;
        return preferencesReply;
      });
      const request = vi.spyOn(service, "request");

      await expect(
        service.restoreFromProjectContent(projectText(), "backup.json"),
      ).resolves.toEqual({
        success: false,
        error: "project_restore_reload_failed",
        params: { reason },
        durable: true,
        currentProfile: "profile-42",
        imported: { profiles: 2, settings: true },
        activation: { data: "complete", preferences: "pending" },
      });
      expect(runPreferencesTransition).toHaveBeenCalledOnce();
      expect(persistImportedSettings).toHaveBeenCalledOnce();
      expect(replaceProjectFromImport).toHaveBeenCalledOnce();
      expect(fixture.projectRepository.commit).toHaveBeenCalledOnce();
      expect(activatePersistedSettings).toHaveBeenCalledOnce();
      expect(request).not.toHaveBeenCalled();
    },
  );

  it("does not acquire or request Preferences activation when settings were not imported", async () => {
    const request = vi.spyOn(service, "request");

    await expect(
      service.restoreFromProjectContent(projectText(false), "backup.json"),
    ).resolves.toEqual({
      success: true,
      currentProfile: "profile-42",
      imported: { profiles: 2, settings: false },
    });
    expect(runPreferencesTransition).not.toHaveBeenCalled();
    expect(persistImportedSettings).not.toHaveBeenCalled();
    expect(activatePersistedSettings).not.toHaveBeenCalled();
    expect(replaceProjectFromImport).toHaveBeenCalledOnce();
    expect(fixture.projectRepository.commit).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });
});
