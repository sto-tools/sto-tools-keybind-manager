import { createDataCoordinatorState } from "../core/componentState.js";

/** Explicit accepted owner coordinates for focused legacy selection fixtures.
 * Does not install responders, turn failures into successes, or publish UI state.
 * Tests retain control over every deferred/rejected/malformed acknowledgement.
 */
export function seedSelectionMutationOwner(service, overrides = {}) {
  if (!service.cache.dataState) {
    service.cache.dataState = createDataCoordinatorState({
      authorityEpoch: 1,
      revision: 0,
      ...overrides,
    });
  }
  return service.cache.dataState;
}

/** Valid success receipt; call explicitly only for an acknowledged test write. */
export function selectionMutationReceipt(profile = {}) {
  return {
    success: true,
    profile: {
      name: "Selection fixture",
      builds: { space: { keys: {} }, ground: { keys: {} } },
      aliases: {},
      ...structuredClone(profile),
    },
  };
}

/** Explicit owner readback delivered through ComponentBase's canonical decoder.
 * Focused race tests decide when a write is acknowledged and call this then;
 * this helper never makes pending, rejected, or malformed writes successful.
 */
export function adoptSelectionMutationReceipt(service, profile) {
  const receipt = selectionMutationReceipt(profile);
  service._cacheDataState(
    createDataCoordinatorState({
      authorityEpoch: service.cache.dataState.authorityEpoch,
      revision: service.cache.dataState.revision + 1,
      currentProfile: service.cache.currentProfile,
      currentEnvironment: service.cache.currentEnvironment,
      currentProfileData: receipt.profile,
      profiles: { [service.cache.currentProfile]: receipt.profile },
    }),
  );
  return receipt;
}
