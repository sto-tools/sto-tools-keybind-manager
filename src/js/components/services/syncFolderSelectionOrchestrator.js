import {
  decodeSyncDirectoryCapability,
  decodeSyncDirectoryPermissionEffects,
  ensureSyncDirectoryPermission,
  probeSyncProjectFile,
} from "./syncFolderBoundary.js";

/** @param {unknown} error */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {import('./SyncService.js').default} service
 * @param {string} key
 */
function translatedError(service, key) {
  return new Error(service.i18n.t(key));
}

/**
 * Decode and permission-check a browser-owned directory capability without
 * allowing its raw shape to leak into selection orchestration.
 *
 * @param {import('./SyncService.js').default} service
 * @param {unknown} raw
 */
async function prepareDirectory(service, raw) {
  const decoded = decodeSyncDirectoryCapability(raw);
  if (!decoded.success) {
    throw translatedError(service, "sync_folder_capability_invalid");
  }

  const permissionEffects = decodeSyncDirectoryPermissionEffects(raw);
  if (!permissionEffects.success) {
    throw translatedError(service, "sync_folder_permission_check_failed");
  }
  const permission = await ensureSyncDirectoryPermission(
    permissionEffects.value,
    "readwrite",
  );
  if (!permission.success) {
    if (permission.error === "permission_denied") {
      throw translatedError(service, "permission_denied_to_folder");
    }
    console.error("[SyncService] folder permission check failed", permission);
    throw translatedError(service, "sync_folder_permission_check_failed");
  }
  return decoded.value;
}

/**
 * @param {import('./SyncService.js').default} service
 * @param {import('../../types/sync-boundary.js').SyncProjectProbeResult} probe
 * @param {import('./serviceTypes.js').AppWindow} appWindow
 * @param {() => boolean} isCurrentSelection
 * @returns {Promise<
 *   | { accepted: false }
 *   | { accepted: true, action: 'import' | 'overwrite' | null, deferredContent: { content: string, fileName: string } | null }
 * >}
 */
async function chooseProjectAction(
  service,
  probe,
  appWindow,
  isCurrentSelection,
) {
  if (probe.success && probe.state === "absent") {
    return { accepted: true, action: null, deferredContent: null };
  }

  const invalidProject =
    !probe.success &&
    (probe.error === "invalid_project" ||
      probe.error === "project_file_too_large");
  if (!probe.success && !invalidProject) {
    if (probe.error === "project_file_access_denied") {
      throw translatedError(service, "permission_denied_to_folder");
    }
    if (probe.error === "invalid_project_file_capability") {
      throw translatedError(service, "sync_folder_capability_invalid");
    }
    console.error("[SyncService] project.json probe failed", probe);
    throw translatedError(service, "sync_folder_project_read_failed");
  }

  const confirm = appWindow.confirmDialog?.confirm;
  if (typeof confirm !== "function") {
    throw translatedError(service, "sync_folder_confirmation_unavailable");
  }

  if (probe.success) {
    const doImport = await confirm.call(
      appWindow.confirmDialog,
      service.i18n.t("sync_folder_contains_project_prompt"),
      service.i18n.t("sync_folder_contains_project_title"),
      "warning",
      "syncImportProject",
    );
    if (!isCurrentSelection()) return { accepted: false };
    if (doImport) {
      return {
        accepted: true,
        action: "import",
        deferredContent: {
          content: probe.content,
          fileName: probe.fileName,
        },
      };
    }
  }

  const confirmOverwrite = await confirm.call(
    appWindow.confirmDialog,
    service.i18n.t(
      invalidProject
        ? "sync_invalid_project_overwrite_prompt"
        : "sync_overwrite_existing_prompt",
    ),
    service.i18n.t("sync_overwrite_existing_title"),
    "warning",
    "syncOverwriteProject",
  );
  if (!isCurrentSelection()) return { accepted: false };
  if (confirmOverwrite) {
    return { accepted: true, action: "overwrite", deferredContent: null };
  }

  service.ui?.showToast(service.i18n.t("sync_operation_cancelled"), "info");
  return { accepted: false };
}

/**
 * Restore the exact prior capability after a failed half of the cross-store
 * saga. IndexedDB and localStorage cannot share a transaction, so this is
 * deliberately described as compensation rather than atomicity.
 *
 * @param {import('./SyncService.js').default} service
 * @param {{ handle: unknown | null, transitionPending: boolean }} previousState
 * @param {unknown} primaryError
 */
async function compensateTransition(service, previousState, primaryError) {
  try {
    await service.fs.restoreSyncDirectoryState(previousState);
  } catch (compensationError) {
    console.error("[SyncService] sync folder compensation failed", {
      primaryError,
      compensationError,
    });
    throw translatedError(service, "sync_folder_compensation_failed");
  }
}

/**
 * @param {import('./SyncService.js').default} service
 * @param {import('../../types/sync-boundary.js').SyncDirectoryCapability} directory
 * @param {boolean} autoSync
 * @param {{ accepted: true, action: 'import' | 'overwrite' | null, deferredContent: { content: string, fileName: string } | null }} decision
 * @param {() => boolean} isCurrentSelection
 */
