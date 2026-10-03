import { classifyPreferencesActivationResult } from "./preferencesActivationResult.js";
import { decodeProjectJson } from "./importJsonBoundary.js";
import { isDataRecord } from "./jsonDataBoundary.js";
import { settleOwnerPublications } from "./ownerPublicationSettlement.js";

const preparedImports = new WeakSet();
const projectImportContexts = new WeakMap();

/**
 * Capture the action flag before joining an owner queue. Accessors are not
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
 * Validate and detach the complete artifact and options before any owner queue
 * is acquired. The opaque prepared value is accepted only by this module's
 * execution path, so callers cannot forge a canonical project candidate.
 *
 * @param {unknown} content
 * @param {unknown} [options]
 * @returns {Extract<import('../../types/rpc/import-export.js').ProjectImportResult, {success: false}> | {success: true, data: import('../../types/data-contracts.js').CanonicalProjectData, importSettings: boolean, importedProfiles: number, currentProfile: string | null}}
 */
export function prepareProjectImport(content, options = {}) {
  const importedOptions = materializeImportOptions(options);
  if (!importedOptions.success) return importedOptions;
  const decoded = decodeProjectJson(content);
  if (!decoded.success) return decoded;

  const data = structuredClone(decoded.value.data);
  const hasTopLevelCurrentProfile = Object.hasOwn(data, "currentProfile");
  const rawCurrentProfile = hasTopLevelCurrentProfile
    ? data.currentProfile
    : data.settings?.currentProfile;
  const prepared = {
    success: /** @type {const} */ (true),
    data,
    importSettings:
      data.settings !== undefined &&
      importedOptions.value.importSettings !== false,
    importedProfiles: Object.keys(data.profiles || {}).length,
    currentProfile:
      typeof rawCurrentProfile === "string" ? rawCurrentProfile : null,
  };
  preparedImports.add(prepared);
  return prepared;
}

/** @param {unknown} value
 * @returns {value is Extract<ReturnType<typeof prepareProjectImport>, {success: true}>}
 */
function isPreparedProjectImport(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    preparedImports.has(/** @type {object} */ (value))
  );
}

/**
 * @param {'settings' | 'project'} operation
 * @param {boolean} settingsCommitted
 * @param {boolean} [projectCommitted]
 * @returns {Extract<import('../../types/rpc/import-export.js').ProjectImportResult, { success: false, error: 'storage_write_failed' }>}
 */
function storageFailure(
  operation,
  settingsCommitted,
  projectCommitted = false,
) {
  return {
    success: false,
    error: "storage_write_failed",
    params: { operation },
    partial: settingsCommitted || projectCommitted,
    committed: {
      // Imported profiles are now one complete-root owner action. They are
      // never separately acknowledged as durable stages.
      profiles: [],
      settings: settingsCommitted,
      project: projectCommitted,
    },
  };
}

/** @param {unknown} result */
function settingsWereCommitted(result) {
  if (!isDataRecord(result)) return false;
  const receipt = Object.getOwnPropertyDescriptor(result, "receipt");
  if (!receipt || !("value" in receipt) || !isDataRecord(receipt.value)) {
    return false;
  }
  const settings = Object.getOwnPropertyDescriptor(receipt.value, "settings");
  if (!settings || !("value" in settings) || !isDataRecord(settings.value)) {
    return false;
  }
  const status = Object.getOwnPropertyDescriptor(settings.value, "status");
  const committed = Object.getOwnPropertyDescriptor(
    settings.value,
    "committed",
  );
  return Boolean(
    status &&
      "value" in status &&
      (status.value === "committed" || status.value === "complete") &&
      (!committed || ("value" in committed && committed.value === true)),
  );
}

/** @param {unknown} result @param {string} stage */
function hasOwnerFailureStage(result, stage) {
  if (!isDataRecord(result)) return false;
  const descriptor = Object.getOwnPropertyDescriptor(result, "stage");
  return Boolean(
    descriptor && "value" in descriptor && descriptor.value === stage,
  );
}

