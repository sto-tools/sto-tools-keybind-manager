import { buildKBFPreviewHtml } from "./kbfPreviewDom.js";
import {
  materializeKBFImportConfiguration,
  materializeSingleKBFImportConfiguration,
} from "./kbfImportConfiguration.js";
import {
  captureEnhancedKBFImportModalDraft,
  captureSingleKBFImportModalDraft,
  projectEnhancedKBFImportModalRow,
  projectSingleKBFImportModalSelection,
} from "./kbfImportModalDom.js";
import {
  captureModalViewDraft,
  releaseModalSessionResources,
  restoreModalViewDraft,
} from "./modalSessionLifecycle.js";
import { eventElement } from "./uiTypes.js";

/** @typedef {Extract<import('../../types/rpc/import-export.js').KBFParseForUiResult, { valid: true }>} ValidKBFParseResult */
/** @typedef {import('../../types/kbf-boundary.js').KBFImportConfiguration} KBFImportConfiguration */
/** @typedef {ReturnType<typeof captureEnhancedKBFImportModalDraft>} EnhancedDraft */
/** @typedef {ReturnType<typeof captureSingleKBFImportModalDraft>} SingleDraft */
/** @typedef {'enhanced' | 'single'} KBFModalMode */
/** @typedef {(message: { modalId: string, success: boolean }) => void} ModalHiddenHandler */
/** @typedef {(handler: ModalHiddenHandler) => (() => void)} ModalHiddenSubscriber */
/** @typedef {(callback: () => void) => (() => void)} FrameScheduler */
/** @typedef {(parseResult: ValidKBFParseResult, draft?: EnhancedDraft) => HTMLDivElement} EnhancedModalFactory */
/** @typedef {(parseResult: ValidKBFParseResult, draft?: SingleDraft) => HTMLDivElement} SingleModalFactory */
/**
 * @typedef {{
 *   mode: KBFModalMode,
 *   parseResult: ValidKBFParseResult,
 *   modalId: string,
 *   modalElement: HTMLDivElement,
 *   draft: EnhancedDraft | SingleDraft,
 *   resolve: (configuration: KBFImportConfiguration | null) => void,
 *   regenerateCallback: () => void,
 *   controlDetachers: Array<() => void>,
 *   documentDetach: (() => void) | null,
 *   modalHiddenDetach: (() => void) | null,
 *   scheduledShowDetach: (() => void) | null,
 *   settled: boolean
 * }} KBFModalSession
 */
const FOCUSABLE_CONTROL_SELECTORS = Object.freeze([
  ".bindset-mapping-select",
  ".bindset-custom-input",
  ".single-bindset-radio",
  ".enhanced-bindset-confirm",
  ".enhanced-bindset-cancel",
  ".single-bindset-confirm",
  ".single-bindset-cancel",
]);

/** @type {FrameScheduler} */
const scheduleAnimationFrame = (callback) => {
  if (typeof globalThis.requestAnimationFrame === "function") {
    const frameId = globalThis.requestAnimationFrame(callback);
    return () => globalThis.cancelAnimationFrame?.(frameId);
  }
  const timeoutId = globalThis.setTimeout(callback, 0);
  return () => globalThis.clearTimeout(timeoutId);
};

/**
 * Owns one KBF configuration modal session. Controls are bound directly to the
 * generated modal and released on every settlement or regeneration path, so a
 * detached predecessor can never act on its replacement.
 */
export default class KBFImportModalSession {
  /**
   * @param {{
   *   document: Document,
   *   modalManager?: import('./uiTypes.js').ModalManagerLike | null,
   *   translate: import('./uiTypes.js').I18nLike['t'],
   *   createEnhancedModal: EnhancedModalFactory,
   *   createSingleModal: SingleModalFactory,
   *   subscribeModalHidden?: ModalHiddenSubscriber,
   *   scheduleFrame?: FrameScheduler
   * }} options
   */
  constructor({
    document,
    modalManager = null,
    translate,
    createEnhancedModal,
    createSingleModal,
    subscribeModalHidden,
    scheduleFrame = scheduleAnimationFrame,
  }) {
    this.document = document;
    this.modalManager = modalManager;
    this.translate = translate;
    this.createEnhancedModal = createEnhancedModal;
    this.createSingleModal = createSingleModal;
    this.subscribeModalHidden = subscribeModalHidden;
    this.scheduleFrame = scheduleFrame;
    /** @type {KBFModalSession | null} */
    this.currentSession = null;
  }

  /** @returns {HTMLDivElement | null} */
  get modalElement() {
    return this.currentSession?.modalElement ?? null;
  }

