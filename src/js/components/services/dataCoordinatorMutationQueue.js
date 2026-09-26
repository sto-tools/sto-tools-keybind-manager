/** @typedef {import('./DataCoordinator.js').default} DataCoordinator */
/** @type {WeakMap<object, {tail: Promise<void>, owner: DataCoordinator | null}>} */
const domains = new WeakMap();
/** @type {WeakMap<DataCoordinator, Promise<unknown>[]>} */
const publications = new WeakMap();

/** @param {DataCoordinator} owner */
function domainFor(owner) {
  const key = owner.eventBus;
  if (!key) throw new Error("data_owner_event_bus_required");
  let domain = domains.get(key);
  if (!domain) {
    domain = { tail: Promise.resolve(), owner: null };
    domains.set(key, domain);
  }
  return domain;
}

/** Replacement invalidates predecessor continuations before loading durability.
 * @param {DataCoordinator} owner
 */
export function activateDataCoordinatorOwner(owner) {
  domainFor(owner).owner = owner;
}

/** @param {DataCoordinator} owner */
export function isCurrentDataCoordinatorOwner(owner) {
  const current = domainFor(owner).owner;
  return current === null || current === owner;
}

/**
 * Record listener settlement while the writer tail covers only ordered writes,
 * adoption and publication invocation. Listeners can request another mutation
 * without deadlocking against their publisher's acknowledgement.
 * @param {DataCoordinator} owner
 * @param {Promise<unknown>} settled
 */
export function recordDataCoordinatorPublication(owner, settled) {
  const completion = Promise.resolve(settled);
  publications.get(owner)?.push(completion);
  // Observe rejection immediately, even while the operation is still running.
  void completion.catch(() => undefined);
}

/**
 * One event-bus domain shares a writer tail across replacement owner instances.
 * Requests must already be validated and detached before entering this helper.
 * @template Result
 * @param {DataCoordinator} owner
 * @param {() => Result | Promise<Result>} operation
 * @returns {Promise<Result>}
 */
export function enqueueDataCoordinatorMutation(owner, operation) {
  const generation = owner._captureOperationGeneration();
  const domain = domainFor(owner);
  const committed = domain.tail.then(async () => {
    owner._assertCurrentOperation(generation);
    /** @type {Promise<unknown>[]} */
    const settled = [];
    publications.set(owner, settled);
    try {
      const value = await operation();
      return { value, settled };
    } finally {
      publications.delete(owner);
    }
  });
  domain.tail = committed.then(
    () => undefined,
    () => undefined,
  );
  return committed.then(async ({ value, settled }) => {
    const observations = await Promise.allSettled(settled);
    for (const observation of observations) {
      if (observation.status === "rejected") {
        console.error(
          "DataCoordinator publication settlement failed:",
          observation.reason,
        );
      }
    }
    // The operation already persisted, adopted and invoked its publications.
    // Losing a presentation lifecycle now cannot undo that accepted outcome.
    return value;
  });
}

/** @param {DataCoordinator} owner @param {import('../../types/rpc/data.js').ProfileMutationPrecondition | undefined} precondition */
export function assertDataCoordinatorPrecondition(owner, precondition) {
  if (
    precondition &&
    (precondition.authorityEpoch !== owner._stateAuthorityEpoch ||
      precondition.revision !== owner._stateRevision)
  ) {
    throw new Error("operation_cancelled");
  }
}