/** @param {unknown} result */
function isDurableOwnerFailure(result) {
  if (!isDataRecord(result)) return false;
  const descriptor = Object.getOwnPropertyDescriptor(result, "durable");
  return Boolean(
    descriptor && "value" in descriptor && descriptor.value === true,
  );
}

/**
 * Read the private durable-data/pending-activation result produced only by the
 * owner execution path. This marker never becomes an `import:project-file`
 * response; ProjectManagement converts it to the frozen restore result arm.
 * @param {unknown} value
 */
export function materializeProjectImportContext(value) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const context = projectImportContexts.get(/** @type {object} */ (value));
  return context ? structuredClone(context) : null;
}

/** @param {unknown} value */
export function materializePendingProjectActivation(value) {
  const context = materializeProjectImportContext(value);
  return context?.activation.data === "pending" ? context : null;
}

/** @param {unknown} result */
function ownerFailureStage(result) {
  if (!isDataRecord(result)) return "project";
  const stage = Object.getOwnPropertyDescriptor(result, "stage");
  return stage && "value" in stage && stage.value === "settings"
    ? "settings"
    : "project";
}

/**
 * Execute a previously validated project through exactly one DataCoordinator
 * owner action. The owner captures and validates the destination while its
 * queue is held, invokes the optional Preferences-owned settings stage, then
 * persists/adopts/publishes one complete root.
 *
 * @param {((projectData: import('../../types/data-contracts.js').CanonicalProjectData, options?: {persistImportedSettings?: import('./preferencesOwnerMutationOperations.js').PersistImportedPreferences}) => Promise<unknown> | unknown) | null | undefined} replaceProjectFromImport
 * @param {unknown} prepared
 * @param {import('./preferencesOwnerMutationOperations.js').PersistImportedPreferences} [persistImportedSettings]
 * @returns {Promise<unknown>}
 */
