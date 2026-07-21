import ComponentBase from "../ComponentBase.js";
import { serializeProjectArtifact } from "./projectArtifact.js";
import {
  hasOwnDataField,
  isDataRecord,
  MAX_PROJECT_JSON_BYTES,
} from "./jsonDataBoundary.js";
import {
  classifyDataReloadResult,
  classifyProjectRestoreResult,
  isProjectImportFailure,
  materializeProjectImportSuccess,
} from "./projectRestoreResult.js";

/** @type {{ settings?: { version?: string } }} */
const STO_DATA =
  /** @type {import('./serviceTypes.js').AppWindow} */ (globalThis).STO_DATA ||
  {};

/** @param {unknown} error */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Lifecycle cancellation is a stable internal code, not user-facing copy.
 * Other reasons are diagnostic text supplied by the failing boundary.
 * @param {import('./serviceTypes.js').I18n | null} i18n
 * @param {string} reason
 */
function getRestoreReloadFailureReason(i18n, reason) {
  return reason === "operation_cancelled"
    ? (i18n?.t("failed_to_load_profile_data") ?? "failed_to_load_profile_data")
    : reason;
}

/** @param {import('./serviceTypes.js').I18n | null} i18n */
function getMalformedRestoreReason(i18n) {
  const error =
    i18n?.t("failed_to_load_profile_data") ?? "failed_to_load_profile_data";
  return i18n?.t("import_failed", { error }) ?? "import_failed";
}

/**
 * @param {string} path
 * @returns {{ success: false, error: 'invalid_project_file', params: { path: string } }}
 */
function invalidRestoreRequest(path) {
  return {
    success: false,
    error: "invalid_project_file",
    params: { path },
  };
}

/**
 * Decode the public RPC envelope without invoking inherited or accessor code.
 * @param {unknown} payload
 * @returns {{ success: true, content: string, fileName: string | undefined } | ReturnType<typeof invalidRestoreRequest>}
 */
function decodeRestoreRequest(payload) {
  /** @type {Record<string, unknown>} */
  let record;
  /** @type {string} */
  let content;
  try {
    if (!isDataRecord(payload) || !hasOwnDataField(payload, "content")) {
      return invalidRestoreRequest("$");
    }
    const descriptor = Object.getOwnPropertyDescriptor(payload, "content");
    if (
      !descriptor ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string"
    ) {
      return invalidRestoreRequest("$");
    }
    record = payload;
    content = descriptor.value;
  } catch {
    return invalidRestoreRequest("$");
  }

  try {
    if (!hasOwnDataField(record, "fileName")) {
      return { success: true, content, fileName: undefined };
    }
    const descriptor = Object.getOwnPropertyDescriptor(record, "fileName");
    if (!descriptor || !("value" in descriptor)) {
      return invalidRestoreRequest("$.fileName");
    }
    const fileName = descriptor.value;
    if (fileName !== undefined && typeof fileName !== "string") {
      return invalidRestoreRequest("$.fileName");
    }
    return { success: true, content, fileName };
  } catch {
    return invalidRestoreRequest("$.fileName");
  }
}

/**
 * ProjectManagementService – Handles import / export of complete project data and
 * keybind files.  Provides both an OO interface and legacy functional wrappers
 * for mix-in compatibility while the codebase migrates to service instances.
 */
export default class ProjectManagementService extends ComponentBase {
  /** @param {{ storage?: import('./serviceTypes.js').Storage | null, ui?: import('./serviceTypes.js').ToastUI | null, app?: unknown, eventBus?: import('./serviceTypes.js').EventBus | null, i18n?: import('./serviceTypes.js').I18n | null }} [options] */
  constructor({
    storage = null,
    ui = null,
    app = null,
    eventBus = null,
    i18n = null,
  } = {}) {
    super(eventBus);
    this.componentName = "ProjectManagementService";

    this.storage = storage;
    this.ui = ui;
    this.i18n = i18n;
    this.app = app;
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
  }

  onInit() {
    this.setupEventHandlers();
    this.setupRequestHandlers();
    console.log("[ProjectManagementService] Initialized and ready");
  }

