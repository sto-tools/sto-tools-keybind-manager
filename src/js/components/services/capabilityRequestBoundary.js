/**
 * Capture a capability-bearing RPC envelope without evaluating caller getters.
 * The live browser capability is deliberately not cloned; its domain decoder
 * validates it before any owner state or artifact is captured.
 * @param {unknown} value
 * @param {string} field
 * @returns {unknown}
 */
export function requireCapabilityRequest(value, field) {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError();
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError();
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const descriptor = descriptors[field];
    if (
      keys.length !== 1 ||
      keys[0] !== field ||
      !descriptor?.enumerable ||
      !("value" in descriptor)
    ) {
      throw new TypeError();
    }
    return descriptor.value;
  } catch {
    throw new TypeError("invalid_mutation_request");
  }
}
