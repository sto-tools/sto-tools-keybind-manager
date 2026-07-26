/** @typedef {import('../../types/events/component-state.js').PreferencesStateSnapshot} PreferencesStateSnapshot */
/** @typedef {import('../../types/events/base.js').PreferencesSettings} PreferencesSettings */

import {
  hasCompleteKnownSettings,
  isDataRecord,
  sanitizeStoredSettingsPatch,
} from "./settingsDataBoundary.js";

/** @type {WeakSet<object>} */
const trustedSnapshots = new WeakSet();

let latestAuthorityEpoch = 0;

/** @returns {number} */
export function nextPreferencesStateAuthorityEpoch() {
  latestAuthorityEpoch += 1;
  return latestAuthorityEpoch;
}

/** @param {number} authorityEpoch */
export function isCurrentPreferencesStateAuthority(authorityEpoch) {
  return authorityEpoch === latestAuthorityEpoch;
}

/**
 * @template Value
 * @param {Value} value
 * @param {WeakSet<object>} [seen]
 * @returns {Value}
 */
function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return value;
  const object = /** @type {object} */ (value);
  if (seen.has(object)) return value;
  seen.add(object);
  for (const key of Reflect.ownKeys(object)) {
    deepFreeze(Reflect.get(object, key), seen);
  }
  return Object.freeze(value);
}

/**
 * Refuse accessors, cycles, symbols, and non-plain objects before the settings
 * sanitizer enumerates the graph. This makes malformed external snapshots
 * inert without executing producer-owned getters.
 * @param {unknown} value
 * @param {WeakSet<object>} [seen]
 * @param {number} [depth]
 */
function hasOnlyJsonDataProperties(value, seen = new WeakSet(), depth = 0) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (typeof value !== "object" || depth > 100 || seen.has(value)) return false;
  const object = /** @type {object} */ (value);
  const prototype = Object.getPrototypeOf(object);
  if (
    !Array.isArray(object) &&
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    return false;
  }
  seen.add(object);
  const descriptors = Object.getOwnPropertyDescriptors(object);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") return false;
    if (Array.isArray(object) && key === "length") continue;
    const descriptor = descriptors[key];
    if (!("value" in descriptor)) return false;
    if (!hasOnlyJsonDataProperties(descriptor.value, seen, depth + 1)) {
      return false;
    }
  }
  return true;
}

/** @param {Record<string, unknown>} record @param {string} key */
function ownDataValue(record, key) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && "value" in descriptor
    ? { present: true, value: descriptor.value }
    : { present: false, value: undefined };
}

/**
 * Decode without trusting getters, proxies, cycles, or non-JSON extension
 * values. Consumers treat every malformed publication as inert.
 * @param {unknown} value
 * @returns {PreferencesStateSnapshot | null}
 */
function decodePreferencesStateSnapshot(value) {
  try {
    if (!isDataRecord(value)) return null;
    const snapshotKeys = Reflect.ownKeys(
      Object.getOwnPropertyDescriptors(value),
    );
    if (
      snapshotKeys.length !== 4 ||
      !snapshotKeys.every(
        (key) =>
          key === "authorityEpoch" ||
          key === "ready" ||
          key === "revision" ||
          key === "settings",
      )
    ) {
      return null;
    }
    const epochField = ownDataValue(value, "authorityEpoch");
    const readyField = ownDataValue(value, "ready");
    const revisionField = ownDataValue(value, "revision");
    const settingsField = ownDataValue(value, "settings");
    if (
      !epochField.present ||
      !readyField.present ||
      !revisionField.present ||
      !settingsField.present
    ) {
      return null;
    }
    const authorityEpoch = epochField.value;
    const ready = readyField.value;
    const revision = revisionField.value;
    const settings = settingsField.value;
    if (
      !Number.isSafeInteger(authorityEpoch) ||
      Number(authorityEpoch) < 1 ||
      typeof ready !== "boolean" ||
      !Number.isSafeInteger(revision) ||
      Number(revision) < 0 ||
      (ready ? Number(revision) < 1 : Number(revision) !== 0) ||
      !isDataRecord(settings) ||
      !hasOnlyJsonDataProperties(settings)
    ) {
      return null;
    }
    const decoded = sanitizeStoredSettingsPatch(
      settings,
      "preferencesState.settings",
    );
    if (decoded.repaired || !hasCompleteKnownSettings(decoded.value)) {
      return null;
    }
    return /** @type {PreferencesStateSnapshot} */ ({
      authorityEpoch,
      ready,
      revision,
      settings: decoded.value,
    });
  } catch {
    return null;
  }
}

/** @param {unknown} value @returns {value is PreferencesStateSnapshot} */
export function isPreferencesStateSnapshot(value) {
  return decodePreferencesStateSnapshot(value) !== null;
}

/**
 * @param {PreferencesSettings} settings
 * @param {{ authorityEpoch: number, ready: boolean, revision: number }} status
 * @returns {PreferencesStateSnapshot}
 */
export function createPreferencesStateSnapshot(
  settings,
  { authorityEpoch, ready, revision },
) {
  const snapshot = decodePreferencesStateSnapshot({
    authorityEpoch,
    ready,
    revision,
    settings,
  });
  if (!snapshot) {
    throw new TypeError("Invalid preferences state snapshot");
  }
  deepFreeze(snapshot);
  trustedSnapshots.add(snapshot);
  return snapshot;
}

/**
 * Adopt a detached immutable snapshot only when it succeeds the current owner
 * epoch and revision. A replacement owner may restart at revision zero; once
 * seen, that epoch makes every delayed predecessor publication inert.
 *
 * @param {unknown} candidate
 * @param {PreferencesStateSnapshot | null | undefined} current
 * @returns {PreferencesStateSnapshot | null}
 */
export function adoptPreferencesStateSnapshot(candidate, current) {
  const decoded = trustedSnapshots.has(/** @type {object} */ (candidate))
    ? /** @type {PreferencesStateSnapshot} */ (candidate)
    : decodePreferencesStateSnapshot(candidate);
  if (!decoded) return null;
  if (
    current &&
    (decoded.authorityEpoch < current.authorityEpoch ||
      (decoded.authorityEpoch === current.authorityEpoch &&
        decoded.revision <= current.revision))
  ) {
    return null;
  }

  if (trustedSnapshots.has(/** @type {object} */ (candidate))) return decoded;
  return createPreferencesStateSnapshot(decoded.settings, {
    authorityEpoch: decoded.authorityEpoch,
    ready: decoded.ready,
    revision: decoded.revision,
  });
}
