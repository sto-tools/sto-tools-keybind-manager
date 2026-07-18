/** @param {unknown} error */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
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
    const handle = await service.getSyncFolderHandle();
    if (!isCurrentDecision() || !handle) return;
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
          const fileHandle = await handle.getFileHandle("project.json", {
            create: false,
          });
          if (!isCurrentDecision()) return;
          const file = await fileHandle.getFile();
          if (!isCurrentDecision()) return;
          content = await file.text();
          if (!isCurrentDecision()) return;
          fileName = "project.json";
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