async function importPreparedProject(
  replaceProjectFromImport,
  prepared,
  persistImportedSettings,
) {
  if (!isPreparedProjectImport(prepared)) {
    return {
      success: false,
      error: "invalid_project_file",
      params: { path: "$" },
    };
  }
  if (!replaceProjectFromImport) {
    return { success: false, error: "storage_not_available" };
  }

  const candidate =
    /** @type {{data: import('../../types/data-contracts.js').CanonicalProjectData, importSettings: boolean, importedProfiles: number, currentProfile: string | null}} */ (
      prepared
    );
  if (candidate.importSettings && !persistImportedSettings) {
    return storageFailure("settings", false);
  }

  let acknowledgedSettings = false;
  const persistSettings = persistImportedSettings;
  const trackSettings = candidate.importSettings
    ? async (/** @type {unknown} */ settings) => {
        if (!persistSettings) throw new Error("settings_stage_unavailable");
        const result = await persistSettings(settings);
        if (result?.status === "committed") acknowledgedSettings = true;
        return result;
      }
    : undefined;

  /** @type {unknown} */
  let result;
  try {
    result = await replaceProjectFromImport(structuredClone(candidate.data), {
      ...(trackSettings ? { persistImportedSettings: trackSettings } : {}),
    });
  } catch {
    return storageFailure("project", acknowledgedSettings);
  }

  acknowledgedSettings ||= settingsWereCommitted(result);
  if (!isDataRecord(result)) {
    return storageFailure("project", acknowledgedSettings);
  }
  const success = Object.getOwnPropertyDescriptor(result, "success");
  if (!success || !("value" in success)) {
    return storageFailure("project", acknowledgedSettings);
  }
  if (success.value !== true) {
    const error = Object.getOwnPropertyDescriptor(result, "error");
    const params = Object.getOwnPropertyDescriptor(result, "params");
    if (
      error &&
      "value" in error &&
      error.value === "invalid_project_file" &&
      params &&
      "value" in params &&
      isDataRecord(params.value) &&
      typeof params.value.path === "string"
    ) {
      return {
        success: false,
        error: "invalid_project_file",
        params: { path: params.value.path },
      };
    }
    if (
      hasOwnerFailureStage(result, "dataActivation") &&
      isDurableOwnerFailure(result)
    ) {
      const activationMaterial = Object.getOwnPropertyDescriptor(
        result,
        "activationMaterial",
      );
      const project =
        activationMaterial &&
        "value" in activationMaterial &&
        isDataRecord(activationMaterial.value)
          ? Object.getOwnPropertyDescriptor(activationMaterial.value, "project")
          : undefined;
      const projectValue =
        project && "value" in project && isDataRecord(project.value)
          ? project.value
          : null;
      const acceptedCurrentProfile = projectValue
        ? Object.getOwnPropertyDescriptor(projectValue, "currentProfile")
        : undefined;
      const currentProfile =
        acceptedCurrentProfile &&
        "value" in acceptedCurrentProfile &&
        (acceptedCurrentProfile.value === null ||
          typeof acceptedCurrentProfile.value === "string")
          ? acceptedCurrentProfile.value
          : candidate.currentProfile;
      const marker = {
        success: false,
        error: "project_data_activation_pending",
        durable: true,
        currentProfile,
        imported: {
          profiles: candidate.importedProfiles,
          settings: candidate.importSettings,
        },
        activation: {
          data: /** @type {const} */ ("pending"),
          preferences: candidate.importSettings
            ? /** @type {const} */ ("pending")
            : /** @type {const} */ ("not-required"),
        },
        publicFailure: storageFailure("project", acknowledgedSettings, true),
      };
      const receipt = Object.getOwnPropertyDescriptor(result, "receipt");
      projectImportContexts.set(marker, {
        currentProfile: marker.currentProfile,
        imported: marker.imported,
        activation: marker.activation,
        publicFailure: marker.publicFailure,
        receipt:
          receipt && "value" in receipt
            ? structuredClone(receipt.value)
            : undefined,
        activationMaterial:
          activationMaterial && "value" in activationMaterial
            ? structuredClone(activationMaterial.value)
            : undefined,
      });
      return marker;
    }
    return storageFailure(ownerFailureStage(result), acknowledgedSettings);
  }

  const acceptedCurrentProfile = Object.getOwnPropertyDescriptor(
    result,
    "currentProfile",
  );
  if (
    !acceptedCurrentProfile ||
    !("value" in acceptedCurrentProfile) ||
    (acceptedCurrentProfile.value !== null &&
      typeof acceptedCurrentProfile.value !== "string")
  ) {
    return storageFailure("project", acknowledgedSettings);
  }

  const projected = {
    success: true,
    message: "project_imported_successfully",
    imported: {
      profiles: candidate.importedProfiles,
      settings: candidate.importSettings,
    },
    currentProfile: acceptedCurrentProfile.value,
  };
  const receipt = Object.getOwnPropertyDescriptor(result, "receipt");
  const activationMaterial = Object.getOwnPropertyDescriptor(
    result,
    "activationMaterial",
  );
  projectImportContexts.set(projected, {
    currentProfile: projected.currentProfile,
    imported: projected.imported,
    activation: {
      data: /** @type {const} */ ("complete"),
      preferences: candidate.importSettings
        ? /** @type {const} */ ("pending")
        : /** @type {const} */ ("not-required"),
    },
    receipt:
      receipt && "value" in receipt
        ? structuredClone(receipt.value)
        : undefined,
    activationMaterial:
      activationMaterial && "value" in activationMaterial
        ? structuredClone(activationMaterial.value)
        : undefined,
  });
  return projected;
}

/**
 * Only the explicit completion capability is safe inside a Preferences lease;
 * an ordinary owner reply may already be waiting for a listener that needs it.
 * @param {import('../../types/storage-contracts.js').ImportedProjectOwnerCompletionAction | null | undefined} ownerAction
 * @param {unknown} prepared
 * @param {import('./preferencesOwnerMutationOperations.js').PersistImportedPreferences} [persistImportedSettings]
 * @param {Parameters<typeof importPreparedProject>[0]} [ordinaryOwnerAction]
 * @returns {Promise<{result: unknown, settlement: Promise<void>}>}
 */
