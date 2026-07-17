import ComponentBase from "../ComponentBase.js";

import FileSystemService, {
  writeFile as fsWriteFile,
  KEY_SYNC_FOLDER,
} from "./FileSystemService.js";

// Re-export the helper so existing imports (especially tests) continue to work
export const writeFile = fsWriteFile;

/** @param {unknown} error */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export default class SyncService extends ComponentBase {
  /** @param {{ eventBus?: import('./serviceTypes.js').EventBus, storage?: import('./serviceTypes.js').Storage, ui?: import('./serviceTypes.js').ToastUI, fs?: import('./serviceTypes.js').FileSystem, i18n?: import('./serviceTypes.js').I18n }} [options] */
  constructor({ eventBus, storage, ui, fs, i18n } = {}) {
    super(eventBus);
    this.componentName = "SyncService";

    this.storage = storage;
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
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._modalCloseTimeout = null;
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
    this.addEventListener("preferences:saved", async () => {
      console.log("[SyncService] preferences:saved received", {
        awaiting: this.awaitingSyncDecisionApply,
        pending: this.pendingSyncAction,
      });
      if (!this.awaitingSyncDecisionApply) return;
      try {
        const handle = await this.getSyncFolderHandle();
        if (!handle) return;
        const action = this.pendingSyncAction;
        console.log("[SyncService] applying pending action", { action });
        if (action === "import") {
          try {
            // Prefer deferred content from selection-time prompt
            /** @type {string} */
            let content;
            /** @type {string} */
            let fileName;
            if (
              this.deferredImportContent &&
              this.deferredImportContent.content
            ) {
              content = this.deferredImportContent.content;
              fileName = this.deferredImportContent.fileName || "project.json";
            } else {
              const fileHandle = await handle.getFileHandle("project.json", {
                create: false,
              });
              const file = await fileHandle.getFile();
              content = await file.text();
              fileName = "project.json";
            }
            // Try immediate restore; if handler not ready, defer to app-ready
            try {
              console.log(
                "[SyncService] invoking project:restore-from-content",
                { size: content?.length },
              );
              const result = await this.invokeRequest(
                "project:restore-from-content",
                { content, fileName },
              );
              console.log(
                "[SyncService] project:restore-from-content result",
                result,
              );
              if (!result?.success) {
                const errMsg = result?.error || "Unknown error";
                this.ui?.showToast(
                  this.i18n.t("failed_to_import_project", { error: errMsg }),
                  "error",
                );
              } else {
                // Clear any stashed content now that import succeeded
                this.deferredImportContent = null;
                this.ui?.showToast(
                  this.i18n.t("project_imported_from_sync_folder"),
                  "success",
                );
              }
            } catch {
              // Handler may not be ready yet – defer until app is ready
              this.deferredImportContent = { content, fileName };
              console.log("[SyncService] deferring import until sto-app-ready");
            }
          } catch (e) {
            this.ui?.showToast(
              this.i18n.t("failed_to_import_project", {
                error: getErrorMessage(e),
              }),
              "error",
            );
          }
        } else if (action === "overwrite") {
          try {
            await this.invokeRequest("export:sync-to-folder", {
              dirHandle: handle,
            });
            console.log(
              "[SyncService] overwrite: export:sync-to-folder completed",
            );
            this.ui?.showToast(
              this.i18n.t("project_synced_successfully"),
              "success",
            );
          } catch (e) {
            this.ui?.showToast(
              this.i18n.t("failed_to_sync_project", {
                error: getErrorMessage(e),
              }),
              "error",
            );
          }
        }
      } finally {
        // Clear pending action and awaiting flag
        this.pendingSyncAction = null;
        this.awaitingSyncDecisionApply = false;
        console.log("[SyncService] cleared pending action and awaiting flag");
      }
    });

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
          // Preferences were closed without save – clear pending action
          this.pendingSyncAction = null;
          this.awaitingSyncDecisionApply = false;
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

  // Set sync folder and optionally enable auto-sync
  async setSyncFolder(autoSync = false) {
    try {
      console.log("[SyncService] setSyncFolder called", { autoSync });
      let handle, folderName;
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
        await this.fs.saveDirectoryHandle(KEY_SYNC_FOLDER, handle);
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

      if (this.storage) {
        const settings = this.storage.getSettings();
        settings.syncFolderName = folderName;
        settings.syncFolderPath = `Selected folder: ${folderName}`;
        settings.syncFolderFallback = false;
        settings.autoSync = autoSync;

        // Check for existing project.json immediately on folder selection
        try {
          const existingHandle = await handle.getFileHandle("project.json", {
            create: false,
          });
          if (existingHandle && appWindow.confirmDialog) {
            const file = await existingHandle.getFile();
            const content = await file.text();
            const title = this.i18n.t("sync_folder_contains_project_title");
            const message = this.i18n.t("sync_folder_contains_project_prompt");
            const doImport = await appWindow.confirmDialog.confirm(
              message,
              title,
              "warning",
              "syncImportProject",
            );
            /** @type {'import' | 'overwrite' | null} */
            let pending = null;
            if (doImport) {
              pending = "import";
              console.log("[SyncService] setSyncFolder: user chose IMPORT");
              // Stash content to avoid re-reading on save
              this.deferredImportContent = {
                content,
                fileName: "project.json",
              };
            } else {
              const overwriteTitle = this.i18n.t(
                "sync_overwrite_existing_title",
              );
              const overwriteMsg = this.i18n.t(
                "sync_overwrite_existing_prompt",
              );
              const confirmOverwrite = await appWindow.confirmDialog.confirm(
                overwriteMsg,
                overwriteTitle,
                "warning",
                "syncOverwriteProject",
              );
              if (confirmOverwrite) {
                pending = "overwrite";
                console.log(
                  "[SyncService] setSyncFolder: user chose OVERWRITE",
                );
              } else {
                this.ui?.showToast(
                  this.i18n.t("sync_operation_cancelled"),
                  "info",
                );
                console.log("[SyncService] setSyncFolder: user CANCELLED");
              }
            }
            if (pending) {
              this.pendingSyncAction = pending;
              this.awaitingSyncDecisionApply = true;
              console.log(
                "[SyncService] setSyncFolder: pending action recorded",
                { pending },
              );
            }
          }
        } catch {
          // No existing project.json – nothing to do
          console.log(
            "[SyncService] setSyncFolder: no existing project.json found",
          );
        }

        // Persist updated settings
        this.storage.saveSettings(settings);
        console.log("[SyncService] setSyncFolder: settings saved");
      }
      if (!this.pendingSyncAction) {
        this.ui?.showToast(this.i18n.t("sync_folder_set"), "success");
      }
      await this.emit("sync:folder-set", { handle }, { synchronous: true });
      return handle;
    } catch (err) {
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
      const prefs = this.storage?.getSettings() || {};
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
    this._responseDetachFunctions.splice(0).forEach((detach) => detach());
    if (this._modalCloseTimeout !== null) {
      clearTimeout(this._modalCloseTimeout);
      this._modalCloseTimeout = null;
    }
    this.pendingSyncAction = null;
    this.awaitingSyncDecisionApply = false;
    this.deferredImportContent = null;
  }
}