  /**
   * @param {ValidKBFParseResult} parseResult
   * @param {boolean} bindsetsEnabled
   * @returns {Promise<KBFImportConfiguration | null>}
   */
  prompt(parseResult, bindsetsEnabled) {
    this.cancelActiveSession();
    return new Promise((resolve) => {
      const mode = bindsetsEnabled ? "enhanced" : "single";
      const modalId = "enhancedBindsetSelectionModal";
      const modalElement = this.createModal(mode, parseResult);
      modalElement.id = modalId;
      /** @type {KBFModalSession} */
      const session = {
        mode,
        parseResult,
        modalId,
        modalElement,
        draft: {},
        resolve,
        regenerateCallback: () => {},
        controlDetachers: [],
        documentDetach: null,
        modalHiddenDetach: null,
        scheduledShowDetach: null,
        settled: false,
      };
      session.regenerateCallback = () => this.regenerate(session);
      this.currentSession = session;
      try {
        this.document.body.appendChild(modalElement);

        if (!this.bindModal(session)) {
          this.settle(session, null);
          return;
        }

        /** @param {KeyboardEvent} event */
        const handleEscape = (event) => {
          if (event.key === "Escape") this.settle(session, null);
        };
        this.document.addEventListener("keydown", handleEscape);
        session.documentDetach = () =>
          this.document.removeEventListener("keydown", handleEscape);

        session.modalHiddenDetach =
          this.subscribeModalHidden?.(({ modalId: hiddenModalId, success }) => {
            if (hiddenModalId === session.modalId && success === true) {
              this.settle(session, null, false);
            }
          }) ?? null;
        this.modalManager?.registerRegenerateCallback?.(
          modalId,
          session.regenerateCallback,
        );
        let framePending = true;
        const detachScheduledShow = this.scheduleFrame(() => {
          framePending = false;
          session.scheduledShowDetach = null;
          if (session === this.currentSession && !session.settled) {
            const shown = this.modalManager?.show(modalId);
            if (shown === false) this.settle(session, null, false);
          }
        });
        if (framePending && !session.settled) {
          session.scheduledShowDetach = detachScheduledShow;
        }
      } catch (error) {
        console.error("[KBFImportModalSession] Setup failed:", error);
        this.settle(session, null);
      }
    });
  }

  /** @returns {boolean} */
  cancelActiveSession() {
    const session = this.currentSession;
    if (!session) return false;
    this.settle(session, null);
    return true;
  }

  destroy() {
    this.cancelActiveSession();
  }

  /**
   * @param {KBFModalMode} mode
   * @param {ValidKBFParseResult} parseResult
   * @param {EnhancedDraft | SingleDraft} [draft]
   */
  createModal(mode, parseResult, draft) {
    return mode === "enhanced"
      ? this.createEnhancedModal(
          parseResult,
          /** @type {EnhancedDraft | undefined} */ (draft),
        )
      : this.createSingleModal(
          parseResult,
          /** @type {SingleDraft | undefined} */ (draft),
        );
  }

  /** @param {KBFModalSession} session */
  captureDraft(session) {
    return session.mode === "enhanced"
      ? captureEnhancedKBFImportModalDraft(session.modalElement)
      : captureSingleKBFImportModalDraft(session.modalElement);
  }

  /** @param {KBFModalSession} session */
  materializeConfiguration(session) {
    if (session.mode === "enhanced") {
      const draft = captureEnhancedKBFImportModalDraft(session.modalElement);
      session.draft = draft;
      return materializeKBFImportConfiguration(draft.mappings ?? []);
    }
    const draft = captureSingleKBFImportModalDraft(session.modalElement);
    session.draft = draft;
    return materializeSingleKBFImportConfiguration(draft.selectedBindsetName);
  }

  /** @param {KBFModalSession} session */
  updateProjection(session) {
    if (session.mode === "single") {
      projectSingleKBFImportModalSelection(session.modalElement);
      session.draft = captureSingleKBFImportModalDraft(session.modalElement);
      return;
    }
    session.draft = captureEnhancedKBFImportModalDraft(session.modalElement);
    const configuration = materializeKBFImportConfiguration(
      session.draft.mappings ?? [],
    );
    const preview = session.modalElement.querySelector("#preview_content");
    if (preview) {
      preview.innerHTML = buildKBFPreviewHtml(configuration, (key) =>
        this.translate(key),
      );
    }
  }

  /**
   * @param {KBFModalSession} session
   * @param {EventTarget} target
   * @param {string} eventName
   * @param {EventListener} handler
   */
  listen(session, target, eventName, handler) {
    target.addEventListener(eventName, handler);
    session.controlDetachers.push(() =>
      target.removeEventListener(eventName, handler),
    );
  }

