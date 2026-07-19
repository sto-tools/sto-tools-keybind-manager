import UIComponentBase from "../UIComponentBase.js";
import { getSnapshotProfile } from "../services/dataState.js";
import { MAX_STO_TEXT_IMPORT_BYTES } from "../services/textImportBoundary.js";
import ImportDecisionModalSession from "./importDecisionModalSession.js";
import ImportFileSession from "./importFileSession.js";
import { projectImportResultToast } from "./importResultMessages.js";
import { runImportWorkflow } from "./importWorkflow.js";
import {
  createEnhancedKBFImportModal,
  createSingleKBFImportModal,
} from "./kbfImportModalDom.js";
import KBFImportModalSession from "./kbfImportModalSession.js";
import { errorMessage, resolveDocument, resolveI18n } from "./uiTypes.js";

/** @typedef {'keybinds' | 'aliases' | 'kbf'} ImportType */
/** @typedef {'space' | 'ground'} ImportEnvironment */
/** @typedef {'merge_keep' | 'merge_overwrite' | 'overwrite_all'} ImportStrategy */
/** @typedef {{ bindsetsEnabled?: boolean }} ImportContext */
/** @typedef {{ environment: ImportEnvironment, strategy: ImportStrategy }} EnvironmentImportConfig */
/** @typedef {Extract<import('../../types/rpc/import-export.js').KBFParseForUiResult, { valid: true }>} ValidKBFParseResult */
/** @typedef {import('../../types/kbf-boundary.js').KBFImportConfiguration} BindsetConfiguration */
/** @typedef {{ profileId: string | null, currentEnvironment: string, profile: import('../services/serviceTypes.js').ProfileData | null, bindsetsEnabled: boolean }} AcceptedImportContext */
/** @typedef {Awaited<ReturnType<typeof runImportWorkflow>>} ImportWorkflowOutcome */

/**
 * ImportUI – Presents file-open dialogs for the "Import Keybinds / Import Aliases"
 * menu actions and delegates the actual import work to ImportService.
 */
