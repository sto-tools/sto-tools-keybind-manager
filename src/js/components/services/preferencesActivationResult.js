const successFields = ["success", "changed", "revision", "effects"];
const failureFields = ["success", "error", "params", "retryable"];
const failureParameterFields = ["reason"];

/**
 * Read an exact plain data record without invoking accessors. All reflection is
 * guarded so hostile proxy replies are classified as malformed instead of
 * escaping into restore/reset orchestration.
 * @param {unknown} value
 * @param {readonly string[]} fields
 * @returns {Record<string, unknown> | null}
 */
function materializeExactDataRecord(value, fields) {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== fields.length ||
      keys.some((key) => typeof key !== "string" || !fields.includes(key))
    ) {
      return null;
    }

    /** @type {Record<string, unknown>} */
    const result = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor?.enumerable || !("value" in descriptor)) return null;
      result[field] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Strictly validate and detach an untrusted Preferences activation reply.
 * Returns null for malformed success and failure envelopes.
 * @param {unknown} value
 * @returns {import('../../types/rpc/parameters-preferences.js').PreferencesActivationResult | null}
 */
export function materializePreferencesActivationResult(value) {
  const success = materializeExactDataRecord(value, successFields);
  if (
    success?.success === true &&
    typeof success.changed === "boolean" &&
    Number.isSafeInteger(success.revision) &&
    /** @type {number} */ (success.revision) >= 1 &&
    (success.effects === "applied" || success.effects === "degraded")
  ) {
    return Object.freeze({
      success: true,
      changed: success.changed,
      revision: /** @type {number} */ (success.revision),
      effects: success.effects,
    });
  }

  const failure = materializeExactDataRecord(value, failureFields);
  const params = materializeExactDataRecord(
    failure?.params,
    failureParameterFields,
  );
  if (
    failure?.success === false &&
    (failure.error === "preferences_activation_failed" ||
      failure.error === "operation_cancelled") &&
    failure.retryable === true &&
    typeof params?.reason === "string"
  ) {
    return Object.freeze({
      success: false,
      error: failure.error,
      params: Object.freeze({ reason: params.reason }),
      retryable: true,
    });
  }

  return null;
}

/**
 * Classify an untrusted activation reply while retaining the strict detached
 * materialization for valid envelopes.
 * @param {unknown} value
 * @returns {
 *   | { kind: 'success', result: import('../../types/rpc/parameters-preferences.js').PreferencesActivationSuccess }
 *   | { kind: 'failure', result: import('../../types/rpc/parameters-preferences.js').PreferencesActivationFailure }
 *   | { kind: 'malformed' }
 * }
 */
export function classifyPreferencesActivationResult(value) {
  const result = materializePreferencesActivationResult(value);
  if (!result) return Object.freeze({ kind: "malformed" });
  return result.success
    ? Object.freeze({ kind: "success", result })
    : Object.freeze({ kind: "failure", result });
}
