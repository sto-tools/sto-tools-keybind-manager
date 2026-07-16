/** @param {unknown} error @param {"restore" | "task"} kind */
export function logSelectionTransitionError(error, kind) {
  console.warn(`[SelectionService] Deferred selection ${kind} failed`, error);
}

/**
 * Own cancellable selection work without coupling transition mechanics to the
 * SelectionService facade.
 *
 * @param {{
 *   getProfileId: () => string | null | undefined,
 *   isDestroyed: () => boolean,
 *   onError?: (error: unknown, kind: "restore" | "task") => void
 * }} options
 */
export function createSelectionTransitionController({
  getProfileId,
  isDestroyed,
  onError = () => {},
}) {
  let epoch = 0;
  /** @type {Set<ReturnType<typeof setTimeout>>} */
  const timers = new Set();

  function invalidate() {
    epoch += 1;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }

  function begin() {
    invalidate();
    const transitionEpoch = epoch;
    const profileId = getProfileId();
    return () =>
      !isDestroyed() &&
      epoch === transitionEpoch &&
      getProfileId() === profileId;
  }

  /**
   * @param {() => Promise<void>} task
   * @param {number} delay
   * @param {() => boolean} isCurrent
   * @param {"restore" | "task"} [kind]
   */
  function schedule(task, delay, isCurrent, kind = "task") {
    const timer = setTimeout(async () => {
      timers.delete(timer);
      if (!isCurrent()) return;
      try {
        await task();
      } catch (error) {
        onError(error, kind);
      }
    }, delay);
    timers.add(timer);
  }

  /** @param {(isCurrent: () => boolean) => Promise<void>} restore */
  function defer(restore) {
    const isCurrent = begin();
    schedule(() => restore(isCurrent), 0, isCurrent, "restore");
  }

  return { begin, defer, invalidate, schedule };
}
