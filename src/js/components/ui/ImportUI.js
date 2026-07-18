import UIComponentBase from "../UIComponentBase.js";
import { getSnapshotProfile } from "../services/dataState.js";
import { MAX_STO_TEXT_IMPORT_BYTES } from "../services/textImportBoundary.js";
import { projectImportResultToast } from "./importResultMessages.js";
import {
  normalizeImportStrategy,
  runImportWorkflow,
} from "./importWorkflow.js";
import {
  materializeKBFImportConfiguration,
  materializeSingleKBFImportConfiguration,
} from "./kbfImportConfiguration.js";
import { buildKBFPreviewHtml } from "./kbfPreviewDom.js";
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
/** @typedef {(value: BindsetConfiguration | null) => void} ConfigurationResolver */
/** @typedef {{ defaultEnv: string, importType: ImportType, additionalContext: ImportContext, resolve: EnvironmentResolver, modalElement: HTMLDivElement }} ImportModalState */
/** @typedef {{ resolve: StrategyResolver, modalElement: HTMLDivElement }} AliasStrategyModalState */
/** @typedef {{ resolve: ConfirmationResolver, modalElement: HTMLDivElement, customMessage: string | null }} OverwriteModalState */
/** @typedef {{ parseResult: ValidKBFParseResult, resolve: ConfigurationResolver, modalElement: HTMLDivElement }} EnhancedBindsetModalState */

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
    /** @type {EnhancedBindsetModalState | null} */
    this.currentEnhancedBindsetSelectionModal = null;
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
  async promptEnhancedBindsetSelection(
    parseResult,
    bindsetsEnabled = this.isBindsetsEnabled(),
  ) {
    const modal = bindsetsEnabled
      ? this.createEnhancedBindsetSelectionModal(parseResult)
      : this.createSingleBindsetSelectionModal(parseResult);
    const modalId = "enhancedBindsetSelectionModal";

    return new Promise((resolve) => {
      modal.id = modalId;
      this.document.body.appendChild(modal);

      // Store modal data for regeneration
      this.currentEnhancedBindsetSelectionModal = {
        parseResult,
        resolve,
        modalElement: modal,
      };

      // Register regeneration callback for language changes
      this.modalManager?.registerRegenerateCallback?.(modalId, () => {
        this.regenerateEnhancedBindsetSelectionModal();
      });

      /** @param {BindsetConfiguration | null} configuration */
      const handleConfiguration = (configuration) => {
        // Unregister regeneration callback
        this.modalManager?.unregisterRegenerateCallback?.(modalId);
        this.currentEnhancedBindsetSelectionModal = null;

        this.modalManager?.hide(modalId);
        if (modal && modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }
        resolve(configuration);
      };

      // Use EventBus for automatic cleanup
      this.onDom(".enhanced-bindset-confirm", "click", () => {
        const configuration = this.validateBindsetConfiguration(modal);
        if (configuration) {
          handleConfiguration(configuration);
        }
      });

      this.onDom(".single-bindset-confirm", "click", () => {
        const configuration = this.validateSingleBindsetConfiguration(modal);
        if (configuration) {
          handleConfiguration(configuration);
        }
      });

      this.onDom(".enhanced-bindset-cancel", "click", () =>
        handleConfiguration(null),
      );

      this.onDom(".single-bindset-cancel", "click", () =>
        handleConfiguration(null),
      );

      // Show modal
      requestAnimationFrame(() => {
        this.modalManager?.show(modalId);
      });
    });
  }

  // Create enhanced modal for bindset selection with table-grid layout
  /** @param {ValidKBFParseResult} parseResult */
  createEnhancedBindsetSelectionModal(parseResult) {
    const modal = this.document.createElement("div");
    modal.className =
      "modal import-modal enhanced-bindset-selection large-modal";

    const title = this.i18n.t("configure_kbf_import");
    const message = this.i18n.t("configure_kbf_import_question");
    const confirmText = this.i18n.t("import_configured");
    const cancelText = this.i18n.t("cancel");

    const { bindsetNames, bindsetKeyCounts } = parseResult;

    // Generate bindset rows for 4-column table layout with key counts
    let bindsetRows = "";
    bindsetNames.forEach((name) => {
      const displayName = name; // Fix: Always show original file name in "Original Bindset" column
      const isMaster = name.toLowerCase() === "master";
      const shouldSelectPrimary = isMaster; // Master bindset defaults to "Maps to Primary Bindset"
      const keyCount = bindsetKeyCounts[name] || 0;
      bindsetRows += `
        <tr class="bindset-row" data-bindset="${name}">
          <td class="bindset-name-cell">
            <span class="bindset-name">${displayName}</span>
            ${isMaster ? '<span class="bindset-indicator primary">Primary</span>' : ""}
          </td>
          <td class="bindset-count-cell">
            <span class="key-count">${keyCount}</span>
          </td>
          <td class="bindset-type-cell" colspan="2">
            <select class="bindset-mapping-select" data-bindset="${name}">
              <option value="primary" ${shouldSelectPrimary ? "selected" : ""}>${this.i18n.t("maps_to_primary_bindset")}</option>
              <option value="mapped" ${!shouldSelectPrimary ? "selected" : ""}>${this.i18n.t("maps_to")}</option>
              <option value="none">${this.i18n.t("not_mapped")}</option>
            </select>
            <div class="bindset-custom-container" style="display: none;">
              <input type="text" class="bindset-custom-input" data-bindset="${name}"
                     placeholder="${name}" value="${name}">
            </div>
          </td>
        </tr>
      `;
    });

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>
            <i class="fas fa-layer-group"></i>
            ${title}
          </h3>
        </div>
        <div class="modal-body">
          <p>${message}</p>

          <div class="enhanced-bindset-grid">
            <table class="bindset-table">
              <thead>
                <tr>
                  <th class="bindset-header">${this.i18n.t("original_bindset_name")}</th>
                  <th class="bindset-header">${this.i18n.t("key_count")}</th>
                  <th class="bindset-header">${this.i18n.t("mapping_type")}</th>
                  <th class="bindset-header">${this.i18n.t("mapping_destination")}</th>
                </tr>
              </thead>
              <tbody>
                ${bindsetRows}
              </tbody>
            </table>
          </div>

          <div class="enhanced-preview-section">
            <h4>${this.i18n.t("import_preview")}</h4>
            <div id="preview_content" class="preview-content">
              <p class="preview-placeholder">${this.i18n.t("select_bindsets_for_preview")}</p>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary enhanced-bindset-confirm">${confirmText}</button>
          <button class="btn btn-secondary enhanced-bindset-cancel">${cancelText}</button>
        </div>
      </div>
    `;

    // Add event listeners for real-time preview updates
    setTimeout(() => {
      this.setupPreviewUpdates(modal);
    }, 0);

    return modal;
  }

  // Create simplified single-keyset selection modal for bindsetsDisabled=false mode
  /** @param {ValidKBFParseResult} parseResult */
  createSingleBindsetSelectionModal(parseResult) {
    const modal = this.document.createElement("div");
    modal.className =
      "modal import-modal single-bindset-selection medium-modal";

    const title = this.i18n.t("select_bindset_to_import");
    const message = this.i18n.t("select_bindset_import_question");
    const confirmText = this.i18n.t("import_selected");
    const cancelText = this.i18n.t("cancel");

    const { bindsetNames, bindsetKeyCounts } = parseResult;

    // Generate simple radio button options with clean styling
    let bindsetOptions = "";
    bindsetNames.forEach((name, index) => {
      const displayName = name;
      const isMaster = name.toLowerCase() === "master";
      const keyCount = bindsetKeyCounts[name] || 0;
      const isChecked = isMaster || index === 0; // Default to master or first bindset

      bindsetOptions += `
        <div class="single-bindset-option ${isChecked ? "selected" : ""}" data-bindset="${name}">
          <label class="single-bindset-label">
            <input type="radio" name="selectedBindset" value="${name}"
                   class="single-bindset-radio" data-bindset="${name}"
                   ${isChecked ? "checked" : ""}>

            <div class="single-bindset-content">
              <div class="single-bindset-main">
                <span class="single-bindset-name">${displayName}</span>
                ${isMaster ? '<span class="single-bindset-badge primary">Primary</span>' : ""}
              </div>
              <div class="single-bindset-meta">
                <span class="single-bindset-count">${keyCount} keys</span>
              </div>
            </div>
          </label>
        </div>
      `;
    });

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>
            <i class="fas fa-layer-group"></i>
            ${title}
          </h3>
        </div>
        <div class="modal-body">
          <p>${message}</p>

          <div class="single-bindset-container">
            ${bindsetOptions}
          </div>

          <div class="bindset-functionality-info">
            <div class="info-header">
              <i class="fas fa-info-circle"></i>
              <span>${this.i18n.t("reduced_bindset_functionality")}</span>
            </div>
            <div class="info-content">
              <p>${this.i18n.t("reduced_bindset_functionality_description")}</p>
              <p><strong>${this.i18n.t("enable_full_bindset_functionality")}</strong></p>
            </div>
          </div>

          <div class="single-bindset-note">
            <i class="fas fa-info-circle"></i> ${this.i18n.t("single_bindset_import_note")}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary single-bindset-confirm">${confirmText}</button>
          <button class="btn btn-secondary single-bindset-cancel">${cancelText}</button>
        </div>
      </div>
    `;

    // Add click handlers for better UX
    setTimeout(() => {
      this.setupSingleBindsetSelection(modal);
    }, 0);

    return modal;
  }

  // Setup enhanced selection for single bindset modal
  /** @param {HTMLDivElement} modal */
  setupSingleBindsetSelection(modal) {
    // Safety check for test environments
    if (!modal || typeof modal.querySelectorAll !== "function") {
      return;
    }

    const options = /** @type {NodeListOf<HTMLElement>} */ (
      modal.querySelectorAll(".single-bindset-option")
    );
    const radios = /** @type {NodeListOf<HTMLInputElement>} */ (
      modal.querySelectorAll(".single-bindset-radio")
    );

    // Handle option clicks for better UX
    options.forEach((option) => {
      option.addEventListener("click", () => {
        const bindsetName = option.dataset.bindset;
        const radio = /** @type {HTMLInputElement | null} */ (
          modal.querySelector(
            `.single-bindset-radio[data-bindset="${bindsetName}"]`,
          )
        );

        if (radio) {
          radio.checked = true;
          this.updateSingleBindsetSelection(modal);
        }
      });
    });

    // Handle radio changes for keyboard navigation
    radios.forEach((radio) => {
      radio.addEventListener("change", () => {
        this.updateSingleBindsetSelection(modal);
      });
    });

    // Initialize selection state
    this.updateSingleBindsetSelection(modal);
  }

  // Update visual selection state of single bindset options
  /** @param {HTMLDivElement} modal */
  updateSingleBindsetSelection(modal) {
    const options = /** @type {NodeListOf<HTMLElement>} */ (
      modal.querySelectorAll(".single-bindset-option")
    );

    options.forEach((option) => {
      const bindsetName = option.dataset.bindset;
      const radio = /** @type {HTMLInputElement | null} */ (
        modal.querySelector(
          `.single-bindset-radio[data-bindset="${bindsetName}"]`,
        )
      );

      if (radio && radio.checked) {
        option.classList.add("selected");
      } else {
        option.classList.remove("selected");
      }
    });
  }

  // Setup real-time preview updates
  /**
   * @param {HTMLDivElement} modal
   */
  setupPreviewUpdates(modal) {
    // Initialize table structure based on current dropdown values
    this.initializeTableStructure(modal);

    const updatePreview = () => {
      const configuration = this.validateBindsetConfiguration(modal);
      const previewContent = /** @type {HTMLElement | null} */ (
        modal.querySelector("#preview_content")
      );
      if (!previewContent) return;
      previewContent.innerHTML = buildKBFPreviewHtml(configuration, (key) =>
        this.i18n.t(key),
      );
    };

    // Add listeners to dropdown controls and custom inputs
    if (!modal || typeof modal.querySelectorAll !== "function") {
      return; // Safety check for test environments
    }

    const dropdowns = /** @type {NodeListOf<HTMLSelectElement>} */ (
      modal.querySelectorAll(".bindset-mapping-select")
    );
    const customInputs = /** @type {NodeListOf<HTMLInputElement>} */ (
      modal.querySelectorAll(".bindset-custom-input")
    );

    dropdowns.forEach((dropdown) => {
      dropdown.addEventListener("change", (event) => {
        if (!(event.target instanceof HTMLSelectElement)) return;
        const bindsetName = event.target.dataset.bindset;
        if (!bindsetName) return;
        const row = /** @type {HTMLTableRowElement | null} */ (
          modal.querySelector(`tr[data-bindset="${bindsetName}"]`)
        );
        const typeCell = /** @type {HTMLTableCellElement | null} */ (
          row?.querySelector(".bindset-type-cell") ?? null
        );
        const customContainer = /** @type {HTMLElement | null} */ (
          modal.querySelector(
            `.bindset-custom-container[data-bindset="${bindsetName}"]`,
          ) ||
            modal.querySelector(
              `.bindset-type-cell[data-bindset="${bindsetName}"] .bindset-custom-container`,
            )
        );
        const customInput = /** @type {HTMLInputElement | null} */ (
          modal.querySelector(
            `.bindset-custom-input[data-bindset="${bindsetName}"]`,
          )
        );
        if (!row || !typeCell || !customInput) return;

        if (event.target.value === "mapped") {
          // Remove colspan and add third column cell
          this.addThirdColumnCell(row, typeCell, customInput, bindsetName);
        } else {
          // Restore colspan and remove third column cell
          this.removeThirdColumnCell(
            row,
            typeCell,
            customContainer,
            customInput,
          );
        }

        updatePreview();
      });
    });

    customInputs.forEach((input) => {
      input.addEventListener("input", updatePreview);
    });

    // Generate initial preview based on default values
    updatePreview();
  }

  // Initialize table structure based on current dropdown values (for regeneration)
  /** @param {HTMLDivElement} modal */
  initializeTableStructure(modal) {
    // Safety check for test environments or missing modal
    if (!modal || typeof modal.querySelectorAll !== "function") {
      return;
    }

    const dropdowns = /** @type {NodeListOf<HTMLSelectElement>} */ (
      modal.querySelectorAll(".bindset-mapping-select")
    );

    dropdowns.forEach((dropdown) => {
      const bindsetName = dropdown.dataset.bindset;
      if (!bindsetName) return;
      const row = /** @type {HTMLTableRowElement | null} */ (
        modal.querySelector(`tr[data-bindset="${bindsetName}"]`)
      );

      // Safety check for missing row
      if (!row) return;

      const typeCell = /** @type {HTMLTableCellElement | null} */ (
        row.querySelector(".bindset-type-cell")
      );
      const customContainer = /** @type {HTMLElement | null} */ (
        modal.querySelector(
          `.bindset-custom-container[data-bindset="${bindsetName}"]`,
        ) ||
          modal.querySelector(
            `.bindset-type-cell[data-bindset="${bindsetName}"] .bindset-custom-container`,
          )
      );
      const customInput = /** @type {HTMLInputElement | null} */ (
        modal.querySelector(
          `.bindset-custom-input[data-bindset="${bindsetName}"]`,
        )
      );
      if (!typeCell || !customInput) return;

      if (dropdown.value === "mapped") {
        // Check if third column cell already exists
        if (!row.querySelector(".bindset-custom-cell")) {
          this.addThirdColumnCell(row, typeCell, customInput, bindsetName);
        }
      } else {
        // Remove third column cell if it exists
        if (row.querySelector(".bindset-custom-cell")) {
          this.removeThirdColumnCell(
            row,
            typeCell,
            customContainer,
            customInput,
          );
        }
      }
    });
  }

  // Add third column cell for custom input when "Maps to" is selected
  /**
   * @param {HTMLTableRowElement} row
   * @param {HTMLTableCellElement} typeCell
   * @param {HTMLInputElement} customInput
   * @param {string} bindsetName
   */
  addThirdColumnCell(row, typeCell, customInput, bindsetName) {
    // Check if third column cell already exists
    if (row.querySelector(".bindset-custom-cell")) {
      return; // Already exists, nothing to do
    }

    // Remove colspan from type cell
    typeCell.removeAttribute("colspan");

    // Create third column cell
    const customCell = this.document.createElement("td");
    customCell.className = "bindset-custom-cell";
    customCell.setAttribute("data-bindset", bindsetName);

    // Clone the custom input to move it to the new cell
    const newCustomInput = /** @type {HTMLInputElement} */ (
      customInput.cloneNode(true)
    );
    newCustomInput.style.display = "block";
    customCell.appendChild(newCustomInput);

    // Add the new cell to the row
    row.appendChild(customCell);

    // Hide the old container
    const oldContainer = /** @type {HTMLElement | null} */ (
      typeCell.querySelector(".bindset-custom-container")
    );
    if (oldContainer) {
      oldContainer.style.display = "none";
    }

    // Focus on the new input
    newCustomInput.focus();
  }

  // Remove third column cell and restore colspan when not using "Maps to"
  /**
   * @param {HTMLTableRowElement} row
   * @param {HTMLTableCellElement} typeCell
   * @param {HTMLElement | null} customContainer
   * @param {HTMLInputElement} customInput
   */
  removeThirdColumnCell(row, typeCell, customContainer, customInput) {
    // Find and remove the third column cell if it exists
    const customCell = /** @type {HTMLTableCellElement | null} */ (
      row.querySelector(".bindset-custom-cell")
    );
    if (customCell) {
      // Get the input from the custom cell before removing
      const cellInput = /** @type {HTMLInputElement | null} */ (
        customCell.querySelector(".bindset-custom-input")
      );
      if (cellInput) {
        // Copy the value back to the original input
        customInput.value = cellInput.value;
      }
      row.removeChild(customCell);
    }

    // Restore colspan to type cell
    typeCell.setAttribute("colspan", "2");

    // Hide the custom container
    if (customContainer) {
      customContainer.style.display = "none";
    }
    customInput.style.display = "none";
  }

  // Validate and extract configuration from modal
  /**
   * @param {HTMLDivElement} modal
   * @returns {BindsetConfiguration | null}
   */
  validateBindsetConfiguration(modal) {
    const dropdowns = /** @type {NodeListOf<HTMLSelectElement>} */ (
      modal.querySelectorAll(".bindset-mapping-select")
    );
    const mappings = Array.from(dropdowns, (dropdown) => {
      const row = dropdown.closest?.("tr");
      const customInput = /** @type {HTMLInputElement | null} */ (
        row?.querySelector(".bindset-custom-cell .bindset-custom-input") ??
          row?.querySelector(".bindset-custom-input") ??
          null
      );
      return {
        bindsetName: dropdown.dataset.bindset,
        mappingType: dropdown.value,
        customName: customInput?.value,
      };
    });

    return materializeKBFImportConfiguration(mappings);
  }

  // Validate single bindset configuration for bindsetsEnabled=false mode
  /**
   * @param {HTMLDivElement} modal
   * @returns {BindsetConfiguration | null}
   */
  validateSingleBindsetConfiguration(modal) {
    const selectedRadio = /** @type {HTMLInputElement | null} */ (
      modal.querySelector(".single-bindset-radio:checked")
    );
    return materializeSingleKBFImportConfiguration(selectedRadio?.value);
  }

  // Regeneration method for enhanced bindset selection modal
  regenerateEnhancedBindsetSelectionModal() {
    if (!this.currentEnhancedBindsetSelectionModal) return;

    const { parseResult, modalElement, resolve } =
      this.currentEnhancedBindsetSelectionModal;

    // Check if we need to regenerate single bindset modal or enhanced modal
    const isSingleBindset = modalElement.classList.contains(
      "single-bindset-selection",
    );
    let newModal;

    if (isSingleBindset) {
      newModal = this.createSingleBindsetSelectionModal(parseResult);
    } else {
      newModal = this.createEnhancedBindsetSelectionModal(parseResult);
    }
    newModal.id = "enhancedBindsetSelectionModal";

    // Replace the old modal with the new one
    modalElement.replaceWith(newModal);
    this.currentEnhancedBindsetSelectionModal.modalElement = newModal;

    // Re-attach event listeners
    /** @param {BindsetConfiguration | null} configuration */
    const handleConfiguration = (configuration) => {
      this.modalManager?.unregisterRegenerateCallback?.(
        "enhancedBindsetSelectionModal",
      );
      this.currentEnhancedBindsetSelectionModal = null;
      this.modalManager?.hide("enhancedBindsetSelectionModal");
      if (newModal && newModal.parentNode) {
        newModal.parentNode.removeChild(newModal);
      }
      resolve(configuration);
    };

    // Use EventBus for automatic cleanup
    this.onDom(".enhanced-bindset-confirm", "click", () => {
      const configuration = this.validateBindsetConfiguration(newModal);
      if (configuration) {
        handleConfiguration(configuration);
      }
    });

    this.onDom(".single-bindset-confirm", "click", () => {
      const configuration = this.validateSingleBindsetConfiguration(newModal);
      if (configuration) {
        handleConfiguration(configuration);
      }
    });

    this.onDom(".enhanced-bindset-cancel", "click", () =>
      handleConfiguration(null),
    );

    this.onDom(".single-bindset-cancel", "click", () =>
      handleConfiguration(null),
    );

    // Re-setup appropriate handlers
    setTimeout(() => {
      if (isSingleBindset) {
        this.setupSingleBindsetSelection(newModal);
      } else {
        this.setupPreviewUpdates(newModal);
      }
    }, 0);
  }
}
