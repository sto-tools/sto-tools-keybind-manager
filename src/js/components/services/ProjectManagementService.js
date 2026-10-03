import ComponentBase from "../ComponentBase.js";
import { MAX_PROJECT_JSON_BYTES } from "./jsonDataBoundary.js";
import {
  decodeRestoreRequest,
  invalidRestoreRequest,
} from "./projectRestoreRequestBoundary.js";
import { classifyProjectRestoreResult } from "./projectRestoreResult.js";
import {
  prepareProjectImport,
  materializeProjectImportCompletion,
} from "./projectImportOrchestrator.js";
import { settleOwnerPublications } from "./ownerPublicationSettlement.js";
import {
  materializeProjectRestoreOutcome,
  resumeProjectRestoreActivation,
} from "./projectRestoreActivation.js";
import { materializeMutationRequest } from "./mutationRequestBoundary.js";

/** @param {unknown} error */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/** @param {import('./serviceTypes.js').I18n | null} i18n */
function getMalformedRestoreReason(i18n) {
  const error =
    i18n?.t("failed_to_load_profile_data") ?? "failed_to_load_profile_data";
  return i18n?.t("import_failed", { error }) ?? "import_failed";
}

/**
 * ProjectManagementService – Handles import / export of complete project data and
 * keybind files.  Provides both an OO interface and legacy functional wrappers
 * for mix-in compatibility while the codebase migrates to service instances.
 */
export default class ProjectManagementService extends ComponentBase {
  /** @param {{ currentArtifactSerializer?: import('../../types/storage-contracts.js').CurrentProjectArtifactSerializerPort | null, ui?: import('./serviceTypes.js').ToastUI | null, eventBus?: import('./serviceTypes.js').EventBus | null, i18n?: import('./serviceTypes.js').I18n | null, runPreferencesTransition?: import('./PreferencesService.js').default['runExternalActivationTransition'] | null, importProjectWithinPreferencesTransition?: import('./ImportService.js').default['importProjectWithinPreferencesTransition'] | null, activateProjectFromImport?: import('../../types/storage-contracts.js').ImportedProjectActivationAction | null, activateImportedSettings?: import('./PreferencesService.js').default['activateImportedSettings'] | null }} [options] */
  constructor({
    currentArtifactSerializer = null,
    ui = null,
    eventBus = null,
    i18n = null,
    runPreferencesTransition = null,
    importProjectWithinPreferencesTransition = null,
    activateProjectFromImport = null,
    activateImportedSettings = null,
  } = {}) {
    super(eventBus);
    this.componentName = "ProjectManagementService";

    this.currentArtifactSerializer = currentArtifactSerializer;
    this.ui = ui;
    this.i18n = i18n;
    this.runPreferencesTransition = runPreferencesTransition;
    this.importProjectWithinPreferencesTransition =
      importProjectWithinPreferencesTransition;
    this.activateProjectFromImport = activateProjectFromImport;
    this.activateImportedSettings = activateImportedSettings;
    /** @type {ReturnType<import('./projectImportOrchestrator.js').materializeProjectImportContext>} */
    this._pendingRestoreActivation = null;
    /** @type {Promise<import('../../types/rpc/application.js').ProjectRestoreResult> | null} */
    this._restoreActivationRetry = null;
    /** @type {Promise<import('../../types/rpc/application.js').ProjectRestoreResult> | null} */
    this._restoreInFlight = null;
    this._restoreWorkflowGeneration = 0;
    this._restoreLifecycleGeneration = 0;
    /** @type {Array<() => void>} */
    this._responseDetachFunctions = [];
  }

  onInit() {
    this._restoreLifecycleGeneration += 1;
    this.setupEventHandlers();
    this.setupRequestHandlers();
    console.log("[ProjectManagementService] Initialized and ready");
  }

