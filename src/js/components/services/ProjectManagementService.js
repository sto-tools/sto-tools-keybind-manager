import ComponentBase from "../ComponentBase.js";
import { serializeProjectArtifact } from "./projectArtifact.js";

/** @type {{ settings?: { version?: string } }} */
const STO_DATA =
  /** @type {import('./serviceTypes.js').AppWindow} */ (globalThis).STO_DATA ||
  {};

/** @param {unknown} error */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
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
      this.respond(
        "project:restore-from-content",
        async (
          {
            content,
            fileName,
          } = /** @type {{ content?: string, fileName?: string }} */ ({}),
        ) => {
          console.log(
            "[ProjectManagementService] request project:restore-from-content",
            { fileName, size: content?.length },
          );
          return await this.restoreFromProjectContent(content, fileName);
        },
      ),
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

            const text = await file.text();
            console.log(
              "[ProjectManagementService] restoreApplicationState: file selected",
              { name: file.name, size: text.length },
            );
            const outcome = await this.restoreFromProjectContent(
              text,
              file.name,
            );
            resolve(outcome);
          } catch (error) {
            console.error(
              "[ProjectManagementService] restoreApplicationState failed:",
              error,
            );
            this.ui?.showToast(
              this.i18n?.t("backup_restore_failed", {
                error: getErrorMessage(error),
              }) ?? getErrorMessage(error),
              "error",
            );
            resolve({ success: false, error: getErrorMessage(error) });
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
      return { success: false, error: getErrorMessage(error) };
    }
  }

  // Unified restore helper – used by both UI file-chooser and SyncService
  /**
   * @param {string | undefined} text
   * @param {string} [fileName]
   * @returns {Promise<import('../../types/rpc/index.js').RpcResult<'project:restore-from-content'>>}
   */
  async restoreFromProjectContent(text, fileName = "project.json") {
    try {
      console.log(
        "[ProjectManagementService] restoreFromProjectContent: begin",
        { fileName, size: text?.length },
      );

      // Import via ImportService - let ImportService handle JSON parsing and validation
      console.log(
        "[ProjectManagementService] About to call ImportService with content length:",
        text?.length,
      );
      if (typeof text !== "string") {
        throw new Error("invalid_project_file");
      }
      const result = await this.request("import:project-file", {
        content: text,
      });
      const failure = result.success ? null : result;
      const failureParams =
        failure && "params" in failure ? failure.params : undefined;
      console.log("[ProjectManagementService] import:project-file result", {
        success: result.success,
        error: failure?.error,
        params: failureParams,
      });
      if (!result.success) {
        const errorMessage = result.error || "import_failed";
        const reason =
          failureParams &&
          "reason" in failureParams &&
          typeof failureParams.reason === "string"
            ? failureParams.reason
            : "";
        const fullMessage = reason
          ? `${errorMessage}: ${reason}`
          : errorMessage;
        throw new Error(fullMessage);
      }

      // Force DataCoordinator to reload its state from storage
      try {
        const reload = await this.request("data:reload-state");
        console.log(
          "[ProjectManagementService] data:reload-state done",
          reload,
        );
      } catch {
        // Reload is best-effort; the imported data remains available in storage.
      }

      // If there's a currentProfile in the imported data, switch to it
      if (result.currentProfile) {
        try {
          const sw = await this.request("data:switch-profile", {
            profileId: result.currentProfile,
          });
          console.log(
            "[ProjectManagementService] data:switch-profile done",
            sw,
          );
        } catch (error) {
          console.warn(
            "Could not switch to imported current profile:",
            getErrorMessage(error),
          );
        }
      }

      this.ui?.showToast(
        this.i18n?.t("backup_restored_successfully") ??
          "backup_restored_successfully",
        "success",
      );

      console.log(
        "[ProjectManagementService] restoreFromProjectContent: success",
      );

      return {
        success: true,
        currentProfile: result.currentProfile,
        imported: result.imported,
      };
    } catch (error) {
      console.error(
        "[ProjectManagementService] restoreFromProjectContent: failed",
        error,
      );
      return { success: false, error: getErrorMessage(error) };
    }
  }

  // High-level helpers (trimmed to backup/restore only)

  // Legacy openProject() removed in favor of restoreApplicationState()

  onDestroy() {
    this._responseDetachFunctions.splice(0).forEach((detach) => detach());
  }
}
