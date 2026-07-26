import {
  hasValidKnownSettingValue,
  isDataRecord,
  isKnownSettingKey,
  isSettingsRecord,
} from "./settingsDataBoundary.js";
import { MAX_PROJECT_JSON_DEPTH, setOwnDataField } from "./jsonDataBoundary.js";

/** @typedef {import('../../types/events/base.js').PreferenceMutation} PreferenceMutation */
/** @typedef {import('../../types/events/base.js').PreferencesSettings} PreferencesSettings */
/** @typedef {import('../../types/events/base.js').SettingsRecord} SettingsRecord */
/** @typedef {import('../../types/rpc/parameters-preferences.js').SyncFolderSettingsMutation} SyncFolderSettingsMutation */
/** @typedef {import('../../types/rpc/parameters-preferences.js').PreferencesActivationSource} PreferencesActivationSource */

const unsafeDataKeys = new Set(["__proto__", "prototype", "constructor"]);
const preferenceMutationFields = new Set(["key", "value", "extension"]);
const syncFolderMutationFields = new Set([
  "syncFolderName",
  "syncFolderPath",
  "syncFolderFallback",
  "autoSync",
]);
const invalidData = Symbol("invalid-preferences-mutation-data");

/**
 * @typedef {{
 *   ancestors: WeakSet<object>,
 *   clones: WeakMap<object, import('../../types/data-contracts.js').JsonValue[] | import('../../types/data-contracts.js').JsonObject>
 * }} JsonMaterializationContext
 */

/**
 * Capture an ordinary record's descriptors once. Reading the returned
 * descriptor map cannot invoke producer-owned getters, and all proxy
 * reflection failures remain confined to the public materializers.
 *
 * @param {unknown} value
 * @returns {{
 *   object: object,
 *   descriptors: Record<PropertyKey, PropertyDescriptor>,
 *   keys: PropertyKey[]
 * } | null}
 */
function capturePlainRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return {
    object: value,
    descriptors,
    keys: Reflect.ownKeys(descriptors),
  };
}

/**
 * @param {Record<PropertyKey, PropertyDescriptor>} descriptors
 * @param {PropertyKey} key
 * @returns {{ present: true, value: unknown } | { present: false, value: undefined }}
 */
function ownEnumerableDataValue(descriptors, key) {
  const descriptor = descriptors[key];
  return descriptor?.enumerable === true && "value" in descriptor
    ? { present: true, value: descriptor.value }
    : { present: false, value: undefined };
}

/** @param {PropertyKey} key @returns {key is string} */
function isSafeEnumerableDataKey(key) {
  return typeof key === "string" && !unsafeDataKeys.has(key);
}

/**
 * Strictly detach JSON data from already-captured descriptor values. Objects
 * and arrays are reflected once per identity, accessors and exotic prototypes
 * are rejected, and shared acyclic values retain one detached clone.
 *
 * @param {unknown} value
 * @param {JsonMaterializationContext} context
 * @param {number} depth
 * @returns {import('../../types/data-contracts.js').JsonValue | typeof invalidData}
 */
function materializeJsonData(value, context, depth) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : invalidData;
  }
  if (typeof value !== "object" || depth > MAX_PROJECT_JSON_DEPTH) {
    return invalidData;
  }

  const object = /** @type {object} */ (value);
  if (context.ancestors.has(object)) return invalidData;
  const existing = context.clones.get(object);
  if (existing) return existing;

  context.ancestors.add(object);
  try {
    const array = Array.isArray(object);
    const prototype = Object.getPrototypeOf(object);
    if (
      (array && prototype !== Array.prototype) ||
      (!array && prototype !== Object.prototype && prototype !== null)
    ) {
      return invalidData;
    }

    const descriptors = Object.getOwnPropertyDescriptors(object);
    const keys = Reflect.ownKeys(descriptors);
    if (array) {
      const lengthDescriptor = descriptors.length;
      if (
        !lengthDescriptor ||
        !("value" in lengthDescriptor) ||
        lengthDescriptor.enumerable ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0 ||
        keys.length !== lengthDescriptor.value + 1
      ) {
        return invalidData;
      }

      const clone = [];
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const field = ownEnumerableDataValue(descriptors, String(index));
        if (!field.present) return invalidData;
        const item = materializeJsonData(field.value, context, depth + 1);
        if (item === invalidData) return invalidData;
        clone.push(item);
      }
      if (
        keys.some(
          (key) =>
            key !== "length" &&
            (typeof key !== "string" ||
              !/^(0|[1-9]\d*)$/.test(key) ||
              Number(key) >= lengthDescriptor.value),
        )
      ) {
        return invalidData;
      }
      context.clones.set(object, clone);
      return clone;
    }

    /** @type {import('../../types/data-contracts.js').JsonObject} */
    const clone = {};
    for (const key of keys) {
      if (!isSafeEnumerableDataKey(key)) return invalidData;
      const field = ownEnumerableDataValue(descriptors, key);
      if (!field.present) return invalidData;
      const item = materializeJsonData(field.value, context, depth + 1);
      if (item === invalidData) return invalidData;
      setOwnDataField(clone, key, item);
    }
    context.clones.set(object, clone);
    return clone;
  } finally {
    context.ancestors.delete(object);
  }
}

