import UIComponentBase from "../UIComponentBase.js";
import { getSnapshotProfile } from "../services/dataState.js";
import { MAX_STO_TEXT_IMPORT_BYTES } from "../services/textImportBoundary.js";
import { projectImportResultToast } from "./importResultMessages.js";
import {
  normalizeImportStrategy,
  runImportWorkflow,
} from "./importWorkflow.js";
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
/** @typedef {(value: EnvironmentImportConfig | null) => void} EnvironmentResolver */
/** @typedef {(value: ImportStrategy | null) => void} StrategyResolver */
/** @typedef {(value: boolean) => void} ConfirmationResolver */
/** @typedef {{ defaultEnv: string, importType: ImportType, additionalContext: ImportContext, resolve: EnvironmentResolver, modalElement: HTMLDivElement }} ImportModalState */
/** @typedef {{ resolve: StrategyResolver, modalElement: HTMLDivElement }} AliasStrategyModalState */
/** @typedef {{ resolve: ConfirmationResolver, modalElement: HTMLDivElement, customMessage: string | null }} OverwriteModalState */

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

    // Store current modal data for regeneration
    /** @type {ImportModalState | null} */
    this.currentImportModal = null;
    /** @type {AliasStrategyModalState | null} */
    this.currentAliasStrategyModal = null;
    /** @type {OverwriteModalState | null} */
    this.currentOverwriteConfirmModal = null;
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
      subscribeModalHidden: (handler) => {
        this.addEventListener("modal:hidden", handler);
        return () => this.removeEventListener("modal:hidden", handler);
      },
    });
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
    const input = this.document.createElement("input");
    input.type = "file";
    input.accept = type === "kbf" ? ".kbf,.txt" : ".txt";
    input.style.display = "none";
    this.document.body.appendChild(input);
    let inputAttached = true;

    const removeInput = () => {
      if (!inputAttached) return;
      inputAttached = false;
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      } else {
        this.document.body.removeChild(input);
      }
    };

    input.addEventListener("cancel", removeInput, { once: true });

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        removeInput();
        return;
      }
      if (type !== "kbf" && file.size > MAX_STO_TEXT_IMPORT_BYTES) {
        const errorKey =
          type === "keybinds"
            ? "keybind_file_too_large"
            : "alias_file_too_large";
        this.showToast(
          this.i18n.t(errorKey, {
            size: file.size,
            limit: MAX_STO_TEXT_IMPORT_BYTES,
          }),
          "error",
        );
        removeInput();
        return;
      }

      let reader;
      try {
        reader = new FileReader();
      } catch (error) {
        removeInput();
        console.error("[ImportUI] Failed to import file:", errorMessage(error));
        return;
      }
      reader.onload = async () => {
        try {
          const content =
            typeof reader.result === "string" ? reader.result : "";
          const dataState = this.cache.dataState;
          const profileId = dataState?.ready ? dataState.currentProfile : null;
          const currentEnvironment = dataState?.ready
            ? dataState.currentEnvironment
            : "space";
          const profile = getSnapshotProfile(dataState, profileId);
          const bindsetsEnabled = this.isBindsetsEnabled();
          const outcome = await runImportWorkflow({
            type,
            content,
            profileId,
            currentEnvironment,
            profile,
            bindsetsEnabled,
            promptEnvironment: (...args) => this.promptEnvironment(...args),
            promptAliasStrategy: () => this.promptAliasStrategy(),
            showOverwriteConfirmation: (...args) =>
              this.showOverwriteConfirmation(...args),
            promptEnhancedBindsetSelection: (parseResult) =>
              this.promptEnhancedBindsetSelection(parseResult, bindsetsEnabled),
            request: this.request.bind(this),
          });

          if (outcome.status === "invalid-kbf") {
            this.showToast(
              this.i18n.t(
                outcome.parseResult.error ?? "invalid_kbf_file_format",
                outcome.parseResult.params,
              ),
              "error",
            );
          } else if (outcome.status === "completed") {
            const toast = projectImportResultToast(outcome, (key, params) =>
              this.i18n.t(key, params),
            );
            this.showToast(toast.message, toast.type);
          }
        } catch (error) {
          console.error(
            "[ImportUI] Failed to import file:",
            errorMessage(error),
          );
        } finally {
          removeInput();
        }
      };
      reader.onerror = removeInput;
      reader.onabort = removeInput;
      try {
        reader.readAsText(file);
      } catch (error) {
        removeInput();
        console.error("[ImportUI] Failed to import file:", errorMessage(error));
      }
    });

    input.click();
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
    return new Promise((resolve) => {
      const modal = this.createImportModal(
        defaultEnv,
        importType,
        additionalContext,
      );
      const modalId = "importModal";
      modal.id = modalId;
      this.document.body.appendChild(modal);

      // Store modal data for regeneration
      this.currentImportModal = {
        defaultEnv,
        importType,
        additionalContext,
        resolve,
        modalElement: modal,
      };

      // Register regeneration callback for language changes
      this.modalManager?.registerRegenerateCallback?.(modalId, () => {
        this.regenerateImportModal();
      });

      /** @param {ImportEnvironment | null} choice */
      const handleChoice = (choice) => {
        // Get selected strategy from radio buttons
        const selectedStrategyRadio = /** @type {HTMLInputElement | null} */ (
          modal.querySelector('input[name="import-strategy"]:checked')
        );
        const strategy = normalizeImportStrategy(selectedStrategyRadio?.value);

        // Unregister regeneration callback
        this.modalManager?.unregisterRegenerateCallback?.(modalId);
        this.currentImportModal = null;

        this.modalManager?.hide(modalId);
        if (modal && modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }

        if (choice) {
          resolve({ environment: choice, strategy });
        } else {
          resolve(null);
        }
      };

      // Use EventBus for automatic cleanup
      this.onDom(".import-space", "click", () => handleChoice("space"));
      this.onDom(".import-ground", "click", () => handleChoice("ground"));
      this.onDom(".import-cancel", "click", () => handleChoice(null));

      // Show modal
      requestAnimationFrame(() => {
        this.modalManager?.show(modalId);
      });
    });
  }

  // Create a standard modal for environment selection
  /**
   * @param {string} defaultEnv
   * @param {ImportType} [importType]
   * @param {ImportContext} [additionalContext]
   */
  createImportModal(
    defaultEnv,
    importType = "keybinds",
    additionalContext = {},
  ) {
    const modal = this.document.createElement("div");
    modal.className = "modal import-modal";

    const title = this.i18n.t("import_environment");
    const message = this.i18n.t("import_environment_question");
    const strategyLabel = this.i18n.t("import_strategy");
    const mergeKeepText = this.i18n.t("merge_keep_existing");
    const mergeOverwriteText = this.i18n.t("merge_overwrite_existing");
    const overwriteAllText = this.i18n.t("overwrite_all");
    const spaceText = this.i18n.t("space");
    const groundText = this.i18n.t("ground");
    const cancelText = this.i18n.t("cancel");

    // Enhanced overwrite_all descriptions based on import type
    let overwriteAllDescription = "";
    if (importType === "keybinds") {
      overwriteAllDescription = this.i18n.t(
        "overwrite_all_description_keybinds",
      );
    } else if (importType === "kbf") {
      // For KBF imports, use context-aware descriptions based on bindsets preference
      const { bindsetsEnabled } = additionalContext;

      if (bindsetsEnabled === false) {
        // Bindsets are disabled - only primary bindset will be affected
        overwriteAllDescription = this.i18n.t(
          "overwrite_all_description_kbf_primary",
        );
      } else {
        // Bindsets are enabled - user will choose specific bindsets in next step
        overwriteAllDescription = this.i18n.t(
          "overwrite_all_description_kbf_bindsets",
        );
      }
    } else if (importType === "aliases") {
      overwriteAllDescription = this.i18n.t(
        "overwrite_all_description_aliases",
      );
    }

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>
            <i class="fas fa-file-import"></i>
            ${title}
          </h3>
        </div>
        <div class="modal-body">
          <p>${message}</p>

          <div class="import-strategy-section">
            <label class="import-strategy-label">${strategyLabel}</label>
            <div class="import-strategy-options">
              <label class="import-strategy-option">
                <input type="radio" name="import-strategy" value="merge_keep" checked>
                <span>${mergeKeepText}</span>
              </label>
              <label class="import-strategy-option">
                <input type="radio" name="import-strategy" value="merge_overwrite">
                <span>${mergeOverwriteText}</span>
              </label>
              <label class="import-strategy-option">
                <input type="radio" name="import-strategy" value="overwrite_all">
                <span>${overwriteAllText}</span>
                ${overwriteAllDescription ? `<div class="strategy-description">${overwriteAllDescription}</div>` : ""}
              </label>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary import-space ${defaultEnv === "space" ? "btn-primary" : "btn-secondary"}">${spaceText}</button>
          <button class="btn btn-primary import-ground ${defaultEnv === "ground" ? "btn-primary" : "btn-secondary"}">${groundText}</button>
          <button class="btn btn-secondary import-cancel">${cancelText}</button>
        </div>
      </div>
    `;

    return modal;
  }

  // Regeneration method for language changes
  regenerateImportModal() {
    if (!this.currentImportModal) return;

    const { defaultEnv, importType, additionalContext, modalElement, resolve } =
      this.currentImportModal;

    const newModal = this.createImportModal(
      defaultEnv,
      importType,
      additionalContext,
    );
    newModal.id = "importModal";

    // Replace the old modal with the new one
    modalElement.replaceWith(newModal);
    this.currentImportModal.modalElement = newModal;

    // Re-attach event listeners
    /** @param {ImportEnvironment | null} choice */
    const handleChoice = (choice) => {
      // Get selected strategy from radio buttons
      const selectedStrategyRadio = /** @type {HTMLInputElement | null} */ (
        newModal.querySelector('input[name="import-strategy"]:checked')
      );
      const strategy = normalizeImportStrategy(selectedStrategyRadio?.value);

      this.modalManager?.unregisterRegenerateCallback?.("importModal");
      this.currentImportModal = null;
      this.modalManager?.hide("importModal");
      if (newModal && newModal.parentNode) {
        newModal.parentNode.removeChild(newModal);
      }

      if (choice) {
        resolve({ environment: choice, strategy });
      } else {
        resolve(null);
      }
    };

    // Use EventBus for automatic cleanup
    this.onDom(".import-space", "click", () => handleChoice("space"));
    this.onDom(".import-ground", "click", () => handleChoice("ground"));
    this.onDom(".import-cancel", "click", () => handleChoice(null));
  }

  // Show a simple modal asking user to choose import strategy for aliases
  // Returns chosen strategy string or null if cancelled
  /** @returns {Promise<ImportStrategy | null>} */
  promptAliasStrategy() {
    return new Promise((resolve) => {
      const modal = this.createAliasStrategyModal();
      const modalId = "aliasStrategyModal";
      modal.id = modalId;
      this.document.body.appendChild(modal);

      // Store modal data for regeneration
      this.currentAliasStrategyModal = { resolve, modalElement: modal };

      // Register regeneration callback for language changes
      this.modalManager?.registerRegenerateCallback?.(modalId, () => {
        this.regenerateAliasStrategyModal();
      });

      /** @param {ImportStrategy | null} strategy */
      const handleStrategyChoice = (strategy) => {
        // Unregister regeneration callback
        this.modalManager?.unregisterRegenerateCallback?.(modalId);
        this.currentAliasStrategyModal = null;

        this.modalManager?.hide(modalId);
        if (modal && modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }
        resolve(strategy);
      };

      // Use EventBus for automatic cleanup
      this.onDom(".alias-strategy-confirm", "click", () => {
        const selectedStrategyRadio = /** @type {HTMLInputElement | null} */ (
          modal.querySelector('input[name="alias-import-strategy"]:checked')
        );
        const strategy = normalizeImportStrategy(selectedStrategyRadio?.value);
        handleStrategyChoice(strategy);
      });

      this.onDom(".alias-strategy-cancel", "click", () =>
        handleStrategyChoice(null),
      );

      // Show modal
      requestAnimationFrame(() => {
        this.modalManager?.show(modalId);
      });
    });
  }

  // Create a modal for alias strategy selection
  createAliasStrategyModal() {
    const modal = this.document.createElement("div");
    modal.className = "modal import-modal";

    const title = this.i18n.t("import_strategy");
    const strategyLabel = this.i18n.t("import_strategy");
    const mergeKeepText = this.i18n.t("merge_keep_existing");
    const mergeOverwriteText = this.i18n.t("merge_overwrite_existing");
    const overwriteAllText = this.i18n.t("overwrite_all");
    const overwriteAllDescription = this.i18n.t(
      "overwrite_all_description_aliases",
    );
    const confirmText = this.i18n.t("import");
    const cancelText = this.i18n.t("cancel");

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>
            <i class="fas fa-file-import"></i>
            ${title}
          </h3>
        </div>
        <div class="modal-body">
          <label class="import-strategy-label">${strategyLabel}</label>
          <div class="import-strategy-options">
            <label class="import-strategy-option">
              <input type="radio" name="alias-import-strategy" value="merge_keep" checked>
              <span>${mergeKeepText}</span>
            </label>
            <label class="import-strategy-option">
              <input type="radio" name="alias-import-strategy" value="merge_overwrite">
              <span>${mergeOverwriteText}</span>
            </label>
            <label class="import-strategy-option">
              <input type="radio" name="alias-import-strategy" value="overwrite_all">
              <span>${overwriteAllText}</span>
              <div class="strategy-description">${overwriteAllDescription}</div>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary alias-strategy-confirm">${confirmText}</button>
          <button class="btn btn-secondary alias-strategy-cancel">${cancelText}</button>
        </div>
      </div>
    `;

    return modal;
  }

  // Regeneration method for alias strategy modal
  regenerateAliasStrategyModal() {
    if (!this.currentAliasStrategyModal) return;

    const { modalElement, resolve } = this.currentAliasStrategyModal;

    const newModal = this.createAliasStrategyModal();
    newModal.id = "aliasStrategyModal";

    // Replace the old modal with the new one
    modalElement.replaceWith(newModal);
    this.currentAliasStrategyModal.modalElement = newModal;

    // Re-attach event listeners
    /** @param {ImportStrategy | null} strategy */
    const handleStrategyChoice = (strategy) => {
      this.modalManager?.unregisterRegenerateCallback?.("aliasStrategyModal");
      this.currentAliasStrategyModal = null;
      this.modalManager?.hide("aliasStrategyModal");
      if (newModal && newModal.parentNode) {
        newModal.parentNode.removeChild(newModal);
      }
      resolve(strategy);
    };

    // Use EventBus for automatic cleanup
    this.onDom(".alias-strategy-confirm", "click", () => {
      const selectedStrategyRadio = /** @type {HTMLInputElement | null} */ (
        newModal.querySelector('input[name="alias-import-strategy"]:checked')
      );
      const strategy = normalizeImportStrategy(selectedStrategyRadio?.value);
      handleStrategyChoice(strategy);
    });

    this.onDom(".alias-strategy-cancel", "click", () =>
      handleStrategyChoice(null),
    );
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
    return new Promise((resolve) => {
      const modal = this.createOverwriteConfirmationModal(
        type,
        current,
        incoming,
        environment,
        customMessage,
      );
      const modalId = "overwriteConfirmModal";
      modal.id = modalId;
      this.document.body.appendChild(modal);

      // Store modal data for regeneration
      this.currentOverwriteConfirmModal = {
        resolve,
        modalElement: modal,
        customMessage,
      };

      // Register regeneration callback for language changes
      this.modalManager?.registerRegenerateCallback?.(modalId, () => {
        this.regenerateOverwriteConfirmationModal(
          type,
          current,
          incoming,
          environment,
        );
      });

      /** @param {boolean} confirmed */
      const handleConfirmChoice = (confirmed) => {
        // Unregister regeneration callback
        this.modalManager?.unregisterRegenerateCallback?.(modalId);
        this.currentOverwriteConfirmModal = null;

        this.modalManager?.hide(modalId);
        if (modal && modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }
        resolve(confirmed);
      };

      // Use EventBus for automatic cleanup
      this.onDom(".overwrite-confirm-yes", "click", () =>
        handleConfirmChoice(true),
      );

      this.onDom(".overwrite-confirm-no", "click", () =>
        handleConfirmChoice(false),
      );

      // Show modal
      requestAnimationFrame(() => {
        this.modalManager?.show(modalId);
      });
    });
  }

  // Create overwrite confirmation modal
  /**
   * @param {'keys' | 'aliases'} type
   * @param {number} current
   * @param {number} incoming
   * @param {ImportEnvironment | null} environment
   * @param {string | null} [customMessage]
   */
  createOverwriteConfirmationModal(
    type,
    current,
    incoming,
    environment,
    customMessage = null,
  ) {
    const modal = this.document.createElement("div");
    modal.className = "modal import-modal";

    const title = this.i18n.t("overwrite_confirm_title");
    let bodyText;

    // Use custom message if provided, otherwise fall back to default logic
    if (customMessage) {
      bodyText = customMessage;
    } else if (type === "keys" && environment) {
      bodyText = this.i18n.t("overwrite_confirm_body_keys", { environment });
    } else {
      bodyText = this.i18n.t("overwrite_confirm_body_aliases");
    }

    // Only show counts if we're using the default logic (for non-custom messages)
    const countsText = customMessage
      ? ""
      : this.i18n.t("overwrite_counts", { current, incoming });
    const yesText = this.i18n.t("overwrite_all_action");
    const noText = this.i18n.t("cancel");

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>
            <i class="fas fa-exclamation-triangle"></i>
            ${title}
          </h3>
        </div>
        <div class="modal-body">
          <p>${bodyText}</p>
          ${countsText ? `<p><strong>${countsText}</strong></p>` : ""}
        </div>
        <div class="modal-footer">
          <button class="btn btn-danger overwrite-confirm-yes">${yesText}</button>
          <button class="btn btn-secondary overwrite-confirm-no">${noText}</button>
        </div>
      </div>
    `;

    return modal;
  }

  // Regeneration method for overwrite confirmation modal
  /**
   * @param {'keys' | 'aliases'} type
   * @param {number} current
   * @param {number} incoming
   * @param {ImportEnvironment | null} environment
   */
  regenerateOverwriteConfirmationModal(type, current, incoming, environment) {
    if (!this.currentOverwriteConfirmModal) return;

    const {
      modalElement,
      customMessage: storedCustomMessage,
      resolve,
    } = this.currentOverwriteConfirmModal;

    const newModal = this.createOverwriteConfirmationModal(
      type,
      current,
      incoming,
      environment,
      storedCustomMessage,
    );
    newModal.id = "overwriteConfirmModal";

    // Replace the old modal with the new one
    modalElement.replaceWith(newModal);
    this.currentOverwriteConfirmModal.modalElement = newModal;

    // Re-attach event listeners
    /** @param {boolean} confirmed */
    const handleConfirmChoice = (confirmed) => {
      this.modalManager?.unregisterRegenerateCallback?.(
        "overwriteConfirmModal",
      );
      this.currentOverwriteConfirmModal = null;
      this.modalManager?.hide("overwriteConfirmModal");
      if (newModal && newModal.parentNode) {
        newModal.parentNode.removeChild(newModal);
      }
      resolve(confirmed);
    };

    // Use EventBus for automatic cleanup
    this.onDom(".overwrite-confirm-yes", "click", () =>
      handleConfirmChoice(true),
    );

    this.onDom(".overwrite-confirm-no", "click", () =>
      handleConfirmChoice(false),
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
