import eventBus from '../core/eventBus.js'

export const viewManagement = {
  /**
   * Update the toggle button by delegating to KeyBrowserUI via event bus.
   * @param {string} viewMode
   */
  updateViewToggleButton(viewMode) {
    try {
      if (typeof eventBus !== 'undefined' && eventBus.emit) {
        eventBus.emit('key-view:update-toggle', { viewMode })
      }
    } catch (_) { /* no-op in tests */ }
  },

  /**
   * Cycle through key view modes – delegates to KeyBrowserUI.
   */
  toggleKeyView() {
    try {
      if (typeof eventBus !== 'undefined' && eventBus.emit) {
        eventBus.emit('key-view:toggle')
      }
    } catch (_) { /* no-op */ }
  },

  /**
   * Filter keys in current grid.
   * @param {string} filter
   */
  filterKeys(filter) {
    try {
      if (typeof eventBus !== 'undefined' && eventBus.emit) {
        eventBus.emit('keys:filter', { value: filter })
      }
    } catch (_) {}
  },

  /**
   * Filter commands in current grid.
   * @param {string} filter
   */
  filterCommands(filter) {
    try {
      if (typeof eventBus !== 'undefined' && eventBus.emit) {
        eventBus.emit('commands:filter', { value: filter })
      }
    } catch (_) {}
  },

  /**
   * Show all keys – delegates to KeyBrowserUI.
   */
  showAllKeys() {
    try {
      if (typeof eventBus !== 'undefined' && eventBus.emit) {
        eventBus.emit('keys:show-all')
      }
    } catch (_) {}
  },
}
