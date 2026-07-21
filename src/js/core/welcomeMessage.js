const VISITED_KEY = "sto_keybind_manager_visited";

/**
 * @typedef {{
 *   commit: () => void,
 *   rollback: () => void
 * }} WelcomeMessageAttempt
 */

/**
 * @param {Storage} storage
 * @param {{
 *   show?: (modalId: string) => unknown,
 *   hide?: (modalId: string) => unknown
 * } | null | undefined} modalManager
 * @returns {WelcomeMessageAttempt | null}
 */
export function checkAndShowWelcomeMessage(storage, modalManager) {
  const previousValue = storage.getItem(VISITED_KEY);
  if (previousValue) return null;

  storage.setItem(VISITED_KEY, "true");

  let active = true;
  let hideOnRollback = false;
  const attempt = {
    commit() {
      active = false;
    },
    rollback() {
      if (!active) return;
      active = false;

      let rollbackError;
      if (hideOnRollback) {
        try {
          modalManager?.hide?.("aboutModal");
        } catch (error) {
          rollbackError = error;
        }
      }

      try {
        if (storage.getItem(VISITED_KEY) === "true") {
          if (previousValue === null) storage.removeItem(VISITED_KEY);
          else storage.setItem(VISITED_KEY, previousValue);
        }
      } catch (error) {
        rollbackError ??= error;
      }

      if (rollbackError) throw rollbackError;
    },
  };

  try {
    if (typeof modalManager?.show === "function") {
      hideOnRollback = true;
      if (modalManager.show("aboutModal") === false) hideOnRollback = false;
    }
  } catch (error) {
    try {
      attempt.rollback();
    } catch {
      // Preserve the startup failure that triggered the rollback.
    }
    throw error;
  }

  return attempt;
}
