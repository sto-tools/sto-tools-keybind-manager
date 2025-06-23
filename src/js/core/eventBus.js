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
  // Support CSS selectors, element IDs, and DOM elements
  if (typeof target === 'string') {
    // Try as CSS selector first, fallback to getElementById for backward compatibility
    const selectorElement = document.querySelector(target)
    if (selectorElement) {
      target = selectorElement
    } else {
      // Fallback to getElementById for backward compatibility with existing code
      target = document.getElementById(target)
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
