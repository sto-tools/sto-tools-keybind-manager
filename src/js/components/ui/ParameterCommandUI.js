import UIComponentBase from "../UIComponentBase.js";
import {
  enrichForDisplay,
  normalizeToString,
} from "../../lib/commandDisplayAdapter.js";
import { STOError } from "../../core/errors.js";
import { getEffectiveCommandBindset } from "../services/dataState.js";
import { errorMessage, resolveDocument, resolveI18n } from "./uiTypes.js";

/** @typedef {string | number | undefined} ParameterValue */
/**
 * @typedef {{
 *   type?: string,
 *   label?: string,
 *   help?: string,
 *   default?: ParameterValue,
 *   options?: string[],
 *   placeholder?: string,
 *   min?: string | number,
 *   max?: string | number,
 *   step?: string | number
 * }} ParameterDefinition
 */
/**
 * @typedef {{
 *   name: string,
 *   parameters: Record<string, ParameterDefinition>,
 *   categoryId?: string,
 *   commandId?: string,
 *   [field: string]: unknown
 * }} ParameterCommandDefinition
 */
/**
 * @typedef {{
 *   categoryId?: string,
 *   commandId?: string,
 *   commandDef: ParameterCommandDefinition,
 *   editIndex?: number,
 *   originalCommand?: string | Record<string, unknown> | null,
 *   isEditing?: boolean
 * }} CurrentParameterCommand
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is ParameterCommandDefinition}
 */
export function isParameterDef(value) {
  if (!isRecord(value)) return false;
  return typeof value.name === "string" && isRecord(value.parameters);
}

/**
 * @param {unknown} value
 * @returns {value is string | { command: string, [field: string]: unknown }}
 */
function isBuiltCommand(value) {
  if (typeof value === "string") return true;
  return isRecord(value) && typeof value.command === "string";
}

/*
 * ParameterCommandUI – a UI component for editing parameterized commands.
 *
 * Responsibilities:
 * 1. Provide a modal for editing parameterized commands.
 * 2. Provide a preview of the generated command.
 * 3. Provide a way to save the command.
 */
