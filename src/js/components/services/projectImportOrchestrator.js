import { decodeProjectJson } from "./importJsonBoundary.js";
import { isDataRecord } from "./jsonDataBoundary.js";

/**
 * Restore one decoded project through the injected storage boundary. The
 * established sequential write order is intentional: failure results disclose
 * acknowledged progress, but this module does not add rollback semantics.
 *
 * @param {import('./serviceTypes.js').Storage | null | undefined} storage
 * @param {unknown} content
 * @param {unknown} [options]
 * @returns {Promise<import('../../types/rpc/import-export.js').ProjectImportResult>}
 */
export async function importProjectToStorage(storage, content, options = {}) {
  if (!storage) {
    return { success: false, error: "storage_not_available" };
  }
  if (!isDataRecord(options)) {
    return {
      success: false,
      error: "invalid_project_options",
      params: { path: "$.options" },
    };
  }
  if (
    Object.hasOwn(options, "importSettings") &&
    options.importSettings !== undefined &&
    typeof options.importSettings !== "boolean"
  ) {
    return {
      success: false,
      error: "invalid_project_options",
      params: { path: "$.options.importSettings" },
    };
  }

  const decoded = decodeProjectJson(content);
  if (!decoded.success) return decoded;

  /** @type {string[]} */
  const committedProfiles = [];
  let committedSettings = false;
  let committedProject = false;
  /**
   * Report only persistence stages that returned successfully. A throwing
   * storage adapter may have mutated state before throwing, but that outcome
   * cannot be known reliably at this boundary.
   * @param {{ operation: "profile", profileId: string } | { operation: "settings" | "project" }} params
   * @returns {Extract<import('../../types/rpc/import-export.js').ProjectImportResult, { success: false, error: "storage_write_failed" }>}
   */
  const storageFailure = (params) => ({
    success: false,
    error: "storage_write_failed",
    params,
    partial:
      committedProfiles.length > 0 || committedSettings || committedProject,
    committed: {
      profiles: [...committedProfiles],
      settings: committedSettings,
      project: committedProject,
    },
  });

  const importedData = decoded.value.data;
  const importedProfiles = importedData.profiles || {};
  const hasTopLevelCurrentProfile = Object.hasOwn(
    importedData,
    "currentProfile",
  );
  const hasLegacyCurrentProfile =
    importedData.settings !== undefined &&
    Object.hasOwn(importedData.settings, "currentProfile");
  const rawCurrentProfile = hasTopLevelCurrentProfile
    ? importedData.currentProfile
    : importedData.settings?.currentProfile;
  const currentProfile =
    typeof rawCurrentProfile === "string" ? rawCurrentProfile : null;

  const currentProfileReferences = [
    ...(hasTopLevelCurrentProfile &&
    typeof importedData.currentProfile === "string"
      ? [
          {
            profileId: importedData.currentProfile,
            path: "$.data.currentProfile",
          },
        ]
      : []),
    ...(hasLegacyCurrentProfile &&
    typeof importedData.settings?.currentProfile === "string"
      ? [
          {
            profileId: importedData.settings.currentProfile,
            path: "$.data.settings.currentProfile",
          },
        ]
      : []),
  ];
  const referencesNeedingDestination = currentProfileReferences.filter(
    ({ profileId }) => !Object.hasOwn(importedProfiles, profileId),
  );
  let destinationProfiles = {};
  if (referencesNeedingDestination.length > 0) {
    try {
      destinationProfiles = storage.getAllData()?.profiles || {};
    } catch {
      return storageFailure({ operation: "project" });
    }
  }
  for (const { profileId, path } of referencesNeedingDestination) {
    if (!Object.hasOwn(destinationProfiles, profileId)) {
      return {
        success: false,
        error: "invalid_project_file",
        params: { path },
      };
    }
  }

  for (const [profileId, profile] of Object.entries(importedProfiles)) {
    try {
      if ((await storage.saveProfile(profileId, profile)) === false) {
        return storageFailure({ operation: "profile", profileId });
      }
      committedProfiles.push(profileId);
    } catch {
      return storageFailure({ operation: "profile", profileId });
    }
  }

  let importedSettings = false;
  if (importedData.settings && options.importSettings !== false) {
    try {
      const currentSettings = storage.getSettings() || {};
      const mergedSettings = {
        ...currentSettings,
        ...importedData.settings,
        version: currentSettings.version || importedData.settings.version,
        firstRun: currentSettings.firstRun,
      };
      if ((await storage.saveSettings(mergedSettings)) === false) {
        return storageFailure({ operation: "settings" });
      }
      committedSettings = true;
      importedSettings = true;
    } catch {
      return storageFailure({ operation: "settings" });
    }
  }

  if (
    Object.keys(importedProfiles).length > 0 ||
    hasTopLevelCurrentProfile ||
    hasLegacyCurrentProfile
  ) {
    try {
      const storedData = storage.getAllData();
      const restoredData = {
        ...storedData,
        profiles: {
          ...(storedData.profiles || {}),
          ...importedProfiles,
        },
        ...(hasTopLevelCurrentProfile || hasLegacyCurrentProfile
          ? { currentProfile }
          : {}),
      };
      if ((await storage.saveAllData(restoredData)) === false) {
        return storageFailure({ operation: "project" });
      }
      committedProject = true;
    } catch {
      return storageFailure({ operation: "project" });
    }
  }

  return {
    success: true,
    message: "project_imported_successfully",
    imported: {
      profiles: Object.keys(importedProfiles).length,
      settings: importedSettings,
    },
    currentProfile,
  };
}
