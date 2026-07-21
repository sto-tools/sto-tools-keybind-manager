import { probeSyncProjectFile } from "./syncFolderBoundary.js";
import {
  classifyDataReloadResult,
  classifyProjectRestoreResult,
} from "./projectRestoreResult.js";

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
  return result.reason ?? service.i18n.t(result.error, result.params);
}

/**
 * @param {import('./SyncService.js').default} service
 * @param {ReturnType<typeof classifyDataReloadResult>} result
 */
function getActivationFailureDetail(service, result) {
  if (result.kind === "failure") {
    return result.error === "operation_cancelled"
      ? service.i18n.t("failed_to_load_profile_data")
      : service.i18n.t(result.error);
  }
  return service.i18n.t("import_failed", {
    error: service.i18n.t("failed_to_load_profile_data"),
  });
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
    return;
  }

  const decisionGeneration = service._syncDecisionGeneration;
  const deferredContent = service.deferredImportContent
    ? { ...service.deferredImportContent }
    : null;
  const activationReceipt = service.pendingRestoreActivationReceipt
    ? {
        currentProfile: service.pendingRestoreActivationReceipt.currentProfile,
        imported: { ...service.pendingRestoreActivationReceipt.imported },
      }
    : null;
  const retainedRestoreWork =
    action === "import" &&
    service._syncDecisionClaimed &&
    (deferredContent !== null || activationReceipt !== null);
  service._syncDecisionApplyInFlight = true;
  service._syncDecisionClaimed = true;
  let retainDecision = false;
  const isCurrentDecision = () =>
    !service.destroyed &&
    service._syncDecisionApplyInFlight &&
    service._syncDecisionGeneration === decisionGeneration;

  try {
    /** @type {import('../../types/sync-boundary.js').SyncDirectoryCapability | null} */
    let directory = null;
    if (!retainedRestoreWork) {
      const loaded = await service.loadSyncFolderCapability();
      if (!isCurrentDecision()) return;
      if (!loaded.success) {
        showDecisionFailure(service, action, loaded.error);
        return;
      }
      if (loaded.state === "missing") {
        showDecisionFailure(service, action, "no_sync_folder_selected");
        return;
      }
      const permission = await service.checkSyncFolderPermission(
        loaded.value.raw,
      );
      if (!isCurrentDecision()) return;
      if (!permission.success) {
        showDecisionFailure(
          service,
          action,
          permission.error === "permission_denied"
            ? "permission_denied_to_folder"
            : "sync_folder_permission_check_failed",
        );
        return;
      }
      directory = loaded.value;
    }
    console.log("[SyncService] applying pending action", { action });

    if (action === "import") {
      if (activationReceipt) {
        let reloadResult;
        try {
          const reload = await service.invokeRequest(
            "data:reload-state",
            undefined,
            0,
          );
          if (!isCurrentDecision()) return;
          reloadResult = classifyDataReloadResult(reload);
        } catch (error) {
          if (!isCurrentDecision()) return;
          retainDecision = true;
          showRestoreToast(
            service,
            service.i18n.t("failed_to_import_project", {
              error: getErrorMessage(error),
            }),
            "error",
          );
          return;
        }

        if (reloadResult.kind === "success") {
          showRestoreToast(
            service,
            service.i18n.t("project_imported_from_sync_folder"),
            "success",
          );
        } else {
          retainDecision = true;
          showRestoreToast(
            service,
            service.i18n.t("failed_to_import_project", {
              error: getActivationFailureDetail(service, reloadResult),
            }),
            "error",
          );
        }
        return;
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
          if (!directory) return;
          const probe = await probeSyncProjectFile(directory);
          if (!isCurrentDecision()) return;
          if (!probe.success) {
            service.ui?.showToast(
              service.i18n.t("failed_to_import_project", {
                error: getProbeFailureDetail(service, probe),
              }),
              "error",
            );
            return;
          }
          if (probe.state === "absent") {
            showDecisionFailure(service, action, "sync_project_file_missing");
            return;
          }
          content = probe.content;
          fileName = probe.fileName;
        }

        if (!isCurrentDecision()) return;
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
          if (!isCurrentDecision()) return;
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
          return;
        }
        if (!isCurrentDecision()) return;
        const outcome = classifyProjectRestoreResult(restoreResult);
        console.log("[SyncService] project restore outcome", outcome.kind);
        if (outcome.kind === "success") {
          showRestoreToast(
            service,
            service.i18n.t("project_imported_from_sync_folder"),
            "success",
          );
        } else {
          if (outcome.kind === "activation-retryable-failure") {
            service.pendingRestoreActivationReceipt = outcome.receipt;
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
        if (!isCurrentDecision()) return;
        service.ui?.showToast(
          service.i18n.t("failed_to_import_project", {
            error: getErrorMessage(error),
          }),
          "error",
        );
      }
    } else {
      try {
        if (!directory) return;
        await service.invokeRequest(
          "export:sync-to-folder",
          { dirHandle: directory.raw },
          0,
        );
        if (!isCurrentDecision()) return;
        console.log("[SyncService] overwrite: export:sync-to-folder completed");
        service.ui?.showToast(
          service.i18n.t("project_synced_successfully"),
          "success",
        );
      } catch (error) {
        if (!isCurrentDecision()) return;
        service.ui?.showToast(
          service.i18n.t("failed_to_sync_project", {
            error: getErrorMessage(error),
          }),
          "error",
        );
      }
    }
  } finally {
    if (isCurrentDecision()) {
      if (action === "import" && retainDecision) {
        service._syncDecisionApplyInFlight = false;
        console.log("[SyncService] pending sync restore retained");
      } else {
        service.clearPendingSyncDecision();
        console.log("[SyncService] consumed pending sync decision");
      }
    }
  }
}