  setupEventHandlers() {
    if (!this.eventBus) return;

    // Listen for backup/restore application state events from HeaderMenuUI
    this.addEventListener("project:save", () => {
      this.backupApplicationState();
    });

    this.addEventListener("project:open", () => {
      this.restoreApplicationState();
    });
  }

  setupRequestHandlers() {
    if (!this.eventBus || this._responseDetachFunctions.length > 0) return;

    // Expose a unified restore endpoint for other services (e.g., SyncService)
    this._responseDetachFunctions.push(
      this.respond("project:restore-from-content", async (payload) => {
        const request = decodeRestoreRequest(payload);
        if (!request.success) return request;
        const { content, fileName } = request;
        console.log(
          "[ProjectManagementService] request project:restore-from-content",
          {
            fileName,
            size: typeof content === "string" ? content.length : undefined,
          },
        );
        return await this.restoreFromProjectContent(content, fileName);
      }),
    );
  }

  // Backup & Restore Application State (same format as sync folder)
  async backupApplicationState() {
    try {
      if (!this.storage || !this.i18n) {
        throw new Error("Project management dependencies are unavailable");
      }
      const data = this.storage.getAllData();
      const exported = new Date().toISOString();
      const jsonContent = serializeProjectArtifact(
        data,
        this.storage.getSettings(),
        { version: STO_DATA?.settings?.version, exported },
      );
      const blob = new Blob([jsonContent], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const timestamp = exported.split("T")[0]; // YYYY-MM-DD
      const filename = `STO_Tools_Backup_${timestamp}.json`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.ui?.showToast(this.i18n.t("backup_created_successfully"), "success");

      return { success: true, filename };
    } catch (error) {
      console.error(
        "[ProjectManagementService] backupApplicationState failed",
        error,
      );
      this.ui?.showToast(
        this.i18n?.t("failed_to_create_backup", {
          error: getErrorMessage(error),
        }) ?? getErrorMessage(error),
        "error",
      );
      return { success: false, error: getErrorMessage(error) };
    }
  }

  async restoreApplicationState() {
    try {
      // Create file input element
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";

      return new Promise((resolve) => {
        input.onchange = async () => {
          try {
            const file = input.files?.[0];
            if (!file) {
              resolve({ success: false, cancelled: true });
              return;
            }

            if (file.size > MAX_PROJECT_JSON_BYTES) {
              const outcome = invalidRestoreRequest("$");
              this.notifyRestoreOutcome(outcome);
              resolve(outcome);
              return;
            }

            const text = await file.text();
            console.log(
              "[ProjectManagementService] restoreApplicationState: file selected",
              { name: file.name, size: text.length },
            );
            const outcome = await this.restoreFromProjectContent(
              text,
              file.name,
            );
            this.notifyRestoreOutcome(outcome);
            resolve(outcome);
          } catch (error) {
            console.error(
              "[ProjectManagementService] restoreApplicationState failed:",
              error,
            );
            const outcome = {
              success: false,
              error: getErrorMessage(error),
            };
            this.notifyRestoreReadFailure(error);
            resolve(outcome);
          }
        };

        input.oncancel = () => {
          resolve({ success: false, cancelled: true });
        };

        input.click();
      });
    } catch (error) {
      console.error(
        "[ProjectManagementService] restoreApplicationState failed:",
        error,
      );
      this.notifyRestoreReadFailure(error);
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /** @param {unknown} restoreError */
  notifyRestoreReadFailure(restoreError) {
    try {
      const error = getErrorMessage(restoreError);
      this.ui?.showToast(
        this.i18n?.t("backup_restore_failed", { error }) ?? error,
        "error",
      );
    } catch (notificationError) {
      console.error(
        "[ProjectManagementService] restore notification failed:",
        notificationError,
      );
    }
  }

  /**
   * The direct file-chooser flow owns its user notification. RPC consumers
   * provide their own context-specific feedback.
   * @param {import('../../types/rpc/application.js').ProjectRestoreResult} outcome
   */
  notifyRestoreOutcome(outcome) {
    try {
      const result = classifyProjectRestoreResult(outcome);
      if (result.kind === "success") {
        this.ui?.showToast(
          this.i18n?.t("backup_restored_successfully") ??
            "backup_restored_successfully",
          "success",
        );
        return;
      }

      const reason =
        result.kind === "malformed"
          ? getMalformedRestoreReason(this.i18n)
          : (result.reason ??
            this.i18n?.t(result.error, result.params) ??
            result.error);
      this.ui?.showToast(
        this.i18n?.t("backup_restore_failed", { error: reason }) ?? reason,
        "error",
      );
    } catch (notificationError) {
      console.error(
        "[ProjectManagementService] restore notification failed:",
        notificationError,
      );
    }
  }

  // Unified restore helper – used by both UI file-chooser and SyncService
  /**
   * @param {unknown} text
   * @param {string} [fileName]
   * @returns {Promise<import('../../types/rpc/index.js').RpcResult<'project:restore-from-content'>>}
   */
  async restoreFromProjectContent(text, fileName = "project.json") {
    console.log("[ProjectManagementService] restoreFromProjectContent: begin", {
      fileName,
      size: typeof text === "string" ? text.length : undefined,
    });

    if (typeof text !== "string") {
      return {
        success: false,
        error: "invalid_project_file",
        params: { path: "$" },
      };
    }

    // ImportService owns parsing, validation, and durable storage writes.
    const importResponderAvailable =
      this.eventBus?.hasListeners("rpc:import:project-file") === true;
    let result;
    try {
      result = await this.request("import:project-file", { content: text }, 0);
    } catch (error) {
      return {
        success: false,
        error: "project_restore_import_failed",
        params: { reason: getErrorMessage(error) },
        durable: importResponderAvailable ? "indeterminate" : false,
      };
    }
    if (isProjectImportFailure(result)) {
      console.log("[ProjectManagementService] import result: failure");
      return result;
    }
    const importSuccess = materializeProjectImportSuccess(result);
    if (!importSuccess) {
      // A malformed reply proves that a responder ran but cannot acknowledge
      // how far it progressed. Never replay the artifact from this state.
      const durability = "indeterminate";
      console.log("[ProjectManagementService] import result: malformed", {
        durability,
      });
      return {
        success: false,
        error: "project_restore_import_failed",
        params: {
          reason: getMalformedRestoreReason(this.i18n),
        },
        durable: durability,
      };
    }
    console.log("[ProjectManagementService] import result: success");

    /**
     * @param {string} reason
     * @returns {Extract<import('../../types/rpc/application.js').ProjectRestoreResult, { error: 'project_restore_reload_failed' }>}
     */
    const reloadFailure = (reason) => ({
      success: false,
      error: "project_restore_reload_failed",
      params: { reason },
      durable: true,
      currentProfile: importSuccess.currentProfile,
      imported: importSuccess.imported,
    });

    try {
      const reload = await this.request("data:reload-state", undefined, 0);
      console.log("[ProjectManagementService] data:reload-state done", reload);
      const reloadResult = classifyDataReloadResult(reload);
      if (reloadResult.kind === "failure") {
        return reloadFailure(
          getRestoreReloadFailureReason(this.i18n, reloadResult.error),
        );
      }
      if (reloadResult.kind === "malformed") {
        return reloadFailure(
          this.i18n?.t("failed_to_load_profile_data") ??
            "failed_to_load_profile_data",
        );
      }
    } catch (error) {
      return reloadFailure(
        getRestoreReloadFailureReason(this.i18n, getErrorMessage(error)),
      );
    }

    console.log(
      "[ProjectManagementService] restoreFromProjectContent: success",
    );

    return {
      success: true,
      currentProfile: importSuccess.currentProfile,
      imported: importSuccess.imported,
    };
  }

  // High-level helpers (trimmed to backup/restore only)

  // Legacy openProject() removed in favor of restoreApplicationState()

  onDestroy() {
    this._responseDetachFunctions.splice(0).forEach((detach) => detach());
  }
}
