import { probeSyncProjectFile } from "./syncFolderBoundary.js";
import { classifyProjectRestoreResult } from "./projectRestoreResult.js";

/** @param {unknown} error */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Materialize one user-facing failure detail from the typed restore result.
 * Transport failures are handled by the surrounding catch path.
 *
 * @param {import('./SyncService.js').default} service
 * @param {ReturnType<typeof classifyProjectRestoreResult>} result
 */
function getRestoreFailureDetail(service, result) {
  if (result.kind === "malformed" || result.kind === "success") {
    return service.i18n.t("import_failed", {
      error: service.i18n.t("failed_to_load_profile_data"),
    });
  }
  if (result.reason === "operation_cancelled") {
    return service.i18n.t("failed_to_load_profile_data");
  }
  return result.reason ?? service.i18n.t(result.error, result.params);
}

/**
 * A notification failure must not change whether durable restore work is
 * terminal or retryable.
 * @param {import('./SyncService.js').default} service
 * @param {string} message
 * @param {string} type
 */
function showRestoreToast(service, message, type) {
  try {
    service.ui?.showToast(message, type);
  } catch (error) {
    console.error("[SyncService] restore notification failed", error);
  }
}

/** Preserve already acknowledged owner work even if folder selection supersedes its UI.
 * @param {import('./SyncService.js').default} service
 * @param {unknown} result
 * @param {ReturnType<typeof classifyProjectRestoreResult>} outcome
 */
function rememberRestoreAcknowledgement(service, result, outcome) {
  if (outcome.kind === "success") {
    // Classification proved these are own data fields; only scalars are retained.
    const accepted =
      /** @type {Extract<import('../../types/rpc/application.js').ProjectRestoreResult, {success: true}>} */ (
        result
      );
    service.pendingRestoreActivationReceipt = {
      currentProfile: accepted.currentProfile,
      imported: {
        profiles: accepted.imported.profiles,
        settings: accepted.imported.settings,
      },
      activation: {
        data: "complete",
        preferences: accepted.imported.settings ? "complete" : "not-required",
      },
    };
    service.deferredImportContent = null;
  } else if (outcome.kind === "activation-retryable-failure") {
    service.pendingRestoreActivationReceipt = outcome.receipt;
    service.deferredImportContent = null;
  } else if (
    outcome.kind === "terminal-failure" ||
    (outcome.kind === "malformed" && !service.pendingRestoreActivationReceipt)
  ) {
    // Superseded UI must not accidentally preserve material for unsafe replay.
    service.pendingRestoreActivationReceipt = null;
    service.deferredImportContent = null;
    service.awaitingSyncDecisionApply = false;
  }
}

/**
 * @param {import('./SyncService.js').default} service
 * @param {'import' | 'overwrite'} action
 * @param {string} errorKey
 * @param {Record<string, unknown>} [params]
 */
function showDecisionFailure(service, action, errorKey, params) {
  const detail = service.i18n.t(errorKey, params);
  service.ui?.showToast(
    service.i18n.t(
      action === "import"
        ? "failed_to_import_project"
        : "failed_to_sync_project",
      { error: detail },
    ),
    "error",
  );
}

/**
 * @param {import('./SyncService.js').default} service
 * @param {Exclude<import('../../types/sync-boundary.js').SyncProjectProbeResult, { success: true }>} probe
 */
function getProbeFailureDetail(service, probe) {
  if (probe.error === "project_file_access_denied") {
    return service.i18n.t("permission_denied_to_folder");
  }
  if (probe.error === "invalid_project_file_capability") {
    return service.i18n.t("sync_folder_capability_invalid");
  }
  if (probe.error === "invalid_project") {
    return probe.decode.error === "invalid_project_file"
      ? service.i18n.t(probe.decode.error, probe.decode.params)
      : service.i18n.t(probe.decode.error);
  }
  if (probe.error === "project_file_too_large") {
    return service.i18n.t("invalid_project_file", { path: "$" });
  }
  return service.i18n.t("sync_folder_project_read_failed");
}

/**
 * Claim and apply one pending sync-folder decision. The service remains the
 * lifecycle owner; this seam keeps the async orchestration token-scoped so an
 * older save cannot consume or clear a newer decision.
 * @param {import('./SyncService.js').default} service
 * @returns {Promise<boolean>} True only for the exact decision's accepted success.
 */
