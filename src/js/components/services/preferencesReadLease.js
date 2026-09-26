import { isCurrentPreferencesStateAuthority } from "./preferencesState.js";

/** @typedef {import('./PreferencesService.js').default} PreferencesService */
/** @typedef {import('../../types/storage-contracts.js').OwnerReadLease<import('../../types/data-contracts.js').CanonicalSettings>} PreferencesReadLease */

/**
 * Reject a lease whose tuple no longer identifies the current ready owner.
 * This deliberately knows nothing about the DataCoordinator revision.
 *
 * @param {PreferencesService} owner
 * @param {PreferencesReadLease} lease
 */
export function assertPreferencesReadLeaseCurrent(owner, lease) {
  const snapshot = owner.getCurrentState();
  if (
    !isCurrentPreferencesStateAuthority(owner._stateAuthorityEpoch) ||
    !snapshot.ready ||
    snapshot.authorityEpoch !== owner._stateAuthorityEpoch ||
    snapshot.revision !== owner._stateRevision ||
    lease.authorityEpoch !== snapshot.authorityEpoch ||
    lease.revision !== snapshot.revision
  ) {
    throw new Error("operation_cancelled");
  }
  owner._assertCurrentLifecycle(owner._lifecycleGeneration);
}

/**
 * Wait for earlier owner mutations, then hold later mutations until release.
 * Release is idempotent so every failure path can safely clean up in finally.
 *
 * @param {PreferencesService} owner
 * @returns {Promise<PreferencesReadLease>}
 */
export function acquirePreferencesReadLease(owner) {
  const generation = owner._lifecycleGeneration;
  /** @type {() => void} */
  let openGate = () => {};
  let released = false;
  /** @type {Promise<void>} */
  const held = new Promise((resolve) => {
    openGate = () => resolve();
  });
  const acquired = owner._mutationTail.then(() => {
    owner._assertCurrentLifecycle(generation);
    const snapshot = owner.getCurrentState();
    if (!snapshot.ready) throw new Error("preferences_not_ready");
    if (
      !isCurrentPreferencesStateAuthority(owner._stateAuthorityEpoch) ||
      snapshot.authorityEpoch !== owner._stateAuthorityEpoch ||
      snapshot.revision !== owner._stateRevision
    ) {
      throw new Error("operation_cancelled");
    }
    return {
      authorityEpoch: snapshot.authorityEpoch,
      revision: snapshot.revision,
      value: structuredClone(snapshot.settings),
      release() {
        if (released) return;
        released = true;
        openGate();
      },
    };
  });
  owner._mutationTail = acquired.then(
    () => held,
    () => undefined,
  );
  return acquired;
}
