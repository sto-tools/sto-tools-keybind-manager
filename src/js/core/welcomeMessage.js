/**
 * @typedef {{
 *   commit: () => void,
 *   rollback: () => void
 * }} WelcomeMessageAttempt
 */

/**
 * @param {import('../components/storage/VisitedStatePort.js').VisitedStatePort} visitedState
 * @param {{
 *   show?: (modalId: string) => unknown,
 *   hide?: (modalId: string) => unknown
 * } | null | undefined} modalManager
 * @returns {WelcomeMessageAttempt | null}
 */
export function checkAndShowWelcomeMessage(visitedState, modalManager) {
  const previousValue = visitedState.loadExact();
  if (previousValue) return null;

  visitedState.markVisited();

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
        visitedState.compensate("true", previousValue);
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
