import UIComponentBase from "../UIComponentBase.js";
import { getSnapshotProfile } from "../services/dataState.js";
import { errorMessage, resolveDocument, resolveI18n } from "./uiTypes.js";

/** @typedef {'keybinds' | 'aliases' | 'kbf'} ImportType */
/** @typedef {'space' | 'ground'} ImportEnvironment */
/** @typedef {'merge_keep' | 'merge_overwrite' | 'overwrite_all'} ImportStrategy */
/** @typedef {{ bindsetsEnabled?: boolean }} ImportContext */
/** @typedef {{ environment: ImportEnvironment, strategy: ImportStrategy }} EnvironmentImportConfig */
/**
 * @typedef {{
 *   valid: true,
 *   bindsetNames: string[],
 *   bindsetKeyCounts: Record<string, number>,
 *   existingBindsets?: string[],
 *   hasMasterBindset?: boolean,
 *   masterDisplayName?: string
 * }} ValidKBFParseResult
 */
/** @typedef {{ valid: false, error?: string }} InvalidKBFParseResult */
/** @typedef {ValidKBFParseResult | InvalidKBFParseResult} KBFParseResult */
/**
 * @typedef {{
 *   success?: boolean,
 *   message?: string,
 *   error?: string,
 *   params?: Record<string, unknown> & { totalErrors?: number, totalWarnings?: number },
 *   imported?: { keys?: number, aliases?: number, bindsets?: number },
 *   skipped?: number,
 *   overwritten?: number,
 *   cleared?: number,
 *   stats?: { skippedActivities?: number, totalErrors?: number, totalWarnings?: number, processingTimeMs?: number },
 *   errors?: unknown[],
 *   warnings?: unknown[],
 *   processedBindsets?: unknown[],
 *   failedBindsets?: unknown[]
 * }} ImportResult
 */
/**
 * @typedef {{
 *   selectedBindsets: string[],
 *   bindsetMappings: Record<string, 'primary' | 'custom'>,
 *   bindsetRenames: Record<string, string>,
 *   singleBindsetMode?: boolean
 * }} BindsetConfiguration
 */
/** @typedef {{ type: 'master-to-primary' | 'new-primary' | 'skip-primary', primaryBindsetName?: string }} PrimaryMapping */
/** @typedef {(value: EnvironmentImportConfig | null) => void} EnvironmentResolver */
/** @typedef {(value: ImportStrategy | null) => void} StrategyResolver */
/** @typedef {(value: boolean) => void} ConfirmationResolver */
/** @typedef {(value: string[] | null) => void} BindsetSelectionResolver */
/** @typedef {(value: BindsetConfiguration | null) => void} ConfigurationResolver */
/** @typedef {{ defaultEnv: string, importType: ImportType, additionalContext: ImportContext, resolve: EnvironmentResolver, modalElement: HTMLDivElement }} ImportModalState */
/** @typedef {{ resolve: StrategyResolver, modalElement: HTMLDivElement }} AliasStrategyModalState */
/** @typedef {{ resolve: ConfirmationResolver, modalElement: HTMLDivElement, customMessage: string | null }} OverwriteModalState */
/** @typedef {{ bindsetNames: string[], hasMasterBindset: boolean, masterDisplayName: string | null, resolve: BindsetSelectionResolver, modalElement: HTMLDivElement }} BindsetSelectionModalState */
/** @typedef {{ parseResult: ValidKBFParseResult, resolve: ConfigurationResolver, modalElement: HTMLDivElement }} EnhancedBindsetModalState */

/**
 * @param {string | null | undefined} value
 * @returns {ImportStrategy}
 */
