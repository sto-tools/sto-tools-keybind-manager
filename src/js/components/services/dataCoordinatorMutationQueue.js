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

/** @param {Promise<unknown>[]} settled */
async function settleDataCoordinatorPublications(settled) {
  const observations = await Promise.allSettled(settled);
  for (const observation of observations) {
    if (observation.status === "rejected") {
      console.error(
        "DataCoordinator publication settlement failed:",
        observation.reason,
      );
    }
  }
}

/**
 * Complete an ordered owner mutation and expose publication settlement without
 * retaining the writer tail. Cross-owner workflows use this boundary so their
 * outer lease can be released before they await asynchronous consumers.
 *
 * @template Result
 * @param {DataCoordinator} owner
 * @param {() => Result | Promise<Result>} operation
 * @returns {Promise<{result: Result, settlement: Promise<void>}>}
 */
export function enqueueDataCoordinatorMutationWithSettlement(owner, operation) {
  const generation = owner._captureOperationGeneration();
  const domain = domainFor(owner);
  const committed = domain.tail.then(async () => {
    owner._assertCurrentOperation(generation);
    /** @type {Promise<unknown>[]} */
    const settled = [];
    publications.set(owner, settled);
    try {
      const result = await operation();
      return { result, settled };
    } finally {
      publications.delete(owner);
    }
  });
  domain.tail = committed.then(
    () => undefined,
    () => undefined,
  );
  return committed.then(({ result, settled }) => ({
    result,
    settlement: settleDataCoordinatorPublications(settled),
  }));
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
  return enqueueDataCoordinatorMutationWithSettlement(owner, operation).then(
    async ({ result, settlement }) => {
      await settlement;
      // The operation already persisted, adopted and invoked its publications.
      // Losing a presentation lifecycle now cannot undo that accepted outcome.
      return result;
    },
  );
}

/**
 * Reject a lease whose tuple no longer identifies the current ready owner.
 * Preferences and DataCoordinator revisions are intentionally independent;
 * this check only compares a DataCoordinator lease with its own owner.
 *
 * @param {DataCoordinator} owner
 * @param {import('../../types/storage-contracts.js').OwnerReadLease<import('../../types/data-contracts.js').ArtifactProjectProjection>} lease
 */
export function assertDataCoordinatorReadLeaseCurrent(owner, lease) {
  const domain = domainFor(owner);
  const snapshot = owner.getCurrentState();
  if (
    domain.owner !== owner ||
    !owner._isCurrentOperation(owner._captureOperationGeneration()) ||
    !snapshot.ready ||
    snapshot.authorityEpoch !== owner._stateAuthorityEpoch ||
    snapshot.revision !== owner._stateRevision ||
    lease.authorityEpoch !== snapshot.authorityEpoch ||
    lease.revision !== snapshot.revision
  ) {
    throw new Error("operation_cancelled");
  }
}

/**
 * Wait for all earlier EventBus-domain writes, then hold later writes until
 * the returned lease is released. The lease carries only the portable project
 * projection, never the owner or repository capability.
 *
 * @param {DataCoordinator} owner
 * @returns {Promise<import('../../types/storage-contracts.js').OwnerReadLease<import('../../types/data-contracts.js').ArtifactProjectProjection>>}
 */
export function acquireDataCoordinatorReadLease(owner) {
  const generation = owner._captureOperationGeneration();
  const domain = domainFor(owner);
  /** @type {() => void} */
  let openGate = () => {};
  let released = false;
  /** @type {Promise<void>} */
  const held = new Promise((resolve) => {
    openGate = () => resolve();
  });
  const acquired = domain.tail.then(() => {
    owner._assertCurrentOperation(generation);
    if (domain.owner !== owner) throw new Error("operation_cancelled");
    const snapshot = owner.getCurrentState();
    if (!snapshot.ready) throw new Error("data_owner_not_ready");
    if (
      snapshot.authorityEpoch !== owner._stateAuthorityEpoch ||
      snapshot.revision !== owner._stateRevision
    ) {
      throw new Error("operation_cancelled");
    }
    const lease = {
      authorityEpoch: snapshot.authorityEpoch,
      revision: snapshot.revision,
      value:
        /** @type {import('../../types/data-contracts.js').ArtifactProjectProjection} */ (
          structuredClone({
            profiles: snapshot.profiles,
            currentProfile: snapshot.currentProfile,
          })
        ),
      release() {
        if (released) return;
        released = true;
        openGate();
      },
    };
    return lease;
  });
  domain.tail = acquired.then(
    () => held,
    () => undefined,
  );
  return acquired;
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
