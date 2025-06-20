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

  function onDom(target, domEvent, busEvent, handler) {
    if (typeof target === 'string') {
      target = document.getElementById(target);
    }
    if (!target || !target.addEventListener) return () => {};
    if (typeof busEvent === 'function') {
      handler = busEvent;
      busEvent = domEvent;
    }
    if (!busEvent) busEvent = domEvent;

    const domHandler = (e) => emit(busEvent, e);
    target.addEventListener(domEvent, domHandler);

    if (handler) on(busEvent, handler);

    return () => {
      target.removeEventListener(domEvent, domHandler);
      if (handler) off(busEvent, handler);
    };
  }

  global.eventBus = { on, off, emit, onDom };
})(typeof window !== 'undefined' ? window : this);
