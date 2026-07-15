import eventBus from "../../../core/eventBus.js";

export default class ParseState {
  /** @param {typeof eventBus | null} [eventBusInstance] */
  constructor(eventBusInstance = null) {
    this.eventBus = eventBusInstance || eventBus;
    this.currentLayer = 0;
    /** @type {Record<string, any>[]} */
    this.errors = [];
    /** @type {Record<string, any>[]} */
    this.warnings = [];
    this.reset();
  }

  reset() {
    this.currentLayer = 0;
    this.errors = [];
    this.warnings = [];
  }

  /** @param {string} message @param {Record<string, any>} [context] */
  addError(message, context = {}) {
    const error = {
      message,
      ...context,
    };
    this.errors.push(error);
    return error;
  }

  /** @param {string} message @param {Record<string, any>} [context] */
  addWarning(message, context = {}) {
    const warning = {
      message,
      ...context,
    };
    this.warnings.push(warning);
    return warning;
  }
}
