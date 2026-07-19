/** @typedef {'keybinds' | 'aliases' | 'kbf'} ImportType */
/** @typedef {'picker' | 'reader' | 'capture' | 'workflow' | 'projection' | 'too-large'} ImportFileErrorStage */

/**
 * @template Context
 * @template Outcome
 * @typedef {{
 *   type: ImportType,
 *   maxBytes?: number,
 *   tooLargeErrorKey?: string,
 *   captureContext: (request: ImportFileCallbackContext<undefined>) => Context,
 *   runWorkflow: (request: ImportFileCallbackContext<Context> & { content: string }) => Outcome | Promise<Outcome>,
 *   projectOutcome: (request: ImportFileCallbackContext<Context> & { outcome: Outcome }) => unknown | Promise<unknown>,
 *   onTooLarge?: (failure: ImportFileTooLargeFailure) => unknown,
 *   onError?: (failure: ImportFileFailure) => unknown
 * }} ImportFileOpenOptions
 */

/**
 * @template Context
 * @typedef {{
 *   type: ImportType,
 *   file: File,
 *   context: Context,
 *   signal: AbortSignal,
 *   isCurrent: () => boolean
 * }} ImportFileCallbackContext
 */

/**
 * @typedef {{
 *   type: ImportType,
 *   file: File,
 *   errorKey: string,
 *   size: number,
 *   limit: number
 * }} ImportFileTooLargeFailure
 */

/**
 * @typedef {{
 *   type: ImportType,
 *   file: File | null,
 *   error: unknown,
 *   stage: ImportFileErrorStage
 * }} ImportFileFailure
 */

/**
 * @typedef {{
 *   generation: number,
 *   type: ImportType,
 *   input: HTMLInputElement,
 *   file: File | null,
 *   reader: FileReader | null,
 *   controller: AbortController,
 *   inputDetachers: Array<() => void>,
 *   readerDetachers: Array<() => void>,
 *   settled: boolean,
 *   options: ImportFileOpenOptions<unknown, unknown>
 * }} ActiveImportFileSession
 */

/** @param {Document} document */
function createBrowserFileReader(document) {
  const Reader = document.defaultView?.FileReader ?? globalThis.FileReader;
  if (typeof Reader !== "function") {
    throw new TypeError("FileReader is not available");
  }
  return new Reader();
}

/** @param {ImportType} type */
function acceptFor(type) {
  return type === "kbf" ? ".kbf,.txt" : ".txt";
}

/**
 * Owns the transient file picker and reader for one import generation. Policy,
 * state snapshots, workflow execution, and result presentation remain injected
 * so the application facade can keep their existing authority boundaries.
 */
export default class ImportFileSession {
  /**
   * @param {{
   *   document: Document,
   *   createFileReader?: () => FileReader,
   *   createAbortController?: () => AbortController
   * }} options
   */
  constructor({
    document,
    createFileReader = () => createBrowserFileReader(document),
    createAbortController = () => new AbortController(),
  }) {
    this.document = document;
    this.createFileReader = createFileReader;
    this.createAbortController = createAbortController;
    this.generation = 0;
    /** @type {ActiveImportFileSession | null} */
    this.currentSession = null;
    this.destroyed = false;
  }

  /** @returns {HTMLInputElement | null} */
  get inputElement() {
    return this.currentSession?.input ?? null;
  }

  /** @returns {boolean} */
  get isActive() {
    return this.currentSession !== null;
  }

  /**
   * Open the picker immediately and return its generation token. A destroyed
   * owner rejects new work with `null`.
   *
   * @template Context
   * @template Outcome
   * @param {ImportFileOpenOptions<Context, Outcome>} options
   * @returns {number | null}
   */
  open(options) {
    if (this.destroyed) return null;
    if (!options || !["keybinds", "aliases", "kbf"].includes(options.type)) {
      throw new TypeError("A supported import type is required");
    }
    if (
      typeof options.captureContext !== "function" ||
      typeof options.runWorkflow !== "function" ||
      typeof options.projectOutcome !== "function"
    ) {
      throw new TypeError("Import file callbacks are required");
    }

    this.cancelActive();
    const generation = ++this.generation;
    const controller = this.createAbortController();
    /** @type {HTMLInputElement} */
    let input;
    try {
      input = this.document.createElement("input");
    } catch (error) {
      controller.abort();
      this.reportDetachedError(options, error, "picker", null);
      return null;
    }

    input.type = "file";
    input.accept = acceptFor(options.type);
    input.style.display = "none";
    /** @type {ActiveImportFileSession} */
    const session = {
      generation,
      type: options.type,
      input,
      file: null,
      reader: null,
      controller,
      inputDetachers: [],
      readerDetachers: [],
      settled: false,
      options: /** @type {ImportFileOpenOptions<unknown, unknown>} */ (options),
    };
    this.currentSession = session;

    try {
      this.document.body.appendChild(input);
      const handleCancel = () => this.finish(session, true);
      const handleChange = () => this.handleSelection(session);
      this.listen(session.inputDetachers, input, "cancel", handleCancel);
      this.listen(session.inputDetachers, input, "change", handleChange);
      input.click();
    } catch (error) {
      this.reportError(session, error, "picker");
      this.finish(session, true);
    }
    return generation;
  }

  /** @returns {boolean} */
  cancelActive() {
    const session = this.currentSession;
    if (!session) return false;
    this.finish(session, true);
    return true;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelActive();
  }

