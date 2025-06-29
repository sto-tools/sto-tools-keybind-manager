const listeners = new Map()

function on(event, callback) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set())
  }
  listeners.get(event).add(callback)
  
  // Return detach function
  return () => {
    off(event, callback)
  }
}

function off(event, callback) {
  const eventListeners = listeners.get(event)
  if (eventListeners) {
    eventListeners.delete(callback)
  }
}

function emit(event, data) {
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.log(`[eventBus] emit → ${event}`, data)
  }
  
  const eventListeners = listeners.get(event)
  if (eventListeners) {
    eventListeners.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error)
      }
    })
  }
}

function onDom(target, domEvent, busEvent, handler) {
  // -------------------------------------------------
  // If a string is supplied we treat it as a selector / id and
  // always install a delegated listener on document so that
  // dynamically replaced elements keep working.
  // -------------------------------------------------
  if (typeof target === 'string') {
    // Allow shorthand signature onDom(selector, domEvent, handler)
    if (typeof busEvent === 'function' && handler === undefined) {
      handler = busEvent
      busEvent = domEvent
    }
    // Normalise selector: if the string already looks like a CSS selector (starts with '.' or '#') we keep it.
    // Otherwise we assume it is an element id and prefix with '#'.
    const selector = /^[.#]/.test(target) ? target : `#${target}`

    const delegated = (e) => {
      const match = e.target.closest(selector)
      if (selector === '#settingsBtn') {
        // console.log('[DEBUG:eventBus] click captured (capture phase) target:', e.target, 'match:', match)
      }
      if (!match) return

      if (handler) {
        try {
          handler(e)
        } catch (err) {
          console.error(err)
        }
      }
      emit(busEvent || domEvent, e)

      // Debug: log delegated handler fired
      // if (target === 'settingsBtn' || selector === '#settingsBtn') {
      //   console.log('[DEBUG:eventBus] delegated handler fired for settingsBtn')
      // }
    }
    document.addEventListener(domEvent, delegated, true)

    // Return detach function – remove only the delegated listener
    return () => {
      document.removeEventListener(domEvent, delegated, true)
    }
  }
  
  if (!target || !target.addEventListener) return () => {}
  if (typeof busEvent === 'function') {
    handler = busEvent
    busEvent = domEvent
  }
  if (!busEvent) busEvent = domEvent

  if (handler) {
    // If a handler is provided, attach it directly to the DOM event
    // and also emit the bus event for other listeners
    const domHandler = (e) => {
      try {
        // Call the handler with the original context
        handler(e)
      } catch (err) {
        console.error(err)
      }
      emit(busEvent, e)
    }
    target.addEventListener(domEvent, domHandler)

    return () => {
      target.removeEventListener(domEvent, domHandler)
    }
  } else {
    // If no handler is provided, just emit the bus event
    const domHandler = (e) => emit(busEvent, e)
    target.addEventListener(domEvent, domHandler)

    return () => {
      target.removeEventListener(domEvent, domHandler)
    }
  }
}

function once(event, callback) {
  const onceCallback = (data) => {
    off(event, onceCallback)
    callback(data)
  }
  on(event, onceCallback)
}

function clear() {
  listeners.clear()
}

function getListenerCount(event) {
  const eventListeners = listeners.get(event)
  return eventListeners ? eventListeners.size : 0
}

function getAllListenerCounts() {
  const counts = {}
  for (const [event, listenerSet] of listeners) {
    counts[event] = listenerSet.size
  }
  return counts
}

// -----------------------
// Debounce utility
// -----------------------
function debounce(fn, delay = 250) {
  let timerId
  return (...args) => {
    clearTimeout(timerId)
    timerId = setTimeout(() => fn.apply(this, args), delay)
  }
}

/**
 * Attach a DOM listener that emits through the bus, but debounced.
 * Signature mirrors onDom with an extra optional delay param at the end.
 *
 * Examples:
 *   eventBus.onDomDebounced('#search', 'input', 'search-changed', (e)=>{...}, 300)
 */
function onDomDebounced(target, domEvent, busEvent, handler, delay = 250) {
  // Handle optional handler omitted case similar to onDom
  if (typeof handler === 'number') {
    delay = handler
    handler = undefined
  }

  const debouncedHandler = debounce(handler || (()=>{}), delay)

  // Reuse onDom for attachment, but route through debounced function
  return onDom(target, domEvent, busEvent, (e) => {
    debouncedHandler(e)
  })
}

export default {
  on,
  off,
  emit,
  onDom,
  onDomDebounced,
  debounce,
  once,
  clear,
  getListenerCount,
  getAllListenerCounts,
  // Expose listeners for debugging and testing (read-only access)
  get listeners() {
    return listeners
  }
}

