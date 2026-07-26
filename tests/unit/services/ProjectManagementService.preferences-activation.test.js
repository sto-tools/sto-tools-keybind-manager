import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProjectManagementService from "../../../src/js/components/services/ProjectManagementService.js";
import { createServiceFixture } from "../../fixtures/index.js";
import { createRequestBackedPreferencesTransition } from "../../fixtures/services/projectRestore.js";

describe("ProjectManagementService Preferences activation", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createServiceFixture();
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
      runPreferencesTransition: createRequestBackedPreferencesTransition(
        () => service,
      ),
    });
    service.init();
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  function installRestoreRequests(preferencesReply, importedSettings = true) {
    return vi
      .spyOn(service, "request")
      .mockImplementation(async (topic, payload) => {
        if (topic === "import:project-file") {
          return {
            success: true,
            message: "project_imported_successfully",
            currentProfile: "profile-42",
            imported: { profiles: 2, settings: importedSettings },
          };
        }
        if (topic === "data:reload-state") {
          return {
            success: true,
            profiles: 2,
            currentProfile: "profile-42",
            environment: "space",
          };
        }
        if (topic === "preferences:activate-persisted-settings") {
          expect(payload).toEqual({ source: "project-restore" });
          if (preferencesReply instanceof Error) throw preferencesReply;
          return preferencesReply;
        }
        throw new Error(`Unexpected request for topic ${topic}`);
      });
  }

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
    [
      "malformed reply",
      { success: true },
      "Import failed: Failed to load profile data",
    ],
    [
      "transport failure",
      new Error("preferences responder unavailable"),
      "preferences responder unavailable",
    ],
  ])(
    "retains only Preferences activation for the %s case",
    async (_label, preferencesReply, reason) => {
      const request = installRestoreRequests(preferencesReply);

      await expect(
        service.restoreFromProjectContent('{"fake":true}', "backup.json"),
      ).resolves.toEqual({
        success: false,
        error: "project_restore_reload_failed",
        params: { reason },
        durable: true,
        currentProfile: "profile-42",
        imported: { profiles: 2, settings: true },
        activation: { data: "complete", preferences: "pending" },
      });
      expect(request.mock.calls.map(([topic]) => topic)).toEqual([
        "import:project-file",
        "data:reload-state",
        "preferences:activate-persisted-settings",
      ]);
    },
  );

  it("does not request Preferences activation when settings were not imported", async () => {
    const request = installRestoreRequests(undefined, false);

    await expect(
      service.restoreFromProjectContent('{"fake":true}', "backup.json"),
    ).resolves.toEqual({
      success: true,
      currentProfile: "profile-42",
      imported: { profiles: 2, settings: false },
    });
    expect(request.mock.calls.map(([topic]) => topic)).toEqual([
      "import:project-file",
      "data:reload-state",
    ]);
  });
});
