const listeners = new Map()
const domListeners = new Set() // Track DOM event listeners for cleanup

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

function emit(event, data, options = {}) {
  // if (typeof window !== 'undefined') {
  //   // eslint-disable-next-line no-console
  //   console.log(`[eventBus] emit → ${event}`, data)
  // }
  
  const eventListeners = listeners.get(event)
  if (!eventListeners) return Promise.resolve()
  
  if (options.synchronous) {
    // Synchronous mode: wait for all listeners to complete
    const promises = []
    
    eventListeners.forEach(callback => {
      try {
        const result = callback(data)
        // If the callback returns a Promise, collect it
        if (result && typeof result.then === 'function') {
          promises.push(result)
        }
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error)
        // Include failed promises so we don't hang
        promises.push(Promise.reject(error))
      }
    })
    
    // Return a Promise that resolves when all listeners complete
    return Promise.allSettled ? Promise.allSettled(promises) : Promise.all(promises.map(p => p.catch(e => e)))
  } else {
    // Asynchronous mode (default): fire and forget
    eventListeners.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error)
      }
    })
    return Promise.resolve()
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
    // Normalise selector: if string already looks like a CSS selector (starts with '.', '#', '[') we keep it.
    // Otherwise we assume it is an element id and prefix with '#'.
    const selector = /^[.\[#]/.test(target) ? target : `#${target}`

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

    // Create cleanup function
    const cleanup = () => {
      document.removeEventListener(domEvent, delegated, true)
      // Remove from tracking
      domListeners.delete(cleanup)
    }
    
    // Track cleanup function
    domListeners.add(cleanup)
    
    return cleanup
  }
  
  if (!target || !target.addEventListener) return () => {}
  if (typeof busEvent === 'function') {
    handler = busEvent
    busEvent = domEvent
  }
  if (!busEvent) busEvent = domEvent

  if (handler) {
    // If a handler is provided, attach it directly to DOM event
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

    // Create cleanup function
    const cleanup = () => {
      target.removeEventListener(domEvent, domHandler)
      // Remove from tracking
      domListeners.delete(cleanup)
    }
    
    // Track cleanup function
    domListeners.add(cleanup)
    
    return cleanup
  } else {
    // If no handler is provided, just emit the bus event
    const domHandler = (e) => emit(busEvent, e)
    target.addEventListener(domEvent, domHandler)

    // Create cleanup function
    const cleanup = () => {
      target.removeEventListener(domEvent, domHandler)
      // Remove from tracking
      domListeners.delete(cleanup)
    }
    
    // Track cleanup function
    domListeners.add(cleanup)
    
    return cleanup
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

function cleanupDomListeners() {
  // Clean up all DOM event listeners
  domListeners.forEach(cleanup => {
    try {
      cleanup()
    } catch (error) {
      console.error('Error cleaning up DOM event listener:', error)
    }
  })
  domListeners.clear()
}

export default {
  on,
  off,
  emit,
  onDom,
  onDomDebounced,
  debounce,
  cleanupDomListeners,
  once,
  clear,
  getListenerCount,
  getAllListenerCounts,
  // Expose listeners for debugging and testing (read-only access)
  get listeners() {
    return listeners
  }
}