export default class ParameterCommandUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./uiTypes.js').EventBus,
   *   modalManager?: import('./uiTypes.js').ModalManagerLike | null,
   *   i18n?: import('./uiTypes.js').I18nLike | null,
   *   ui?: import('./uiTypes.js').UIServiceLike | null,
   *   document?: Document | null
   * }} [options]
   */
  constructor({
    eventBus,
    modalManager = null,
    i18n = null,
    ui = null,
    document = null,
  } = {}) {
    super(eventBus);
    this.componentName = "ParameterCommandUI";

    this.modalManager = modalManager;
    this.i18n = resolveI18n(i18n);
    this.ui = ui;
    this.document = resolveDocument(document);

    // ComponentBase handles activeBindset caching automatically

    /** @type {CurrentParameterCommand | null} */
    this.currentParameterCommand = null;
  }

  /**
   * Safe Number parsing utility with NaN validation
   *
   * This function prevents NaN values from being passed to command building
   * by validating numeric inputs from HTML form fields. Invalid inputs like
   * "abc", "1.2.3", etc. throw validation errors with descriptive messages.
   *
   * @param {string} value - The string value to parse
   * @param {string} paramName - The parameter name being parsed (for error messages)
   * @returns {number | undefined} The parsed number
   * @throws {STOError} If the parsed value is NaN
   */
  safeParseNumber(value, paramName) {
    if (value === "" || value === undefined || value === null) {
      return undefined;
    }

    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw new STOError(
        `Invalid number for ${paramName}: '${value}' is not a valid number`,
        "INVALID_PARAMETER_NUMBER",
      );
    }
    return parsed;
  }

  /**
   * Safe Boolean parsing utility with transformation logic
   *
   * This function handles boolean parameter validation and transformation
   * according to boolean semantics: any non-zero number becomes 1 (true),
   * and 0 remains 0 (false). This provides proper boolean behavior for
   * parameters that are stored as numbers but represent boolean values.
   *
   * @param {string} value - The string value to parse
   * @param {string} paramName - The parameter name being parsed (for error messages)
   * @returns {number | undefined} 0 or 1 (boolean representation as number)
   * @throws {STOError} If the parsed value is NaN
   */
  safeParseBoolean(value, paramName) {
    if (value === "" || value === undefined || value === null) {
      return undefined;
    }

    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw new STOError(
        `Invalid boolean for ${paramName}: '${value}' is not a valid number`,
        "INVALID_PARAMETER_BOOLEAN",
      );
    }

    // Boolean transformation: any non-zero value becomes 1, 0 remains 0
    return parsed !== 0 ? 1 : 0;
  }

  onInit() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    // ComponentBase handles bindset caching automatically via bindset-selector:active-changed
    // No need to manually update _activeBindset - use this.cache.activeBindset instead

    // Handle parameter command editing requests
    this.addEventListener(
      "parameter-command:edit",
      ({ index, command, commandDef, categoryId, commandId }) => {
        if (categoryId && commandId && isParameterDef(commandDef)) {
          this.editParameterizedCommand(index, command, commandDef);
        }
      },
    );

    // Listen for language changes to regenerate modal if open
    // The ModalManagerService will automatically handle regeneration through registered callbacks
    this.addEventListener("language:changed", () => {
      // Modal regeneration is handled by ModalManagerService languageChanged handler
      // No need to manually regenerate here
    });
  }

  // UI – Modal lifecycle
  /**
   * @param {string} categoryId
   * @param {string} commandId
   * @param {ParameterCommandDefinition} commandDef
   */
  showParameterModal(categoryId, commandId, commandDef) {
    this.currentParameterCommand = { categoryId, commandId, commandDef };

    // Create modal lazily
    if (!this.document.getElementById("parameterModal")) {
      this.createParameterModal();
    } else {
      // Re-register regeneration callback if modal already exists
      // This ensures language changes work for subsequent modal openings
      this.modalManager?.registerRegenerateCallback?.("parameterModal", () => {
        this.regenerateParameterModal();
      });
    }

    // Persist command definition on the modal so it can be rebuilt on i18n
    const modal = this.document.getElementById("parameterModal");
    if (modal) {
      modal.setAttribute("data-command-def", JSON.stringify(commandDef));
    }

    this.populateParameterModal(commandDef);

    // Use injected modal manager
    this.modalManager?.show("parameterModal");
  }

  createParameterModal() {
    const modal = this.document.createElement("div");
    modal.className = "modal";
    modal.id = "parameterModal";
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="parameterModalTitle" data-i18n="parameter_configuration">Parameter Configuration</h3>
          <button class="modal-close" data-modal="parameterModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <div id="parameterInputs"></div>
          <div class="command-preview-modal">
            <label data-i18n="generated_command">${this.i18n.t("generated_command")}</label>
            <div class="command-preview" id="parameterCommandPreview"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="saveParameterCommandBtn">${this.i18n.t("add_command")}</button>
          <button class="btn btn-secondary" data-modal="parameterModal">${this.i18n.t("cancel")}</button>
        </div>
      </div>`;

    this.document.body.appendChild(modal);

    // Register regeneration callback for language changes
    this.modalManager?.registerRegenerateCallback?.("parameterModal", () => {
      this.regenerateParameterModal();
    });

    // Attach event handlers using helper method
    this.attachModalEventHandlers();
  }

  cancelParameterCommand() {
    this.currentParameterCommand = null;

    // Reset button text (i18n ready)
    const saveBtn = this.document.getElementById("saveParameterCommandBtn");
    if (saveBtn) {
      saveBtn.textContent = this.i18n.t("add_command");
    }

    // Unregister regeneration callback when cancelling
    this.modalManager?.unregisterRegenerateCallback?.("parameterModal");

    this.modalManager?.hide("parameterModal");
  }

  /**
   * Regeneration method for language changes
   * Rebuilds the modal content while preserving current state
   */
  regenerateParameterModal() {
    if (!this.currentParameterCommand) return;

    // Capture current state before regeneration
    const { commandDef, isEditing } = this.currentParameterCommand;
    const currentParameterValues = this.getParameterValues();

    // Rebuild modal content
    const modal = this.document.getElementById("parameterModal");
    if (!modal) return;

    // Update modal HTML with current language
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="parameterModalTitle" data-i18n="parameter_configuration">Parameter Configuration</h3>
          <button class="modal-close" data-modal="parameterModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <div id="parameterInputs"></div>
          <div class="command-preview-modal">
            <label data-i18n="generated_command">${this.i18n.t("generated_command")}</label>
            <div class="command-preview" id="parameterCommandPreview"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="saveParameterCommandBtn">${this.i18n.t(isEditing ? "save" : "add_command")}</button>
          <button class="btn btn-secondary" data-modal="parameterModal">${this.i18n.t("cancel")}</button>
        </div>
      </div>`;

    // Re-attach event handlers for the new modal content
    this.attachModalEventHandlers();

    // Restore modal state
    if (isEditing) {
      this.populateParameterModalForEdit(commandDef, currentParameterValues);
      // Update button text for editing
      const saveBtn = this.document.getElementById("saveParameterCommandBtn");
      if (saveBtn) {
        saveBtn.textContent = this.i18n.t("save");
      }
    } else {
      this.populateParameterModal(commandDef);
    }
  }

  /**
   * Helper method to attach modal event handlers
   * Used both during modal creation and regeneration
   */
  attachModalEventHandlers() {
    // Save button handler
    this.onDom(
      "saveParameterCommandBtn",
      "click",
      "parameter-command-save",
      () => {
        this.saveParameterCommand();
      },
    );

    // Modal close handlers
    const modal = this.document.getElementById("parameterModal");
    if (modal) {
      modal
        .querySelectorAll('.modal-close, [data-modal="parameterModal"]')
        .forEach((btn) => {
          this.onDom(btn, "click", "parameter-modal-close", () => {
            this.cancelParameterCommand();
          });
        });
    }
  }

  // Modal content helpers
  /** @param {ParameterCommandDefinition} commandDef */
  populateParameterModal(commandDef) {
    const container = this.document.getElementById("parameterInputs");
    const titleElement = this.document.getElementById("parameterModalTitle");

    if (!container || !titleElement) return;

    titleElement.textContent = `${this.i18n.t("configure_colon")} ${commandDef.name}`;
    container.innerHTML = "";
    this.buildParameterInputs(container, commandDef);

    // Initial preview
    this.updateParameterPreview();
  }

  // Edit mode
  /**
   * @param {number} index
   * @param {string | Record<string, unknown> | null | undefined} command
   * @param {ParameterCommandDefinition} commandDef
   */
  editParameterizedCommand(index, command, commandDef) {
    // Convert canonical string command to rich object for editing
    const commandString = normalizeToString(command);

    // Set up for editing mode
    this.currentParameterCommand = {
      categoryId: commandDef.categoryId,
      commandId: commandDef.commandId,
      commandDef,
      editIndex: index,
      originalCommand: command,
      // Flag to indicate we are editing an existing item instead of adding new
      isEditing: true,
    };

    // Create modal lazily
    if (!this.document.getElementById("parameterModal")) {
      this.createParameterModal();
    }

    // Persist command definition on the modal so it can be rebuilt on i18n
    const modal = this.document.getElementById("parameterModal");
    if (modal) {
      modal.setAttribute("data-command-def", JSON.stringify(commandDef));
    }

    // For editing, we need to extract existing parameters from the command
    const enrichCommand = async () => {
      try {
        // Use injected i18n object for translations
        const richCommand =
          /** @type {{ parameters?: Record<string, ParameterValue> }} */ (
            await enrichForDisplay(commandString, this.i18n, {
              eventBus: this.eventBus ?? undefined,
            })
          );
        const existingParams = richCommand.parameters || {};

        // Populate modal with existing parameters
        this.populateParameterModalForEdit(commandDef, existingParams);

        // Update button text for editing
        const saveBtn = this.document.getElementById("saveParameterCommandBtn");
        if (saveBtn) {
          saveBtn.textContent = this.i18n.t("save");
        }

        // Use injected modal manager
        this.modalManager?.show("parameterModal");
      } catch (error) {
        console.error(
          "[ParameterCommandUI] Error enriching command for editing:",
          error,
        );
        // Fallback: populate without existing parameters
        this.populateParameterModalForEdit(commandDef, {});
        this.modalManager?.show("parameterModal");
      }
    };

    enrichCommand();
  }

  /**
   * @param {ParameterCommandDefinition} commandDef
   * @param {Record<string, ParameterValue>} [existingParams]
   */
  populateParameterModalForEdit(commandDef, existingParams = {}) {
    const container = this.document.getElementById("parameterInputs");
    const titleElement = this.document.getElementById("parameterModalTitle");

    if (!container || !titleElement) return;

    titleElement.textContent = `${this.i18n.t("edit_colon")} ${commandDef.name}`;
    container.innerHTML = "";
    this.buildParameterInputs(container, commandDef, existingParams);

    // Initial preview
    this.updateParameterPreview();
  }

  // Live preview / param collection
  async updateParameterPreview() {
    if (!this.currentParameterCommand) return;

    const { categoryId, commandId, commandDef } = this.currentParameterCommand;
    if (!categoryId || !commandId) return;

    let params;
    try {
      params = this.getParameterValues();
    } catch (error) {
      // Handle validation errors from safeParseNumber
      const previewEl = this.document.getElementById("parameterCommandPreview");
      if (previewEl) {
        previewEl.textContent =
          errorMessage(error) || "Invalid parameter values";
        previewEl.style.color = "#d63031"; // Error color
      }
      return;
    }

    try {
      const cmd = await this.request("parameter-command:build", {
        categoryId,
        commandId,
        commandDef,
        params,
      });
      const previewEl = this.document.getElementById("parameterCommandPreview");
      if (!previewEl || !cmd) return;

      if (Array.isArray(cmd)) {
        previewEl.textContent = cmd
          .filter(isBuiltCommand)
          .map((command) =>
            typeof command === "string" ? command : command.command,
          )
          .join(" $$ ");
      } else if (isBuiltCommand(cmd)) {
        previewEl.textContent = typeof cmd === "string" ? cmd : cmd.command;
      } else {
        // Fallback for malformed command objects
        previewEl.textContent = "Error: Invalid command format";
      }
      // Reset color to default on successful preview
      previewEl.style.color = "";
    } catch (error) {
      const previewEl = this.document.getElementById("parameterCommandPreview");
      if (previewEl) {
        if (errorMessage(error) === "please_enter_a_raw_command") {
          const msg = this.i18n.t("please_enter_a_raw_command");
          previewEl.textContent = msg;
        } else {
          // Only log unexpected errors, not the expected "please_enter_a_raw_command"
          console.error("Error updating parameter preview:", error);
          const errMsg = this.i18n.t("error_generating_command");
          previewEl.textContent = errMsg;
        }
      }
    }
  }

  getParameterValues() {
    const container = this.document.getElementById("parameterInputs");
    if (!container) return {};

    /** @type {Record<string, ParameterValue>} */
    const values = {};

    // Get parameter definitions from current command to check types
    const commandDef = this.currentParameterCommand?.commandDef;
    const parameterDefs = commandDef?.parameters || {};

    container.querySelectorAll("input, select").forEach((element) => {
      const input = /** @type {HTMLInputElement | HTMLSelectElement} */ (
        element
      );
      const name = input.name;
      if (!name) return;

      const paramDef = parameterDefs[name];

      if (input.type === "number") {
        if (paramDef?.type === "boolean") {
          values[name] = this.safeParseBoolean(input.value, name);
        } else {
          values[name] = this.safeParseNumber(input.value, name);
        }
      } else {
        values[name] = input.value;
      }
    });

    return values;
  }

  // Saving / Editing
  async saveParameterCommand() {
    // Use ComponentBase cached state
    const currentEnv = this.cache.currentEnvironment || "space";
    const selectedKey =
      currentEnv === "alias"
        ? this.cache.selectedAlias
        : this.cache.selectedKey;

    if (!selectedKey || !this.currentParameterCommand) {
      const message =
        currentEnv === "alias"
          ? this.i18n.t("please_select_an_alias_first")
          : this.i18n.t("please_select_a_key_first");
      this.ui?.showToast?.(message, "warning");
      return;
    }

    const { categoryId, commandId, commandDef } = this.currentParameterCommand;
    if (!categoryId || !commandId) return;

    let params;
    try {
      params = this.getParameterValues();
    } catch (error) {
      // Handle validation errors from safeParseNumber
      this.ui?.showToast?.(
        errorMessage(error) || "Invalid parameter values",
        "error",
      );
      return;
    }

    try {
      const cmd = await this.request("parameter-command:build", {
        categoryId,
        commandId,
        commandDef,
        params,
      });
      if (!cmd) return;

      const builtCommand = Array.isArray(cmd)
        ? cmd.filter(isBuiltCommand)
        : isBuiltCommand(cmd)
          ? cmd
          : null;
      if (!builtCommand) return;
      if (Array.isArray(builtCommand) && !builtCommand.length) return;

      // Check if we're editing an existing command or adding a new one
      if (
        this.currentParameterCommand.isEditing &&
        this.currentParameterCommand.editIndex !== undefined
      ) {
        if (Array.isArray(builtCommand)) return;
        // Editing existing command - emit update event
        this.emit("command:edit", {
          key: selectedKey,
          index: this.currentParameterCommand.editIndex,
          updatedCommand: builtCommand,
          bindset: getEffectiveCommandBindset(
            this.cache.currentEnvironment,
            this.cache.activeBindset,
            this.cache.preferences?.bindsetsEnabled,
          ),
        });
      } else {
        // Adding new command - handle arrays as single batch to avoid race conditions
        // Include active bindset when not in alias mode
        this.emit("command:add", {
          command: builtCommand,
          key: selectedKey,
          bindset: getEffectiveCommandBindset(
            this.cache.currentEnvironment,
            this.cache.activeBindset,
            this.cache.preferences?.bindsetsEnabled,
          ),
        });
      }
    } catch (error) {
      console.error("Error building parameterized command:", error);
      if (errorMessage(error) === "please_enter_a_raw_command") {
        const msg = this.i18n.t("please_enter_a_raw_command");
        this.ui?.showToast?.(msg, "warning");
      } else {
        const errMsg = this.i18n.t("error_generating_command");
        this.ui?.showToast?.(errMsg, "error");
      }
      return;
    }

    // Unregister regeneration callback when saving
    this.modalManager?.unregisterRegenerateCallback?.("parameterModal");

    // Close modal
    this.modalManager?.hide("parameterModal");

    this.currentParameterCommand = null;

    // Reset button text (i18n ready)
    const saveBtn = this.document.getElementById("saveParameterCommandBtn");
    if (saveBtn) {
      saveBtn.textContent = this.i18n.t("add_command");
    }
  }

  // DRY helpers for parameter input generation
  /** @param {string} n */
  formatParameterName(n) {
    return n.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }

  // Provide contextual help text for well-known parameters. Falls back to a
  // generic message when the parameter is unknown.
  /**
   * @param {string} paramName
   * @param {ParameterDefinition} paramDef
   */
  getParameterHelp(paramName, paramDef) {
    if (paramDef.help) return paramDef.help;

    // Use the new command_parameters structure for unified parameter data
    return (
      this.i18n.t(`command_parameters.${paramName}.help`) ||
      this.i18n.t("parameter_value")
    );
  }

  // Resolve option labels with i18n support and special-case tray labels
  /**
   * @param {string} paramName
   * @param {string} value
   */
  getOptionLabel(paramName, value) {
    if (paramName === "verb") {
      return this.i18n.t(`verb.${value}`);
    }
    if (value === "STOTrayExecByTray") {
      return this.i18n.t("stotrayexecbytray_description");
    }
    if (value === "TrayExecByTray") {
      return this.i18n.t("trayexecbytray_description");
    }
    return value;
  }

  // Build all parameter inputs into a container element
  /**
   * @param {HTMLElement} container
   * @param {ParameterCommandDefinition} commandDef
   * @param {Record<string, ParameterValue>} [existingParams]
   */
  buildParameterInputs(container, commandDef, existingParams = {}) {
    Object.entries(commandDef.parameters).forEach(([paramName, paramDef]) => {
      const inputGroup = this.document.createElement("div");
      inputGroup.className = "form-group";

      const label = this.document.createElement("label");
      label.textContent =
        paramDef.label ||
        this.i18n.t(`command_parameters.${paramName}.label`) ||
        this.i18n.t(paramName) ||
        this.formatParameterName(paramName);
      label.setAttribute("for", `param_${paramName}`);

      /** @type {HTMLInputElement | HTMLSelectElement} */
      let inputEl;
      const selectedVal = existingParams[paramName] ?? paramDef.default;

      if (paramDef.type === "select") {
        inputEl = this.document.createElement("select");
        inputEl.id = `param_${paramName}`;
        inputEl.name = paramName;
        (paramDef.options || []).forEach((opt) => {
          const o = this.document.createElement("option");
          o.value = opt;
          o.textContent = this.getOptionLabel(paramName, opt);
          if (opt === selectedVal) o.selected = true;
          inputEl.appendChild(o);
        });
      } else {
        inputEl = this.document.createElement("input");
        inputEl.type =
          paramDef.type === "number" || paramDef.type === "boolean"
            ? "number"
            : "text";
        inputEl.id = `param_${paramName}`;
        inputEl.name = paramName;
        inputEl.value = String(selectedVal ?? "");
        if (paramDef.placeholder) {
          // Translate placeholder if it's a translation key
          if (
            paramDef.placeholder.startsWith("command_definitions.") &&
            this.i18n
          ) {
            inputEl.placeholder =
              this.i18n.t(paramDef.placeholder) || paramDef.placeholder;
          } else {
            inputEl.placeholder = paramDef.placeholder;
          }
        }
        if (paramDef.type === "number" || paramDef.type === "boolean") {
          if (paramDef.min !== undefined) inputEl.min = String(paramDef.min);
          if (paramDef.max !== undefined) inputEl.max = String(paramDef.max);
          if (paramDef.step !== undefined) inputEl.step = String(paramDef.step);
        }
      }

      const help = this.document.createElement("small");
      help.textContent = this.getParameterHelp(paramName, paramDef);

      inputGroup.appendChild(label);
      inputGroup.appendChild(inputEl);
      inputGroup.appendChild(help);
      container.appendChild(inputGroup);

      // Live preview updates
      if (paramDef.type === "boolean") {
        // Special handling for boolean parameters: real-time validation and transformation
        inputEl.addEventListener("input", () => {
          const value = inputEl.value;

          // Validate input is a number first
          const parsed = Number(value);
          if (!Number.isNaN(parsed)) {
            // Transform non-zero values to 1, keep 0 as 0
            const transformedValue = parsed !== 0 ? 1 : 0;

            // Only update the field if the transformation changed the value
            if (parsed !== transformedValue) {
              inputEl.value = String(transformedValue);
            }
          }

          this.updateParameterPreview();
        });
      } else {
        // Standard handling for other parameter types
        inputEl.addEventListener("input", () => this.updateParameterPreview());
      }

      if (inputEl.tagName === "SELECT") {
        inputEl.addEventListener("change", () => this.updateParameterPreview());
      }
    });
  }
}
