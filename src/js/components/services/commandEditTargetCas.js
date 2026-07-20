/** @typedef {import('./serviceTypes.js').StoredCommand} StoredCommand */
/** @typedef {import('../../types/events/commands.js').CommandEditTarget} CommandEditTarget */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Compare canonical JSON-like command data without depending on object
 * identity or property insertion order.
 *
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
export function commandDataEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => commandDataEqual(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        commandDataEqual(left[key], right[key]),
    )
  );
}

/**
 * Compare one captured editor target with the accepted command location at
 * mutation execution time.
 *
 * @param {CommandEditTarget} target
 * @param {{
 *   authorityEpoch: unknown,
 *   revision: unknown,
 *   profileId: string,
 *   environment: string,
 *   name: string,
 *   bindset: string | null,
 *   index: number,
 *   originalEntry: StoredCommand | undefined
 * }} current
 * @returns {boolean}
 */
export function commandEditTargetMatches(target, current) {
  return Boolean(
    isRecord(target) &&
      Object.prototype.hasOwnProperty.call(target, "originalEntry") &&
      typeof target.authorityEpoch === "number" &&
      Number.isSafeInteger(target.authorityEpoch) &&
      typeof target.revision === "number" &&
      Number.isSafeInteger(target.revision) &&
      typeof target.index === "number" &&
      Number.isSafeInteger(target.index) &&
      target.authorityEpoch === current.authorityEpoch &&
      target.revision === current.revision &&
      target.profileId === current.profileId &&
      target.environment === current.environment &&
      target.name === current.name &&
      target.bindset === current.bindset &&
      target.index === current.index &&
      commandDataEqual(target.originalEntry, current.originalEntry),
  );
}
