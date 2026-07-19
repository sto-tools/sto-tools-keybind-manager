import { normalizeImportStrategy } from "./importWorkflow.js";
import {
  captureAliasStrategyModalDraft,
  captureEnvironmentImportModalDraft,
  createAliasStrategyModal,
  createEnvironmentImportModal,
  createOverwriteConfirmationModal,
} from "./importDecisionModalDom.js";
import {
  captureModalViewDraft,
  releaseModalSessionResources,
  restoreModalViewDraft,
} from "./modalSessionLifecycle.js";
import { eventElement } from "./uiTypes.js";

/** @typedef {'keybinds' | 'aliases' | 'kbf'} ImportType */
/** @typedef {'space' | 'ground'} ImportEnvironment */
/** @typedef {'merge_keep' | 'merge_overwrite' | 'overwrite_all'} ImportStrategy */
/** @typedef {{ bindsetsEnabled?: boolean }} ImportContext */
/** @typedef {{ environment: ImportEnvironment, strategy: ImportStrategy }} EnvironmentImportConfig */
/** @typedef {{ selectedStrategy?: ImportStrategy | null }} ImportStrategyDraft */
/** @typedef {'environment' | 'alias' | 'overwrite'} DecisionKind */
/** @typedef {EnvironmentImportConfig | ImportStrategy | boolean | null} DecisionResult */
/** @typedef {(key: string, params?: Record<string, unknown>) => string} Translate */
/** @typedef {(message: { modalId: string, success: boolean }) => void} ModalHiddenHandler */
/** @typedef {(handler: ModalHiddenHandler) => (() => void)} ModalHiddenSubscriber */
/** @typedef {(callback: () => void) => (() => void)} FrameScheduler */
/** @typedef {{ defaultEnv: string, importType: ImportType, additionalContext: ImportContext }} EnvironmentOptions */
/** @typedef {{ type: 'keys' | 'aliases', current: number, incoming: number, environment: ImportEnvironment | null, customMessage: string | null }} OverwriteOptions */
/** @typedef {(options: EnvironmentOptions, draft?: ImportStrategyDraft) => HTMLDivElement} EnvironmentModalFactory */
/** @typedef {(draft?: ImportStrategyDraft) => HTMLDivElement} AliasModalFactory */
/** @typedef {(options: OverwriteOptions) => HTMLDivElement} OverwriteModalFactory */
/**
 * @typedef {{
 *   kind: DecisionKind,
 *   options: EnvironmentOptions | OverwriteOptions | Record<string, never>,
 *   modalId: string,
 *   modalElement: HTMLDivElement,
 *   draft: ImportStrategyDraft,
 *   cancelValue: null | false,
 *   resolve: (value: DecisionResult) => void,
 *   regenerateCallback: () => boolean,
 *   controlDetachers: Array<() => void>,
 *   documentDetach: (() => void) | null,
 *   modalHiddenDetach: (() => void) | null,
 *   scheduledShowDetach: (() => void) | null,
 *   settled: boolean
 * }} DecisionSession
 */

const FOCUSABLE_SELECTORS = Object.freeze([
  'input[name="import-strategy"]',
  ".import-space",
  ".import-ground",
  ".import-cancel",
  'input[name="alias-import-strategy"]',
  ".alias-strategy-confirm",
  ".alias-strategy-cancel",
  ".overwrite-confirm-yes",
  ".overwrite-confirm-no",
]);

const REQUIRED_CONTROLS = Object.freeze({
  environment: [".import-space", ".import-ground", ".import-cancel"],
  alias: [".alias-strategy-confirm", ".alias-strategy-cancel"],
  overwrite: [".overwrite-confirm-yes", ".overwrite-confirm-no"],
});

/** @type {FrameScheduler} */
const scheduleAnimationFrame = (callback) => {
  if (typeof globalThis.requestAnimationFrame === "function") {
    const frameId = globalThis.requestAnimationFrame(callback);
    return () => globalThis.cancelAnimationFrame?.(frameId);
  }
  const timeoutId = globalThis.setTimeout(callback, 0);
  return () => globalThis.clearTimeout(timeoutId);
};

