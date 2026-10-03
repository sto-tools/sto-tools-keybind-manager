import { vi } from "vitest";

/** Explicit completion capability for owner doubles with no publications. */
export function createProjectImportOwnerCompletionAction(ownerAction) {
  return vi.fn(async (...args) => ({
    result: await ownerAction(...args),
    settlement: Promise.resolve(),
  }));
}

/**
 * Complete-root owner-action double for focused ImportService tests.
 * Validation precedes the optional settings stage and the single root write.
 */
export function createProjectImportOwnerAction(fixture) {
  return vi.fn(async (projectData, { persistImportedSettings } = {}) => {
    const destination = fixture.readProjectRoot();
    const profiles = {
      ...(destination.profiles || {}),
      ...(projectData.profiles || {}),
    };
    const topLevel = Object.hasOwn(projectData, "currentProfile");
    const legacy =
      projectData.settings !== undefined &&
      Object.hasOwn(projectData.settings, "currentProfile");
    const selected = topLevel
      ? projectData.currentProfile
      : legacy
        ? projectData.settings.currentProfile
        : destination.currentProfile;

    for (const [profileId, path] of [
      ...(topLevel && typeof projectData.currentProfile === "string"
        ? [[projectData.currentProfile, "$.data.currentProfile"]]
        : []),
      ...(legacy && typeof projectData.settings.currentProfile === "string"
        ? [
            [
              projectData.settings.currentProfile,
              "$.data.settings.currentProfile",
            ],
          ]
        : []),
    ]) {
      if (!Object.hasOwn(profiles, profileId)) {
        return {
          success: false,
          error: "invalid_project_file",
          params: { path },
          durable: false,
          receipt: { settings: { status: "skipped", committed: false } },
        };
      }
    }

    let settings;
    if (projectData.settings && persistImportedSettings) {
      settings = await persistImportedSettings(projectData.settings);
      if (settings.status !== "committed") {
        return {
          success: false,
          error: "storage_write_failed",
          stage: "settings",
          durable: "indeterminate",
          receipt: {
            settings: { status: "failed", committed: "indeterminate" },
          },
        };
      }
    }

    const currentProfile =
      typeof selected === "string" ? selected : (selected ?? null);
    const committed = await fixture.projectRepository.commit({
      ...destination,
      profiles,
      currentProfile,
    });
    if (committed.status !== "committed") {
      return {
        success: false,
        error: "storage_write_failed",
        stage: "project",
        durable: "indeterminate",
        receipt: {
          settings: settings
            ? { status: "complete", committed: true }
            : { status: "skipped", committed: false },
        },
      };
    }

    return {
      success: true,
      currentProfile,
      importedProfiles: Object.keys(projectData.profiles || {}).length,
      receipt: {
        settings: settings
          ? { status: "complete", committed: true }
          : { status: "skipped", committed: false },
      },
      activationMaterial: {
        project: committed.value,
        ...(settings ? { settings: settings.value } : {}),
      },
    };
  });
}
