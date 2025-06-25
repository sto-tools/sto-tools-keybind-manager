const listeners = {}

function on(event, handler) {
  if (!listeners[event]) {
    listeners[event] = new Set()
  }
  listeners[event].add(handler)
}

function off(event, handler) {
  if (listeners[event]) {
    listeners[event].delete(handler)
  }
}

function emit(event, detail) {
  if (!listeners[event]) return
  for (const handler of listeners[event]) {
    try {
      handler(detail)
    } catch (err) {
      console.error(err)
    }
  }
}

function onDom(target, domEvent, busEvent, handler) {
  // -------------------------------------------------
  // If a string is supplied we treat it as a selector / id and
  // always install a delegated listener on document so that
  // dynamically replaced elements keep working.
  // -------------------------------------------------
  if (typeof target === 'string') {
    // Normalise selector: if the string already looks like a CSS selector (starts with '.' or '#') we keep it.
    // Otherwise we assume it is an element id and prefix with '#'.
    const selector = /^[.#]/.test(target) ? target : `#${target}`

    const delegated = (e) => {
      const match = e.target.closest(selector)
      if (selector === '#settingsBtn') {
        console.log('[DEBUG:eventBus] click captured (capture phase) target:', e.target, 'match:', match)
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
      if (target === 'settingsBtn' || selector === '#settingsBtn') {
        console.log('[DEBUG:eventBus] delegated handler fired for settingsBtn')
      }
    }
    document.addEventListener(domEvent, delegated, true)

    // Attempt direct binding as well if the element currently exists
    const directTarget = document.querySelector(selector)
    if (directTarget && directTarget.addEventListener) {
      directTarget.addEventListener(domEvent, delegated)

      // Debug: log direct listener attached
      if (directTarget && (selector === '#settingsBtn')) {
        directTarget.addEventListener(domEvent, delegated)
        console.log('[DEBUG:eventBus] direct listener attached to #settingsBtn')
      }
    }

    // Return detach function
    return () => {
      document.removeEventListener(domEvent, delegated, true)
      if (directTarget && directTarget.removeEventListener) {
        directTarget.removeEventListener(domEvent, delegated)
      }
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

export default { on, off, emit, onDom }
