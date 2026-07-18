import UIComponentBase from "../UIComponentBase.js";
import { escapeHtml } from "../../lib/htmlEscape.js";
import { resolveDocument, resolveI18n } from "./uiTypes.js";

/**
 * @typedef {{
 *   bindsetName: string,
 *   keyCount: number,
 *   modalId: string,
 *   modalElement: HTMLElement,
 *   resolve: (confirmed: boolean) => void,
 *   regenerateCallback: () => void,
 *   draft: { acknowledged: boolean, text: string },
 *   controlDetachers: Array<() => void>,
 *   documentDetach: (() => void) | null,
 *   modalHiddenDetach: (() => void) | null,
 *   settled: boolean
 * }} BindsetDeleteSession
 */

/**
 * BindsetDeleteConfirmUI owns one multi-step confirmation session at a time.
 * Every settlement path releases the session's DOM listeners, document
 * listener, regeneration callback, and modal before resolving its promise.
 */
export default class BindsetDeleteConfirmUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./uiTypes.js').EventBus,
   *   modalManager?: import('./uiTypes.js').ModalManagerLike,
   *   i18n?: import('./uiTypes.js').I18nLike,
   *   document?: Document
   * }} [options]
   */
  constructor({ eventBus, modalManager, i18n, document } = {}) {
    super(eventBus);
    this.componentName = "BindsetDeleteConfirmUI";
    this.modalManager = modalManager;
    this.i18n = resolveI18n(i18n);
    this.document = resolveDocument(document);
    /** @type {BindsetDeleteSession | null} */
    this.currentModal = null;
  }

  onDestroy() {
    this.cancelActiveConfirmation();
  }

  /**
   * Show a multi-step confirmation dialog. Starting another confirmation
   * cancels and completely releases the active session first.
   *
   * @param {string} bindsetName
   * @param {number} keyCount
   * @param {string} [prefix]
   * @returns {Promise<boolean>}
   */
  async confirm(bindsetName, keyCount, prefix = "") {
    this.cancelActiveConfirmation();

    return new Promise((resolve) => {
      const modalId = prefix
        ? `${prefix}BindsetDeleteConfirmModal`
        : "bindsetDeleteConfirmModal";
      const modalElement = this.createModal(bindsetName, keyCount);
      modalElement.id = modalId;

      /** @type {BindsetDeleteSession} */
      const session = {
        bindsetName,
        keyCount,
        modalId,
        modalElement,
        resolve,
        regenerateCallback: () => {},
        draft: { acknowledged: false, text: "" },
        controlDetachers: [],
        documentDetach: null,
        modalHiddenDetach: null,
        settled: false,
      };
      session.regenerateCallback = () => this.regenerateModal(session);
      this.currentModal = session;
      this.document.body.appendChild(modalElement);

      if (!this.bindModalControls(session, modalElement)) {
        this.settleSession(session, false);
        return;
      }

      /** @param {KeyboardEvent} event */
      const handleEscape = (event) => {
        if (event.key === "Escape") this.settleSession(session, false);
      };
      this.document.addEventListener("keydown", handleEscape);
      session.documentDetach = () => {
        this.document.removeEventListener("keydown", handleEscape);
      };

      /** @param {{ modalId: string }} message */
      const handleModalHidden = ({ modalId: hiddenModalId }) => {
        if (hiddenModalId === session.modalId) {
          this.settleSession(session, false, false);
        }
      };
      this.addEventListener("modal:hidden", handleModalHidden);
      session.modalHiddenDetach = () => {
        this.removeEventListener("modal:hidden", handleModalHidden);
      };

      this.modalManager?.registerRegenerateCallback?.(
        modalId,
        session.regenerateCallback,
      );
      this.modalManager?.show(modalId);
    });
  }

  /**
   * Cancel and release the active confirmation without destroying this helper.
   * KeyBrowserUI can call this from onDestroy and reuse the same helper after
   * its own reinitialization.
   *
   * @returns {boolean} Whether an active session was cancelled.
   */
  cancelActiveConfirmation() {
    const session = this.currentModal;
    if (!session) return false;
    this.settleSession(session, false);
    return true;
  }

  /**
   * @param {BindsetDeleteSession} session
   * @param {boolean} result
   * @param {boolean} [hideModal]
   */
  settleSession(session, result, hideModal = true) {
    if (session.settled) return;
    session.settled = true;
    if (this.currentModal === session) this.currentModal = null;
    const documentDetach = session.documentDetach;
    const modalHiddenDetach = session.modalHiddenDetach;
    const releases = [
      () => this.detachModalControls(session),
      () => documentDetach?.(),
      () => modalHiddenDetach?.(),
      () =>
        this.modalManager?.unregisterRegenerateCallback?.(
          session.modalId,
          session.regenerateCallback,
        ),
      () => {
        if (hideModal) this.modalManager?.hide(session.modalId);
      },
      () => session.modalElement.remove(),
    ];
    session.documentDetach = null;
    session.modalHiddenDetach = null;
    for (const release of releases) {
      try {
        release();
      } catch (error) {
        console.error(
          "[BindsetDeleteConfirmUI] Session cleanup failed:",
          error,
        );
      }
    }
    session.resolve(result);
  }

  /** @param {BindsetDeleteSession} session */
  detachModalControls(session) {
    for (const detach of session.controlDetachers.splice(0)) detach();
  }

  /**
   * @param {BindsetDeleteSession} session
   * @param {EventTarget} target
   * @param {string} eventName
   * @param {EventListener} handler
   */
  listenToControl(session, target, eventName, handler) {
    target.addEventListener(eventName, handler);
    session.controlDetachers.push(() => {
      target.removeEventListener(eventName, handler);
    });
  }

  /**
   * Bind one generated modal to the existing session. Regeneration detaches the
   * old controls before binding the replacement and never duplicates the
   * document listener or regeneration callback.
   *
   * @param {BindsetDeleteSession} session
   * @param {HTMLElement} modal
   * @returns {boolean}
   */
  bindModalControls(session, modal) {
    this.detachModalControls(session);
    const checkbox = /** @type {HTMLInputElement | null} */ (
      modal.querySelector("#bindset-delete-confirm-checkbox")
    );
    const textInput = /** @type {HTMLInputElement | null} */ (
      modal.querySelector("#bindset-delete-confirm-input")
    );
    const deleteButton = /** @type {HTMLButtonElement | null} */ (
      modal.querySelector(".bindset-delete-confirm-btn")
    );
    const cancelButton = /** @type {HTMLButtonElement | null} */ (
      modal.querySelector(".bindset-delete-cancel-btn")
    );
    if (!checkbox || !textInput || !deleteButton || !cancelButton) return false;

    checkbox.checked = session.draft.acknowledged;
    textInput.value = session.draft.text;

    const validate = () => {
      session.draft.acknowledged = checkbox.checked;
      session.draft.text = textInput.value;
      const confirmed =
        session.draft.acknowledged &&
        session.draft.text.trim().toUpperCase() === "DELETE";
      deleteButton.disabled = !confirmed;
      textInput.disabled = !session.draft.acknowledged;
      return confirmed;
    };
    /** @type {EventListener} */
    const handleConfirm = () => {
      if (validate()) this.settleSession(session, true);
    };
    /** @type {EventListener} */
    const handleCancel = () => this.settleSession(session, false);

    this.listenToControl(session, checkbox, "change", validate);
    this.listenToControl(session, textInput, "input", validate);
    this.listenToControl(session, deleteButton, "click", handleConfirm);
    this.listenToControl(session, cancelButton, "click", handleCancel);
    validate();
    return true;
  }

  /**
   * Replace the active modal after a language change while preserving its
   * checkbox and text draft.
   *
   * @param {BindsetDeleteSession | null} [expectedSession]
   * @returns {boolean} Whether an active modal was regenerated.
   */
  regenerateModal(expectedSession = this.currentModal) {
    const session = expectedSession;
    if (!session || session !== this.currentModal || session.settled)
      return false;

    const currentCheckbox = /** @type {HTMLInputElement | null} */ (
      session.modalElement.querySelector("#bindset-delete-confirm-checkbox")
    );
    const currentInput = /** @type {HTMLInputElement | null} */ (
      session.modalElement.querySelector("#bindset-delete-confirm-input")
    );
    if (currentCheckbox) session.draft.acknowledged = currentCheckbox.checked;
    if (currentInput) session.draft.text = currentInput.value;

    const replacement = this.createModal(session.bindsetName, session.keyCount);
    replacement.id = session.modalId;
    this.detachModalControls(session);
    session.modalElement.replaceWith(replacement);
    session.modalElement = replacement;
    if (!this.bindModalControls(session, replacement)) {
      this.settleSession(session, false);
      return false;
    }
    return true;
  }

  /**
   * @param {string} bindsetName
   * @param {number} keyCount
   * @returns {HTMLElement}
   */
  createModal(bindsetName, keyCount) {
    const modal = this.document.createElement("div");
    modal.className = "modal bindset-delete-confirm-modal";
    /** @param {string} key @param {Record<string, unknown>} [params] */
    const translated = (key, params) => escapeHtml(this.i18n.t(key, params));
    const warningTitle = translated("confirm_delete_bindset_with_keys");
    const warningMessage = translated("bindset_delete_warning", {
      name: bindsetName,
      count: keyCount,
    });
    const confirmationText = translated("bindset_delete_confirmation_text");
    const instructionText = translated("bindset_delete_type_confirm");

    modal.innerHTML = `
      <div class="modal-content bindset-delete-confirm-content">
        <div class="modal-header">
          <h3>
            <i class="fas fa-exclamation-triangle"></i>
            ${warningTitle}
          </h3>
        </div>
        <div class="modal-body">
          <div class="bindset-delete-warning">
            <p><strong>${warningMessage}</strong></p>
            <p>${translated("bindset_delete_consequences")}</p>
          </div>

          <div class="bindset-delete-steps">
            <div class="bindset-delete-step">
              <label class="checkbox-label">
                <input type="checkbox" id="bindset-delete-confirm-checkbox">
                <span class="checkmark"></span>
                ${confirmationText}
              </label>
            </div>

            <div class="bindset-delete-step">
              <label for="bindset-delete-confirm-input" class="input-label">
                ${instructionText}
              </label>
              <input
                type="text"
                id="bindset-delete-confirm-input"
                class="form-control"
                placeholder="DELETE"
                disabled
                autocomplete="off"
                spellcheck="false"
              >
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary bindset-delete-cancel-btn">
            ${translated("cancel")}
          </button>
          <button class="btn btn-danger bindset-delete-confirm-btn" disabled>
            ${translated("delete")}
          </button>
        </div>
      </div>
    `;

    return modal;
  }
}