  /** @param {KBFModalSession} session */
  detachControls(session) {
    for (const detach of session.controlDetachers.splice(0)) {
      try {
        detach();
      } catch (error) {
        console.error("[KBFImportModalSession] Control cleanup failed:", error);
      }
    }
  }

  /**
   * @param {KBFModalSession} session
   * @returns {boolean}
   */
  bindModal(session) {
    this.detachControls(session);
    const modal = session.modalElement;
    const confirmSelector =
      session.mode === "enhanced"
        ? ".enhanced-bindset-confirm"
        : ".single-bindset-confirm";
    const cancelSelector =
      session.mode === "enhanced"
        ? ".enhanced-bindset-cancel"
        : ".single-bindset-cancel";
    if (
      !modal.querySelector(confirmSelector) ||
      !modal.querySelector(cancelSelector)
    ) {
      return false;
    }

    if (session.mode === "enhanced") {
      for (const row of modal.querySelectorAll(".bindset-row")) {
        projectEnhancedKBFImportModalRow(
          /** @type {HTMLTableRowElement} */ (row),
        );
      }
    } else {
      projectSingleKBFImportModalSelection(modal);
    }

    /** @type {EventListener} */
    const handleClick = (event) => {
      const target = eventElement(event);
      if (!target || !modal.contains(target)) return;
      if (target.closest(confirmSelector)) {
        const configuration = this.materializeConfiguration(session);
        if (configuration) this.settle(session, configuration);
        return;
      }
      if (target.closest(cancelSelector)) {
        this.settle(session, null);
        return;
      }
      if (session.mode === "single") {
        const option = target.closest(".single-bindset-option");
        const radio = /** @type {HTMLInputElement | null} */ (
          option?.querySelector(".single-bindset-radio") ?? null
        );
        if (radio) {
          radio.checked = true;
          this.updateProjection(session);
        }
      }
    };
    /** @type {EventListener} */
    const handleChange = (event) => {
      const target = eventElement(event);
      if (!target || !modal.contains(target)) return;
      if (
        session.mode === "enhanced" &&
        target.matches(".bindset-mapping-select")
      ) {
        const row = target.closest(".bindset-row");
        if (row) {
          const projected = projectEnhancedKBFImportModalRow(
            /** @type {HTMLTableRowElement} */ (row),
          );
          if (
            projected &&
            target.localName === "select" &&
            /** @type {HTMLSelectElement} */ (target).value === "mapped"
          ) {
            const input = /** @type {HTMLInputElement | null} */ (
              row.querySelector(".bindset-custom-input")
            );
            input?.focus();
          }
        }
      }
      this.updateProjection(session);
    };
    /** @type {EventListener} */
    const handleInput = (event) => {
      const target = eventElement(event);
      if (target?.matches(".bindset-custom-input")) {
        this.updateProjection(session);
      }
    };
    this.listen(session, modal, "click", handleClick);
    this.listen(session, modal, "change", handleChange);
    this.listen(session, modal, "input", handleInput);
    this.updateProjection(session);
    return true;
  }

  /**
   * @param {KBFModalSession | null} [expectedSession]
   * @returns {boolean}
   */
  regenerate(expectedSession = this.currentSession) {
    const session = expectedSession;
    if (!session || session !== this.currentSession || session.settled) {
      return false;
    }
    session.draft = this.captureDraft(session);
    const viewDraft = captureModalViewDraft(
      this.document,
      session.modalElement,
      FOCUSABLE_CONTROL_SELECTORS,
    );
    const replacement = this.createModal(
      session.mode,
      session.parseResult,
      session.draft,
    );
    replacement.id = session.modalId;
    replacement.classList.toggle(
      "active",
      session.modalElement.classList.contains("active"),
    );
    this.detachControls(session);
    session.modalElement.replaceWith(replacement);
    session.modalElement = replacement;
    if (!this.bindModal(session)) {
      this.settle(session, null);
      return false;
    }
    restoreModalViewDraft(replacement, viewDraft);
    return true;
  }

  /**
   * @param {KBFModalSession} session
   * @param {KBFImportConfiguration | null} result
   * @param {boolean} [hideModal]
   */
  settle(session, result, hideModal = true) {
    if (session.settled) return;
    session.settled = true;
    if (this.currentSession === session) this.currentSession = null;
    releaseModalSessionResources({
      session,
      modalManager: this.modalManager,
      detachControls: () => this.detachControls(session),
      hideModal,
      onCleanupError: (error) => {
        console.error("[KBFImportModalSession] Cleanup failed:", error);
      },
    });
    session.resolve(result);
  }
}
