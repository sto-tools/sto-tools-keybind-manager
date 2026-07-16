import { applyActiveSelection } from "./selectionState.js";

/**
 * Resolve the canonical snapshot ComponentBase accepted for this raw delivery.
 * Matching both coordinates prevents a delayed predecessor or stale revision
 * from bypassing ComponentBase's ordering decision. Adoption always reads the
 * accepted cache value, never the independently delivered raw graph.
 *
 * @param {import('./SelectionService.js').default} service
 * @param {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot} delivered
 */
function acceptedCoordinatorState(service, delivered) {
  const accepted = service.cache.dataState;
  if (
    !accepted ||
    accepted.authorityEpoch !== delivered.authorityEpoch ||
    accepted.revision !== delivered.revision
  ) {
    return null;
  }
  return accepted;
}

/**
 * Adopt a complete DataCoordinator authority snapshot into SelectionService's
 * business cache. This is used by both late-join replies and the loading-to-ready
 * live transition, keeping selection persistence seeded from the full profile.
 *
 * @param {import('./SelectionService.js').default} service
 * @param {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot} state
 */
export function adoptCoordinatorSelectionState(service, state) {
  const accepted = acceptedCoordinatorState(service, state);
  if (!accepted) return;

  service._selectionAuthorityEpoch = accepted.authorityEpoch;
  service._selectionAuthorityReady = accepted.ready;
  if (!accepted.ready) return;

  const profile = accepted.currentProfileData
    ? structuredClone(accepted.currentProfileData)
    : null;

  if (!profile) {
    service.cache.currentProfile = null;
    service.selectionEnvironment =
      accepted.currentEnvironment || service.selectionEnvironment || "space";
    service.cache.currentEnvironment = service.selectionEnvironment;
    service.replaceCachedSelections(null);
    service.cache.selectedKey = null;
    service.cache.selectedAlias = null;
    service.broadcastState();
    return;
  }

  service.cache.currentProfile = accepted.currentProfile || profile.id || null;
  service.selectionEnvironment =
    accepted.currentEnvironment ||
    profile.environment ||
    profile.currentEnvironment ||
    "space";
  service.cache.currentEnvironment = service.selectionEnvironment;
  service.updateCacheFromProfile(profile);
  service.replaceCachedSelections(profile);

  const cachedSelection =
    service.getCachedSelection(service.selectionEnvironment) ?? null;
  applyActiveSelection(
    service.cache,
    service.selectionEnvironment,
    cachedSelection,
  );
  service.broadcastState();
}

/**
 * @param {import('./SelectionService.js').default} service
 * @param {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot} state
 */
export function shouldAdoptLiveCoordinatorState(service, state) {
  const accepted = acceptedCoordinatorState(service, state);
  return (
    accepted?.ready === true &&
    (accepted.authorityEpoch !== service._selectionAuthorityEpoch ||
      !service._selectionAuthorityReady)
  );
}