async function commitFolderSelection(
  service,
  directory,
  autoSync,
  decision,
  isCurrentSelection,
) {
  return service.runFolderCapabilityOperation(async () => {
    if (!isCurrentSelection()) return null;

    const previousState = await service.fs.getSyncDirectoryState();
    if (!isCurrentSelection()) return null;

    const rawHandle = directory.raw;
    await service.fs.beginSyncDirectoryTransition(rawHandle);

    if (!isCurrentSelection()) {
      await compensateTransition(
        service,
        previousState,
        "selection superseded",
      );
      return null;
    }

    /** @type {unknown} */
    let settingsFailure = null;
    let settingsPersisted = false;
    try {
      settingsPersisted =
        (await service.request("preferences:persist-sync-folder-settings", {
          syncFolderName: directory.name,
          syncFolderPath: `Selected folder: ${directory.name}`,
          syncFolderFallback: false,
          autoSync,
        })) === true;
      if (!settingsPersisted) {
        settingsFailure = translatedError(service, "storage_write_failed");
      }
    } catch (error) {
      settingsFailure = error;
    }

    if (!settingsPersisted) {
      await compensateTransition(service, previousState, settingsFailure);
      throw settingsFailure;
    }

    // A successful owner mutation and handle write form a coherent baseline,
    // even if a newer selection started while the owner request was in flight.
    try {
      await service.fs.completeSyncDirectoryTransition();
    } catch (error) {
      console.error(
        "[SyncService] sync folder transition finalization failed",
        error,
      );
      throw translatedError(service, "sync_folder_transition_incomplete");
    }
    service.clearPendingSyncDecision();
    if (!isCurrentSelection()) return null;

    service.stagePendingSyncDecision(decision.action, decision.deferredContent);
    if (!decision.action) {
      service.ui?.showToast(service.i18n.t("sync_folder_set"), "success");
    }
    await service.emit(
      "sync:folder-set",
      { handle: rawHandle },
      { synchronous: true },
    );
    return rawHandle;
  });
}

/**
 * Run the browser-facing folder selection workflow for the lifecycle-owning
 * SyncService facade.
 *
 * @param {import('./SyncService.js').default} service
 * @param {unknown} autoSync
 * @returns {Promise<import('../../types/sync-boundary.js').SyncDirectoryHandle | null>}
 */
export async function selectSyncFolder(service, autoSync = false) {
  const selectionGeneration = ++service._folderSelectionGeneration;
  const isCurrentSelection = () =>
    !service.destroyed &&
    service._folderSelectionGeneration === selectionGeneration;
  const enabled = autoSync === true;

  try {
    console.log("[SyncService] setSyncFolder called", { autoSync: enabled });
    const appWindow = /** @type {import('./serviceTypes.js').AppWindow} */ (
      window
    );

    if (service.isFirefox()) {
      service.ui?.showToast(
        service.i18n.t("sync_not_supported_firefox"),
        "error",
      );
      if (appWindow.confirmDialog) {
        await appWindow.confirmDialog.inform(
          service.i18n.t("sync_not_supported_detailed"),
          service.i18n.t("sync_not_supported_title"),
          "info",
          "syncNotSupported",
        );
      }
      return null;
    }

    if (!service.isSecureContext()) {
      service.ui?.showToast(
        service.i18n.t("sync_not_supported_secure_context"),
        "error",
      );
      if (appWindow.confirmDialog) {
        await appWindow.confirmDialog.inform(
          service.i18n.t("sync_not_supported_secure_context_detailed"),
          service.i18n.t("sync_not_supported_secure_context_title"),
          "info",
          "syncSecureContext",
        );
      }
      return null;
    }

    if (typeof appWindow.showDirectoryPicker !== "function") {
      service.ui?.showToast(
        service.i18n.t("sync_not_supported_browser"),
        "error",
      );
      if (appWindow.confirmDialog) {
        await appWindow.confirmDialog.inform(
          service.i18n.t("sync_not_supported_browser_detailed"),
          service.i18n.t("sync_not_supported_browser_title"),
          "info",
          "syncNotSupportedBrowser",
        );
      }
      return null;
    }

    const rawHandle = await appWindow.showDirectoryPicker();
    if (!isCurrentSelection()) return null;
    const directory = await prepareDirectory(service, rawHandle);
    if (!isCurrentSelection()) return null;

    const probe = await probeSyncProjectFile(directory);
    if (!isCurrentSelection()) return null;
    const decision = await chooseProjectAction(
      service,
      probe,
      appWindow,
      isCurrentSelection,
    );
    if (!decision.accepted || !isCurrentSelection()) return null;

    console.log("[SyncService] setSyncFolder: directory accepted", {
      folderName: directory.name,
      pending: decision.action,
    });
    return await commitFolderSelection(
      service,
      directory,
      enabled,
      decision,
      isCurrentSelection,
    );
  } catch (error) {
    if (!isCurrentSelection()) return null;
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      console.error("[SyncService] setSyncFolder failed", error);
      service.ui?.showToast(
        service.i18n.t("failed_to_set_sync_folder", {
          error: getErrorMessage(error),
        }),
        "error",
      );
    }
    return null;
  }
}
