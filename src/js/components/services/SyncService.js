import ComponentBase from "../ComponentBase.js";

import FileSystemService, {
  writeFile as fsWriteFile,
} from "./FileSystemService.js";
import { applyPendingSyncDecision as applyClaimedSyncDecision } from "./syncDecisionOrchestrator.js";
import {
  decodeSyncDirectoryCapability,
  decodeSyncDirectoryPermissionEffects,
  ensureSyncDirectoryPermission,
} from "./syncFolderBoundary.js";
import { selectSyncFolder } from "./syncFolderSelectionOrchestrator.js";

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
    /** @type {{ currentProfile: string | null, imported: { profiles: number, settings: boolean } } | null} */
    this.pendingRestoreActivationReceipt = null;
    this._syncDecisionGeneration = 0;
    this._syncDecisionApplyInFlight = false;
    this._syncDecisionClaimed = false;
    this._startupRestoreRetryConsumed = false;
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._modalCloseTimeout = null;
    this._folderSelectionGeneration = 0;
    /** @type {Promise<void>} */
    this._folderSelectionCommitTail = Promise.resolve();
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
    this._startupRestoreRetryConsumed = false;
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
        if (this.awaitingSyncDecisionApply && !this._syncDecisionClaimed) {
          // Preferences were closed without save – invalidate the complete
          // decision, including content that must not reach sto-app-ready.
          this.clearPendingSyncDecision();
          console.log(
            "[SyncService] preferences modal closed without save; pending cleared (deferred)",
          );
        }
      }, 0);
    });

    // A restore selected before the project owner registered gets one startup
    // retry. Later failures remain available for an explicit retry and never
    // schedule themselves.
    this.addEventListener("sto-app-ready", () => {
      if (this._startupRestoreRetryConsumed) return;
      this._startupRestoreRetryConsumed = true;
      if (
        this.pendingSyncAction !== "import" ||
        (!this.deferredImportContent &&
          !this.pendingRestoreActivationReceipt) ||
        this._syncDecisionApplyInFlight
      ) {
        return;
      }
      return this.applyPendingSyncDecision();
    });
  }

  clearPendingSyncDecision() {
    this._syncDecisionGeneration += 1;
    this._syncDecisionApplyInFlight = false;
    this._syncDecisionClaimed = false;
    this.pendingSyncAction = null;
    this.awaitingSyncDecisionApply = false;
    this.deferredImportContent = null;
    this.pendingRestoreActivationReceipt = null;
  }

  /**
   * @param {'import' | 'overwrite' | null} action
   * @param {{ content: string, fileName: string } | null} deferredContent
   */
  stagePendingSyncDecision(action, deferredContent) {
    this._syncDecisionGeneration += 1;
    this._syncDecisionApplyInFlight = false;
    this._syncDecisionClaimed = false;
    this.pendingSyncAction = action;
    this.awaitingSyncDecisionApply = action !== null;
    this.deferredImportContent = deferredContent;
    this.pendingRestoreActivationReceipt = null;
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

  // Set sync folder and optionally enable auto-sync
  async setSyncFolder(autoSync = false) {
    return selectSyncFolder(this, autoSync);
  }

  /**
   * Serialize capability reads with cross-store folder transitions. A reader
   * reserves its queue position before touching IndexedDB, so a selection that
   * starts later cannot expose an uncommitted handle to that reader.
   *
   * @template TResult
   * @param {() => Promise<TResult>} operation
   * @returns {Promise<TResult>}
   */
  async runFolderCapabilityOperation(operation) {
    const previousOperation = this._folderSelectionCommitTail;
    /** @type {() => void} */
    let releaseOperation = () => {};
    this._folderSelectionCommitTail = new Promise((resolve) => {
      releaseOperation = resolve;
    });

    await previousOperation;
    try {
      return await operation();
    } finally {
      releaseOperation();
    }
  }

  /**
   * Load and decode the IndexedDB-owned capability without overlapping a
   * folder transition that could still compensate.
   * @returns {Promise<import('../../types/sync-boundary.js').SyncDirectoryLoadResult>}
   */
  async loadSyncFolderCapability() {
    return this.runFolderCapabilityOperation(async () => {
      /** @type {{ handle: unknown | null, transitionPending: boolean }} */
      let storedState;
      try {
        storedState = await this.fs.getSyncDirectoryState();
      } catch (cause) {
        console.error("[SyncService] getSyncFolderHandle failed", cause);
        return { success: false, error: "sync_folder_load_failed", cause };
      }
      if (storedState.transitionPending) {
        return { success: false, error: "sync_folder_transition_incomplete" };
      }
      const rawHandle = storedState.handle;
      if (rawHandle === null) return { success: true, state: "missing" };

      const decoded = decodeSyncDirectoryCapability(rawHandle);
      if (!decoded.success) {
        return { success: false, error: "sync_folder_capability_invalid" };
      }
      return { success: true, state: "available", value: decoded.value };
    });
  }

  async getSyncFolderHandle() {
    const loaded = await this.loadSyncFolderCapability();
    if (!loaded.success || loaded.state === "missing") return null;
    return loaded.value.raw;
  }

  /** @param {unknown} handle */
  async checkSyncFolderPermission(handle) {
    const decoded = decodeSyncDirectoryPermissionEffects(handle);
    if (!decoded.success) return decoded;
    return ensureSyncDirectoryPermission(decoded.value, "readwrite");
  }

  /** @param {unknown} handle */
  async ensurePermission(handle) {
    if (!handle) return false;
    const result = await this.checkSyncFolderPermission(handle);
    return result.success;
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

    // Secure context: distinguish genuine absence from a failed or corrupt
    // capability load before any permission or export effect occurs.
    const loaded = await this.loadSyncFolderCapability();
    if (!loaded.success) {
      this.ui?.showToast(this.i18n.t(loaded.error), "error");
      return { success: false, error: loaded.error };
    }
    if (loaded.state === "missing") {
      this.ui?.showToast(this.i18n.t("no_sync_folder_selected"), "warning");
      return { success: false, error: "no_sync_folder_selected" };
    }

    const permission = await this.checkSyncFolderPermission(loaded.value.raw);
    if (!permission.success && permission.error === "permission_denied") {
      this.ui?.showToast(this.i18n.t("permission_denied_to_folder"), "error");
      return { success: false, error: "permission_denied_to_folder" };
    }
    if (!permission.success) {
      console.error("[SyncService] folder permission check failed", permission);
      this.ui?.showToast(
        this.i18n.t("sync_folder_permission_check_failed"),
        "error",
      );
      return {
        success: false,
        error: "sync_folder_permission_check_failed",
      };
    }
    const handle = loaded.value.raw;
    try {
      // Proceed with sync without interactive prompts
      // Use request/response system instead of global window.stoExport
      await this.invokeRequest(
        "export:sync-to-folder",
        { dirHandle: handle },
        0,
      );
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
