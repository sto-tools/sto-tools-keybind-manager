import { adoptDataStateSnapshot } from "./dataState.js";
import {
  materializeMutationRequest,
  requireMutationIdentifier,
  requireMutationString,
  requireMutationBoolean,
} from "./mutationRequestBoundary.js";

/** @typedef {import('../../types/events/base.js').Environment} SelectionEnvironment */
/** @typedef {Record<string, string | null>} PersistedSelections */

/**
 * @typedef {Object} ProfileSelectionState
 * @property {PersistedSelections} baseline
 * @property {number} generation
 * @property {Promise<void>} admissionQueue
 * @property {number | undefined} authorityEpoch
 * @property {Set<Promise<void>>} durability
 * @property {PersistenceToken | null} active
 * @property {PersistenceToken | null} latestIntent
 */

/**
 * @typedef {Object} PersistenceToken
 * @property {number} generation
 * @property {boolean} released
 * @property {() => void} release
 * @property {{authorityEpoch: number, revision: number} | null} precondition
 * @property {boolean} canonicalAdvance
 */

/**
 * @typedef {Object} SelectionPersistenceController
 * @property {(profileId: string, selections?: Readonly<Record<string, unknown>> | null) => void} reset
 * @property {(profileId: string, environment: SelectionEnvironment, selection: string | null) => Promise<boolean>} persist
 * @property {(profileId: string) => PersistedSelections} snapshot
 * @property {() => void} dispose
 * @property {() => Promise<void>} whenAdmitted
 * @property {() => Promise<void>} whenSettled
 * @property {(state: import('../../types/events/component-state.js').DataCoordinatorStateSnapshot) => void} acceptAuthorityState
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
 *   write: (profileId: string, selections: PersistedSelections, authorityEpoch?: number, dispatched?: (precondition: {authorityEpoch: number, revision: number}) => void) => Promise<unknown>,
 *   captureAuthorityEpoch?: () => number | undefined,
 *   initialQueue?: Promise<void>,
 *   onCommit?: (profileId: string, selections: PersistedSelections) => void,
 *   onError?: (error: unknown, profileId: string, selections: PersistedSelections) => void
 * }} options
 * @returns {SelectionPersistenceController}
 */
