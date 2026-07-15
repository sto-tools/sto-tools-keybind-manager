/** @typedef {(data: unknown) => unknown} EventCallback */
/** @typedef {(event: Event) => unknown} DomEventCallback */
/** @typedef {{ synchronous?: boolean }} EmitOptions */

/** @type {Map<string, Set<EventCallback>>} */
const listeners = new Map();
/** @type {Set<() => void>} */
const domListeners = new Set(); // Track DOM event listeners for cleanup

/**
 * @param {string} event
 * @param {EventCallback} callback
 * @param {unknown} [_context] Retained for the legacy ComponentBase signature.
 */
function on(event, callback, _context) {
  void _context;
  let eventListeners = listeners.get(event);
  if (!eventListeners) {
    eventListeners = new Set();
    listeners.set(event, eventListeners);
  }
  eventListeners.add(callback);

  // Return detach function
  return () => {
    off(event, callback);
  };
}

/** @param {string} event @param {EventCallback} callback */
function off(event, callback) {
  const eventListeners = listeners.get(event);
  if (eventListeners) {
    eventListeners.delete(callback);
    if (eventListeners.size === 0) listeners.delete(event);
  }
}

/**
 * Report whether a topic currently has at least one listener without exposing
 * the invokable listener collection.
 * @param {string} event
 * @returns {boolean}
 */
function hasListeners(event) {
  return (listeners.get(event)?.size ?? 0) > 0;
}

/**
 * @param {string} event
 * @param {unknown} [data]
 * @param {EmitOptions} [options]
 */
function emit(event, data = null, options = {}) {
  // if (typeof window !== 'undefined') {
  //   // eslint-disable-next-line no-console
  //   console.log(`[eventBus] emit → ${event}`, data)
  // }

  const eventListeners = listeners.get(event);
  if (!eventListeners) return Promise.resolve();

  if (options.synchronous) {
    // Synchronous mode: wait for all listeners to complete
    /** @type {Promise<unknown>[]} */
    const promises = [];

    eventListeners.forEach((callback) => {
      try {
        const result = callback(data);
        // If the callback returns a Promise, collect it
        if (
          result !== null &&
          (typeof result === "object" || typeof result === "function") &&
          "then" in result &&
          typeof result.then === "function"
        ) {
          promises.push(Promise.resolve(result));
        }
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
        // Include failed promises so we don't hang
        promises.push(Promise.reject(error));
      }
    });

    // Return a Promise that resolves when all listeners complete
    return Promise.allSettled(promises);
  } else {
    // Asynchronous mode (default): fire and forget
    eventListeners.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
    return Promise.resolve();
  }
}

/**
 * @param {string | EventTarget} target
 * @param {string} domEvent
 * @param {string | DomEventCallback} busEvent
 * @param {DomEventCallback} [handler]
 */
function onDom(target, domEvent, busEvent, handler) {
  // -------------------------------------------------
  // If a string is supplied we treat it as a selector / id and
  // always install a delegated listener on document so that
  // dynamically replaced elements keep working.
  // -------------------------------------------------
  if (typeof target === "string") {
    // Allow shorthand signature onDom(selector, domEvent, handler)
    if (typeof busEvent === "function" && handler === undefined) {
      handler = busEvent;
      busEvent = domEvent;
    }
    // Normalise selector: if string already looks like a CSS selector (starts with '.', '#', '[') we keep it.
    // Otherwise we assume it is an element id and prefix with '#'.
    const selector = [".", "#", "["].includes(target[0])
      ? target
      : `#${target}`;

    /** @param {Event} e */
    const delegated = (e) => {
      const closestTarget =
        /** @type {{ closest?: (selector: string) => Element | null } | null} */ (
          e.target
        );
      const match =
        typeof closestTarget?.closest === "function"
          ? closestTarget.closest(selector)
          : null;
      if (selector === "#settingsBtn") {
        // console.log('[DEBUG:eventBus] click captured (capture phase) target:', e.target, 'match:', match)
      }
      if (!match) return;

      if (handler) {
        try {
          handler(e);
        } catch (err) {
          console.error(err);
        }
      }
      emit(typeof busEvent === "string" ? busEvent : domEvent, e);

      // Debug: log delegated handler fired
      // if (target === 'settingsBtn' || selector === '#settingsBtn') {
      //   console.log('[DEBUG:eventBus] delegated handler fired for settingsBtn')
      // }
    };
    document.addEventListener(domEvent, delegated, true);

    // Create cleanup function
    const cleanup = () => {
      document.removeEventListener(domEvent, delegated, true);
      // Remove from tracking
      domListeners.delete(cleanup);
    };

    // Track cleanup function
    domListeners.add(cleanup);

    return cleanup;
  }

  if (!target || !target.addEventListener) return () => {};
  if (typeof busEvent === "function") {
    handler = busEvent;
    busEvent = domEvent;
  }
  if (!busEvent) busEvent = domEvent;

  if (handler) {
    // If a handler is provided, attach it directly to DOM event
    // and also emit the bus event for other listeners
    /** @param {Event} e */
    const domHandler = (e) => {
      try {
        // Call the handler with the original context
        handler(e);
      } catch (err) {
        console.error(err);
      }
      emit(typeof busEvent === "string" ? busEvent : domEvent, e);
    };
    target.addEventListener(domEvent, domHandler);

    // Create cleanup function
    const cleanup = () => {
      target.removeEventListener(domEvent, domHandler);
      // Remove from tracking
      domListeners.delete(cleanup);
    };

    // Track cleanup function
    domListeners.add(cleanup);

    return cleanup;
  } else {
    // If no handler is provided, just emit the bus event
    /** @param {Event} e */
    const domHandler = (e) =>
      emit(typeof busEvent === "string" ? busEvent : domEvent, e);
    target.addEventListener(domEvent, domHandler);

    // Create cleanup function
    const cleanup = () => {
      target.removeEventListener(domEvent, domHandler);
      // Remove from tracking
      domListeners.delete(cleanup);
    };

    // Track cleanup function
    domListeners.add(cleanup);

    return cleanup;
  }
}

