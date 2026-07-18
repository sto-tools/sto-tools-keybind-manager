import ComponentBase from "../ComponentBase.js";

import FileSystemService, {
  writeFile as fsWriteFile,
  KEY_SYNC_FOLDER,
} from "./FileSystemService.js";
import { applyPendingSyncDecision as applyClaimedSyncDecision } from "./syncDecisionOrchestrator.js";

// Re-export the helper so existing imports (especially tests) continue to work
export const writeFile = fsWriteFile;

/** @param {unknown} error */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export default class SyncService extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus, ui?: import('./serviceTypes.js').ToastUI, fs?: import('./serviceTypes.js').FileSystem, i18n?: import('./serviceTypes.js').I18n }} [options] */
  constructor({ eventBus, ui, fs, i18n } = {}) {
    super(eventBus);
    this.componentName = "SyncService";

    this.ui = ui;
    this.i18n =
      i18n ??
      /** @type {import('./serviceTypes.js').I18n} */ ({
        t: (key) => key,
      });
    this.fs = fs || new FileSystemService({ eventBus });
    this.awaitingSyncDecisionApply = false;
    /** @type {'import' | 'overwrite' | null} */
    this.pendingSyncAction = null;
    /** @type {{ content: string, fileName: string } | null} */
    this.deferredImportContent = null;
    this._syncDecisionGeneration = 0;
    this._syncDecisionApplyInFlight = false;
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._modalCloseTimeout = null;
    this._folderSelectionGeneration = 0;
    /** @type {Promise<void>} */
    this._folderHandleWriteTail = Promise.resolve();
    console.log("[SyncService] constructed");

    // Indirection for request calls (simplifies testing)
    this.invokeRequest =
      /** @type {import('../../types/rpc/index.js').RpcRequester} */ (
        this.request.bind(this)
      );

    // Ensure FileSystemService instance
    if (!this.fs) this.fs = new FileSystemService({ eventBus });
  }

  onInit() {
    this.setupRequestHandlers();
    this.setupEventListeners();
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    this._responseDetachFunctions.push(
      this.respond(
        "sync:sync-project",
        ({ source } = /** @type {{ source?: string }} */ ({})) =>
          this.syncProject(source),
      ),
    );
  }

  setupEventListeners() {
    if (!this.eventBus) return;

    // Handle deferred import/overwrite on preferences save/cancel
    this.addEventListener("preferences:saved", () =>
      this.applyPendingSyncDecision(),
    );

    this.addEventListener("modal:hidden", ({ modalId }) => {
      console.log("[SyncService] modal:hidden received", {
        modalId,
        awaiting: this.awaitingSyncDecisionApply,
        pending: this.pendingSyncAction,
      });
      if (modalId !== "preferencesModal") return;
      // Defer clearing to allow preferences:saved to fire first, if it will
      if (this._modalCloseTimeout !== null) {
        clearTimeout(this._modalCloseTimeout);
      }
      this._modalCloseTimeout = setTimeout(() => {
        this._modalCloseTimeout = null;
        if (this.awaitingSyncDecisionApply) {
          // Preferences were closed without save – invalidate the complete
          // decision, including content that must not reach sto-app-ready.
          this.clearPendingSyncDecision();
          console.log(
            "[SyncService] preferences modal closed without save; pending cleared (deferred)",
          );
        }
      }, 0);
    });

    // Handle deferred import once the app is fully initialized
    this.addEventListener("sto-app-ready", async () => {
      console.log(
        "[SyncService] sto-app-ready received; checking deferred import",
        { hasDeferred: !!this.deferredImportContent },
      );
      if (!this.deferredImportContent) return;
      const { content, fileName } = this.deferredImportContent;
      this.deferredImportContent = null;
      try {
        const result = await this.invokeRequest(
          "project:restore-from-content",
          { content, fileName },
        );
        console.log(
          "[SyncService] deferred project:restore-from-content result",
          result,
        );
        if (!result?.success) {
          const errMsg = result?.error || "Unknown error";
          this.ui?.showToast(
            this.i18n.t("failed_to_import_project", { error: errMsg }),
            "error",
          );
        }
      } catch (e) {
        this.ui?.showToast(
          this.i18n.t("failed_to_import_project", {
            error: getErrorMessage(e),
          }),
          "error",
        );
      }
    });
  }

  clearPendingSyncDecision() {
    this._syncDecisionGeneration += 1;
    this._syncDecisionApplyInFlight = false;
    this.pendingSyncAction = null;
    this.awaitingSyncDecisionApply = false;
    this.deferredImportContent = null;
  }

  /**
   * @param {'import' | 'overwrite' | null} action
   * @param {{ content: string, fileName: string } | null} deferredContent
   */
  stagePendingSyncDecision(action, deferredContent) {
    this._syncDecisionGeneration += 1;
    this._syncDecisionApplyInFlight = false;
    this.pendingSyncAction = action;
    this.awaitingSyncDecisionApply = action !== null;
    this.deferredImportContent = deferredContent;
  }

  async applyPendingSyncDecision() {
    return applyClaimedSyncDecision(this);
  }

  // Browser detection utilities
  isFirefox() {
    // Check if the browser is Firefox
    return (
      typeof navigator !== "undefined" &&
      /firefox/i.test(navigator.userAgent) &&
      !/seamonkey/i.test(navigator.userAgent)
    );
  }

  isSecureContext() {
    // Check if the current context is secure (HTTPS, file://, localhost)
    if (typeof window === "undefined") return false;

    // Use the browser's built-in secure context check first
    if (window.isSecureContext !== undefined) {
      return window.isSecureContext;
    }

    // Fallback: check protocol and hostname
    const protocol = window.location?.protocol;
    const hostname = window.location?.hostname;

    return (
      protocol === "https:" ||
      protocol === "file:" ||
      protocol === "chrome-extension:" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      (hostname && hostname.endsWith(".localhost"))
    );
  }

  /**
   * Serialize capability writes in selection order. A newer selection can
   * start while an older IndexedDB transaction is already in flight; the
   * newer handle must be the last durable write even though the older browser
   * transaction cannot be cancelled.
   * @param {FileSystemDirectoryHandle} handle
   * @param {() => boolean} isCurrentSelection
   */
  async persistSelectedFolderHandle(handle, isCurrentSelection) {
    const previousWrite = this._folderHandleWriteTail;
    /** @type {() => void} */
    let releaseWrite = () => {};
    this._folderHandleWriteTail = new Promise((resolve) => {
      releaseWrite = resolve;
    });

    await previousWrite;
    try {
      if (!isCurrentSelection()) return false;
      await this.fs.saveDirectoryHandle(KEY_SYNC_FOLDER, handle);
      return isCurrentSelection();
    } finally {
      releaseWrite();
    }
  }

  // Set sync folder and optionally enable auto-sync
  async setSyncFolder(autoSync = false) {
    const selectionGeneration = ++this._folderSelectionGeneration;
    const isCurrentSelection = () =>
      !this.destroyed &&
      this._folderSelectionGeneration === selectionGeneration;
    try {
      console.log("[SyncService] setSyncFolder called", { autoSync });
      let handle, folderName;
      /** @type {'import' | 'overwrite' | null} */
      let nextPendingSyncAction = null;
      /** @type {{ content: string, fileName: string } | null} */
      let nextDeferredImportContent = null;
      const appWindow = /** @type {import('./serviceTypes.js').AppWindow} */ (
        window
      );

      // Implement proper decision tree for browser capability and security context
      if (this.isFirefox()) {
        // Firefox: File System Access API not supported regardless of protocol
        this.ui?.showToast(this.i18n.t("sync_not_supported_firefox"), "error");

        // Show a more detailed explanation using inform dialog (OK button only)
        if (appWindow.confirmDialog) {
          await appWindow.confirmDialog.inform(
            this.i18n.t("sync_not_supported_detailed"),
            this.i18n.t("sync_not_supported_title"),
            "info",
            "syncNotSupported",
          );
        }

        return null;
      }

      // Non-Firefox browsers: Check security context
      if (!this.isSecureContext()) {
        // Insecure context (HTTP) - show specific secure context error
        this.ui?.showToast(
          this.i18n.t("sync_not_supported_secure_context"),
          "error",
        );

        // Show detailed explanation about secure context requirement
        if (appWindow.confirmDialog) {
          await appWindow.confirmDialog.inform(
            this.i18n.t("sync_not_supported_secure_context_detailed"),
            this.i18n.t("sync_not_supported_secure_context_title"),
            "info",
            "syncSecureContext",
          );
        }

        return null;
      }

      // Secure context: Check API availability and proceed
      if (appWindow.showDirectoryPicker) {
        handle = await appWindow.showDirectoryPicker();
        if (!isCurrentSelection()) return null;
        const handlePersisted = await this.persistSelectedFolderHandle(
          handle,
          isCurrentSelection,
        );
        if (!handlePersisted) return null;
        // Any older decision referred to the previously persisted handle. Once
        // this capability is replaced it must never be replayed against the new
        // directory, even if the later settings write fails.
        this.clearPendingSyncDecision();
        folderName = handle.name;
        console.log("[SyncService] setSyncFolder: directory selected", {
          folderName,
        });
      } else {
        // Unexpected case: Non-Firefox browser without API support in secure context
        this.ui?.showToast(this.i18n.t("sync_not_supported_browser"), "error");

        if (appWindow.confirmDialog) {
          await appWindow.confirmDialog.inform(
            this.i18n.t("sync_not_supported_browser_detailed"),
            this.i18n.t("sync_not_supported_browser_title"),
            "info",
            "syncNotSupportedBrowser",
          );
        }

        return null;
      }

      // Check for existing project.json immediately on folder selection. Keep
      // the decision local until the folder settings are durably accepted so a
      // failed write cannot arm a later preferences:saved action.
      try {
        const existingHandle = await handle.getFileHandle("project.json", {
          create: false,
        });
        if (!isCurrentSelection()) return null;
        if (existingHandle && appWindow.confirmDialog) {
          const file = await existingHandle.getFile();
          if (!isCurrentSelection()) return null;
          const content = await file.text();
          if (!isCurrentSelection()) return null;
          const title = this.i18n.t("sync_folder_contains_project_title");
          const message = this.i18n.t("sync_folder_contains_project_prompt");
          const doImport = await appWindow.confirmDialog.confirm(
            message,
            title,
            "warning",
            "syncImportProject",
          );
          if (!isCurrentSelection()) return null;
          if (doImport) {
            nextPendingSyncAction = "import";
            console.log("[SyncService] setSyncFolder: user chose IMPORT");
            // Stash content to avoid re-reading on save.
            nextDeferredImportContent = {
              content,
              fileName: "project.json",
            };
          } else {
            const overwriteTitle = this.i18n.t("sync_overwrite_existing_title");
            const overwriteMsg = this.i18n.t("sync_overwrite_existing_prompt");
            const confirmOverwrite = await appWindow.confirmDialog.confirm(
              overwriteMsg,
              overwriteTitle,
              "warning",
              "syncOverwriteProject",
            );
            if (!isCurrentSelection()) return null;
            if (confirmOverwrite) {
              nextPendingSyncAction = "overwrite";
              console.log("[SyncService] setSyncFolder: user chose OVERWRITE");
            } else {
              this.ui?.showToast(
                this.i18n.t("sync_operation_cancelled"),
                "info",
              );
              console.log("[SyncService] setSyncFolder: user CANCELLED");
            }
          }
        }
      } catch {
        if (!isCurrentSelection()) return null;
        // No existing project.json – nothing to do
        console.log(
          "[SyncService] setSyncFolder: no existing project.json found",
        );
      }

      if (!isCurrentSelection()) return null;
      const settingsPersisted = await this.request(
        "preferences:persist-sync-folder-settings",
        {
          syncFolderName: folderName,
          syncFolderPath: `Selected folder: ${folderName}`,
          syncFolderFallback: false,
          autoSync,
        },
      );
      if (!isCurrentSelection()) return null;
      if (!settingsPersisted) {
        throw new Error(this.i18n.t("storage_write_failed"));
      }
      console.log("[SyncService] setSyncFolder: settings saved");

      this.stagePendingSyncDecision(
        nextPendingSyncAction,
        nextDeferredImportContent,
      );
      if (nextPendingSyncAction) {
        console.log("[SyncService] setSyncFolder: pending action recorded", {
          pending: nextPendingSyncAction,
        });
      } else {
        this.ui?.showToast(this.i18n.t("sync_folder_set"), "success");
      }
      await this.emit("sync:folder-set", { handle }, { synchronous: true });
      return handle;
    } catch (err) {
      if (!isCurrentSelection()) return null;
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        this.ui?.showToast(
          this.i18n.t("failed_to_set_sync_folder", {
            error: getErrorMessage(err),
          }),
          "error",
        );
      }
      return null;
    }
  }

  async getSyncFolderHandle() {
    try {
      return await this.fs.getDirectoryHandle(KEY_SYNC_FOLDER);
    } catch (err) {
      console.error("[SyncService] getSyncFolderHandle failed", err);
      return null;
    }
  }

  /** @param {FileSystemDirectoryHandle | null | undefined} handle */
  async ensurePermission(handle) {
    if (!handle) return false;
    try {
      const opts = { mode: "readwrite" };
      // Permission methods are implemented by File System Access API handles,
      // but are not yet included in every TypeScript DOM library release.
      const queryPermission = Reflect.get(handle, "queryPermission");
      if (typeof queryPermission !== "function") return false;
      const perm = await queryPermission.call(handle, opts);
      if (perm === "granted") return true;
      const requestPermission = Reflect.get(handle, "requestPermission");
      if (typeof requestPermission !== "function") return false;
      const req = await requestPermission.call(handle, opts);
      return req === "granted";
    } catch (err) {
      console.error("[SyncService] ensurePermission failed", err);
      return false;
    }
  }

  /**
   * @param {string} [source]
   * @returns {Promise<import('../../types/rpc/application.js').SyncProjectResult>}
   */
  async syncProject(source = "auto") {
    // Apply the same browser and context detection logic as setSyncFolder
    console.log("[SyncService] syncProject called", { source });
    if (this.isFirefox()) {
      // Firefox: File System Access API not supported regardless of protocol
      this.ui?.showToast(this.i18n.t("sync_not_supported_firefox"), "warning");
      return { success: false, error: "sync_not_supported_firefox" };
    }

    // Non-Firefox browsers: Check security context
    if (!this.isSecureContext()) {
      // Insecure context (HTTP) - show specific secure context error
      this.ui?.showToast(
        this.i18n.t("sync_not_supported_secure_context"),
        "warning",
      );
      return { success: false, error: "sync_not_supported_secure_context" };
    }

    // Secure context: Check if sync folder exists
    const handle = await this.getSyncFolderHandle();
    if (!handle) {
      this.ui?.showToast(this.i18n.t("no_sync_folder_selected"), "warning");
      return { success: false, error: "no_sync_folder_selected" };
    }
    const allowed = await this.ensurePermission(handle);
    if (!allowed) {
      this.ui?.showToast(this.i18n.t("permission_denied_to_folder"), "error");
      return { success: false, error: "permission_denied_to_folder" };
    }
    try {
      // Proceed with sync without interactive prompts
      // Use request/response system instead of global window.stoExport
      await this.invokeRequest("export:sync-to-folder", { dirHandle: handle });
      console.log("[SyncService] export:sync-to-folder completed");

      // Determine when to show success toast:
      // - Always show on manual sync (sync now button)
      // - Show on time-based auto sync (e.g., "every 30 seconds")
      // - Don't show on change-based auto sync ("after every change")
      const prefs = this.cache.preferences;
      const isAutoSyncEnabled = prefs.autoSync;
      const autoSyncInterval = prefs.autoSyncInterval || "change";
      const isChangeBasedAutoSync =
        isAutoSyncEnabled && autoSyncInterval === "change";
      const shouldShowToast =
        source === "manual" || (source === "auto" && !isChangeBasedAutoSync);

      if (shouldShowToast) {
        this.ui?.showToast(
          this.i18n.t("project_synced_successfully"),
          "success",
        );
      }

      return { success: true };
    } catch (err) {
      const error = getErrorMessage(err);
      this.ui?.showToast(
        this.i18n.t("failed_to_sync_project", { error }),
        "error",
      );
      return {
        success: false,
        error: "failed_to_sync_project",
        params: { error },
      };
    }
  }

  onDestroy() {
    this._folderSelectionGeneration += 1;
    this._responseDetachFunctions.splice(0).forEach((detach) => detach());
    if (this._modalCloseTimeout !== null) {
      clearTimeout(this._modalCloseTimeout);
      this._modalCloseTimeout = null;
    }
    this.clearPendingSyncDecision();
  }
}
