import { probeSyncProjectFile } from "./syncFolderBoundary.js";

/** @param {unknown} error */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
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
  service._syncDecisionApplyInFlight = true;
  const isCurrentDecision = () =>
    !service.destroyed &&
    service._syncDecisionApplyInFlight &&
    service._syncDecisionGeneration === decisionGeneration;

  try {
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
    const handle = loaded.value.raw;
    console.log("[SyncService] applying pending action", { action });

    if (action === "import") {
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
          const probe = await probeSyncProjectFile(loaded.value);
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

        try {
          console.log("[SyncService] invoking project:restore-from-content", {
            size: content.length,
          });
          const result = await service.invokeRequest(
            "project:restore-from-content",
            { content, fileName },
          );
          if (!isCurrentDecision()) return;
          console.log(
            "[SyncService] project:restore-from-content result",
            result,
          );
          if (!result?.success) {
            const errMsg = result?.error || "Unknown error";
            service.ui?.showToast(
              service.i18n.t("failed_to_import_project", { error: errMsg }),
              "error",
            );
          } else {
            service.deferredImportContent = null;
            service.ui?.showToast(
              service.i18n.t("project_imported_from_sync_folder"),
              "success",
            );
          }
        } catch {
          if (!isCurrentDecision()) return;
          // Handler may not be ready yet – defer until app is ready.
          service.deferredImportContent = { content, fileName };
          console.log("[SyncService] deferring import until sto-app-ready");
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
        await service.invokeRequest("export:sync-to-folder", {
          dirHandle: handle,
        });
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
      service._syncDecisionGeneration += 1;
      service._syncDecisionApplyInFlight = false;
      service.pendingSyncAction = null;
      service.awaitingSyncDecisionApply = false;
      console.log("[SyncService] consumed pending sync decision");
    }
  }
}