export default class ImportDecisionModalSession {
  /**
   * @param {{
   *   document: Document,
   *   translate: Translate,
   *   modalManager?: import('./uiTypes.js').ModalManagerLike | null,
   *   subscribeModalHidden?: ModalHiddenSubscriber,
   *   scheduleFrame?: FrameScheduler,
   *   createEnvironmentModal?: EnvironmentModalFactory,
   *   createAliasModal?: AliasModalFactory,
   *   createOverwriteModal?: OverwriteModalFactory
   * }} options
   */
  constructor({
    document,
    translate,
    modalManager = null,
    subscribeModalHidden,
    scheduleFrame = scheduleAnimationFrame,
    createEnvironmentModal,
    createAliasModal,
    createOverwriteModal,
  }) {
    this.document = document;
    this.translate = translate;
    this.modalManager = modalManager;
    this.subscribeModalHidden = subscribeModalHidden;
    this.scheduleFrame = scheduleFrame;
    this.createEnvironmentModal =
      createEnvironmentModal ??
      ((options, draft) =>
        createEnvironmentImportModal({
          document: this.document,
          translate: this.translate,
          defaultEnv: options.defaultEnv,
          importType: options.importType,
          additionalContext: options.additionalContext,
          draft,
        }));
    this.createAliasModal =
      createAliasModal ??
      ((draft) =>
        createAliasStrategyModal({
          document: this.document,
          translate: this.translate,
          draft,
        }));
    this.createOverwriteModal =
      createOverwriteModal ??
      ((options) =>
        createOverwriteConfirmationModal({
          document: this.document,
          translate: this.translate,
          ...options,
        }));
    /** @type {DecisionSession | null} */
    this.currentSession = null;
  }

