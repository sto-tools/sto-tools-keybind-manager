/**
 * @typedef {{
 *   callbackRegistered: boolean,
 *   regenerateCallback: () => unknown,
 *   controlDetachers: Array<() => void>
 * }} ReleasableParameterSession
 */

/**
 * Attach one control listener and retain its exact inverse on the owning
 * session so modal regeneration never accumulates stale handlers.
 *
 * @param {ReleasableParameterSession} session
 * @param {EventTarget} target
 * @param {string} eventName
 * @param {EventListener} handler
 */
export function listenParameterControl(session, target, eventName, handler) {
  target.addEventListener(eventName, handler);
  session.controlDetachers.push(() =>
    target.removeEventListener(eventName, handler),
  );
}

/**
 * @param {ReleasableParameterSession} session
 * @param {(operation: string, error: unknown) => void} onError
 */
export function detachParameterControls(session, onError) {
  for (const detach of session.controlDetachers.splice(0)) {
    try {
      detach();
    } catch (error) {
      onError("detach modal control", error);
    }
  }
}

/**
 * Release only resources owned by one parameter session. The modal element is
 * reusable and remains owned by the session controller until controller
 * destruction.
 *
 * @param {{
 *   session: ReleasableParameterSession,
 *   modalManager?: import('./uiTypes.js').ModalManagerLike | null,
 *   modalId: string,
 *   hide: boolean,
 *   onError: (operation: string, error: unknown) => void
 * }} options
 */
export function releaseParameterSessionResources({
  session,
  modalManager = null,
  modalId,
  hide,
  onError,
}) {
  detachParameterControls(session, onError);
  if (session.callbackRegistered) {
    try {
      modalManager?.unregisterRegenerateCallback?.(
        modalId,
        session.regenerateCallback,
      );
    } catch (error) {
      onError("release regeneration", error);
    }
    session.callbackRegistered = false;
  }
  if (!hide) return;
  try {
    modalManager?.hide(modalId);
  } catch (error) {
    onError("hide parameter modal", error);
  }
}
