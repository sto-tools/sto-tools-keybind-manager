import eventBus from '../../../core/eventBus.js'

export default class ParseState {
  constructor(eventBusInstance = null) {
    this.eventBus = eventBusInstance || eventBus
    this.reset()
  }

  reset() {
    this.errors = []
    this.warnings = []
  }

  addError(message, context = {}) {
    const error = {
      message,
      ...context,
    }
    this.errors.push(error)
    return error
  }

  addWarning(message, context = {}) {
    const warning = {
      message,
      ...context,
    }
    this.warnings.push(warning)
    return warning
  }
}
