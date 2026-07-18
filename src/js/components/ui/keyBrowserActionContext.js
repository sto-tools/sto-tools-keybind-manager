/** @typedef {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot} DataStateSnapshot */
/**
 * @typedef {{
 *   destroyed: boolean,
 *   _lifecycleGeneration: number,
 *   cache: { dataState: DataStateSnapshot | null }
 * }} KeyBrowserActionOwner
 */
/**
 * @typedef {{
 *   lifecycleGeneration: number,
 *   dataState: DataStateSnapshot | null,
 *   authorityEpoch: number | null,
 *   profileId: string | null
 * }} KeyBrowserActionContext
 */

/** @param {KeyBrowserActionOwner} owner @returns {KeyBrowserActionContext} */
export function captureKeyBrowserActionContext(owner) {
  const state = owner.cache.dataState;
  return {
    lifecycleGeneration: owner._lifecycleGeneration,
    dataState: state,
    authorityEpoch: state?.authorityEpoch ?? null,
    profileId: state?.ready ? state.currentProfile : null,
  };
}

/**
 * @param {KeyBrowserActionOwner} owner
 * @param {DataStateSnapshot} candidate
 */
export function isCurrentKeyBrowserDataState(owner, candidate) {
  const accepted = owner.cache.dataState;
  return Boolean(
    accepted &&
      accepted.authorityEpoch === candidate.authorityEpoch &&
      accepted.revision === candidate.revision,
  );
}

/**
 * Dialog results are valid only while the exact accepted predecessor snapshot
 * remains current.
 * @param {KeyBrowserActionOwner} owner
 * @param {KeyBrowserActionContext} context
 */
export function isPendingKeyBrowserActionCurrent(owner, context) {
  return (
    !owner.destroyed &&
    context.lifecycleGeneration === owner._lifecycleGeneration &&
    context.dataState === owner.cache.dataState
  );
}

/**
 * A dispatched mutation replaces its own predecessor snapshot before replying.
 * Admit that successor only while the same live owner and profile remain.
 * @param {KeyBrowserActionOwner} owner
 * @param {KeyBrowserActionContext} context
 */
export function isSettledKeyBrowserActionCurrent(owner, context) {
  const state = owner.cache.dataState;
  return Boolean(
    !owner.destroyed &&
      context.lifecycleGeneration === owner._lifecycleGeneration &&
      state?.ready &&
      state.authorityEpoch === context.authorityEpoch &&
      state.currentProfile === context.profileId,
  );
}