  setupEventHandlers() {
    if (!this.eventBus) return;

    // Listen for backup/restore application state events from HeaderMenuUI
    this.addEventListener("project:save", () => this.backupApplicationState());

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
      this.respond("project:retry-restore-activation", (payload = {}) => {
        try {
          materializeMutationRequest(payload, []);
        } catch {
          return {
            success: false,
            error: "project_restore_import_failed",
            params: { reason: "invalid_mutation_request" },
            durable: false,
          };
        }
        return this.retryRestoreActivation();
      }),
    );
  }

  // Backup & Restore Application State (same format as sync folder)
  async backupApplicationState() {
    try {
      if (!this.currentArtifactSerializer || !this.i18n) {
        throw new Error("Project management dependencies are unavailable");
      }
      const { artifact: jsonContent, exported } =
        await this.currentArtifactSerializer.serialize();
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
    const request = decodeRestoreRequest({ content: text, fileName });
    if (!request.success) return request;
    const prepared = prepareProjectImport(request.content, {});
    if (!prepared.success) return prepared;
    if (this._restoreActivationRetry) {
      return {
        success: false,
        error: "project_restore_import_failed",
        params: { reason: "project_restore_activation_in_progress" },
        durable: false,
      };
    }
    const generation = ++this._restoreWorkflowGeneration;
    const restore = this._runRestoreFromProjectContent(
      text,
      fileName,
      generation,
      prepared,
    );
    this._restoreInFlight = restore;
    try {
      return await restore;
    } finally {
      if (this._restoreInFlight === restore) this._restoreInFlight = null;
    }
  }

  /**
   * @param {unknown} text
   * @param {string} fileName
   * @param {number} workflowGeneration
   * @param {Extract<ReturnType<typeof prepareProjectImport>, {success: true}>} prepared
   * @returns {Promise<import('../../types/rpc/application.js').ProjectRestoreResult>}
   */
  async _runRestoreFromProjectContent(
    text,
    fileName,
    workflowGeneration,
    prepared,
  ) {
    console.log("[ProjectManagementService] restoreFromProjectContent: begin", {
      fileName,
      size: typeof text === "string" ? text.length : undefined,
    });

    if (workflowGeneration === this._restoreWorkflowGeneration) {
      this._pendingRestoreActivation = null;
    }

    let importDispatched = false;
    /** @type {import('../../types/rpc/application.js').ProjectRestoreResult | undefined} */
    let acknowledgedOutcome;
    /** @type {PromiseLike<unknown>[]} */
    const publications = [];
    const lifecycleGeneration = this._restoreLifecycleGeneration;
    /**
     * @param {() => Promise<import('../../types/rpc/parameters-preferences.js').PreferencesActivationResult>} activatePersistedSettings
     * @param {(() => void) | undefined} assertPreferencesTransition
     * @param {import('./preferencesOwnerMutationOperations.js').PersistImportedPreferences | undefined} persistImportedSettings
     */
    const runPreparedRestore = (
      activatePersistedSettings,
      assertPreferencesTransition,
      persistImportedSettings,
    ) => {
      const assertRestoreActive = () => {
        assertPreferencesTransition?.();
        if (
          lifecycleGeneration !== this._restoreLifecycleGeneration ||
          !this.initialized ||
          this.destroyed
        ) {
          throw new Error("operation_cancelled");
        }
      };
      return this._restoreWithinPreferencesTransition(
        prepared,
        activatePersistedSettings,
        assertRestoreActive,
        () => {
          importDispatched = true;
        },
        persistImportedSettings,
        workflowGeneration,
        (settlement) => publications.push(settlement),
      ).then((outcome) => {
        acknowledgedOutcome = outcome;
        return outcome;
      });
    };
    try {
      if (!prepared.importSettings) {
        const result = await runPreparedRestore(
          async () => {
            throw new Error("preferences_activation_not_required");
          },
          undefined,
          undefined,
        );
        await settleOwnerPublications(publications);
        return result;
      }
      if (!this.runPreferencesTransition) {
        return {
          success: false,
          error: "project_restore_import_failed",
          params: { reason: "preferences_transition_unavailable" },
          durable: false,
        };
      }
      const result = await this.runPreferencesTransition(
        "project-restore",
        (
          activatePersistedSettings,
          assertPreferencesTransition,
          persistImportedSettings,
        ) =>
          runPreparedRestore(
            activatePersistedSettings,
            assertPreferencesTransition,
            persistImportedSettings,
          ),
      );
      await settleOwnerPublications(publications);
      return result;
    } catch (error) {
      await settleOwnerPublications(publications);
      if (acknowledgedOutcome?.success === false) return acknowledgedOutcome;
      return {
        success: false,
        error: "project_restore_import_failed",
        params: { reason: getErrorMessage(error) },
        durable: importDispatched ? "indeterminate" : false,
      };
    }
  }

  /**
   * The Preferences owner invokes this while holding its mutation queue. This
   * keeps the single complete-root Data action and optional settings activation
   * ordered without changing the established external result union.
   *
   * @param {unknown} prepared
   * @param {() => Promise<import('../../types/rpc/parameters-preferences.js').PreferencesActivationResult>} activatePersistedSettings
   * @param {() => void} assertRestoreActive
   * @param {() => void} markImportDispatched
   * @param {import('./preferencesOwnerMutationOperations.js').PersistImportedPreferences | undefined} persistImportedSettings
   * @param {number} workflowGeneration
   * @param {(settlement: Promise<void>) => void} recordSettlement
   * @returns {Promise<import('../../types/rpc/index.js').RpcResult<'project:restore-from-content'>>}
   */
  async _restoreWithinPreferencesTransition(
    prepared,
    activatePersistedSettings,
    assertRestoreActive,
    markImportDispatched,
    persistImportedSettings,
    workflowGeneration,
    recordSettlement,
  ) {
    assertRestoreActive();
    // ImportService owns parsing/validation and dispatches the owner transition.
    if (!this.importProjectWithinPreferencesTransition) {
      return {
        success: false,
        error: "project_restore_import_failed",
        params: { reason: "project_import_action_unavailable" },
        durable: false,
      };
    }
    let result;
    try {
      markImportDispatched();
      const completion = materializeProjectImportCompletion(
        await this.importProjectWithinPreferencesTransition(
          prepared,
          persistImportedSettings,
        ),
      );
      recordSettlement(completion.settlement);
      result = completion.result;
    } catch (error) {
      return {
        success: false,
        error: "project_restore_import_failed",
        params: { reason: getErrorMessage(error) },
        durable: "indeterminate",
      };
    }
    const outcome = await materializeProjectRestoreOutcome({
      ownerResult: result,
      activatePersistedSettings,
      assertActive: assertRestoreActive,
      i18n: this.i18n,
    });
    if (workflowGeneration === this._restoreWorkflowGeneration) {
      this._pendingRestoreActivation = outcome.pending;
    }
    return outcome.result;
  }

  /**
   * Resume only owner activation from the retained acknowledged material. This
   * path receives no artifact and performs no import or durable write.
   * @returns {Promise<import('../../types/rpc/application.js').ProjectRestoreResult>}
   */
  retryRestoreActivation() {
    if (this._restoreActivationRetry) return this._restoreActivationRetry;
    if (this._restoreInFlight) {
      return Promise.resolve({
        success: false,
        error: "project_restore_import_failed",
        params: { reason: "project_restore_in_progress" },
        durable: false,
      });
    }
    const retry = this._retryRestoreActivation();
    this._restoreActivationRetry = retry;
    void retry.then(
      () => {
        if (this._restoreActivationRetry === retry) {
          this._restoreActivationRetry = null;
        }
      },
      () => {
        if (this._restoreActivationRetry === retry) {
          this._restoreActivationRetry = null;
        }
      },
    );
    return retry;
  }

  /** @returns {Promise<import('../../types/rpc/application.js').ProjectRestoreResult>} */
  async _retryRestoreActivation() {
    const retained = this._pendingRestoreActivation;
    if (!retained) {
      return {
        success: false,
        error: "project_restore_import_failed",
        params: { reason: "project_restore_activation_unavailable" },
        durable: false,
      };
    }

    const outcome = await resumeProjectRestoreActivation({
      retained,
      activateProjectFromImport: this.activateProjectFromImport,
      activateImportedSettings: this.activateImportedSettings,
      i18n: this.i18n,
    });
    if (this._pendingRestoreActivation === retained) {
      this._pendingRestoreActivation = outcome.retained;
    }
    return outcome.result;
  }

  // High-level helpers (trimmed to backup/restore only)

  // Legacy openProject() removed in favor of restoreApplicationState()

  onDestroy() {
    this._restoreLifecycleGeneration += 1;
    this._pendingRestoreActivation = null;
    this._responseDetachFunctions.splice(0).forEach((detach) => detach());
  }
}