  /**
   * @param {Array<() => void>} detachers
   * @param {EventTarget} target
   * @param {string} eventName
   * @param {EventListener} handler
   */
  listen(detachers, target, eventName, handler) {
    target.addEventListener(eventName, handler);
    detachers.push(() => target.removeEventListener(eventName, handler));
  }

  /** @param {Array<() => void>} detachers */
  detachAll(detachers) {
    for (const detach of detachers.splice(0)) {
      try {
        detach();
      } catch {
        // Cleanup continues so the transient input cannot leak.
      }
    }
  }

  /** @param {ActiveImportFileSession} session */
  isCurrentSession(session) {
    return (
      !this.destroyed && !session.settled && this.currentSession === session
    );
  }

  /** @param {ActiveImportFileSession} session */
  handleSelection(session) {
    if (!this.isCurrentSession(session)) return;
    this.detachAll(session.inputDetachers);
    let file;
    try {
      file = session.input.files?.[0] ?? null;
    } catch (error) {
      this.reportError(session, error, "picker");
      this.finish(session, true);
      return;
    }
    if (!file) {
      this.finish(session, true);
      return;
    }
    session.file = file;

    const { maxBytes, tooLargeErrorKey, onTooLarge } = session.options;
    if (
      session.type !== "kbf" &&
      typeof maxBytes === "number" &&
      Number.isFinite(maxBytes) &&
      file.size > maxBytes
    ) {
      if (typeof onTooLarge === "function" && tooLargeErrorKey) {
        try {
          onTooLarge({
            type: session.type,
            file,
            errorKey: tooLargeErrorKey,
            size: file.size,
            limit: maxBytes,
          });
        } catch (error) {
          this.reportError(session, error, "too-large");
        }
      }
      this.finish(session, true);
      return;
    }
    this.startReader(session, file);
  }

  /** @param {ActiveImportFileSession} session @param {File} file */
  startReader(session, file) {
    if (!this.isCurrentSession(session)) return;
    try {
      const reader = this.createFileReader();
      session.reader = reader;
      const handleLoad = () => {
        if (!this.isCurrentSession(session)) return;
        this.detachAll(session.readerDetachers);
        void this.processLoadedFile(session, file);
      };
      const handleError = () => this.finish(session, true);
      const handleAbort = () => this.finish(session, true);
      this.listen(session.readerDetachers, reader, "load", handleLoad);
      this.listen(session.readerDetachers, reader, "error", handleError);
      this.listen(session.readerDetachers, reader, "abort", handleAbort);
      reader.readAsText(file);
    } catch (error) {
      this.reportError(session, error, "reader");
      this.finish(session, true);
    }
  }

  /** @param {ActiveImportFileSession} session @param {File} file */
  async processLoadedFile(session, file) {
    /** @type {ImportFileErrorStage} */
    let stage = "capture";
    let failed = false;
    try {
      if (!this.isCurrentSession(session)) return;
      const reader = session.reader;
      const content = typeof reader?.result === "string" ? reader.result : "";
      const isCurrent = () => this.isCurrentSession(session);
      const base = {
        type: session.type,
        file,
        signal: session.controller.signal,
        isCurrent,
      };
      const context = session.options.captureContext({
        ...base,
        context: undefined,
      });
      if (!this.isCurrentSession(session)) return;

      stage = "workflow";
      const outcome = await session.options.runWorkflow({
        ...base,
        content,
        context,
      });
      if (!this.isCurrentSession(session)) return;

      stage = "projection";
      await session.options.projectOutcome({ ...base, context, outcome });
    } catch (error) {
      failed = true;
      this.reportError(session, error, stage);
    } finally {
      this.finish(session, failed);
    }
  }

  /**
   * @param {ActiveImportFileSession} session
   * @param {unknown} error
   * @param {ImportFileErrorStage} stage
   */
  reportError(session, error, stage) {
    if (!this.isCurrentSession(session)) return;
    this.reportDetachedError(session.options, error, stage, session.file);
  }

  /**
   * @template Context
   * @template Outcome
   * @param {ImportFileOpenOptions<Context, Outcome>} options
   * @param {unknown} error
   * @param {ImportFileErrorStage} stage
   * @param {File | null} file
   */
  reportDetachedError(options, error, stage, file) {
    try {
      options.onError?.({ type: options.type, file, error, stage });
    } catch {
      // A diagnostic sink must not keep the hidden picker alive.
    }
  }

  /**
   * @param {ActiveImportFileSession} session
   * @param {boolean} abort
   */
  finish(session, abort) {
    if (session.settled) return false;
    session.settled = true;
    if (this.currentSession === session) this.currentSession = null;
    this.detachAll(session.inputDetachers);
    this.detachAll(session.readerDetachers);
    if (abort && !session.controller.signal.aborted) {
      session.controller.abort();
    }
    const reader = session.reader;
    if (
      abort &&
      reader &&
      typeof reader.abort === "function" &&
      (typeof reader.readyState !== "number" || reader.readyState === 1)
    ) {
      try {
        reader.abort();
      } catch {
        // Some hosts reject abort after a synchronous reader transition.
      }
    }
    try {
      if (session.input.parentNode) {
        session.input.parentNode.removeChild(session.input);
      } else {
        this.document.body.removeChild(session.input);
      }
    } catch {
      try {
        session.input.remove();
      } catch {
        // The input is already detached or belongs to a partial test document.
      }
    }
    return true;
  }
}
