/** @typedef {import('./serviceTypes.js').ProfileData} SelectionProfile */

/**
 * Preserve every durable string/null slot without admitting invalid values.
 *
 * @param {SelectionProfile | null | undefined} profile
 * @returns {Record<string, string | null>}
 */
export function selectionRecordFromProfile(profile) {
  /** @type {Record<string, string | null>} */
  const result = {};
  for (const [environment, selection] of Object.entries(
    profile?.selections || {},
  )) {
    if (typeof selection === "string" || selection === null) {
      result[environment] = selection;
    }
  }
  return result;
}

/**
 * @param {Readonly<Record<string, string | null>>} left
 * @param {Readonly<Record<string, string | null>>} right
 */
export function selectionRecordsEqual(left, right) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (environment) =>
        Object.prototype.hasOwnProperty.call(right, environment) &&
        left[environment] === right[environment],
    )
  );
}

/** @param {SelectionProfile | null} profile */
export function selectionCacheFromProfile(profile) {
  const selections = profile?.selections;
  return {
    ...selectionRecordFromProfile(profile),
    space: typeof selections?.space === "string" ? selections.space : null,
    ground: typeof selections?.ground === "string" ? selections.ground : null,
    alias: typeof selections?.alias === "string" ? selections.alias : null,
  };
}

/**
 * Apply the mutually exclusive active key/alias projection.
 *
 * @param {{ selectedKey?: string | null, selectedAlias?: string | null }} cache
 * @param {string} environment
 * @param {string | null} selection
 * @returns {boolean} whether the active projection changed
 */
export function applyActiveSelection(cache, environment, selection) {
  const selectedKey = environment === "alias" ? null : selection;
  const selectedAlias = environment === "alias" ? selection : null;
  const changed =
    cache.selectedKey !== selectedKey || cache.selectedAlias !== selectedAlias;
  cache.selectedKey = selectedKey;
  cache.selectedAlias = selectedAlias;
  return changed;
}