function normalizeImportStrategy(value) {
  if (value === "merge_overwrite" || value === "overwrite_all") return value;
  return "merge_keep";
}

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
    /** @type {BindsetSelectionModalState | null} */
    this.currentBindsetSelectionModal = null;
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

    // Append to body to ensure click works in all browsers
    this.document.body.appendChild(input);

    input.addEventListener("change", async () => {
      if (!input.files || input.files.length === 0) return;
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const content =
            typeof reader.result === "string" ? reader.result : "";
          // Capture one accepted authority snapshot for the complete import
          // decision. Profile, environment, and overwrite counts must not come
          // from independently timed reads.
          const dataState = this.cache.dataState;
          const profileId = dataState?.ready ? dataState.currentProfile : null;
          const currentEnvironment = dataState?.ready
            ? dataState.currentEnvironment
            : "space";
          const profile = getSnapshotProfile(dataState, profileId);
          /** @type {ImportResult | undefined} */
          let result;
          if (type === "keybinds") {
            // Ask user which environment to import into and what strategy to use
            const importConfig = await this.promptEnvironment(
              currentEnvironment,
              "keybinds",
            );
            if (!importConfig) return; // user cancelled

            // Check for overwrite confirmation if strategy is overwrite_all
            if (importConfig.strategy === "overwrite_all") {
              // Get current key count for the environment
              const currentKeys = Object.keys(
                profile?.builds?.[importConfig.environment]?.keys || {},
              ).length;

              if (currentKeys > 0) {
                const confirmed = await this.showOverwriteConfirmation(
                  "keys",
                  currentKeys,
                  0,
                  importConfig.environment,
                );
                if (!confirmed) return; // user cancelled overwrite
              }
            }

            result = await this.request("import:keybind-file", {
              content,
              profileId,
              environment: importConfig.environment,
              strategy: importConfig.strategy,
            });
          } else if (type === "kbf") {
            // Use the published preference snapshot for context-aware descriptions
            const bindsetsEnabled = this.isBindsetsEnabled();

            // Ask user which environment to import into and what strategy to use
            const importConfig = await this.promptEnvironment(
              currentEnvironment,
              "kbf",
              { bindsetsEnabled }, // Pass context for better descriptions
            );
            if (!importConfig) return; // user cancelled

            // Parse KBF file first to extract bindset information without importing
            /** @type {KBFParseResult} */
            const parseResult = await this.request("parse-kbf-file", {
              content,
              environment: importConfig.environment,
            });

            if (!parseResult.valid) {
              const message = this.i18n.t("invalid_kbf_file_format");
              this.showToast(message, "error");
              this.document.body.removeChild(input);
              return;
            }

            // Always show configuration modal for KBF files to allow bindset mapping options
            const configuration =
              await this.promptEnhancedBindsetSelection(parseResult);

            if (!configuration) {
              this.document.body.removeChild(input);
              return; // user cancelled
            }

            // Import with user configuration and strategy
            result = await this.request("import:kbf-file", {
              content,
              profileId,
              environment: importConfig.environment,
              strategy: importConfig.strategy,
              configuration,
            });
          } else {
            // For alias imports, we need to prompt for strategy too but not environment
            const strategy = await this.promptAliasStrategy();
            if (!strategy) return; // user cancelled

            // Check for overwrite confirmation if strategy is overwrite_all
            if (strategy === "overwrite_all") {
              // Get current alias count
              const currentAliases = Object.keys(profile?.aliases || {}).length;

              if (currentAliases > 0) {
                const confirmed = await this.showOverwriteConfirmation(
                  "aliases",
                  currentAliases,
                  0,
                );
                if (!confirmed) return; // user cancelled overwrite
              }
            }

            result = await this.request("import:alias-file", {
              content,
              profileId,
              strategy,
            });
          }

          // Show appropriate toast based on result
          if (result?.success) {
            let message;
            if (type === "kbf") {
              // Enhanced KBF success messaging with comprehensive statistics
              message = this.getKBFSuccessMessage(result);
            } else {
              // Use strategy-based messages for keybind and alias imports
              let messageKey;
              const imported =
                result.imported?.keys || result.imported?.aliases || 0;
              const skipped = result.skipped || 0;
              const overwritten = result.overwritten || 0;
              const cleared = result.cleared || 0;

              if (cleared > 0) {
                messageKey = "import_result_overwrite_all";
                message = this.i18n.t(messageKey, {
                  imported,
                  cleared,
                });
              } else if (overwritten > 0) {
                messageKey = "import_result_overwrote";
                message = this.i18n.t(messageKey, {
                  imported,
                  overwritten,
                });
              } else if (skipped > 0) {
                messageKey = "import_result_skipped";
                message = this.i18n.t(messageKey, {
                  imported,
                  skipped,
                });
              } else {
                // Fallback to original message for no conflicts
                message = this.i18n.t(result.message ?? "import_completed", {
                  count: imported,
                });
              }
            }
            this.showToast(message, "success");
          } else {
            let message;
            if (type === "kbf") {
              // Enhanced KBF error messaging with detailed summary
              message = this.getKBFErrorMessage(result ?? {});
            } else {
              message = this.i18n.t(
                result?.error ?? "import_failed",
                result?.params,
              );
            }
            this.showToast(message, "error");
          }
        } catch (error) {
          console.error(
            "[ImportUI] Failed to import file:",
            errorMessage(error),
          );
        }
        // Clean up
        this.document.body.removeChild(input);
      };
      reader.readAsText(file);
    });

    // Trigger dialog
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
      this.onDom(".import-space", "click", "import-dialog-space", () =>
        handleChoice("space"),
      );
      this.onDom(".import-ground", "click", "import-dialog-ground", () =>
        handleChoice("ground"),
      );
      this.onDom(".import-cancel", "click", "import-dialog-cancel", () =>
        handleChoice(null),
      );

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
    this.onDom(".import-space", "click", "import-dialog-regen-space", () =>
      handleChoice("space"),
    );
    this.onDom(".import-ground", "click", "import-dialog-regen-ground", () =>
      handleChoice("ground"),
    );
    this.onDom(".import-cancel", "click", "import-dialog-regen-cancel", () =>
      handleChoice(null),
    );
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
      this.onDom(
        ".alias-strategy-confirm",
        "click",
        "alias-strategy-confirm",
        () => {
          const selectedStrategyRadio = /** @type {HTMLInputElement | null} */ (
            modal.querySelector('input[name="alias-import-strategy"]:checked')
          );
          const strategy = normalizeImportStrategy(
            selectedStrategyRadio?.value,
          );
          handleStrategyChoice(strategy);
        },
      );

      this.onDom(
        ".alias-strategy-cancel",
        "click",
        "alias-strategy-cancel",
        () => handleStrategyChoice(null),
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
    this.onDom(
      ".alias-strategy-confirm",
      "click",
      "alias-strategy-regen-confirm",
      () => {
        const selectedStrategyRadio = /** @type {HTMLInputElement | null} */ (
          newModal.querySelector('input[name="alias-import-strategy"]:checked')
        );
        const strategy = normalizeImportStrategy(selectedStrategyRadio?.value);
        handleStrategyChoice(strategy);
      },
    );

    this.onDom(
      ".alias-strategy-cancel",
      "click",
      "alias-strategy-regen-cancel",
      () => handleStrategyChoice(null),
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
      this.onDom(
        ".overwrite-confirm-yes",
        "click",
        "overwrite-confirm-yes",
        () => handleConfirmChoice(true),
      );

      this.onDom(".overwrite-confirm-no", "click", "overwrite-confirm-no", () =>
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
    this.onDom(
      ".overwrite-confirm-yes",
      "click",
      "overwrite-confirm-regen-yes",
      () => handleConfirmChoice(true),
    );

    this.onDom(
      ".overwrite-confirm-no",
      "click",
      "overwrite-confirm-regen-no",
      () => handleConfirmChoice(false),
    );
  }

  // Show a modal asking user which bindsets to import from a multi-bindset KBF file
  /**
   * @param {string[]} bindsetNames
   * @param {boolean} hasMasterBindset
   * @param {string | null} masterDisplayName
   * @returns {Promise<string[] | null>}
   */
  promptBindsetSelection(bindsetNames, hasMasterBindset, masterDisplayName) {
    return new Promise((resolve) => {
      const modal = this.createBindsetSelectionModal(
        bindsetNames,
        hasMasterBindset,
        masterDisplayName,
      );
      const modalId = "bindsetSelectionModal";
      modal.id = modalId;
      this.document.body.appendChild(modal);

      // Store modal data for regeneration
      this.currentBindsetSelectionModal = {
        bindsetNames,
        hasMasterBindset,
        masterDisplayName,
        resolve,
        modalElement: modal,
      };

      // Register regeneration callback for language changes
      this.modalManager?.registerRegenerateCallback?.(modalId, () => {
        this.regenerateBindsetSelectionModal();
      });

      /** @param {string[] | null} selectedBindsets */
      const handleSelection = (selectedBindsets) => {
        // Unregister regeneration callback
        this.modalManager?.unregisterRegenerateCallback?.(modalId);
        this.currentBindsetSelectionModal = null;

        this.modalManager?.hide(modalId);
        if (modal && modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }
        resolve(selectedBindsets);
      };

      // Use EventBus for automatic cleanup
      this.onDom(
        ".bindset-confirm",
        "click",
        "bindset-selection-confirm",
        () => {
          /** @type {string[]} */
          const selectedBindsets = [];
          const checkboxes = modal.querySelectorAll(
            'input[type="checkbox"]:checked',
          );
          checkboxes.forEach((checkbox) => {
            const input = /** @type {HTMLInputElement} */ (checkbox);
            selectedBindsets.push(input.value);
          });
          handleSelection(selectedBindsets);
        },
      );

      this.onDom(".bindset-cancel", "click", "bindset-selection-cancel", () =>
        handleSelection(null),
      );

      // Show modal
      requestAnimationFrame(() => {
        this.modalManager?.show(modalId);
      });
    });
  }

  // Create a modal for bindset selection
  /**
   * @param {string[]} bindsetNames
   * @param {boolean} hasMasterBindset
   * @param {string | null} masterDisplayName
   */
  createBindsetSelectionModal(
    bindsetNames,
    hasMasterBindset,
    masterDisplayName,
  ) {
    const modal = this.document.createElement("div");
    modal.className = "modal import-modal";

    const title = this.i18n.t("select_bindsets_to_import");
    const message = this.i18n.t("select_bindsets_to_import_question");
    const confirmText = this.i18n.t("import_selected");
    const cancelText = this.i18n.t("cancel");

    // Generate bindset options
    let bindsetOptions = "";
    bindsetNames.forEach((name) => {
      const displayName =
        name.toLowerCase() === "master" ? masterDisplayName || name : name;
      const isChecked = name.toLowerCase() === "master" ? "checked" : "";
      bindsetOptions += `
        <div class="bindset-option">
          <input type="checkbox" id="bindset_${name}" name="bindsets" value="${name}" ${isChecked}>
          <label for="bindset_${name}">${displayName}</label>
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
          <div class="bindset-list">
            ${bindsetOptions}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary bindset-confirm">${confirmText}</button>
          <button class="btn btn-secondary bindset-cancel">${cancelText}</button>
        </div>
      </div>
    `;

    return modal;
  }

  // Regeneration method for bindset selection modal
  regenerateBindsetSelectionModal() {
    if (!this.currentBindsetSelectionModal) return;

    const {
      bindsetNames,
      hasMasterBindset,
      masterDisplayName,
      modalElement,
      resolve,
    } = this.currentBindsetSelectionModal;

    const newModal = this.createBindsetSelectionModal(
      bindsetNames,
      hasMasterBindset,
      masterDisplayName,
    );
    newModal.id = "bindsetSelectionModal";

    // Replace the old modal with the new one
    modalElement.replaceWith(newModal);
    this.currentBindsetSelectionModal.modalElement = newModal;

    // Re-attach event listeners
    /** @param {string[] | null} selectedBindsets */
    const handleSelection = (selectedBindsets) => {
      this.modalManager?.unregisterRegenerateCallback?.(
        "bindsetSelectionModal",
      );
      this.currentBindsetSelectionModal = null;
      this.modalManager?.hide("bindsetSelectionModal");
      if (newModal && newModal.parentNode) {
        newModal.parentNode.removeChild(newModal);
      }
      resolve(selectedBindsets);
    };

    // Use EventBus for automatic cleanup
    this.onDom(
      ".bindset-confirm",
      "click",
      "bindset-selection-regen-confirm",
      () => {
        /** @type {string[]} */
        const selectedBindsets = [];
        const checkboxes = newModal.querySelectorAll(
          'input[type="checkbox"]:checked',
        );
        checkboxes.forEach((checkbox) => {
          const input = /** @type {HTMLInputElement} */ (checkbox);
          selectedBindsets.push(input.value);
        });
        handleSelection(selectedBindsets);
      },
    );

    this.onDom(
      ".bindset-cancel",
      "click",
      "bindset-selection-regen-cancel",
      () => handleSelection(null),
    );
  }

  // Get comprehensive KBF success message with detailed statistics
  /** @param {ImportResult} result */
  getKBFSuccessMessage(result) {
    const {
      imported,
      skipped = 0,
      overwritten = 0,
      cleared = 0,
      stats,
      errors,
      warnings,
    } = result;

    // Build base success message with import counts
    let message = this.i18n.t("kbf_import_completed", {
      bindsets: imported?.bindsets || 0,
      keys: imported?.keys || 0,
      aliases: imported?.aliases || 0,
    });

    // Add additional context for comprehensive feedback (requirement 6.8)
    /** @type {string[]} */
    const additionalInfo = [];

    // Add strategy result information for KBF imports
    if (cleared > 0) {
      additionalInfo.push(
        this.i18n.t("import_result_overwrite_all", {
          imported: imported?.keys || 0,
          cleared,
        }),
      );
    } else if (overwritten > 0) {
      additionalInfo.push(
        this.i18n.t("import_result_overwrote", {
          imported: imported?.keys || 0,
          overwritten,
        }),
      );
    } else if (skipped > 0) {
      additionalInfo.push(
        this.i18n.t("import_result_skipped", {
          imported: imported?.keys || 0,
          skipped,
        }),
      );
    }

    // Add skipped activities count if available
    const skippedActivities = stats?.skippedActivities ?? 0;
    if (skippedActivities > 0) {
      additionalInfo.push(
        this.i18n.t("kbf_import_skipped_activities", {
          count: skippedActivities,
        }),
      );
    }

    // Add error and warning summaries if present
    const totalErrors = stats?.totalErrors || errors?.length || 0;
    const totalWarnings = stats?.totalWarnings || warnings?.length || 0;

    if (totalErrors > 0 || totalWarnings > 0) {
      if (totalErrors > 0) {
        additionalInfo.push(
          this.i18n.t("kbf_import_errors_encountered", {
            count: totalErrors,
          }),
        );
      }
      if (totalWarnings > 0) {
        additionalInfo.push(
          this.i18n.t("kbf_import_warnings_generated", {
            count: totalWarnings,
          }),
        );
      }
    }

    // Add processing time if available
    if (stats?.processingTimeMs) {
      const processingSeconds = Math.round(stats.processingTimeMs / 1000);
      additionalInfo.push(
        this.i18n.t("kbf_import_processing_time", {
          seconds: processingSeconds,
        }),
      );
    }

    // Combine base message with additional info
    if (additionalInfo.length > 0) {
      message += "\n" + additionalInfo.join(" • ");
    }

    return message;
  }

  // Enhanced bindset selection with renaming and mapping options
  /**
   * @param {ValidKBFParseResult} parseResult
   * @returns {Promise<BindsetConfiguration | null>}
   */
  async promptEnhancedBindsetSelection(parseResult) {
    // Check if bindsets are disabled - if so, use single-keyset selection
    const modal = this.isBindsetsEnabled()
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
      this.onDom(
        ".enhanced-bindset-confirm",
        "click",
        "enhanced-bindset-selection-confirm",
        () => {
          const configuration = this.validateBindsetConfiguration(
            modal,
            parseResult,
          );
          if (configuration) {
            handleConfiguration(configuration);
          }
        },
      );

      this.onDom(
        ".single-bindset-confirm",
        "click",
        "single-bindset-selection-confirm",
        () => {
          const configuration = this.validateSingleBindsetConfiguration(modal);
          if (configuration) {
            handleConfiguration(configuration);
          }
        },
      );

      this.onDom(
        ".enhanced-bindset-cancel",
        "click",
        "enhanced-bindset-selection-cancel",
        () => handleConfiguration(null),
      );

      this.onDom(
        ".single-bindset-cancel",
        "click",
        "single-bindset-selection-cancel",
        () => handleConfiguration(null),
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
      this.setupPreviewUpdates(modal, parseResult);
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
   * @param {ValidKBFParseResult} parseResult
   */
  setupPreviewUpdates(modal, parseResult) {
    // Initialize table structure based on current dropdown values
    this.initializeTableStructure(modal);

    const updatePreview = () => {
      const configuration = this.validateBindsetConfiguration(
        modal,
        parseResult,
      );
      const previewContent = /** @type {HTMLElement | null} */ (
        modal.querySelector("#preview_content")
      );
      if (!previewContent) return;

      if (configuration && configuration.selectedBindsets.length > 0) {
        let previewHTML = '<div class="preview-table">';

        configuration.selectedBindsets.forEach((bindsetName) => {
          const displayName = bindsetName; // Fix: Show original name in preview as well
          const mapping = configuration.bindsetMappings[bindsetName];
          const finalName = configuration.bindsetRenames[bindsetName];

          let mappingDisplay = "";
          if (mapping === "primary") {
            mappingDisplay = `<span class="mapping-indicator primary">${this.i18n.t("maps_to_primary_bindset")}</span>`;
          } else if (mapping === "custom") {
            const hasConflict =
              finalName !==
              (configuration.bindsetRenames[bindsetName] || bindsetName);
            mappingDisplay = `<span class="mapping-indicator custom ${hasConflict ? "conflict" : ""}">${this.i18n.t("maps_to")}: ${finalName}</span>`;
          }

          previewHTML += `
            <div class="preview-row">
              <span class="preview-original">${displayName}</span>
              <span class="preview-arrow">→</span>
              ${mappingDisplay}
            </div>
          `;
        });

        previewHTML += "</div>";
        previewContent.innerHTML = previewHTML;
      } else {
        previewContent.innerHTML = `<p class="preview-placeholder">${this.i18n.t("select_bindsets_for_preview")}</p>`;
      }
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

  // Get primary mapping preview text
  /** @param {PrimaryMapping} primaryMapping */
  getPrimaryMappingPreview(primaryMapping) {
    switch (primaryMapping.type) {
      case "master-to-primary":
        return `<span class="mapping-indicator primary">${this.i18n.t("mapped_to_primary")}</span>`;
      case "new-primary":
        return `<span class="mapping-indicator new-primary">${this.i18n.t("mapped_to_new_primary", { name: primaryMapping.primaryBindsetName || "Custom Primary" })}</span>`;
      case "skip-primary":
        return `<span class="mapping-indicator skip-primary">${this.i18n.t("mapped_to_named")}</span>`;
      default:
        return "";
    }
  }

  // Resolve bindset name conflicts with incremental numbering
  /**
   * @param {string} proposedName
   * @param {string[] | undefined} existingBindsets
   */
  resolveBindsetName(proposedName, existingBindsets) {
    if (!existingBindsets || !existingBindsets.includes(proposedName)) {
      return proposedName;
    }

    let counter = 1;
    let resolvedName = `${proposedName} (${counter})`;

    while (existingBindsets.includes(resolvedName)) {
      counter++;
      resolvedName = `${proposedName} (${counter})`;
    }

    return resolvedName;
  }

  // Validate and extract configuration from modal
  /**
   * @param {HTMLDivElement} modal
   * @param {ValidKBFParseResult} parseResult
   * @returns {BindsetConfiguration | null}
   */
  validateBindsetConfiguration(modal, parseResult) {
    /** @type {BindsetConfiguration} */
    const configuration = {
      selectedBindsets: [],
      bindsetMappings: {}, // New: mapping destination per bindset
      bindsetRenames: {},
    };

    const dropdowns = /** @type {NodeListOf<HTMLSelectElement>} */ (
      modal.querySelectorAll(".bindset-mapping-select")
    );
    dropdowns.forEach((dropdown) => {
      const bindsetName = dropdown.dataset.bindset;
      const mappingType = dropdown.value;
      if (!bindsetName) return;

      if (mappingType !== "none") {
        configuration.selectedBindsets.push(bindsetName);

        if (mappingType === "mapped") {
          // Look for custom input in either the third column cell or original container
          const customInput = /** @type {HTMLInputElement | null} */ (
            modal.querySelector(
              `.bindset-custom-cell[data-bindset="${bindsetName}"] .bindset-custom-input`,
            ) ||
              modal.querySelector(
                `.bindset-custom-input[data-bindset="${bindsetName}"]`,
              )
          );
          const customName = customInput?.value?.trim();
          const finalName = this.resolveBindsetName(
            customName || bindsetName,
            parseResult.existingBindsets,
          );

          configuration.bindsetMappings[bindsetName] = "custom";
          configuration.bindsetRenames[bindsetName] = finalName;
        } else {
          configuration.bindsetMappings[bindsetName] = "primary";
        }
      }
    });

    return configuration.selectedBindsets.length > 0 ? configuration : null;
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

    if (!selectedRadio) {
      return null;
    }

    const selectedBindsetName = selectedRadio.value;

    // Configuration for single bindset import to primary bindset only
    /** @type {BindsetConfiguration} */
    const configuration = {
      selectedBindsets: [selectedBindsetName],
      bindsetMappings: {
        [selectedBindsetName]: "primary", // Always map to primary when bindsets disabled
      },
      bindsetRenames: {},
      singleBindsetMode: true, // Flag to indicate this is single-bindset mode
    };

    return configuration;
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
    this.onDom(
      ".enhanced-bindset-confirm",
      "click",
      "enhanced-bindset-selection-regen-confirm",
      () => {
        const configuration = this.validateBindsetConfiguration(
          newModal,
          parseResult,
        );
        if (configuration) {
          handleConfiguration(configuration);
        }
      },
    );

    this.onDom(
      ".single-bindset-confirm",
      "click",
      "single-bindset-selection-regen-confirm",
      () => {
        const configuration = this.validateSingleBindsetConfiguration(newModal);
        if (configuration) {
          handleConfiguration(configuration);
        }
      },
    );

    this.onDom(
      ".enhanced-bindset-cancel",
      "click",
      "enhanced-bindset-selection-regen-cancel",
      () => handleConfiguration(null),
    );

    this.onDom(
      ".single-bindset-cancel",
      "click",
      "single-bindset-selection-regen-cancel",
      () => handleConfiguration(null),
    );

    // Re-setup appropriate handlers
    setTimeout(() => {
      if (isSingleBindset) {
        this.setupSingleBindsetSelection(newModal);
      } else {
        this.setupPreviewUpdates(newModal, parseResult);
      }
    }, 0);
  }

  // Get comprehensive KBF error message with detailed summary
  /** @param {ImportResult} result */
  getKBFErrorMessage(result) {
    const { params, errors, warnings, processedBindsets, failedBindsets } =
      result;

    // Build base error message
    let message = this.i18n.t(result?.error || "import_failed", params || {});

    // Add detailed error summary for KBF imports (requirement 6.5)
    /** @type {string[]} */
    const errorSummary = [];

    // Add bindset processing summary
    const processedCount = processedBindsets?.length || 0;
    const failedCount = failedBindsets?.length || 0;

    if (processedCount > 0 || failedCount > 0) {
      if (processedCount > 0) {
        errorSummary.push(
          this.i18n.t("kbf_import_bindsets_processed", {
            count: processedCount,
          }),
        );
      }
      if (failedCount > 0) {
        errorSummary.push(
          this.i18n.t("kbf_import_bindsets_failed", {
            count: failedCount,
          }),
        );
      }
    }

    // Add error and warning counts
    const totalErrors = params?.totalErrors || errors?.length || 0;
    const totalWarnings = params?.totalWarnings || warnings?.length || 0;

    if (totalErrors > 0) {
      errorSummary.push(
        this.i18n.t("kbf_import_total_errors", {
          count: totalErrors,
        }),
      );
    }

    if (totalWarnings > 0) {
      errorSummary.push(
        this.i18n.t("kbf_import_total_warnings", {
          count: totalWarnings,
        }),
      );
    }

    // Combine base message with error summary
    if (errorSummary.length > 0) {
      message +=
        "\n" +
        this.i18n.t("kbf_import_error_summary") +
        ": " +
        errorSummary.join(" • ");
    }

    return message;
  }
}