/**
 * @param {object} root
 * @returns {JsonMaterializationContext}
 */
function createJsonMaterializationContext(root) {
  return {
    ancestors: new WeakSet([root]),
    clones: new WeakMap(),
  };
}

/** @param {unknown} value @returns {value is PreferencesActivationSource} */
export function isPreferencesActivationSource(value) {
  return value === "project-restore" || value === "application-reset";
}

/**
 * Decode the public action envelope without invoking producer-owned accessors.
 * @param {unknown} value
 * @returns {{ source: PreferencesActivationSource } | null}
 */
export function materializePreferencesActivationRequest(value) {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 1 || keys[0] !== "source") return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, "source");
    if (
      !descriptor?.enumerable ||
      !("value" in descriptor) ||
      !isPreferencesActivationSource(descriptor.value)
    ) {
      return null;
    }
    return Object.freeze({ source: descriptor.value });
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 * @returns {{ mutation: PreferenceMutation | null, key: string | null }}
 */
function decodePreferenceMutation(value) {
  /** @type {string | null} */
  let key = null;
  try {
    const captured = capturePlainRecord(value);
    if (!captured) return { mutation: null, key };
    const { descriptors, keys, object } = captured;
    const keyField = ownEnumerableDataValue(descriptors, "key");
    if (keyField.present && typeof keyField.value === "string") {
      key = keyField.value;
    }
    if (
      keys.length < 2 ||
      keys.length > 3 ||
      keys.some(
        (field) =>
          typeof field !== "string" || !preferenceMutationFields.has(field),
      )
    ) {
      return { mutation: null, key };
    }

    const valueField = ownEnumerableDataValue(descriptors, "value");
    const extensionField = ownEnumerableDataValue(descriptors, "extension");
    if (!keyField.present || !valueField.present || typeof key !== "string") {
      return { mutation: null, key };
    }

    const detachedValue = materializeJsonData(
      valueField.value,
      createJsonMaterializationContext(object),
      1,
    );
    if (detachedValue === invalidData) return { mutation: null, key };

    if (isKnownSettingKey(key)) {
      if (
        (extensionField.present && extensionField.value !== false) ||
        !hasValidKnownSettingValue(key, detachedValue)
      ) {
        return { mutation: null, key };
      }
      return {
        mutation: /** @type {PreferenceMutation} */ (
          Object.freeze(
            extensionField.present
              ? { key, value: detachedValue, extension: false }
              : { key, value: detachedValue },
          )
        ),
        key,
      };
    }

    if (
      !key ||
      unsafeDataKeys.has(key) ||
      !extensionField.present ||
      extensionField.value !== true
    ) {
      return { mutation: null, key };
    }
    return {
      mutation: Object.freeze({
        key: /** @type {import('../../types/events/base.js').ExtensionPreferenceKey} */ (
          key
        ),
        value: detachedValue,
        extension: true,
      }),
      key,
    };
  } catch {
    return { mutation: null, key };
  }
}

/**
 * Strictly validate and detach the exact single-setting RPC envelope.
 * @param {unknown} value
 * @returns {PreferenceMutation | null}
 */
export function materializePreferenceMutation(value) {
  return decodePreferenceMutation(value).mutation;
}

