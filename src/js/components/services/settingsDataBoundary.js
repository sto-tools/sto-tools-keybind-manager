import { isKnownPreferenceKey } from "./preferenceKeys.js";
import {
  assertSafeDataKey,
  cloneJsonData,
  invalidProjectData,
  isDataRecord,
} from "./jsonDataBoundary.js";

/** @typedef {import('../../types/data-contracts.js').KnownPreferenceKey} KnownPreferenceKey */
/** @typedef {import('../../types/data-contracts.js').KnownPreferencesSettings} KnownPreferencesSettings */
/** @typedef {import('../../types/data-contracts.js').SettingsData} SettingsData */

/** @type {Record<KnownPreferenceKey, (value: unknown) => boolean>} */
const knownSettingValidators = {
  theme: (value) => typeof value === "string",
  autoSave: (value) => typeof value === "boolean",
  showTooltips: (value) => typeof value === "boolean",
  confirmDeletes: (value) => typeof value === "boolean",
  maxUndoSteps: (value) => typeof value === "number",
  defaultMode: (value) => typeof value === "string",
  compactView: (value) => typeof value === "boolean",
  language: (value) => typeof value === "string",
  syncFolderName: (value) => value === null || typeof value === "string",
  syncFolderPath: (value) => value === null || typeof value === "string",
  autoSync: (value) => typeof value === "boolean",
  autoSyncInterval: (value) => typeof value === "string",
  bindToAliasMode: (value) => typeof value === "boolean",
  bindsetsEnabled: (value) => typeof value === "boolean",
  translateGeneratedMessages: (value) => typeof value === "boolean",
};

/** @type {Record<string, (value: unknown) => boolean>} */
const compatibilitySettingValidators = {
  syncFolderFallback: (value) => typeof value === "boolean",
  currentProfile: (value) => value === null || typeof value === "string",
  version: (value) => typeof value === "string",
  firstRun: (value) => typeof value === "boolean",
};

/** @param {string} key @returns {key is KnownPreferenceKey} */
export function isKnownSettingKey(key) {
  return isKnownPreferenceKey(key);
}

/** @param {KnownPreferenceKey} key @param {unknown} value */
export function hasValidKnownSettingValue(key, value) {
  return knownSettingValidators[key](value);
}

/** @param {unknown} value @returns {value is SettingsData} */
export function isSettingsRecord(value) {
  if (!isDataRecord(value)) return false;
  return Object.entries(value).every(
    ([key, settingValue]) =>
      !isKnownSettingKey(key) || hasValidKnownSettingValue(key, settingValue),
  );
}

/**
 * Forgiving storage recovery: keep extensions and replace invalid or missing
 * known values with defaults. This intentionally differs from strict import.
 * @param {unknown} value
 * @param {KnownPreferencesSettings} defaults
 * @returns {KnownPreferencesSettings & Record<string, unknown>}
 */
export function sanitizeStoredSettings(value, defaults) {
  /** @type {Record<string, unknown>} */
  const settings = { ...defaults };
  if (!isDataRecord(value)) {
    return /** @type {KnownPreferencesSettings & Record<string, unknown>} */ (
      settings
    );
  }

  for (const [key, settingValue] of Object.entries(value)) {
    if (
      !isKnownSettingKey(key) ||
      hasValidKnownSettingValue(key, settingValue)
    ) {
      Object.defineProperty(settings, key, {
        value: settingValue,
        configurable: true,
        enumerable: true,
        writable: true,
      });
    }
  }
  return /** @type {KnownPreferencesSettings & Record<string, unknown>} */ (
    settings
  );
}

/**
 * Strict project-import settings decoder. Missing known fields remain missing
 * because project restore overlays the destination settings record.
 * @param {unknown} value
 * @param {string} [path]
 * @returns {SettingsData}
 */
export function decodeProjectSettings(value, path = "data.settings") {
  if (!isDataRecord(value)) invalidProjectData(path);
  const cloned = cloneJsonData(value, path);
  if (!isDataRecord(cloned)) invalidProjectData(path);

  for (const [key, settingValue] of Object.entries(cloned)) {
    if (isKnownSettingKey(key)) {
      if (!hasValidKnownSettingValue(key, settingValue)) {
        invalidProjectData(`${path}.${key}`);
      }
      continue;
    }
    if (
      Object.hasOwn(compatibilitySettingValidators, key) &&
      !compatibilitySettingValidators[
        /** @type {keyof typeof compatibilitySettingValidators} */ (key)
      ](settingValue)
    ) {
      invalidProjectData(`${path}.${key}`);
    }
    if (key === "currentProfile" && typeof settingValue === "string") {
      assertSafeDataKey(settingValue, `${path}.${key}`);
    }
  }
  return /** @type {SettingsData} */ (cloned);
}

export { isDataRecord };
