import {
  selectionRecordFromProfile,
  selectionRecordsEqual,
} from "./selectionState.js";

/**
 * @param {import('./SelectionService.js').default} service
 * @param {string} environment
 * @param {string | null | undefined} selection
 */
function selectionExists(service, environment, selection) {
  if (!selection) return true;
  return environment === "alias"
    ? service.validateAliasExists(selection)
    : service.validateKeyExists(selection, environment);
}

/**
 * Distinguish an authoritative selection/profile change from unrelated profile
 * edits so a valid in-flight user intent is not canceled by rename or command
 * updates carrying the same persisted selections.
 *
 * @param {import('./SelectionService.js').default} service
 * @param {import('./serviceTypes.js').ProfileData | null | undefined} profile
 */
export function profileUpdateChangesSelectionAuthority(service, profile) {
  if (!profile || !service.cache.currentProfile) return true;
  const confirmed = service.selectionPersistence.snapshot(
    service.cache.currentProfile,
  );
  if (!selectionRecordsEqual(confirmed, selectionRecordFromProfile(profile))) {
    return true;
  }

  const environment = service.selectionEnvironment;
  if (
    !selectionExists(
      service,
      environment,
      service.cachedSelections[environment],
    )
  ) {
    return true;
  }
  return service.selectionIntents.some(
    (intent) => !selectionExists(service, intent.environment, intent.selection),
  );
}
