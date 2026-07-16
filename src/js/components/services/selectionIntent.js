/**
 * @typedef {Object} SelectionIntent
 * @property {string} environment
 * @property {string | null} selection
 * @property {Promise<boolean>} persistence
 */

/**
 * Track only the newest in-flight persistence intent for each selection slot.
 * The promise remains owned by its caller; this helper only supplies identity
 * and lookup semantics for environment transitions.
 */
export function createSelectionIntentTracker() {
  /** @type {Map<string, SelectionIntent>} */
  const intents = new Map();

  /**
   * @param {string} environment
   * @param {string | null} selection
   * @param {Promise<boolean>} persistence
   * @returns {SelectionIntent}
   */
  function track(environment, selection, persistence) {
    const intent = { environment, selection, persistence };
    intents.set(environment, intent);
    return intent;
  }

  /** @param {string} environment @returns {SelectionIntent | null} */
  function get(environment) {
    return intents.get(environment) || null;
  }

  /** @param {SelectionIntent} intent @returns {boolean} */
  function finish(intent) {
    if (intents.get(intent.environment) !== intent) return false;
    intents.delete(intent.environment);
    return true;
  }

  function clear() {
    intents.clear();
  }

  /**
   * @param {(intent: SelectionIntent) => boolean} predicate
   * @returns {boolean}
   */
  function some(predicate) {
    for (const intent of intents.values()) {
      if (predicate(intent)) return true;
    }
    return false;
  }

  return { clear, finish, get, some, track };
}
