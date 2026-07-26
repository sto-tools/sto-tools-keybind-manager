import { createPreferencesStateSnapshot } from "./preferencesState.js";

/** @typedef {import('../../types/events/base.js').PreferencesSettings} PreferencesSettings */

/**
 * Fully validate, normalize, detach, and freeze the next canonical snapshot
 * before a durable write can succeed.
 * @param {PreferencesSettings} settings
 * @param {number} authorityEpoch
 * @param {number} currentRevision
 */
export function preparePreferencesTransition(
  settings,
  authorityEpoch,
  currentRevision,
) {
  const state = createPreferencesStateSnapshot(settings, {
    authorityEpoch,
    ready: true,
    revision: currentRevision + 1,
  });
  return { settings: structuredClone(state.settings), state };
}

/**
 * Invoke the compatibility receipts in order while preserving the already
 * started saved-listener settlement if synchronous re-entry replaces the
 * owner. The public action can then reject only after that settlement finishes.
 *
 * @param {import('./PreferencesService.js').default} owner
 * @param {number} generation
 * @param {PreferencesSettings} settings
 * @param {import('../../types/events/preferences.js').PreferencesChangedPayload | null} changed
 * @param {string | null} language
 */
export function publishPreferencesTransitionReceipts(
  owner,
  generation,
  settings,
  changed,
  language,
) {
  const settlement = owner.publishSavedSettings(settings);
  /** @type {unknown} */
  let completionError;
  try {
    owner._assertCurrentLifecycle(generation);
    if (changed) {
      owner.emit("preferences:changed", changed);
      owner._assertCurrentLifecycle(generation);
    }
    if (language !== null) {
      owner.emit("language:changed", { language });
      owner._assertCurrentLifecycle(generation);
    }
  } catch (error) {
    completionError = error;
  }
  return { ok: true, settlement, completionError };
}

/**
 * Let the serialized mutation queue advance once its publications have been
 * invoked, while keeping the public action pending until saved listeners
 * settle.
 * @param {Promise<{ok: boolean, settlement: PromiseLike<unknown> | null, completionError?: unknown}>} publication
 * @param {() => void} assertCurrent
 */
export async function settlePreferencesMutation(publication, assertCurrent) {
  const { ok, settlement, completionError } = await publication;
  await settlement;
  if (completionError) throw completionError;
  assertCurrent();
  return ok;
}
