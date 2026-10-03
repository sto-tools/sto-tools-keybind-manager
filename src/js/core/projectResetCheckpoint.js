/** @typedef {import('../types/storage-contracts.js').ProjectResetCheckpoint} ProjectResetCheckpoint */
/** @typedef {import('../types/storage-contracts.js').ProjectResetResult} ProjectResetResult */
/** @typedef {ProjectResetResult['rootRemoval']} Step */
/** @typedef {{values: (string | null)[] | null, steps: Step[]}} CheckpointState */
/** @type {WeakMap<object, CheckpointState>} */
const states = new WeakMap();

/** Private identity only; no caller-supplied receipt or storage data is accepted. */
export function createProjectResetCheckpoint() {
  const token = Object.freeze({});
  states.set(token, {
    values: null,
    steps: [0, 1, 2].map(() => ({ status: "not_attempted" })),
  });
  return /** @type {ProjectResetCheckpoint} */ (token);
}

/** @param {ProjectResetCheckpoint | undefined} token */
export function projectResetCheckpointState(token) {
  if (token === undefined) return null;
  const state = states.get(token);
  if (!state) throw new TypeError("invalid_reset_checkpoint");
  return state;
}
