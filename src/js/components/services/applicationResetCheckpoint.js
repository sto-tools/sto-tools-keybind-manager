import { createProjectResetCheckpoint } from "../../core/projectResetCheckpoint.js";

/** @typedef {import('../../types/storage-contracts.js').ApplicationResetCheckpoint} ApplicationResetCheckpoint */
/** @typedef {{authorityEpoch: number, revision: number, generation: number}} Guard */
/** @typedef {Guard & {adopted: boolean, published: boolean}} DataCheckpoint */
/** @typedef {Guard & {receipt: import('../../types/storage-contracts.js').ApplicationPreferencesResetReceipt, defaultsJson: string, priorJson: string | null | undefined, adopted: boolean, result: import('../../types/storage-contracts.js').ApplicationPreferencesResetResult | null, settlement: Promise<void> | null}} PreferencesCheckpoint */
/** @typedef {{active: boolean, project: import('../../types/storage-contracts.js').ProjectResetCheckpoint, data: DataCheckpoint | null, preferences: PreferencesCheckpoint | null, receipt: import('../../types/rpc/application.js').ApplicationResetReceipt | null}} Saga */
/** @type {WeakMap<object, Saga>} */
const states = new WeakMap();

export function createApplicationResetCheckpoint() {
  const token = Object.freeze({});
  states.set(token, {
    active: true,
    project: createProjectResetCheckpoint(),
    data: null,
    preferences: null,
    receipt: null,
  });
  return /** @type {ApplicationResetCheckpoint} */ (token);
}

/** @param {ApplicationResetCheckpoint | undefined} token */
export function applicationResetCheckpointState(token) {
  if (token === undefined) return null;
  const state = states.get(token);
  if (!state) throw new TypeError("invalid_reset_checkpoint");
  return state;
}
