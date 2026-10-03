import { createDataStateChangedPayload } from "./dataStateChange.js";
import { createVirtualProfile } from "./dataState.js";
import { recordDataCoordinatorPublication } from "./dataCoordinatorMutationQueue.js";

/**
 * Publish one authoritative snapshot and retain the event-bus settlement
 * promise for response boundaries that must acknowledge async consumers.
 *
 * @param {import('./DataCoordinator.js').default} coordinator
 * @param {import('../../types/events/data.js').DataStateChangeReason} reason
 * @param {{ profileId?: string }} [details]
 * @returns {{
 *   state: import('../../types/events/component-state.js').DataCoordinatorStateSnapshot | null,
 *   settled: import('../../types/events/protocol.js').EventEmitResult
 * }}
 */
export function publishDataCoordinatorState(coordinator, reason, details = {}) {
  if (!coordinator._stateReady || coordinator.destroyed) {
    return { state: null, settled: Promise.resolve() };
  }

  coordinator._stateRevision += 1;
  coordinator._currentStateSnapshot = null;
  const state = coordinator.getCurrentState();
  const settled = coordinator.emit(
    "data:state-changed",
    createDataStateChangedPayload(reason, state, details),
    { synchronous: true },
  );
  recordDataCoordinatorPublication(coordinator, settled);
  return { state, settled };
}

/**
 * Publish the current profile compatibility projection when one exists.
 * Callers retain responsibility for lifecycle checks between ordered emits.
 *
 * @param {import('./DataCoordinator.js').default} coordinator
 * @param {{ cloneProfile?: boolean, fromProfile?: string | null }} [options]
 * @returns {import('../../types/events/protocol.js').EventEmitResult | null}
 */
export function publishCurrentCoordinatorProfile(
  coordinator,
  { cloneProfile = false, fromProfile = null } = {},
) {
  const profileId = coordinator.state.currentProfile;
  if (!profileId || !coordinator.state.profiles[profileId]) return null;

  const virtualProfile = createVirtualProfile(
    profileId,
    coordinator.state.profiles[profileId],
    coordinator.state.currentEnvironment,
  );
  const settled = coordinator.emit(
    "profile:switched",
    {
      fromProfile,
      toProfile: profileId,
      profileId,
      profile: cloneProfile ? structuredClone(virtualProfile) : virtualProfile,
      environment: coordinator.state.currentEnvironment,
      timestamp: Date.now(),
    },
    { synchronous: true },
  );
  recordDataCoordinatorPublication(coordinator, settled);
  return settled;
}

/**
 * Invoke the complete reload publication sequence in compatibility order and
 * return one settlement promise for the RPC boundary.
 *
 * @param {import('./DataCoordinator.js').default} coordinator
 * @param {number} operation
 * @returns {Promise<unknown[]>}
 */
export function publishReloadedCoordinatorState(coordinator, operation) {
  const publications = [
    publishDataCoordinatorState(coordinator, "state-reloaded").settled,
  ];
  coordinator._assertCurrentOperation(operation);

  console.log(
    `[${coordinator.componentName}] State reloaded. Current profile: ${coordinator.state.currentProfile}, Environment: ${coordinator.state.currentEnvironment}`,
  );

  if (
    coordinator.state.currentProfile &&
    coordinator.state.profiles[coordinator.state.currentProfile]
  ) {
    const profilePublication = publishCurrentCoordinatorProfile(coordinator, {
      cloneProfile: true,
    });
    if (profilePublication) publications.push(profilePublication);
    coordinator._assertCurrentOperation(operation);
  }

  const environmentPublication = coordinator.emit(
    "environment:changed",
    {
      fromEnvironment: null,
      toEnvironment: coordinator.state.currentEnvironment,
      environment: coordinator.state.currentEnvironment,
      timestamp: Date.now(),
    },
    { synchronous: true },
  );
  publications.push(environmentPublication);
  recordDataCoordinatorPublication(coordinator, environmentPublication);

  return Promise.all(publications);
}
