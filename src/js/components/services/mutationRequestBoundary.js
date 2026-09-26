import { materializePreferenceDataRecord } from "./preferencesMutationBoundary.js";
import { hasBoundedPreferencesJson } from "./preferencesJsonBudget.js";
import { isDataRecord, setOwnDataField } from "./jsonDataBoundary.js";
import { decodeProfileData } from "./profileDataBoundary.js";

/** @typedef {import('../../types/data-contracts.js').JsonValue} JsonValue */

/**
 * Reuse the descriptor-only JSON materializer through an opaque envelope. No
 * caller field is interpreted as a preference key. The returned value, not the
 * wrapper, is checked against the common project depth/expanded-byte budget.
 * @param {unknown} value
 * @returns {JsonValue}
 */
export function materializeMutationValue(value) {
  const envelope = materializePreferenceDataRecord({ payload: value });
  const detached = /** @type {JsonValue | undefined} */ (envelope?.payload);
  if (detached === undefined || !hasBoundedPreferencesJson(detached)) {
    throw new TypeError("invalid_mutation_request");
  }
  return detached;
}

/**
 * Materialize an exact own-data envelope before any lifecycle/owner read.
 * Explicit undefined is treated as omission only on these declared outer
 * fields; undefined nested JSON values, getters, symbols, hidden fields,
 * exotic prototypes, cycles, and oversized expanded DAGs are rejected.
 * Required-field and topic-specific value checks follow on this detached data.
 * @param {unknown} value
 * @param {readonly string[]} fields
 * @returns {Record<string, JsonValue | undefined>}
 */
export function materializeMutationRequest(value, fields) {
  try {
    if (!isDataRecord(value)) throw new TypeError();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    /** @type {Record<string, unknown>} */
    const captured = {};
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") throw new TypeError();
      const descriptor = descriptors[key];
      if (
        !fields.includes(key) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        throw new TypeError();
      }
      if (descriptor.value !== undefined) {
        setOwnDataField(captured, key, descriptor.value);
      }
    }
    const result = materializeMutationValue(captured);
    if (!isDataRecord(result)) throw new TypeError();
    return result;
  } catch {
    throw new TypeError("invalid_mutation_request");
  }
}

/**
 * @overload
 * @param {unknown} value
 * @param {{optional?: false, nullable?: false, allowEmpty?: boolean}} [options]
 * @returns {string}
 */
/**
 * @overload
 * @param {unknown} value
 * @param {{optional: true, nullable?: false, allowEmpty?: boolean}} options
 * @returns {string | undefined}
 */
/**
 * @overload
 * @param {unknown} value
 * @param {{optional?: false, nullable: true, allowEmpty?: boolean}} options
 * @returns {string | null}
 */
/**
 * @overload
 * @param {unknown} value
 * @param {{optional?: boolean, nullable?: boolean, allowEmpty?: boolean}} options
 * @returns {string | null | undefined}
 */
/**
 * @param {unknown} value
 * @param {{optional?: boolean, nullable?: boolean, allowEmpty?: boolean}} [options]
 * @returns {string | null | undefined}
 */
export function requireMutationString(
  value,
  { optional = false, nullable = false, allowEmpty = false } = {},
) {
  if (optional && value === undefined) return undefined;
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.length === 0) ||
    !hasBoundedPreferencesJson(value)
  ) {
    throw new TypeError("invalid_mutation_request");
  }
  return value;
}

/** @param {unknown} value @param {{allowEmpty?: boolean}} [options] @returns {string} */
export function requireMutationIdentifier(value, options) {
  const identifier = requireMutationString(value, options);
  if (["__proto__", "prototype", "constructor"].includes(identifier)) {
    throw new TypeError("unsafe_profile_operation_key");
  }
  return identifier;
}

/** @param {unknown} value @returns {boolean} */
export function requireMutationBoolean(value) {
  if (typeof value !== "boolean")
    throw new TypeError("invalid_mutation_request");
  return value;
}

/** @param {unknown} value @returns {number} */
export function requireMutationIndex(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("invalid_mutation_request");
  }
  return value;
}

/** Validate known rich-command fields while preserving JSON-safe extensions.
 * @param {unknown} value
 * @returns {import('./serviceTypes.js').StoredCommand}
 */
export function requireMutationCommand(value) {
  const command = materializeMutationValue(value);
  if (typeof command !== "string" && !isDataRecord(command)) {
    throw new TypeError("invalid_mutation_request");
  }
  decodeProfileData(
    {
      name: "command-validation",
      builds: { space: { keys: { validation: [command] } } },
    },
    "validation",
  );
  return command;
}

/** @param {unknown} value @returns {import('../../types/rpc/data.js').ProfileMutationPrecondition} */
export function materializeProfilePrecondition(value) {
  const detached = materializeMutationRequest(value, [
    "authorityEpoch",
    "revision",
  ]);
  for (const key of ["authorityEpoch", "revision"]) {
    if (
      typeof detached[key] !== "number" ||
      !Number.isSafeInteger(detached[key]) ||
      detached[key] < 0
    ) {
      throw new TypeError("invalid_mutation_precondition");
    }
  }
  return /** @type {import('../../types/rpc/data.js').ProfileMutationPrecondition} */ (
    detached
  );
}

/** Validate acknowledgement data without adopting it as a second state source.
 * @param {unknown} value
 * @returns {import('../../types/rpc/base.js').ProfileUpdateResult}
 */
export function requireProfileUpdateResult(value) {
  const detached = materializeMutationRequest(value, ["success", "profile"]);
  if (detached.success !== true || !isDataRecord(detached.profile)) {
    throw new TypeError("invalid_profile_update_result");
  }
  decodeProfileData(detached.profile, "acknowledged-profile");
  return /** @type {import('../../types/rpc/base.js').ProfileUpdateResult} */ (
    detached
  );
}
