/** @typedef {import('../../types/events/base.js').ExtensionPreferenceKey} ExtensionPreferenceKey */
/** @typedef {import('../../types/events/base.js').KnownPreferenceKey} KnownPreferenceKey */

const knownPreferenceKeys = new Set([
  "theme",
  "autoSave",
  "showTooltips",
  "confirmDeletes",
  "maxUndoSteps",
  "defaultMode",
  "compactView",
  "language",
  "syncFolderName",
  "syncFolderPath",
  "autoSync",
  "autoSyncInterval",
  "bindToAliasMode",
  "bindsetsEnabled",
  "translateGeneratedMessages",
]);

/**
 * @param {string} key
 * @returns {key is KnownPreferenceKey}
 */
export function isKnownPreferenceKey(key) {
  return knownPreferenceKeys.has(key);
}

/**
 * Mark a runtime-validated application-defined setting key for the explicit
 * extension mutation path. Known settings must always use their typed path.
 *
 * @param {string} key
 * @returns {ExtensionPreferenceKey}
 */
export function extensionPreferenceKey(key) {
  if (!key || isKnownPreferenceKey(key)) {
    throw new TypeError(
      key
        ? `Known preference "${key}" cannot use the extension mutation path`
        : "Extension preference keys must be non-empty strings",
    );
  }
  return /** @type {ExtensionPreferenceKey} */ (key);
}
