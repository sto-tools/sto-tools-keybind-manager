import eventBus from "./eventBus.js";

const state = {
  currentProfile: null,
  currentMode: "space",
  currentEnvironment: "space",
  selectedKey: null,
  isModified: false,
  undoStack: [],
  redoStack: [],
  maxUndoSteps: 50,
  commandIdCounter: 0,
};

const store = new Proxy(state, {
  set(target, prop, value) {
    Reflect.set(target, prop, value);
    if (eventBus && eventBus.emit) {
      const topic =
        /** @type {import("../types/events/dynamic.js").DynamicStoreEventTopic<string, unknown>} */ (
          `store:${String(prop)}`
        );
      eventBus.emit(topic, value);
    }
    return true;
  },
});

export default store;
