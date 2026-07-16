import { applyActiveSelection } from "./selectionState.js";

/**
 * Reconcile a failed newest intent to the last successful cached selection.
 *
 * @param {import('./SelectionService.js').default} service
 * @param {string} environment
 */
export function reconcileFailedSelection(service, environment) {
  if (service.destroyed || environment !== service.selectionEnvironment) return;
  const selection = service.cachedSelections[environment] ?? null;
  publishActiveSelection(service, environment, selection);
}

/**
 * Publish a complete snapshot and compatibility event when active state moves.
 *
 * @param {import('./SelectionService.js').default} service
 * @param {string} environment
 * @param {string | null} selection
 * @returns {boolean}
 */
export function publishActiveSelection(service, environment, selection) {
  if (!applyActiveSelection(service.cache, environment, selection))
    return false;

  service.broadcastState();
  if (environment === "alias") {
    service.emit("alias-selected", {
      name: selection,
      source: "SelectionService",
    });
    return true;
  }
  service.emit("key-selected", {
    key: selection,
    environment,
    bindset: null,
    source: "SelectionService",
  });
  return true;
}