/**
 * Add a one-time event listener that automatically removes itself after first execution.
 * This function is kept for future use - it's a common event pattern that may be needed.
 * @param {string} event - The event name to listen for
 * @param {Function} callback - The callback function to execute once
 * @returns {Function} Detach function to manually remove the listener if needed
 */
/** @param {string} event @param {EventCallback} callback */
function once(event, callback) {
  /** @type {EventCallback} */
  const onceCallback = (data) => {
    off(event, onceCallback);
    callback(data);
    return undefined;
  };
  return on(event, onceCallback);
}

/**
 * Clear all event listeners from the event bus.
 * This is a global cleanup function that removes ALL listeners from ALL events AND all DOM listeners.
 *
 * Useful for:
 * - Testing setup/teardown
 * - Application reset scenarios
 * - Memory cleanup during page transitions
 * - Debugging and development cleanup
 *
 * @returns {void}
 */
function clear() {
  listeners.clear();

  // Clean up all DOM event listeners (replaces the removed cleanupDomListeners function)
  domListeners.forEach((cleanup) => {
    try {
      cleanup();
    } catch (error) {
      console.error("Error cleaning up DOM event listener:", error);
    }
  });
  domListeners.clear();
}

// -----------------------
// Debounce utility
// -----------------------
/**
 * @template {unknown[]} Args
 * @param {(...args: Args) => void} fn
 * @param {number} [delay]
 * @returns {((...args: Args) => void) & { cancel: () => void }}
 */
function debounce(fn, delay = 250) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timerId;
  const debounced =
    /** @type {((...args: Args) => void) & { cancel: () => void }} */ (
      (...args) => {
        if (timerId !== undefined) clearTimeout(timerId);
        timerId = setTimeout(() => {
          timerId = undefined;
          fn(...args);
        }, delay);
      }
    );
  debounced.cancel = () => {
    if (timerId !== undefined) clearTimeout(timerId);
    timerId = undefined;
  };
  return debounced;
}

/**
 * Couple a debounced callback to the DOM listener lifecycle so neither manual
 * detach nor global clear can run a queued local callback afterward.
 * @param {() => void} detachDom
 * @param {{ cancel: () => void }} debouncedHandler
 * @returns {() => void}
 */
function trackDebouncedDomCleanup(detachDom, debouncedHandler) {
  const cleanup = () => {
    debouncedHandler.cancel();
    detachDom();
    domListeners.delete(cleanup);
  };

  // onDom tracks its own cleanup. Replace that entry with the lifecycle-aware
  // wrapper so eventBus.clear() also cancels pending debounce timers.
  domListeners.delete(detachDom);
  domListeners.add(cleanup);
  return cleanup;
}

/**
 * Attach a DOM listener that emits through the bus, but debounced.
 * Signature mirrors onDom with an extra optional delay param at the end.
 *
 * Examples:
 *   eventBus.onDomDebounced('#search', 'input', 'search-changed', (e)=>{...}, 300)
 */
/**
 * @param {string | EventTarget} target
 * @param {string} domEvent
 * @param {string | DomEventCallback} busEvent
 * @param {DomEventCallback | number} [handler]
 * @param {number} [delay]
 */
function onDomDebounced(target, domEvent, busEvent, handler, delay = 250) {
  // Handler-only shorthand: onDomDebounced(target, event, handler, delay)
  if (typeof busEvent === "function") {
    if (typeof handler === "number") delay = handler;
    const debouncedHandler = debounce(busEvent, delay);
    const detachDom = onDom(target, domEvent, debouncedHandler);
    return trackDebouncedDomCleanup(detachDom, debouncedHandler);
  }

  // Bus-topic form with an omitted handler: the fourth argument is the delay.
  if (typeof handler === "number") {
    delay = handler;
    handler = undefined;
  }

  const debouncedHandler = debounce(handler || (() => {}), delay);

  // Reuse onDom for attachment, but debounce only the local handler. onDom
  // continues to mirror the raw DOM event onto the bus immediately.
  const detachDom = onDom(target, domEvent, busEvent, (e) => {
    debouncedHandler(e);
  });
  return trackDebouncedDomCleanup(detachDom, debouncedHandler);
}

/** @type {import("../types/events/protocol.js").TypedEventBus} */
const eventBus = {
  on,
  off,
  emit,
  onDom,
  onDomDebounced,
  once,
  clear,
  hasListeners,
};

export default eventBus;