export default class ImportUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./uiTypes.js').EventBus,
   *   document?: Document,
   *   i18n?: import('./uiTypes.js').I18nLike,
   *   modalManager?: import('./uiTypes.js').ModalManagerLike | null
   * }} [options]
   */
  constructor({ eventBus, document, i18n, modalManager = null } = {}) {
    super(eventBus);
    this.componentName = "ImportUI";
    this.document = resolveDocument(document);
    this.i18n = resolveI18n(i18n);
    this.modalManager = modalManager;

    /** @param {(message: { modalId: string, success: boolean }) => void} handler */
    const subscribeModalHidden = (handler) => {
      this.addEventListener("modal:hidden", handler);
      return () => this.removeEventListener("modal:hidden", handler);
    };
    this.decisionModalSession = new ImportDecisionModalSession({
      document: this.document,
      modalManager: this.modalManager,
      translate: (key, params) => this.i18n.t(key, params),
      subscribeModalHidden,
    });
    this.kbfImportSession = new KBFImportModalSession({
      document: this.document,
      modalManager: this.modalManager,
      translate: (key) => this.i18n.t(key),
      createEnhancedModal: (parseResult, draft) =>
        createEnhancedKBFImportModal({
          document: this.document,
          translate: (key) => this.i18n.t(key),
          parseResult,
          draft,
        }),
      createSingleModal: (parseResult, draft) =>
        createSingleKBFImportModal({
          document: this.document,
          translate: (key) => this.i18n.t(key),
          parseResult,
          draft,
        }),
      subscribeModalHidden,
    });
    this.importFileSession = new ImportFileSession({ document: this.document });
  }

  onInit() {
    // Listen for menu events dispatched by HeaderMenuUI
    this.addEventListener("keybinds:import", () =>
      this.openFileDialog("keybinds"),
    );
    this.addEventListener("aliases:import", () =>
      this.openFileDialog("aliases"),
    );
    this.addEventListener("keybinds:kbf-import", () =>
      this.openFileDialog("kbf"),
    );
  }

  onDestroy() {
    this.importFileSession.destroy();
    this.decisionModalSession.destroy();
    this.kbfImportSession.destroy();
  }

  /**
   * PreferencesService hydrates ComponentBase's cache by startup broadcast or
   * late-join snapshot. Default to the historically safe enabled mode until a
   * valid snapshot is available.
   * @returns {boolean}
   */
  isBindsetsEnabled() {
    const configured = this.cache.preferences.bindsetsEnabled;
    return typeof configured === "boolean" ? configured : true;
  }

  // Opens a hidden file input, waits for selection and forwards content to ImportService.
  /** @param {ImportType} type */
  async openFileDialog(type) {
    this.decisionModalSession.cancelActiveSession();
    this.kbfImportSession.cancelActiveSession();
    const tooLargeErrorKey =
      type === "keybinds" ? "keybind_file_too_large" : "alias_file_too_large";
    this.importFileSession.open({
      type,
      maxBytes: MAX_STO_TEXT_IMPORT_BYTES,
      tooLargeErrorKey,
      captureContext: () => this.captureImportContext(),
      runWorkflow: ({ content, context, signal, isCurrent }) =>
        this.runAcceptedImport(type, content, context, signal, isCurrent),
      projectOutcome: ({ outcome }) => this.projectImportOutcome(outcome),
      onTooLarge: ({ errorKey, size, limit }) => {
        this.showToast(this.i18n.t(errorKey, { size, limit }), "error");
      },
      onError: ({ error }) => {
        console.error("[ImportUI] Failed to import file:", errorMessage(error));
      },
    });
  }

  /** @returns {AcceptedImportContext} */
  captureImportContext() {
    const dataState = this.cache.dataState;
    const profileId = dataState?.ready ? dataState.currentProfile : null;
    return {
      profileId,
      currentEnvironment: dataState?.ready
        ? dataState.currentEnvironment
        : "space",
      profile: getSnapshotProfile(dataState, profileId),
      bindsetsEnabled: this.isBindsetsEnabled(),
    };
  }

  /**
   * @param {ImportType} type
   * @param {string} content
   * @param {AcceptedImportContext} context
   * @param {AbortSignal} signal
   * @param {() => boolean} isCurrent
   * @returns {Promise<ImportWorkflowOutcome>}
   */
  runAcceptedImport(type, content, context, signal, isCurrent) {
    const canContinue = () => isCurrent() && !signal.aborted;
    const rawRequest =
      /** @type {(topic: string, payload?: unknown) => Promise<unknown>} */ (
        /** @type {unknown} */ (this.request.bind(this))
      );
    /** @param {string} topic @param {unknown} [payload] */
    const guardedRequest = async (topic, payload) => {
      if (!canContinue()) {
        const error = new Error("Import file session was superseded");
        error.name = "AbortError";
        throw error;
      }
      return rawRequest(topic, payload);
    };
    const request =
      /** @type {import('../../types/rpc/transport.js').RpcRequester} */ (
        /** @type {unknown} */ (guardedRequest)
      );
    return runImportWorkflow({
      type,
      content,
      ...context,
      promptEnvironment: (...args) =>
        canContinue() ? this.promptEnvironment(...args) : Promise.resolve(null),
      promptAliasStrategy: () =>
        canContinue() ? this.promptAliasStrategy() : Promise.resolve(null),
      showOverwriteConfirmation: (...args) =>
        canContinue()
          ? this.showOverwriteConfirmation(...args)
          : Promise.resolve(false),
      promptEnhancedBindsetSelection: (parseResult) =>
        canContinue()
          ? this.promptEnhancedBindsetSelection(
              parseResult,
              context.bindsetsEnabled,
            )
          : Promise.resolve(null),
      request,
    });
  }

  /** @param {ImportWorkflowOutcome} outcome */
  projectImportOutcome(outcome) {
    if (outcome.status === "invalid-kbf") {
      this.showToast(
        this.i18n.t(
          outcome.parseResult.error ?? "invalid_kbf_file_format",
          outcome.parseResult.params,
        ),
        "error",
      );
      return;
    }
    if (outcome.status === "completed") {
      const toast = projectImportResultToast(outcome, (key, params) =>
        this.i18n.t(key, params),
      );
      this.showToast(toast.message, toast.type);
    }
  }

  // Show a simple modal asking user whether the import is for Space or Ground.
  // Returns { environment, strategy } object or null if cancelled.
  /**
   * @param {string} [defaultEnv]
   * @param {ImportType} [importType]
   * @param {ImportContext} [additionalContext]
   * @returns {Promise<EnvironmentImportConfig | null>}
   */
  promptEnvironment(
    defaultEnv = "space",
    importType = "keybinds",
    additionalContext = {},
  ) {
    return this.decisionModalSession.promptEnvironment(
      defaultEnv,
      importType,
      additionalContext,
    );
  }

  // Show a simple modal asking user to choose import strategy for aliases
  // Returns chosen strategy string or null if cancelled
  /** @returns {Promise<ImportStrategy | null>} */
  promptAliasStrategy() {
    return this.decisionModalSession.promptAliasStrategy();
  }

  // Show overwrite confirmation dialog when strategy is overwrite_all
  /**
   * @param {'keys' | 'aliases'} type
   * @param {number} current
   * @param {number} incoming
   * @param {ImportEnvironment | null} [environment]
   * @param {string | null} [customMessage]
   * @returns {Promise<boolean>}
   */
  async showOverwriteConfirmation(
    type,
    current,
    incoming,
    environment = null,
    customMessage = null,
  ) {
    return this.decisionModalSession.showOverwriteConfirmation(
      type,
      current,
      incoming,
      environment,
      customMessage,
    );
  }

  // Enhanced bindset selection with renaming and mapping options
  /**
   * @param {ValidKBFParseResult} parseResult
   * @param {boolean} [bindsetsEnabled]
   * @returns {Promise<BindsetConfiguration | null>}
   */
  promptEnhancedBindsetSelection(
    parseResult,
    bindsetsEnabled = this.isBindsetsEnabled(),
  ) {
    return this.kbfImportSession.prompt(parseResult, bindsetsEnabled);
  }
}
