/**
 * Shared structural types for browser UI dependencies.
 *
 * These declarations intentionally describe only the capabilities consumed by
 * UI components; they do not grant arbitrary property access.
 *
 * @typedef {typeof import('../../core/eventBus.js').default} EventBus
 *
 * @typedef {{
 *   t: (key: string | string[], params?: import('i18next').TOptions) => string,
 *   language?: string
 * }} I18nLike
 *
 * @typedef {'warning' | 'danger' | 'info' | 'success'} DialogType
 *
 * @typedef {{
 *   dragElement?: HTMLElement | null
 * }} DragState
 *
 * @typedef {{
 *   draggableSelector: string,
 *   dropZoneSelector: string,
 *   onDrop: (event: Event, dragState: DragState, dropZone: HTMLElement | null) => void
 * }} DragAndDropOptions
 *
 * @typedef {{
 *   showToast?: (message: string, type?: string, duration?: number) => unknown,
 *   initDragAndDrop?: (container: HTMLElement, options: DragAndDropOptions) => void | (() => void)
 * }} UIServiceLike
 *
 * @typedef {{
 *   show: (modalId: string) => unknown,
 *   hide: (modalId: string) => unknown,
 *   registerRegenerateCallback?: (modalId: string, callback: () => void) => void,
 *   unregisterRegenerateCallback?: (modalId: string, expectedCallback?: () => void) => void
 * }} ModalManagerLike
 *
 * @typedef {{
 *   confirm: (message: string, title?: string, type?: DialogType, context?: string) => Promise<boolean>,
 *   inform?: (message: string, title?: string, type?: DialogType, context?: string) => Promise<unknown>
 * }} ConfirmDialogLike
 *
 * @typedef {{
 *   title?: string,
 *   defaultValue?: string,
 *   placeholder?: string,
 *   type?: string,
 *   validate?: ((value: string) => true | string) | null,
 *   maxLength?: number
 * }} InputDialogOptions
 *
 * @typedef {{
 *   prompt: (message: string, options?: InputDialogOptions) => Promise<string | null>
 * }} InputDialogLike
 *
 * @typedef {'space' | 'ground' | 'alias'} Environment
 *
 * @typedef {{ environment?: Environment, newMode?: Environment, mode?: Environment }} EnvironmentPayload
 *
 * @typedef {{
 *   success?: boolean,
 *   error?: string,
 *   [field: string]: unknown
 * }} ActionResult
 *
 * @typedef {{
 *   id?: string,
 *   name?: string,
 *   description?: string,
 *   environment?: string,
 *   command?: string,
 *   commands?: Array<string | Record<string, unknown>>,
 *   parameters?: Record<string, unknown>,
 *   [field: string]: unknown
 * }} UIDataRecord
 *
 * @typedef {Record<string, UIDataRecord>} UIDataRecordMap
 *
 * @typedef {{
 *   selectedEffects: { space: Set<string>, ground: Set<string> },
 *   showPlayerSay: boolean,
 *   isEffectSelected: (environment: 'space' | 'ground', effect: string) => boolean,
 *   toggleEffect: (environment: 'space' | 'ground', effect: string) => void,
 *   selectAllEffects: (environment: 'space' | 'ground') => void,
 *   getEffectCount: (environment: 'space' | 'ground') => number,
 *   generateAlias: (environment: 'space' | 'ground') => string | null
 * }} VFXManagerLike
 *
 * @typedef {{
 *   storageService?: import('../services/StorageService.js').default,
 *   stoUI?: UIServiceLike,
 *   confirmDialog?: ConfirmDialogLike,
 *   applyTranslations?: (element?: Document | Element | null) => void,
 *   stoSync?: { setSyncFolder: (autoSync?: boolean) => Promise<FileSystemDirectoryHandle | null> }
 * }} RuntimeGlobals
 */

/** @type {I18nLike} */
const fallbackI18n = Object.freeze({
  /**
   * A missing translator should leave a stable key in non-application test
   * environments instead of making the component crash during construction.
   * Production always injects the configured i18next instance.
   * @param {string | string[]} key
   */
  t(key) {
    return Array.isArray(key) ? (key[0] ?? "") : key;
  },
});

/**
 * Normalize an optional UI translator to the small interface components use.
 * @param {I18nLike | null | undefined} i18n
 * @returns {I18nLike}
 */
export function resolveI18n(i18n) {
  return i18n ?? fallbackI18n;
}

/**
 * Resolve the injected document while remaining safe in non-DOM test hosts.
 * @param {Document | null | undefined} candidate
 * @returns {Document}
 */
export function resolveDocument(candidate) {
  const resolved = candidate ?? globalThis.document;
  if (!resolved) {
    throw new TypeError("A Document is required to construct a UI component");
  }
  return resolved;
}

/**
 * Recognize DOM elements structurally so injected documents from another
 * Window realm are supported.
 * @param {unknown} value
 * @returns {value is Element}
 */
export function isElement(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "nodeType" in value &&
    value.nodeType === 1 &&
    "closest" in value &&
    typeof value.closest === "function"
  );
}

/**
 * Recognize HTML elements structurally so callers do not couple injected
 * documents to the ambient Window realm.
 * @param {unknown} value
 * @returns {HTMLElement | null}
 */
export function asHTMLElement(value) {
  if (!isElement(value) || !("dataset" in value) || !("style" in value)) {
    return null;
  }
  return /** @type {HTMLElement} */ (value);
}

/**
 * Recognize input elements structurally across Window realms.
 * @param {unknown} value
 * @returns {HTMLInputElement | null}
 */
export function asHTMLInputElement(value) {
  const element = asHTMLElement(value);
  if (!element || element.localName !== "input" || !("value" in element)) {
    return null;
  }
  return /** @type {HTMLInputElement} */ (element);
}

/**
 * Extract an Element target from a DOM event.
 * @param {Event} event
 * @returns {Element | null}
 */
export function eventElement(event) {
  return isElement(event.target) ? event.target : null;
}

/**
 * Convert caught values into a user-safe diagnostic string.
 * @param {unknown} error
 * @returns {string}
 */
export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
