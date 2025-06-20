import eventBus from './eventBus.js'

const state = {
  currentProfile: null,
  currentMode: 'space',
  currentEnvironment: 'space',
  selectedKey: null,
  isModified: false,
  undoStack: [],
  redoStack: [],
  maxUndoSteps: 50,
  commandIdCounter: 0
}

const store = new Proxy(state, {
  set(target, prop, value) {
    target[prop] = value
    if (eventBus && eventBus.emit) {
      eventBus.emit(`store:${prop}`, value)
    }
    return true
  }
})

export function resetStore() {
  Object.assign(store, {
    currentProfile: null,
    currentMode: 'space',
    currentEnvironment: 'space',
    selectedKey: null,
    isModified: false,
    undoStack: [],
    redoStack: [],
    maxUndoSteps: 50,
    commandIdCounter: 0
  })
}

export default store


