import { isKnownPreferenceKey } from "./preferenceKeys.js";
import {
  assertSafeDataKey,
  cloneJsonData,
  invalidProjectData,
  isDataRecord,
  MAX_PROJECT_JSON_BYTES,
  setOwnDataField,
} from "./jsonDataBoundary.js";

/** @typedef {import('../../types/data-contracts.js').KnownPreferenceKey} KnownPreferenceKey */
/** @typedef {import('../../types/data-contracts.js').KnownPreferencesSettings} KnownPreferencesSettings */
/** @typedef {import('../../types/data-contracts.js').SettingsData} SettingsData */

/**
 * @typedef {object} StoredSettingsPatchResult
 * @property {SettingsData} value
 * @property {boolean} repaired
 */

/**
 * A failed decode still carries detached defaults so storage callers can keep
 * their established lazy-repair behavior: reads recover in memory and the
 * next ordinary settings save repairs the persisted value.
 * @typedef {object} StoredSettingsJsonDecodeResult
 * @property {KnownPreferencesSettings & Record<string, unknown>} value
 * @property {boolean} repaired
 * @property {"invalid_json" | "invalid_data"} [error]
 */

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

/** @param {string} content */
function storedSettingsByteLength(content) {
  return new TextEncoder().encode(content).byteLength;
}

/** @param {unknown} error */
function isInvalidProjectDataError(error) {
  return error instanceof TypeError && error.message === "invalid_project_file";
}

/** @param {string} key @param {string} path */
function hasSafeStoredDataKey(key, path) {
  try {
    assertSafeDataKey(key, path);
    return true;
  } catch (error) {
    if (isInvalidProjectDataError(error)) return false;
    throw error;
  }
}

/**
 * Clone one persisted field without allowing invalid extension data to reject
 * the other recoverable settings. Starting at depth one accounts for the
 * settings record itself at depth zero.
 * @param {unknown} value
 * @param {string} path
 * @returns {{ success: true, value: import('../../types/data-contracts.js').JsonValue } | { success: false }}
 */
function tryCloneStoredSetting(value, path) {
  try {
    return { success: true, value: cloneJsonData(value, path, 1) };
  } catch (error) {
    if (isInvalidProjectDataError(error)) return { success: false };
    throw error;
  }
}

/**
 * Forgiving persistence-boundary sanitizer. Valid present fields are deeply
 * detached; invalid fields are omitted independently so one extension cannot
 * prevent recovery of the rest of the record. Missing fields remain missing,
 * which lets embedded root settings retain their established partial shape.
 *
 * `repaired` means at least one supplied value could not safely be retained.
 * A merely partial settings record does not need repair.
 *
 * @param {unknown} value
 * @param {string} [path]
 * @returns {StoredSettingsPatchResult}
 */
export function sanitizeStoredSettingsPatch(value, path = "settings") {
  /** @type {Record<string, unknown>} */
  const settings = {};
  if (!isDataRecord(value)) {
    return { value: /** @type {SettingsData} */ (settings), repaired: true };
  }

  let repaired = false;
  for (const [key, settingValue] of Object.entries(value)) {
    if (!hasSafeStoredDataKey(key, `${path}.${key}`)) {
      repaired = true;
      continue;
    }

    if (
      isKnownSettingKey(key) &&
      !hasValidKnownSettingValue(key, settingValue)
    ) {
      repaired = true;
      continue;
    }

    if (Object.hasOwn(compatibilitySettingValidators, key)) {
      const validator =
        compatibilitySettingValidators[
          /** @type {keyof typeof compatibilitySettingValidators} */ (key)
        ];
      if (!validator(settingValue)) {
        repaired = true;
        continue;
      }
      if (key === "currentProfile" && typeof settingValue === "string") {
        if (!hasSafeStoredDataKey(settingValue, `${path}.${key}`)) {
          repaired = true;
          continue;
        }
      }
    }

    const cloned = tryCloneStoredSetting(settingValue, `${path}.${key}`);
    if (!cloned.success) {
      repaired = true;
      continue;
    }
    setOwnDataField(settings, key, cloned.value);
  }

  return { value: /** @type {SettingsData} */ (settings), repaired };
}

/**
 * Overlay a sanitized persisted patch onto detached caller defaults.
 * @param {unknown} value
 * @param {KnownPreferencesSettings} defaults
 */
function recoverStoredSettings(value, defaults) {
  const defaultPatch = sanitizeStoredSettingsPatch(defaults, "defaults");
  const storedPatch = sanitizeStoredSettingsPatch(value);
  /** @type {Record<string, unknown>} */
  const settings = {};

  for (const [key, settingValue] of Object.entries(defaultPatch.value)) {
    setOwnDataField(settings, key, settingValue);
  }
  for (const [key, settingValue] of Object.entries(storedPatch.value)) {
    setOwnDataField(settings, key, settingValue);
  }

  return {
    value: /** @type {KnownPreferencesSettings & Record<string, unknown>} */ (
      settings
    ),
    repaired: storedPatch.repaired,
  };
}

/**
 * Forgiving storage recovery: deeply detach JSON-safe extensions and replace
 * invalid or missing known values with defaults. This intentionally differs
 * from strict project import, which rejects invalid fields.
 * @param {unknown} value
 * @param {KnownPreferencesSettings} defaults
 * @returns {KnownPreferencesSettings & Record<string, unknown>}
 */
export function sanitizeStoredSettings(value, defaults) {
  return recoverStoredSettings(value, defaults).value;
}

/**
 * Decode the raw standalone localStorage settings value without mutating
 * storage. Every result includes a usable, deeply detached settings snapshot;
 * callers can inspect `repaired`/`error` while preserving lazy on-disk repair.
 *
 * @param {unknown} content
 * @param {KnownPreferencesSettings} defaults
 * @returns {StoredSettingsJsonDecodeResult}
 */
export function decodeStoredSettingsJson(content, defaults) {
  if (typeof content !== "string") {
    return {
      ...recoverStoredSettings(undefined, defaults),
      repaired: true,
      error: "invalid_data",
    };
  }
  if (
    content.length > MAX_PROJECT_JSON_BYTES ||
    storedSettingsByteLength(content) > MAX_PROJECT_JSON_BYTES
  ) {
    return {
      ...recoverStoredSettings(undefined, defaults),
      repaired: true,
      error: "invalid_data",
    };
  }

  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      ...recoverStoredSettings(undefined, defaults),
      repaired: true,
      error: "invalid_json",
    };
  }

  const recovered = recoverStoredSettings(parsed, defaults);
  if (!isDataRecord(parsed)) {
    return { ...recovered, repaired: true, error: "invalid_data" };
  }
  return recovered;
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
