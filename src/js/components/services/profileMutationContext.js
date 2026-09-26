/** @typedef {import('../ComponentBase.js').default} Component */
/**
 * @typedef {{
 *   generation: number,
 *   profileId: string | null,
 *   currentProfile: string | null,
 *   environment: string,
 *   precondition: import('../../types/rpc/data.js').ProfileMutationPrecondition
 * }} ProfileMutationContext
 */

/**
 * Call only after complete request validation/detachment. Explicit import
 * targets may be absent; their creation policy remains with DataCoordinator.
 * @param {Component} service
 * @param {number} generation
 * @param {string | null} [profileId]
 * @returns {ProfileMutationContext}
 */
export function captureProfileMutationContext(service, generation, profileId) {
  const state = service.cache.dataState;
  if (service.destroyed || !state?.ready) {
    throw new Error("operation_cancelled");
  }
  return {
    generation,
    profileId: profileId === undefined ? state.currentProfile : profileId,
    currentProfile: state.currentProfile,
    environment: state.currentEnvironment,
    precondition: {
      authorityEpoch: state.authorityEpoch,
      revision: state.revision,
    },
  };
}

/** Check the captured planning baseline immediately before handing off work.
 * The owner repeats the authority/revision check inside its serialized queue.
 * @param {Component} service
 * @param {ProfileMutationContext} context
 * @param {number} generation
 */
export function assertProfileMutationContext(service, context, generation) {
  const state = service.cache.dataState;
  if (
    service.destroyed ||
    generation !== context.generation ||
    !state?.ready ||
    state.authorityEpoch !== context.precondition.authorityEpoch ||
    state.revision !== context.precondition.revision
  ) {
    throw new Error("operation_cancelled");
  }
}

/**
 * An acknowledged commit normally advances revision. Suppress stale local
 * effects after a context switch without denying already accepted durability.
 * @param {Component} service
 * @param {ProfileMutationContext} context
 * @param {number} generation
 */
export function canPublishProfileMutation(service, context, generation) {
  const state = service.cache.dataState;
  return (
    !service.destroyed &&
    generation === context.generation &&
    state?.ready === true &&
    state.authorityEpoch === context.precondition.authorityEpoch &&
    state.currentProfile === context.currentProfile &&
    state.currentEnvironment === context.environment
  );
}