/**
 * Strict materialization variant used by the responder so a rejected known
 * key retains its established diagnostic without reflecting the payload twice.
 * @param {unknown} value
 * @returns {PreferenceMutation}
 */
export function requirePreferenceMutation(value) {
  const decoded = decodePreferenceMutation(value);
  if (decoded.mutation) return decoded.mutation;
  throw invalidMutationError(
    decoded.key === null ? null : { key: decoded.key },
  );
}

/**
 * Strictly validate and detach a bulk settings patch. String fields outside
 * the known settings vocabulary remain intentional extension settings.
 *
 * @param {unknown} value
 * @returns {SettingsRecord | null}
 */
export function materializePreferenceSettingsMutation(value) {
  try {
    const captured = capturePlainRecord(value);
    if (!captured) return null;
    const { descriptors, keys, object } = captured;
    const context = createJsonMaterializationContext(object);
    /** @type {Record<string, unknown>} */
    const settings = {};
    for (const key of keys) {
      if (!isSafeEnumerableDataKey(key)) return null;
      const field = ownEnumerableDataValue(descriptors, key);
      if (!field.present) return null;
      const settingValue = materializeJsonData(field.value, context, 1);
      if (settingValue === invalidData) return null;
      setOwnDataField(settings, key, settingValue);
    }
    return isSettingsRecord(settings)
      ? /** @type {SettingsRecord} */ (settings)
      : null;
  } catch {
    return null;
  }
}

/**
 * Strictly validate and detach the exact sync-folder settings RPC envelope.
 * @param {unknown} value
 * @returns {SyncFolderSettingsMutation | null}
 */
export function materializeSyncFolderSettingsMutation(value) {
  try {
    const captured = capturePlainRecord(value);
    if (!captured) return null;
    const { descriptors, keys } = captured;
    if (
      keys.length !== syncFolderMutationFields.size ||
      keys.some(
        (key) => typeof key !== "string" || !syncFolderMutationFields.has(key),
      )
    ) {
      return null;
    }
    const syncFolderName = ownEnumerableDataValue(
      descriptors,
      "syncFolderName",
    );
    const syncFolderPath = ownEnumerableDataValue(
      descriptors,
      "syncFolderPath",
    );
    const syncFolderFallback = ownEnumerableDataValue(
      descriptors,
      "syncFolderFallback",
    );
    const autoSync = ownEnumerableDataValue(descriptors, "autoSync");
    if (
      !syncFolderName.present ||
      !syncFolderPath.present ||
      !syncFolderFallback.present ||
      !autoSync.present ||
      typeof syncFolderName.value !== "string" ||
      typeof syncFolderPath.value !== "string" ||
      syncFolderFallback.value !== false ||
      typeof autoSync.value !== "boolean"
    ) {
      return null;
    }
    return Object.freeze({
      syncFolderName: syncFolderName.value,
      syncFolderPath: syncFolderPath.value,
      syncFolderFallback: false,
      autoSync: autoSync.value,
    });
  } catch {
    return null;
  }
}

/** @param {unknown} value */
export function invalidMutationError(value) {
  const key =
    isDataRecord(value) && typeof value.key === "string" ? value.key : "";
  return new TypeError(
    key
      ? `Invalid value or mutation path for preference "${key}"`
      : "Invalid preference mutation payload",
  );
}

/**
 * Compare sanitized JSON data structurally. Record key order is irrelevant;
 * array order remains part of the persisted value.
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
function isStructurallyEqualPreferenceValue(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) =>
        isStructurallyEqualPreferenceValue(value, right[index]),
      )
    );
  }
  if (!isDataRecord(left) || !isDataRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        isStructurallyEqualPreferenceValue(left[key], right[key]),
    )
  );
}

/**
 * @param {PreferencesSettings} previous
 * @param {PreferencesSettings} next
 * @returns {SettingsRecord}
 */
export function collectPreferenceChanges(previous, next) {
  /** @type {Record<string, unknown>} */
  const changes = {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    const existed = Object.prototype.hasOwnProperty.call(previous, key);
    const exists = Object.prototype.hasOwnProperty.call(next, key);
    if (
      existed !== exists ||
      !isStructurallyEqualPreferenceValue(previous[key], next[key])
    ) {
      changes[key] = next[key];
    }
  }
  return changes;
}
