(function (global) {
  const listeners = {};

  function on(event, handler) {
    if (!listeners[event]) {
      listeners[event] = new Set();
    }
    listeners[event].add(handler);
  }

  function off(event, handler) {
    if (listeners[event]) {
      listeners[event].delete(handler);
    }
  }

  function emit(event, detail) {
    if (!listeners[event]) return;
    for (const handler of listeners[event]) {
      try {
        handler(detail);
      } catch (err) {
        console.error(err);
      }
    }
  }

  function onDom(element, domEvent, busEvent = domEvent) {
    if (!element || !element.addEventListener) return () => {};
    const wrapped = (e) => emit(busEvent, e);
    element.addEventListener(domEvent, wrapped);
    return () => element.removeEventListener(domEvent, wrapped);
  }

  global.eventBus = { on, off, emit, onDom };
})(typeof window !== 'undefined' ? window : this);
