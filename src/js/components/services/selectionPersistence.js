/** @typedef {import('../../types/events/base.js').Environment} SelectionEnvironment */
/** @typedef {Record<string, string | null>} PersistedSelections */

/**
 * @typedef {Object} ProfileSelectionState
 * @property {PersistedSelections} baseline
 * @property {number} generation
 * @property {number} pendingWrites
 * @property {Promise<void>} writeQueue
 */

/**
 * @typedef {Object} SelectionPersistenceController
 * @property {(profileId: string, selections?: Readonly<Record<string, unknown>> | null) => void} reset
 * @property {(profileId: string, environment: SelectionEnvironment, selection: string | null) => Promise<boolean>} persist
 * @property {(profileId: string) => PersistedSelections} snapshot
 * @property {() => void} dispose
 */

/**
 * Copy persisted selection slots without inventing absent null fields.
 *
 * @param {Readonly<Record<string, unknown>> | null | undefined} selections
 * @returns {PersistedSelections}
 */
function copySelections(selections) {
  /** @type {PersistedSelections} */
  const copy = {};
  if (!selections) return copy;

  for (const [environment, selection] of Object.entries(selections)) {
    if (typeof selection === "string" || selection === null) {
      copy[environment] = selection;
    }
  }
  return copy;
}

/**
 * Serialize each profile's selection writes and rebase a queued payload on
 * the latest successful write or fresh profile seed when execution begins.
 *
 * @param {{
 *   write: (profileId: string, selections: PersistedSelections) => Promise<unknown>,
 *   onCommit?: (profileId: string, selections: PersistedSelections) => void,
 *   onError?: (error: unknown, profileId: string, selections: PersistedSelections) => void
 * }} options
 * @returns {SelectionPersistenceController}
 */
export function createSelectionPersistenceController({
  write,
  onCommit = () => {},
  onError = () => {},
}) {
  /** @type {Map<string, ProfileSelectionState>} */
  const profileStates = new Map();
  let disposed = false;

  /**
   * Keep a profile queue live after either a handled writer failure or an
   * unexpected callback failure.
   *
   * @template T
   * @param {ProfileSelectionState} state
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  function enqueue(state, task) {
    state.pendingWrites += 1;
    const result = state.writeQueue.then(task);
    const tracked = result.finally(() => {
      state.pendingWrites -= 1;
    });
    state.writeQueue = tracked.then(
      () => undefined,
      () => undefined,
    );
    return tracked;
  }

  /**
   * Reassert a fresh seed after an older, already-dispatched write. A newer
   * reset supersedes this correction through the same generation check.
   *
   * @param {string} profileId
   * @param {ProfileSelectionState} state
   * @param {number} generation
   */
  function enqueueCorrection(profileId, state, generation) {
    // Corrections deliberately outlive dispose(): an already-dispatched stale
    // write cannot be canceled, so its fresh authority seed must still land.
    // They never invoke onCommit and therefore cannot revive destroyed state.
    void enqueue(state, async () => {
      if (state.generation !== generation) return;
      const snapshot = { ...state.baseline };
      try {
        await write(profileId, snapshot);
      } catch (error) {
        if (state.generation === generation) {
          onError(error, profileId, snapshot);
        }
      }
    });
  }

  /**
   * Replace a profile's baseline with selections from a fresh profile value.
   *
   * @param {string} profileId
   * @param {Readonly<Record<string, unknown>> | null} [selections]
   */
  function reset(profileId, selections = null) {
    if (disposed) return;
    const seed = copySelections(selections);
    const state = profileStates.get(profileId);
    if (state) {
      const needsCorrection = state.pendingWrites > 0;
      state.baseline = seed;
      state.generation += 1;
      if (needsCorrection) {
        enqueueCorrection(profileId, state, state.generation);
      }
      return;
    }
    profileStates.set(profileId, {
      baseline: seed,
      generation: 0,
      pendingWrites: 0,
      writeQueue: Promise.resolve(),
    });
  }

  /** @param {string} profileId @returns {ProfileSelectionState} */
  function getProfileState(profileId) {
    let state = profileStates.get(profileId);
    if (!state) {
      state = {
        baseline: {},
        generation: 0,
        pendingWrites: 0,
        writeQueue: Promise.resolve(),
      };
      profileStates.set(profileId, state);
    }
    return state;
  }

  /** @param {string} profileId @returns {PersistedSelections} */
  function snapshot(profileId) {
    return { ...getProfileState(profileId).baseline };
  }

  /**
   * @param {string} profileId
   * @param {SelectionEnvironment} environment
   * @param {string | null} selection
   * @returns {Promise<boolean>}
   */
  function persist(profileId, environment, selection) {
    if (disposed) return Promise.resolve(false);
    // A null selection has historically been transient state, not a write.
    if (selection === null) return Promise.resolve(true);

    const state = getProfileState(profileId);
    const generation = state.generation;
    return enqueue(state, async () => {
      if (disposed || state.generation !== generation) return false;
      const snapshot = {
        ...state.baseline,
        [environment]: selection,
      };
      try {
        await write(profileId, { ...snapshot });
      } catch (error) {
        if (!disposed && state.generation === generation) {
          onError(error, profileId, { ...snapshot });
        }
        return false;
      }

      if (disposed || state.generation !== generation) return false;
      state.baseline = snapshot;
      onCommit(profileId, { ...snapshot });
      return true;
    });
  }

  function dispose() {
    // Stop undispatched user intents. Authority corrections queued by reset()
    // remain responsible for repairing older writes that were already sent.
    disposed = true;
  }

  return { dispose, persist, reset, snapshot };
}