export async function importPreparedProjectWithSettlement(
  ownerAction,
  prepared,
  persistImportedSettings,
  ordinaryOwnerAction,
) {
  if (
    isPreparedProjectImport(prepared) &&
    prepared.importSettings === false &&
    !ownerAction
  ) {
    return {
      result: await importPreparedProject(ordinaryOwnerAction, prepared),
      settlement: Promise.resolve(),
    };
  }
  /** @type {PromiseLike<unknown>[]} */
  const publications = [];
  const result = await importPreparedProject(
    ownerAction
      ? async (project, options) => {
          const completion = await ownerAction(project, options);
          const accepted = materializeProjectImportCompletion(completion);
          publications.push(accepted.settlement);
          return accepted.result;
        }
      : null,
    prepared,
    persistImportedSettings,
  );
  return { result, settlement: settleOwnerPublications(publications) };
}

/** Preserve the private projected outcome's identity, including retry markers.
 * @param {unknown} value
 * @returns {{result: unknown, settlement: Promise<void>}}
 */
export function materializeProjectImportCompletion(value) {
  if (!isDataRecord(value))
    throw new TypeError("invalid_project_import_completion");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== 2 ||
    !keys.includes("result") ||
    !keys.includes("settlement") ||
    !descriptors.result.enumerable ||
    !descriptors.settlement.enumerable ||
    !("value" in descriptors.result) ||
    !("value" in descriptors.settlement) ||
    !(descriptors.settlement.value instanceof Promise)
  ) {
    throw new TypeError("invalid_project_import_completion");
  }
  const settlement = /** @type {Promise<void>} */ (
    descriptors.settlement.value
  );
  void settlement.catch(() => undefined);
  return { result: descriptors.result.value, settlement };
}

/**
 * Public imports acquire their own Preferences transition only when portable
 * settings are selected. Restore uses the explicit completion path inside its
 * already-held transition.
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
  const prepared = prepareProjectImport(content, options);
  if (!prepared.success) return prepared;

  if (!prepared.importSettings) {
    const result = await importPreparedProject(
      service.replaceProjectFromImport,
      prepared,
    );
    const pendingActivation = materializePendingProjectActivation(result);
    return pendingActivation
      ? pendingActivation.publicFailure
      : /** @type {import('../../types/rpc/import-export.js').ProjectImportResult} */ (
          result
        );
  }
  if (!service.runPreferencesTransition) {
    return storageFailure("settings", false);
  }
  if (!service.replaceProjectFromImportWithSettlement) {
    return { success: false, error: "storage_not_available" };
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
      : storageFailure("settings", false);

  /** @type {PromiseLike<unknown>[]} */
  const publications = [];
  try {
    const outcome = await service.runPreferencesTransition(
      "project-restore",
      async (
        activatePersistedSettings,
        assertActive,
        persistImportedSettings,
      ) => {
        assertActive?.();
        const completion = materializeProjectImportCompletion(
          await service.importProjectWithinPreferencesTransition(
            prepared,
            persistImportedSettings,
          ),
        );
        publications.push(completion.settlement);
        const result = completion.result;
        const pendingActivation = materializePendingProjectActivation(result);
        if (pendingActivation) return pendingActivation.publicFailure;
        const publicResult =
          /** @type {import('../../types/rpc/import-export.js').ProjectImportResult} */ (
            result
          );
        importOutcome = publicResult;
        if (!publicResult.success || !publicResult.imported.settings) {
          return publicResult;
        }
        persisted = publicResult;
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
        return publicResult;
      },
    );
    await settleOwnerPublications(publications);
    return outcome;
  } catch (error) {
    await settleOwnerPublications(publications);
    if (importOutcome?.success === false) return importOutcome;
    return activationFailure(
      error instanceof Error ? error.message : String(error),
    );
  }
}