  /** @returns {HTMLDivElement | null} */
  get modalElement() {
    return this.currentSession?.modalElement ?? null;
  }

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
    return /** @type {Promise<EnvironmentImportConfig | null>} */ (
      this.start(
        "environment",
        { defaultEnv, importType, additionalContext },
        null,
      )
    );
  }

  /** @returns {Promise<ImportStrategy | null>} */
  promptAliasStrategy() {
    return /** @type {Promise<ImportStrategy | null>} */ (
      this.start("alias", {}, null)
    );
  }

  /**
   * @param {'keys' | 'aliases'} type
   * @param {number} current
   * @param {number} incoming
   * @param {ImportEnvironment | null} [environment]
   * @param {string | null} [customMessage]
   * @returns {Promise<boolean>}
   */
  showOverwriteConfirmation(
    type,
    current,
    incoming,
    environment = null,
    customMessage = null,
  ) {
    return /** @type {Promise<boolean>} */ (
      this.start(
        "overwrite",
        { type, current, incoming, environment, customMessage },
        false,
      )
    );
  }

  /**
   * @param {DecisionKind} kind
   * @param {EnvironmentOptions | OverwriteOptions | Record<string, never>} options
   * @param {null | false} cancelValue
   * @returns {Promise<DecisionResult>}
   */
  start(kind, options, cancelValue) {
    this.cancelActiveSession();
    return new Promise((resolve) => {
      let modalElement;
      try {
        modalElement = this.createModal(kind, options);
      } catch (error) {
        console.error("[ImportDecisionModalSession] Setup failed:", error);
        resolve(cancelValue);
        return;
      }
      const modalId = this.modalIdFor(kind);
      modalElement.id = modalId;
      /** @type {DecisionSession} */
      const session = {
        kind,
        options,
        modalId,
        modalElement,
        draft: {},
        cancelValue,
        resolve,
        regenerateCallback: () => false,
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
          this.settle(session, cancelValue);
          return;
        }
        this.bindSessionLifecycle(session);
        this.modalManager?.registerRegenerateCallback?.(
          modalId,
          session.regenerateCallback,
        );
        this.scheduleShow(session);
      } catch (error) {
        console.error("[ImportDecisionModalSession] Setup failed:", error);
        this.settle(session, cancelValue);
      }
    });
  }

  /** @param {DecisionSession} session */
  bindSessionLifecycle(session) {
    /** @param {KeyboardEvent} event */
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        this.settle(session, session.cancelValue);
      }
    };
    this.document.addEventListener("keydown", handleEscape);
    session.documentDetach = () =>
      this.document.removeEventListener("keydown", handleEscape);
    session.modalHiddenDetach =
      this.subscribeModalHidden?.(({ modalId, success }) => {
        if (modalId === session.modalId && success === true) {
          this.settle(session, session.cancelValue, false);
        }
      }) ?? null;
  }

  /** @param {DecisionSession} session */
  scheduleShow(session) {
    let framePending = true;
    const detachScheduledShow = this.scheduleFrame(() => {
      framePending = false;
      session.scheduledShowDetach = null;
      if (session !== this.currentSession || session.settled) return;
      try {
        const shown = this.modalManager?.show(session.modalId);
        if (shown === false) this.settle(session, session.cancelValue, false);
      } catch (error) {
        console.error("[ImportDecisionModalSession] Show failed:", error);
        this.settle(session, session.cancelValue, false);
      }
    });
    if (framePending && !session.settled) {
      session.scheduledShowDetach = detachScheduledShow;
    }
  }

  /** @returns {boolean} */
  cancelActiveSession() {
    const session = this.currentSession;
    if (!session) return false;
    this.settle(session, session.cancelValue);
    return true;
  }

  destroy() {
    this.cancelActiveSession();
  }

  /** @param {DecisionKind} kind */
  modalIdFor(kind) {
    if (kind === "environment") return "importModal";
    if (kind === "alias") return "aliasStrategyModal";
    return "overwriteConfirmModal";
  }

  /**
   * @param {DecisionKind} kind
   * @param {DecisionSession['options']} options
   * @param {ImportStrategyDraft} [draft]
   */
  createModal(kind, options, draft) {
    if (kind === "environment") {
      return this.createEnvironmentModal(
        /** @type {EnvironmentOptions} */ (options),
        draft,
      );
    }
    if (kind === "alias") return this.createAliasModal(draft);
    return this.createOverwriteModal(/** @type {OverwriteOptions} */ (options));
  }

  /** @param {DecisionSession} session */
  captureDraft(session) {
    if (session.kind === "environment") {
      return captureEnvironmentImportModalDraft(session.modalElement);
    }
    if (session.kind === "alias") {
      return captureAliasStrategyModalDraft(session.modalElement);
    }
    return {};
  }

  /** @param {DecisionSession} session */
  bindModal(session) {
    this.detachControls(session);
    const modal = session.modalElement;
    if (
      REQUIRED_CONTROLS[session.kind].some(
        (selector) => !modal.querySelector(selector),
      )
    ) {
      return false;
    }
    /** @type {EventListener} */
    const handleClick = (event) => {
      const target = eventElement(event);
      if (!target || !modal.contains(target)) return;
      const result = this.resultFromClick(session, target);
      if (result.handled) this.settle(session, result.value);
    };
    this.listen(session, modal, "click", handleClick);
    return true;
  }

  /**
   * @param {DecisionSession} session
   * @param {Element} target
   * @returns {{ handled: boolean, value: DecisionResult }}
   */
  resultFromClick(session, target) {
    if (session.kind === "environment") {
      /** @type {ImportEnvironment | null} */
      let environment = null;
      if (target.closest(".import-space")) environment = "space";
      else if (target.closest(".import-ground")) environment = "ground";
      else if (!target.closest(".import-cancel")) {
        return { handled: false, value: null };
      }
      if (!environment) return { handled: true, value: null };
      const draft = captureEnvironmentImportModalDraft(session.modalElement);
      return {
        handled: true,
        value: {
          environment,
          strategy: normalizeImportStrategy(draft.selectedStrategy),
        },
      };
    }
    if (session.kind === "alias") {
      if (target.closest(".alias-strategy-cancel")) {
        return { handled: true, value: null };
      }
      if (!target.closest(".alias-strategy-confirm")) {
        return { handled: false, value: null };
      }
      const draft = captureAliasStrategyModalDraft(session.modalElement);
      return {
        handled: true,
        value: normalizeImportStrategy(draft.selectedStrategy),
      };
    }
    if (target.closest(".overwrite-confirm-yes")) {
      return { handled: true, value: true };
    }
    if (target.closest(".overwrite-confirm-no")) {
      return { handled: true, value: false };
    }
    return { handled: false, value: false };
  }

  /**
   * @param {DecisionSession} session
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

  /** @param {DecisionSession} session */
  detachControls(session) {
    for (const detach of session.controlDetachers.splice(0)) {
      try {
        detach();
      } catch (error) {
        console.error(
          "[ImportDecisionModalSession] Control cleanup failed:",
          error,
        );
      }
    }
  }

  /** @param {DecisionSession | null} [expectedSession] */
  regenerate(expectedSession = this.currentSession) {
    const session = expectedSession;
    if (!session || session !== this.currentSession || session.settled) {
      return false;
    }
    try {
      session.draft = this.captureDraft(session);
      const viewDraft = captureModalViewDraft(
        this.document,
        session.modalElement,
        FOCUSABLE_SELECTORS,
      );
      const replacement = this.createModal(
        session.kind,
        session.options,
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
        this.settle(session, session.cancelValue);
        return false;
      }
      restoreModalViewDraft(replacement, viewDraft);
      return true;
    } catch (error) {
      console.error("[ImportDecisionModalSession] Regeneration failed:", error);
      this.settle(session, session.cancelValue);
      return false;
    }
  }

  /**
   * @param {DecisionSession} session
   * @param {DecisionResult} result
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
        console.error("[ImportDecisionModalSession] Cleanup failed:", error);
      },
    });
    session.resolve(result);
  }
}
