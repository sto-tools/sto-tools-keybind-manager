/**
 * @typedef {{
 *   type: string,
 *   listener: EventListenerOrEventListenerObject,
 *   delegate: EventListener,
 * }} DelegatedRegistration
 *
 * @typedef {{
 *   stabilizeExecutionOrder: EventTarget,
 *   copyAlias: EventTarget,
 *   copyPreview: EventTarget,
 *   commandList: EventTarget,
 * }} CommandChainListenerTargets
 */

/**
 * Adapt one selector into the EventTarget surface consumed by EventBus while
 * keeping delegation inside the injected document. Capture-phase delegation
 * preserves the previous listener semantics across target insertion and
 * replacement without consulting the ambient global document.
 *
 * @param {Document} document
 * @param {string} selector
 * @returns {EventTarget}
 */
function createInjectedDocumentTarget(document, selector) {
  /** @type {Set<DelegatedRegistration>} */
  const registrations = new Set();
  const adapter = {
    /**
     * @param {string} type
     * @param {EventListenerOrEventListenerObject | null} listener
     */
    addEventListener(type, listener) {
      if (!listener || typeof document.addEventListener !== "function") return;
      for (const registration of registrations) {
        if (registration.type === type && registration.listener === listener) {
          return;
        }
      }
      /** @type {EventListener} */
      const delegate = (event) => {
        const origin =
          /** @type {{ closest?: (value: string) => Element | null } | null} */ (
            event.target
          );
        if (
          typeof origin?.closest !== "function" ||
          !origin.closest(selector)
        ) {
          return;
        }
        if (typeof listener === "function") listener.call(adapter, event);
        else listener.handleEvent(event);
      };
      registrations.add({ type, listener, delegate });
      document.addEventListener(type, delegate, true);
    },
    /**
     * @param {string} type
     * @param {EventListenerOrEventListenerObject | null} listener
     */
    removeEventListener(type, listener) {
      if (!listener) return;
      for (const registration of registrations) {
        if (registration.type !== type || registration.listener !== listener) {
          continue;
        }
        document.removeEventListener?.(type, registration.delegate, true);
        registrations.delete(registration);
      }
    },
  };
  return /** @type {EventTarget} */ (
    /** @type {unknown} */ (Object.freeze(adapter))
  );
}

/**
 * Create CommandChainUI's listener targets within its injected document.
 *
 * @param {Document} document
 * @returns {Readonly<CommandChainListenerTargets>}
 */
export function captureCommandChainListenerTargets(document) {
  return Object.freeze({
    stabilizeExecutionOrder: createInjectedDocumentTarget(
      document,
      "#stabilizeExecutionOrderBtn",
    ),
    copyAlias: createInjectedDocumentTarget(document, "#copyAliasBtn"),
    copyPreview: createInjectedDocumentTarget(document, "#copyPreviewBtn"),
    commandList: createInjectedDocumentTarget(document, "#commandList"),
  });
}