export async function applyPendingSyncDecision(service) {
  console.log("[SyncService] preferences:saved received", {
    awaiting: service.awaitingSyncDecisionApply,
    pending: service.pendingSyncAction,
    applying: service._syncDecisionApplyInFlight,
  });
  const action = service.pendingSyncAction;
  if (
    !service.awaitingSyncDecisionApply ||
    !action ||
    service._syncDecisionApplyInFlight
  ) {
    return false;
  }

  const decisionGeneration = service._syncDecisionGeneration;
  const folderGeneration = service._folderSelectionGeneration;
  const deferredContent = service.deferredImportContent
    ? { ...service.deferredImportContent }
    : null;
  const activationReceipt = service.pendingRestoreActivationReceipt
    ? {
        currentProfile: service.pendingRestoreActivationReceipt.currentProfile,
        imported: { ...service.pendingRestoreActivationReceipt.imported },
        activation: { ...service.pendingRestoreActivationReceipt.activation },
      }
    : null;
  const retainedRestoreWork =
    action === "import" &&
    service._syncDecisionClaimed &&
    (deferredContent !== null || activationReceipt !== null);
  service._syncDecisionApplyInFlight = true;
  service._syncDecisionClaimed = true;
  let retainDecision = false;
  const ownsDecision = () =>
    !service.destroyed &&
    service._syncDecisionApplyInFlight &&
    service._syncDecisionGeneration === decisionGeneration;
  const isCurrentDecision = () =>
    ownsDecision() &&
    (action !== "import" ||
      service._folderSelectionGeneration === folderGeneration);

  try {
    /** @type {import('../../types/sync-boundary.js').SyncDirectoryCapability | null} */
    let directory = null;
    if (!retainedRestoreWork) {
      const loaded = await service.loadSyncFolderCapability();
      if (!isCurrentDecision()) return false;
      if (!loaded.success) {
        showDecisionFailure(service, action, loaded.error);
        return false;
      }
      if (loaded.state === "missing") {
        showDecisionFailure(service, action, "no_sync_folder_selected");
        return false;
      }
      const permission = await service.checkSyncFolderPermission(
        loaded.value.raw,
      );
      if (!isCurrentDecision()) return false;
      if (!permission.success) {
        showDecisionFailure(
          service,
          action,
          permission.error === "permission_denied"
            ? "permission_denied_to_folder"
            : "sync_folder_permission_check_failed",
        );
        return false;
      }
      directory = loaded.value;
    }
    console.log("[SyncService] applying pending action", { action });

    if (action === "import") {
      if (activationReceipt) {
        if (
          activationReceipt.activation.data === "complete" &&
          activationReceipt.activation.preferences !== "pending"
        ) {
          showRestoreToast(
            service,
            service.i18n.t("project_imported_from_sync_folder"),
            "success",
          );
          return true;
        }
        let retryResult;
        try {
          retryResult = await service.invokeRequest(
            "project:retry-restore-activation",
            undefined,
            0,
          );
        } catch (error) {
          if (!isCurrentDecision()) return false;
          retainDecision = true;
          showRestoreToast(
            service,
            service.i18n.t("failed_to_import_project", {
              error: getErrorMessage(error),
            }),
            "error",
          );
          return false;
        }

        const retryOutcome = classifyProjectRestoreResult(retryResult);
        if (ownsDecision())
          rememberRestoreAcknowledgement(service, retryResult, retryOutcome);
        if (!isCurrentDecision()) return false;
        if (retryOutcome.kind === "success") {
          showRestoreToast(
            service,
            service.i18n.t("project_imported_from_sync_folder"),
            "success",
          );
          return true;
        }

        retainDecision =
          retryOutcome.kind === "activation-retryable-failure" ||
          retryOutcome.kind === "malformed";
        if (retryOutcome.kind === "activation-retryable-failure") {
          service.pendingRestoreActivationReceipt = retryOutcome.receipt;
        }
        showRestoreToast(
          service,
          service.i18n.t("failed_to_import_project", {
            error: getRestoreFailureDetail(service, retryOutcome),
          }),
          "error",
        );
        return false;
      }

      try {
        // Prefer content captured with the claimed decision. Shared state may
        // now belong to a newer selection.
        /** @type {string} */
        let content;
        /** @type {string} */
        let fileName;
        if (deferredContent?.content) {
          content = deferredContent.content;
          fileName = deferredContent.fileName || "project.json";
        } else {
          if (!directory) return false;
          const probe = await probeSyncProjectFile(directory);
          if (!isCurrentDecision()) return false;
          if (!probe.success) {
            service.ui?.showToast(
              service.i18n.t("failed_to_import_project", {
                error: getProbeFailureDetail(service, probe),
              }),
              "error",
            );
            return false;
          }
          if (probe.state === "absent") {
            showDecisionFailure(service, action, "sync_project_file_missing");
            return false;
          }
          content = probe.content;
          fileName = probe.fileName;
        }

        if (!isCurrentDecision()) return false;
        // Keep the exact validated artifact available until the restore has a
        // terminal outcome. A retry must not re-read a file that may change.
        service.deferredImportContent = { content, fileName };

        // request() proves a missing listener before dispatch. Once a restore
        // responder is present, a rejection or malformed reply cannot prove
        // that the handler made no durable change.
        const restoreResponderAvailable =
          service.eventBus?.hasListeners("rpc:project:restore-from-content") ===
          true;
        let restoreResult;
        try {
          console.log("[SyncService] invoking project:restore-from-content", {
            size: content.length,
          });
          restoreResult = await service.invokeRequest(
            "project:restore-from-content",
            { content, fileName },
            0,
          );
        } catch (error) {
          if (ownsDecision() && restoreResponderAvailable) {
            service.deferredImportContent = null;
            service.awaitingSyncDecisionApply = false;
          }
          if (!isCurrentDecision()) return false;
          retainDecision = !restoreResponderAvailable;
          showRestoreToast(
            service,
            service.i18n.t("failed_to_import_project", {
              error: getErrorMessage(error),
            }),
            "error",
          );
          console.log(
            retainDecision
              ? "[SyncService] retained pre-dispatch import for explicit retry"
              : "[SyncService] closed indeterminate restore rejection",
          );
          return false;
        }
        const outcome = classifyProjectRestoreResult(restoreResult);
        if (ownsDecision())
          rememberRestoreAcknowledgement(service, restoreResult, outcome);
        if (!isCurrentDecision()) return false;
        console.log("[SyncService] project restore outcome", outcome.kind);
        if (outcome.kind === "success") {
          showRestoreToast(
            service,
            service.i18n.t("project_imported_from_sync_folder"),
            "success",
          );
          return true;
        } else {
          if (outcome.kind === "activation-retryable-failure") {
            service.pendingRestoreActivationReceipt = outcome.receipt;
            service.deferredImportContent = null;
            retainDecision = true;
          } else {
            retainDecision = outcome.kind === "retryable-failure";
          }
          showRestoreToast(
            service,
            service.i18n.t("failed_to_import_project", {
              error: getRestoreFailureDetail(service, outcome),
            }),
            "error",
          );
        }
      } catch (error) {
        if (!isCurrentDecision()) return false;
        service.ui?.showToast(
          service.i18n.t("failed_to_import_project", {
            error: getErrorMessage(error),
          }),
          "error",
        );
      }
    } else {
      try {
        if (!directory) return false;
        const result = await service.invokeRequest(
          "export:sync-to-folder",
          { dirHandle: directory.raw },
          0,
        );
        if (result !== undefined) {
          throw new TypeError("invalid_sync_export_response");
        }
        if (!isCurrentDecision()) return false;
        console.log("[SyncService] overwrite: export:sync-to-folder completed");
        service.ui?.showToast(
          service.i18n.t("project_synced_successfully"),
          "success",
        );
        return true;
      } catch (error) {
        if (!isCurrentDecision()) return false;
        service.ui?.showToast(
          service.i18n.t("failed_to_sync_project", {
            error: getErrorMessage(error),
          }),
          "error",
        );
      }
    }
    return false;
  } finally {
    if (ownsDecision()) {
      if (!isCurrentDecision() || (action === "import" && retainDecision)) {
        service._syncDecisionApplyInFlight = false;
        console.log("[SyncService] pending sync restore retained");
      } else {
        service.clearPendingSyncDecision();
        console.log("[SyncService] consumed pending sync decision");
      }
    }
  }
}

