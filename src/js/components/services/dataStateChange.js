/** @typedef {import('../../types/events/data.js').DataStateChangeReason} DataStateChangeReason */
/** @typedef {import('../../types/events/data.js').DataStateChangedPayload} DataStateChangedPayload */
/** @typedef {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot} DataStateSnapshot */
/** @typedef {import('./serviceTypes.js').ProfileOperations} ProfileOperations */

/**
 * Materialize the closed data-state event union without weakening replacement
 * provenance for consumers that distinguish active-profile replacement.
 *
 * @param {DataStateChangeReason} reason
 * @param {DataStateSnapshot} state
 * @param {{ profileId?: string }} [details]
 * @returns {DataStateChangedPayload}
 */
export function createDataStateChangedPayload(reason, state, details = {}) {
  if (reason === "profile-replaced") {
    if (!details.profileId) {
      throw new Error("profile-replaced state requires a profileId");
    }
    return Object.freeze({ reason, profileId: details.profileId, state });
  }
  return Object.freeze({ reason, state });
}

/**
 * Select the exact state-change provenance for one accepted profile update.
 *
 * @param {ProfileOperations} updates
 * @param {string} profileId
 * @returns {[DataStateChangeReason, { profileId?: string }]}
 */
export function profileStateChange(updates, profileId) {
  return updates.replacement
    ? ["profile-replaced", { profileId }]
    : ["profile-updated", {}];
}
