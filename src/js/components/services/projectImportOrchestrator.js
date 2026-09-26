import { classifyPreferencesActivationResult } from "./preferencesActivationResult.js";
import { decodeProjectJson } from "./importJsonBoundary.js";
import { isDataRecord } from "./jsonDataBoundary.js";

/**
 * Capture the action flag before joining a queued lease. Accessors are not
 * action data, and a caller cannot change the selected stages while waiting.
 * @param {unknown} options
 * @returns {{success: true, value: {importSettings?: boolean}} | Extract<import('../../types/rpc/import-export.js').ProjectImportResult, {error: 'invalid_project_options'}>}
 */
function materializeImportOptions(options) {
  try {
    if (isDataRecord(options)) {
      const descriptor = Object.getOwnPropertyDescriptor(
        options,
        "importSettings",
      );
      if (!descriptor) return { success: true, value: {} };
      if (
        "value" in descriptor &&
        (descriptor.value === undefined ||
          typeof descriptor.value === "boolean")
      ) {
        return { success: true, value: { importSettings: descriptor.value } };
      }
      return {
        success: false,
        error: "invalid_project_options",
        params: { path: "$.options.importSettings" },
      };
    }
  } catch {
    // Unreadable envelopes have no adoptable action flag.
  }
  return {
    success: false,
    error: "invalid_project_options",
    params: { path: "$.options" },
  };
}

/**
 * Restore one decoded project through the injected storage boundary. The
 * established sequential write order is intentional: failure results disclose
 * acknowledged progress, but this module does not add rollback semantics.
 *
 * @param {import('./serviceTypes.js').Storage | null | undefined} storage
 * @param {unknown} content
 * @param {unknown} [options]
 * @param {import('./preferencesOwnerMutationOperations.js').PersistImportedPreferences} [persistImportedSettings]
 * @returns {Promise<import('../../types/rpc/import-export.js').ProjectImportResult>}
 */
export async function importProjectToStorage(
  storage,
  content,
  options = {},
  persistImportedSettings,
) {
  if (!storage) {
    return { success: false, error: "storage_not_available" };
  }
  const importedOptions = materializeImportOptions(options);
  if (!importedOptions.success) return importedOptions;

  const decoded = decodeProjectJson(content);
  if (!decoded.success) return decoded;

  /** @type {string[]} */
  const committedProfiles = [];
  let committedSettings = false;
  let committedProject = false;
  /**
   * Report only persistence stages that returned successfully. A false-returning
   * or throwing storage adapter may have mutated state before failing, but that
   * outcome cannot be known reliably at this boundary. Consequently, an empty
   * committed summary is not a no-write acknowledgement.
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
  if (
    importedData.settings &&
    importedOptions.value.importSettings !== false &&
    !persistImportedSettings
  ) {
    return storageFailure({ operation: "settings" });
  }
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
  if (importedData.settings && importedOptions.value.importSettings !== false) {
    try {
      const result = await persistImportedSettings?.(importedData.settings);
      if (result?.status !== "committed") {
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

/**
 * Public imports acquire their own Preferences lease; restore uses the direct
 * action inside its already-held lease instead.
 * @param {import("./ImportService.js").default} service
 * @param {unknown} content
 * @param {unknown} options
 * @returns {Promise<import("../../types/rpc/import-export.js").ProjectImportResult>}
 */
export async function importProjectWithPreferencesTransition(
  service,
  content,
  options,
) {
  if (!service.storage)
    return { success: false, error: "storage_not_available" };
  const importedOptions = materializeImportOptions(options);
  if (!importedOptions.success) return importedOptions;
  const detachedOptions = importedOptions.value;
  const decoded = decodeProjectJson(content);
  if (
    !service.runPreferencesTransition ||
    !decoded.success ||
    !decoded.value.data.settings ||
    detachedOptions.importSettings === false
  ) {
    return importProjectToStorage(service.storage, content, detachedOptions);
  }
  /** @type {Extract<import('../../types/rpc/import-export.js').ProjectImportResult, { success: true }> | undefined} */
  let persisted;
  /** @type {import('../../types/rpc/import-export.js').ProjectImportResult | undefined} */
  let importOutcome;
  /** @param {string} reason @returns {import('../../types/rpc/import-export.js').ProjectImportResult} */
  const activationFailure = (reason) =>
    persisted
      ? {
          success: false,
          error: "preferences_activation_failed",
          durable: true,
          imported: persisted.imported,
          currentProfile: persisted.currentProfile,
          params: { reason },
        }
      : {
          success: false,
          error: "storage_write_failed",
          params: { operation: "settings" },
          partial: false,
          committed: { profiles: [], settings: false, project: false },
        };
  try {
    return await service.runPreferencesTransition(
      "project-restore",
      async (
        activatePersistedSettings,
        assertActive,
        persistImportedSettings,
      ) => {
        assertActive?.();
        const result = await service.importProjectWithinPreferencesTransition(
          content,
          detachedOptions,
          persistImportedSettings,
        );
        importOutcome = result;
        if (!result.success || !result.imported.settings) return result;
        persisted = result;
        assertActive?.();
        const activation = classifyPreferencesActivationResult(
          await activatePersistedSettings(),
        );
        if (activation.kind !== "success") {
          return activationFailure(
            activation.kind === "failure"
              ? activation.result.params.reason
              : "invalid_preferences_activation_result",
          );
        }
        return result;
      },
    );
  } catch (error) {
    if (importOutcome?.success === false) return importOutcome;
    return activationFailure(
      error instanceof Error ? error.message : String(error),
    );
  }
}