export function createSelectionPersistenceController({
  write,
  captureAuthorityEpoch,
  initialQueue = Promise.resolve(),
  onCommit = () => {},
  onError = () => {},
}) {
  /** @type {Map<string, ProfileSelectionState>} */
  const profileStates = new Map();
  let disposed = false;

  /** @param {string} profileId @param {PersistedSelections} selections @param {number | undefined} epoch @param {PersistenceToken} token */
  function dispatch(profileId, selections, epoch, token) {
    return captureAuthorityEpoch
      ? write(profileId, selections, epoch, (precondition) => {
          token.precondition = precondition;
        })
      : write(profileId, selections);
  }

  /**
   * Start work behind the admission tail while retaining its exact durability
   * result independently. A newer canonical owner snapshot can release only
   * admission; destroy/drain still waits for every RPC reply.
   *
   * @template T
   * @param {ProfileSelectionState} state
   * @param {number} generation
   * @param {(token: PersistenceToken) => Promise<T>} task
   * @returns {{result: Promise<T>, token: PersistenceToken}}
   */
  function enqueue(state, generation, task) {
    let releaseGate = () => {};
    /** @type {Promise<void>} */
    const gate = new Promise((resolve) => {
      releaseGate = resolve;
    });
    /** @type {PersistenceToken} */
    const token = {
      generation,
      released: false,
      release() {
        if (token.released) return;
        token.released = true;
        releaseGate();
      },
      precondition: null,
      canonicalAdvance: false,
    };
    const prior = state.admissionQueue;
    const result = prior.then(async () => {
      state.active = token;
      try {
        return await task(token);
      } finally {
        if (state.active === token) state.active = null;
        token.release();
      }
    });
    state.admissionQueue = prior.then(
      () => gate,
      () => gate,
    );
    const finishDurability = () => {
      state.durability.delete(settled);
    };
    const settled = result.then(finishDurability, finishDurability);
    state.durability.add(settled);
    return { result, token };
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
    void enqueue(state, generation, async (token) => {
      if (state.generation !== generation) return;
      const snapshot = { ...state.baseline };
      try {
        await dispatch(profileId, snapshot, state.authorityEpoch, token);
      } catch (error) {
        if (state.generation === generation) {
          onError(error, profileId, snapshot);
        }
      }
    }).result;
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
    const authorityEpoch = captureAuthorityEpoch?.();
    const state = profileStates.get(profileId);
    if (state) {
      const needsCorrection = state.active !== null && !state.active.released;
      state.baseline = seed;
      state.authorityEpoch = authorityEpoch;
      state.generation += 1;
      state.latestIntent = null;
      if (needsCorrection) {
        enqueueCorrection(profileId, state, state.generation);
      }
      return;
    }
    profileStates.set(profileId, {
      baseline: seed,
      generation: 0,
      admissionQueue: initialQueue,
      authorityEpoch,
      durability: new Set(),
      active: null,
      latestIntent: null,
    });
  }

  /** @param {string} profileId @returns {ProfileSelectionState} */
  function getProfileState(profileId) {
    let state = profileStates.get(profileId);
    if (!state) {
      state = {
        baseline: {},
        generation: 0,
        admissionQueue: initialQueue,
        authorityEpoch: captureAuthorityEpoch?.(),
        durability: new Set(),
        active: null,
        latestIntent: null,
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
    const authorityEpoch = captureAuthorityEpoch
      ? captureAuthorityEpoch()
      : state.authorityEpoch;
    if (captureAuthorityEpoch && authorityEpoch === undefined)
      return Promise.resolve(false);
    const queued = enqueue(state, generation, async (token) => {
      if (disposed || state.generation !== generation) return false;
      const snapshot = {
        ...state.baseline,
        [environment]: selection,
      };
      try {
        await dispatch(profileId, { ...snapshot }, authorityEpoch, token);
      } catch (error) {
        if (!disposed && state.generation === generation) {
          onError(error, profileId, { ...snapshot });
        }
        return false;
      }

      if (
        disposed ||
        state.generation !== generation ||
        (token.canonicalAdvance && state.latestIntent !== token)
      )
        return false;
      if (token.canonicalAdvance) {
        if (state.baseline[environment] !== selection) return false;
      } else state.baseline = snapshot;
      onCommit(profileId, { ...state.baseline });
      return true;
    });
    state.latestIntent = queued.token;
    return queued.result;
  }

  function dispose() {
    // Stop undispatched user intents. Authority corrections queued by reset()
    // remain responsible for repairing older writes that were already sent.
    disposed = true;
  }

  async function whenSettled() {
    while (true) {
      const pending = [...profileStates.values()].flatMap((state) => [
        ...state.durability,
      ]);
      if (pending.length === 0) return;
      await Promise.all(pending);
    }
  }

  async function whenAdmitted() {
    await Promise.all(
      [...profileStates.values()].map((state) => state.admissionQueue),
    );
  }

  /** @param {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot} ownerState */
  function acceptAuthorityState(ownerState) {
    if (!ownerState.ready) return;
    for (const [profileId, state] of profileStates) {
      const profile = ownerState.profiles[profileId];
      const token = state.active;
      if (profile && (!token || token.generation === state.generation)) {
        state.baseline = copySelections(profile.selections);
      }
      if (
        token?.precondition &&
        (ownerState.authorityEpoch > token.precondition.authorityEpoch ||
          (ownerState.authorityEpoch === token.precondition.authorityEpoch &&
            ownerState.revision > token.precondition.revision))
      ) {
        token.canonicalAdvance = true;
        token.release();
      }
    }
  }

  return {
    acceptAuthorityState,
    dispose,
    persist,
    reset,
    snapshot,
    whenAdmitted,
    whenSettled,
  };
}

/** Observe only accepted owner coordinates while already-admitted writes drain.
 * Never updates a service cache or acquires new intent after disposal.
 * @param {import('./serviceTypes.js').EventBus | null} bus
 * @param {() => import('../../types/events/component-state.js').DataCoordinatorStateSnapshot | null} acceptedState
 * @param {(state: import('../../types/events/component-state.js').DataCoordinatorStateSnapshot) => void} [onAccepted]
 */
export function createSelectionPersistenceAuthority(
  bus,
  acceptedState,
  onAccepted = () => {},
) {
  /** @type {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot | null} */
  let observed = null;
  let draining = false;
  /** @param {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot | null} state */
  const accept = (state) => {
    if (!state) return;
    observed = state;
    onAccepted(state);
  };
  /** @param {{state: import('../../types/events/component-state.js').DataCoordinatorStateSnapshot}} event */
  const observe = ({ state }) => {
    accept(adoptDataStateSnapshot(state, observed));
  };
  const detach = bus?.on("data:state-changed", observe);
  return {
    captureAuthorityEpoch() {
      if (draining) throw new Error("operation_cancelled");
      const accepted = acceptedState();
      if (accepted) accept(adoptDataStateSnapshot(accepted, observed));
      return observed?.ready ? observed.authorityEpoch : undefined;
    },
    /** @param {number | undefined} epoch */
    precondition(epoch) {
      if (!observed?.ready || observed.authorityEpoch !== epoch)
        throw new Error("operation_cancelled");
      return {
        authorityEpoch: observed.authorityEpoch,
        revision: observed.revision,
      };
    },
    /** @param {Promise<void>} settled */
    drain(settled) {
      draining = true;
      return settled.finally(() => {
        if (typeof detach === "function") detach();
        else bus?.off("data:state-changed", observe);
      });
    },
  };
}

/** @param {unknown} payload @param {'key'|'alias'} kind @param {boolean} [legacy] */
export function selectionRequest(payload, kind, legacy = false) {
  const fields =
    kind === "key" ? ["keyName", "environment", "bindset"] : ["aliasName"];
  if (!legacy) fields.push("skipPersistence", "isAuto", "forceEmit");
  const input = materializeMutationRequest(payload, fields);
  const name = input[kind === "key" ? "keyName" : "aliasName"];
  requireMutationString(name, { nullable: true, allowEmpty: true });
  if (name !== null) requireMutationIdentifier(name, { allowEmpty: true });
  if (input.environment !== undefined)
    requireMutationIdentifier(input.environment, { allowEmpty: true });
  if (input.bindset !== undefined && input.bindset !== null)
    requireMutationIdentifier(input.bindset, { allowEmpty: true });
  for (const field of ["skipPersistence", "isAuto", "forceEmit"])
    if (input[field] !== undefined) requireMutationBoolean(input[field]);
  return /** @type {{keyName: string|null, aliasName: string|null, environment?: string, bindset?: string|null, skipPersistence?: boolean, isAuto?: boolean, forceEmit?: boolean}} */ (
    input
  );
}

/** Internal cancellation capability is never admitted by public RPC schemas.
 * @param {unknown} value @returns {import('./SelectionService.js').SelectionOptions}
 */
export function internalSelectionOptions(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new TypeError("invalid_mutation_request");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const data = {};
  let isCurrent;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string")
      throw new TypeError("invalid_mutation_request");
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !("value" in descriptor))
      throw new TypeError("invalid_mutation_request");
    if (key === "isCurrent") {
      if (
        descriptor.value !== undefined &&
        typeof descriptor.value !== "function"
      )
        throw new TypeError("invalid_mutation_request");
      isCurrent = descriptor.value;
    } else
      Object.defineProperty(data, key, {
        value: descriptor.value,
        enumerable: true,
      });
  }
  const detached = materializeMutationRequest(data, [
    "bindset",
    "skipPersistence",
    "isAuto",
    "forceEmit",
  ]);
  if (detached.bindset !== undefined && detached.bindset !== null)
    requireMutationIdentifier(detached.bindset, { allowEmpty: true });
  for (const key of ["skipPersistence", "isAuto", "forceEmit"])
    if (detached[key] !== undefined) requireMutationBoolean(detached[key]);
  return /** @type {import('./SelectionService.js').SelectionOptions} */ ({
    ...detached,
    ...(isCurrent ? { isCurrent } : {}),
  });
}
