import { classifyPreferencesActivationResult } from "./preferencesActivationResult.js";
import {
  isProjectImportFailure,
  materializeProjectImportSuccess,
} from "./projectRestoreResult.js";
import {
  materializePendingProjectActivation,
  materializeProjectImportContext,
} from "./projectImportOrchestrator.js";

/** @param {unknown} error */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {import('./serviceTypes.js').I18n | null} i18n
 * @param {ReturnType<typeof classifyPreferencesActivationResult>} result
 */
function getPreferencesActivationFailureReason(i18n, result) {
  if (result.kind !== "failure") {
    return (
      i18n?.t("failed_to_load_profile_data") ?? "failed_to_load_profile_data"
    );
  }
  return result.result.error === "operation_cancelled" ||
    result.result.params.reason === "operation_cancelled"
    ? (i18n?.t("failed_to_load_profile_data") ?? "failed_to_load_profile_data")
    : result.result.params.reason;
}

/** @param {import('./serviceTypes.js').I18n | null} i18n */
function getMalformedRestoreReason(i18n) {
  const error =
    i18n?.t("failed_to_load_profile_data") ?? "failed_to_load_profile_data";
  return i18n?.t("import_failed", { error }) ?? "import_failed";
}

/**
 * Project the direct Data-owner outcome into the frozen restore result union,
 * then complete the Preferences activation stage when it is required.
 *
 * @param {{
 *   ownerResult: unknown,
 *   activatePersistedSettings: () => Promise<import('../../types/rpc/parameters-preferences.js').PreferencesActivationResult>,
 *   assertActive: () => void,
 *   i18n: import('./serviceTypes.js').I18n | null,
 * }} options
 */
export async function materializeProjectRestoreOutcome({
  ownerResult,
  activatePersistedSettings,
  assertActive,
  i18n,
}) {
  const dataPending = materializePendingProjectActivation(ownerResult);
  if (dataPending) {
    return {
      result: {
        success: /** @type {const} */ (false),
        error: /** @type {const} */ ("project_restore_reload_failed"),
        params: {
          reason:
            i18n?.t("failed_to_load_profile_data") ??
            "failed_to_load_profile_data",
        },
        durable: /** @type {const} */ (true),
        currentProfile: dataPending.currentProfile,
        imported: dataPending.imported,
        activation: dataPending.activation,
      },
      pending: dataPending,
    };
  }
  if (isProjectImportFailure(ownerResult)) {
    return { result: ownerResult, pending: null };
  }

  const imported = materializeProjectImportSuccess(ownerResult);
  if (!imported) {
    return {
      result: {
        success: /** @type {const} */ (false),
        error: /** @type {const} */ ("project_restore_import_failed"),
        params: { reason: getMalformedRestoreReason(i18n) },
        durable: /** @type {const} */ ("indeterminate"),
      },
      pending: null,
    };
  }

  assertActive();
  const context = materializeProjectImportContext(ownerResult);
  if (!imported.imported.settings) {
    return {
      result: { success: /** @type {const} */ (true), ...imported },
      pending: null,
    };
  }

  const activation = {
    data: /** @type {const} */ ("complete"),
    preferences: /** @type {const} */ ("pending"),
  };
  /** @param {string} reason */
  const failed = (reason) => ({
    result: {
      success: /** @type {const} */ (false),
      error: /** @type {const} */ ("project_restore_reload_failed"),
      params: { reason },
      durable: /** @type {const} */ (true),
      currentProfile: imported.currentProfile,
      imported: imported.imported,
      activation,
    },
    pending: context ? { ...context, activation } : null,
  });

  try {
    assertActive();
    const outcome = classifyPreferencesActivationResult(
      await activatePersistedSettings(),
    );
    if (outcome.kind !== "success") {
      return failed(getPreferencesActivationFailureReason(i18n, outcome));
    }
    assertActive();
  } catch (error) {
    const reason = getErrorMessage(error);
    return failed(
      reason === "operation_cancelled"
        ? (i18n?.t("failed_to_load_profile_data") ??
            "failed_to_load_profile_data")
        : reason,
    );
  }

  return {
    result: { success: /** @type {const} */ (true), ...imported },
    pending: null,
  };
}

/**
 * Resume owner activation from retained, fingerprinted material. This path has
 * no artifact and performs no durable write; each owner may read its durable
 * state inside its own queue to verify the retained fingerprint before adopt.
 *
 * @param {{
 *   retained: NonNullable<ReturnType<import('./projectImportOrchestrator.js').materializeProjectImportContext>>,
 *   activateProjectFromImport: import('../../types/storage-contracts.js').ImportedProjectActivationAction | null,
 *   activateImportedSettings: import('./PreferencesService.js').default['activateImportedSettings'] | null,
 *   i18n: import('./serviceTypes.js').I18n | null,
 * }} options
 * @returns {Promise<{result: import('../../types/rpc/application.js').ProjectRestoreResult, retained: NonNullable<ReturnType<import('./projectImportOrchestrator.js').materializeProjectImportContext>> | null}>}
 */
export async function resumeProjectRestoreActivation({
  retained,
  activateProjectFromImport,
  activateImportedSettings,
  i18n,
}) {
  /**
   * @param {string} reason
   * @param {import('../../types/rpc/application.js').ProjectRestorePendingActivation} activation
   */
  const failed = (reason, activation) => ({
    result: {
      success: /** @type {const} */ (false),
      error: /** @type {const} */ ("project_restore_reload_failed"),
      params: { reason },
      durable: /** @type {const} */ (true),
      currentProfile: retained.currentProfile,
      imported: structuredClone(retained.imported),
      activation,
    },
    retained: { ...retained, activation },
  });

  let activation = structuredClone(retained.activation);
  const material = retained.activationMaterial;
  const receipt = retained.receipt;

  if (activation.data === "pending") {
    const fingerprint = receipt?.project?.fingerprint;
    if (
      !activateProjectFromImport ||
      !material?.project ||
      typeof fingerprint !== "string"
    ) {
      return failed("project_data_activation_unavailable", activation);
    }
    let outcome;
    try {
      outcome = await activateProjectFromImport(material.project, {
        fingerprint,
      });
    } catch (error) {
      return failed(getErrorMessage(error), activation);
    }
    if (outcome?.success !== true) {
      return failed(
        typeof outcome?.error === "string"
          ? outcome.error
          : "project_data_activation_failed",
        activation,
      );
    }
    activation = { ...activation, data: /** @type {const} */ ("complete") };
  }

  if (activation.preferences === "pending") {
    const fingerprint = receipt?.settings?.fingerprint;
    if (
      !activateImportedSettings ||
      !material?.settings ||
      typeof fingerprint !== "string"
    ) {
      return failed("project_preferences_activation_unavailable", activation);
    }
    let outcome;
    try {
      outcome = classifyPreferencesActivationResult(
        await activateImportedSettings(material.settings, fingerprint),
      );
    } catch (error) {
      return failed(getErrorMessage(error), activation);
    }
    if (outcome.kind !== "success") {
      return failed(
        getPreferencesActivationFailureReason(i18n, outcome),
        activation,
      );
    }
  }

  return {
    result: {
      success: true,
      currentProfile: retained.currentProfile,
      imported: structuredClone(retained.imported),
    },
    retained: null,
  };
}
