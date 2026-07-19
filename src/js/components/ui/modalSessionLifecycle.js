import { asHTMLElement, asHTMLInputElement } from "./uiTypes.js";

/**
 * @typedef {{
 *   selector: string,
 *   index: number,
 *   selectionStart: number | null,
 *   selectionEnd: number | null,
 *   selectionDirection: 'forward' | 'backward' | 'none' | null
 * }} ModalFocusDraft
 */
/**
 * @typedef {{
 *   bodyScrollTop: number,
 *   bodyScrollLeft: number,
 *   focus: ModalFocusDraft | null
 * }} ModalViewDraft
 */
/**
 * @typedef {{
 *   modalId: string,
 *   modalElement: HTMLDivElement,
 *   regenerateCallback: () => unknown,
 *   documentDetach: (() => void) | null,
 *   modalHiddenDetach: (() => void) | null,
 *   scheduledShowDetach: (() => void) | null
 * }} ReleasableModalSession
 */

/**
 * Capture only view-local modal state. Domain selections remain owned by each
 * session's draft projection.
 *
 * @param {Document} document
 * @param {HTMLDivElement} modal
 * @param {ReadonlyArray<string>} focusableSelectors
 * @returns {ModalViewDraft}
 */
export function captureModalViewDraft(document, modal, focusableSelectors) {
  const body = /** @type {HTMLElement | null} */ (
    modal.querySelector(".modal-body")
  );
  const activeElement = asHTMLElement(document.activeElement);
  /** @type {ModalFocusDraft | null} */
  let focus = null;

  if (activeElement && modal.contains(activeElement)) {
    for (const selector of focusableSelectors) {
      const controls = Array.from(modal.querySelectorAll(selector));
      const index = controls.indexOf(activeElement);
      if (index === -1) continue;
      const input = asHTMLInputElement(activeElement);
      focus = {
        selector,
        index,
        selectionStart: input?.selectionStart ?? null,
        selectionEnd: input?.selectionEnd ?? null,
        selectionDirection: input?.selectionDirection ?? null,
      };
      break;
    }
  }

  return {
    bodyScrollTop: body?.scrollTop ?? 0,
    bodyScrollLeft: body?.scrollLeft ?? 0,
    focus,
  };
}

/**
 * @param {HTMLDivElement} modal
 * @param {ModalViewDraft} draft
 */
export function restoreModalViewDraft(modal, draft) {
  const body = /** @type {HTMLElement | null} */ (
    modal.querySelector(".modal-body")
  );
  if (body) {
    body.scrollTop = draft.bodyScrollTop;
    body.scrollLeft = draft.bodyScrollLeft;
  }
  if (!draft.focus) return;

  const control = modal.querySelectorAll(draft.focus.selector)[
    draft.focus.index
  ];
  const htmlControl = asHTMLElement(control);
  if (!htmlControl) return;
  htmlControl.focus();
  const input = asHTMLInputElement(htmlControl);
  if (
    input &&
    draft.focus.selectionStart !== null &&
    draft.focus.selectionEnd !== null
  ) {
    try {
      input.setSelectionRange(
        draft.focus.selectionStart,
        draft.focus.selectionEnd,
        draft.focus.selectionDirection ?? undefined,
      );
    } catch {
      // Controls such as radios do not expose a writable selection range.
    }
  }
}

/**
 * Release resources shared by modal-session owners. Callers retain authority
 * over settlement identity, result resolution, and control-listener storage.
 *
 * @param {{
 *   session: ReleasableModalSession,
 *   modalManager?: import('./uiTypes.js').ModalManagerLike | null,
 *   detachControls: () => void,
 *   hideModal?: boolean,
 *   onCleanupError: (error: unknown) => void
 * }} options
 */
export function releaseModalSessionResources({
  session,
  modalManager = null,
  detachControls,
  hideModal = true,
  onCleanupError,
}) {
  const scheduledShowDetach = session.scheduledShowDetach;
  const documentDetach = session.documentDetach;
  const modalHiddenDetach = session.modalHiddenDetach;
  session.scheduledShowDetach = null;
  session.documentDetach = null;
  session.modalHiddenDetach = null;

  const releases = [
    () => scheduledShowDetach?.(),
    detachControls,
    () => documentDetach?.(),
    () => modalHiddenDetach?.(),
    () =>
      modalManager?.unregisterRegenerateCallback?.(
        session.modalId,
        session.regenerateCallback,
      ),
    () => {
      if (hideModal) modalManager?.hide(session.modalId);
    },
    () => session.modalElement.remove(),
  ];

  for (const release of releases) {
    try {
      release();
    } catch (error) {
      onCleanupError(error);
    }
  }
}
