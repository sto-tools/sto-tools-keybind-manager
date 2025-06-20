(function(global){
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

  global.eventBus = { on, off, emit };
})(typeof window !== 'undefined' ? window : this);