/** Existing manual action may resume admitted import work, never export stale state.
 * @param {import('./SyncService.js').default} service
 * @param {string} source
 * @returns {Promise<import('../../types/rpc/application.js').SyncProjectResult | null>}
 */
export async function resumePendingSyncImport(service, source) {
  if (service.pendingSyncAction !== "import") return null;
  const failed = () => pendingSyncImportFailure(service);
  if (
    source !== "manual" ||
    !service.awaitingSyncDecisionApply ||
    !service._syncDecisionClaimed ||
    service._syncDecisionApplyInFlight ||
    (!service.deferredImportContent && !service.pendingRestoreActivationReceipt)
  )
    return failed();
  const generation = service._syncDecisionGeneration;
  const folderGeneration = service._folderSelectionGeneration;
  const applied = await service.applyPendingSyncDecision();
  if (
    !applied ||
    service.destroyed ||
    service._folderSelectionGeneration !== folderGeneration ||
    service.pendingSyncAction !== null ||
    service._syncDecisionGeneration !== generation + 1
  )
    return failed();
  return { success: true };
}

/** @param {import('./SyncService.js').default} service
 * @returns {Extract<import('../../types/rpc/application.js').SyncProjectResult, {error: 'failed_to_sync_project'}>}
 */
export function pendingSyncImportFailure(service) {
  return {
    success: false,
    error: "failed_to_sync_project",
    params: { error: service.i18n.t("failed_to_load_profile_data") },
  };
}
