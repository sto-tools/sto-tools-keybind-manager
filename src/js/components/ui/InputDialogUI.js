import UIComponentBase from "../UIComponentBase.js";
import { resolveI18n } from "./uiTypes.js";

/**
 * @typedef {{
 *   message: string,
 *   title: string,
 *   defaultValue: string,
 *   placeholder: string,
 *   type: string,
 *   validate: ((value: string) => true | string) | null,
 *   maxLength: number,
 *   resolve: (value: string | null) => void,
 *   modalElement: HTMLElement
 * }} InputModalState
 */

/**
 * @typedef {{
 *   modalElement: HTMLElement,
 *   inputElement: HTMLInputElement,
 *   submitBtn: HTMLButtonElement,
 *   cancelBtn: HTMLButtonElement,
 *   errorDiv: HTMLElement,
 *   validate: ((value: string) => true | string) | null,
 *   resolve: (value: string | null) => void,
 *   topicSuffix?: string
 * }} InputModalControls
 */

/**
 * InputDialogUI – responsible for rendering input dialogs and
 * resolving with the user's input or null if cancelled.
 */
export default class InputDialogUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./uiTypes.js').EventBus | null,
   *   modalManager?: import('./uiTypes.js').ModalManagerLike | null,
   *   i18n?: import('./uiTypes.js').I18nLike
   * }} [options]
   */
  constructor({ eventBus = null, modalManager = null, i18n } = {}) {
    super(eventBus);
    this.componentName = "InputDialogUI";
    this.modalManager = modalManager;
    this.i18n = resolveI18n(i18n);

    // Store current modal data for regeneration
    /** @type {InputModalState | null} */
    this.currentInputModal = null;
  }

  onInit() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Listen for language changes and regenerate modal if open
    this.addEventListener("language:changed", () => {
      // i18n instance is injected through constructor - no need to update from global

      // Regenerate modal if currently open
      if (this.currentInputModal) {
        this.regenerateInputModal();
      }
    });
  }

  /**
   * Show an input dialog and resolve with the user's input or null if cancelled.
   * @param {string} message - The message to display
   * @param {import('./uiTypes.js').InputDialogOptions} [options] - Configuration options
   * @returns {Promise<string|null>} User input or null if cancelled
   */
  async prompt(message, options = {}) {
    const {
      title = "Input",
      defaultValue = "",
      placeholder = "",
      type = "text",
      validate = null,
      maxLength = 255,
    } = options;

    return new Promise((resolve) => {
      const inputModal = this.createInputModal(
        message,
        title,
        defaultValue,
        placeholder,
        type,
        validate,
        maxLength,
      );
      const inputId = "inputModal";
      inputModal.id = inputId;
      document.body.appendChild(inputModal);

      // Store modal data for regeneration
      this.currentInputModal = {
        message,
        title,
        defaultValue,
        placeholder,
        type,
        validate,
        maxLength,
        resolve,
        modalElement: inputModal,
      };

      // Register regeneration callback for language changes
      this.modalManager?.registerRegenerateCallback?.(inputId, () => {
        this.regenerateInputModal();
      });

      const inputElement = /** @type {HTMLInputElement | null} */ (
        inputModal.querySelector(".input-field")
      );
      const submitBtn = /** @type {HTMLButtonElement | null} */ (
        inputModal.querySelector(".input-submit")
      );
      const cancelBtn = /** @type {HTMLButtonElement | null} */ (
        inputModal.querySelector(".input-cancel")
      );
      const errorDiv = /** @type {HTMLElement | null} */ (
        inputModal.querySelector(".input-error")
      );
      if (!inputElement || !submitBtn || !cancelBtn || !errorDiv) {
        this.closeModal(inputModal, inputId);
        resolve(null);
        return;
      }

      this.bindInputModalControls({
        modalElement: inputModal,
        inputElement,
        submitBtn,
        cancelBtn,
        errorDiv,
        validate,
        resolve,
      });

      // Initial button state
      const hasInitialContent = defaultValue.trim().length > 0;
      submitBtn.disabled = !hasInitialContent;

      // Show modal and focus input
      requestAnimationFrame(() => {
        this.modalManager?.show(inputId);
        inputElement.focus();
        inputElement.select(); // Select default text for easy replacement
      });
    });
  }

  /**
   * Close the modal and clean up
   * @private
   * @param {HTMLElement} modalElement
   * @param {string} modalId
   */
  closeModal(modalElement, modalId) {
    // Unregister regeneration callback
    this.modalManager?.unregisterRegenerateCallback?.(modalId);
    this.currentInputModal = null;

    this.modalManager?.hide(modalId);
    if (modalElement && modalElement.parentNode) {
      modalElement.parentNode.removeChild(modalElement);
    }
  }

  /**
   * Attach the shared submit, cancel, input, and keyboard behavior.
   * @private
   * @param {InputModalControls} controls
   */
  bindInputModalControls({
    modalElement,
    inputElement,
    submitBtn,
    cancelBtn,
    errorDiv,
    validate,
    resolve,
    topicSuffix = "",
  }) {
    const modalId = modalElement.id;
    /** @param {string} name */
    const topic = (name) =>
      `input-dialog-${name}${topicSuffix ? `-${topicSuffix}` : ""}`;

    const handleCancel = () => {
      this.closeModal(modalElement, modalId);
      resolve(null);
    };

    const handleSubmit = () => {
      const value = inputElement.value;
      const validationResult = validate?.(value) ?? true;
      if (validationResult !== true) {
        errorDiv.textContent =
          typeof validationResult === "string"
            ? validationResult
            : this.i18n.t("invalid_input");
        errorDiv.style.display = "block";
        inputElement.focus();
        return;
      }

      this.closeModal(modalElement, modalId);
      resolve(value);
    };

    const inputHandler = () => {
      errorDiv.style.display = "none";
      submitBtn.disabled = inputElement.value.trim().length === 0;
    };

    /** @param {Event} event */
    const keyHandler = (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key === "Enter" && !submitBtn.disabled) {
        event.preventDefault();
        handleSubmit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        handleCancel();
      }
    };

    this.onDom(submitBtn, "click", topic("submit"), handleSubmit);
    this.onDom(cancelBtn, "click", topic("cancel"), handleCancel);
    this.onDom(inputElement, "input", topic("input"), inputHandler);
    this.onDom(inputElement, "keydown", topic("keydown"), keyHandler);
  }

  /**
   * Internal helper – generates the DOM for the input dialog.
   * @private
   * @param {string} message
   * @param {string} title
   * @param {string} defaultValue
   * @param {string} placeholder
   * @param {string} type
   * @param {((value: string) => true | string) | null} validate
   * @param {number} maxLength
   */
  createInputModal(
    message,
    title,
    defaultValue,
    placeholder,
    type,
    validate,
    maxLength,
  ) {
    const modal = document.createElement("div");
    modal.className = "modal input-modal";

    const submitText = this.i18n.t("ok");
    const cancelText = this.i18n.t("cancel");

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>
            <i class="fas fa-edit"></i>
            ${title}
          </h3>
        </div>
        <div class="modal-body">
          <p>${message}</p>
          <div class="input-group">
            <input 
              type="${type}" 
              class="input-field" 
              value="${defaultValue}" 
              placeholder="${placeholder}"
              maxlength="${maxLength}"
              autocomplete="off"
            />
            <div class="input-error" style="display: none; color: #dc3545; font-size: 0.875em; margin-top: 0.25rem;"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary input-submit">${submitText}</button>
          <button class="btn btn-secondary input-cancel">${cancelText}</button>
        </div>
      </div>
    `;

    return modal;
  }

  // Regeneration method for language changes
  regenerateInputModal() {
    if (!this.currentInputModal) return;

    const {
      message,
      title,
      defaultValue,
      placeholder,
      type,
      validate,
      maxLength,
      modalElement,
      resolve,
    } = this.currentInputModal;

    // Preserve current input value before regeneration
    const currentInput = /** @type {HTMLInputElement | null} */ (
      modalElement.querySelector(".input-field")
    );
    const currentValue = currentInput?.value || defaultValue;

    const newModal = this.createInputModal(
      message,
      title,
      defaultValue,
      placeholder,
      type,
      validate,
      maxLength,
    );
    newModal.id = "inputModal";

    // Replace the old modal with the new one
    modalElement.replaceWith(newModal);
    this.currentInputModal.modalElement = newModal;

    // Restore input value
    const inputElement = /** @type {HTMLInputElement | null} */ (
      newModal.querySelector(".input-field")
    );
    const submitBtn = /** @type {HTMLButtonElement | null} */ (
      newModal.querySelector(".input-submit")
    );
    const cancelBtn = /** @type {HTMLButtonElement | null} */ (
      newModal.querySelector(".input-cancel")
    );
    const errorDiv = /** @type {HTMLElement | null} */ (
      newModal.querySelector(".input-error")
    );
    if (!inputElement || !submitBtn || !cancelBtn || !errorDiv) {
      this.closeModal(newModal, "inputModal");
      resolve(null);
      return;
    }

    inputElement.value = currentValue;

    this.bindInputModalControls({
      modalElement: newModal,
      inputElement,
      submitBtn,
      cancelBtn,
      errorDiv,
      validate,
      resolve,
      topicSuffix: "regen",
    });

    // Set initial button state
    const hasContent = currentValue.trim().length > 0;
    submitBtn.disabled = !hasContent;

    // Focus input
    inputElement.focus();
    inputElement.select();
  }
}
