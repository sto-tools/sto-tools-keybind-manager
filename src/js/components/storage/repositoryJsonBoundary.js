import {
  assertSafeDataKey,
  MAX_PROJECT_JSON_BYTES,
  MAX_PROJECT_JSON_DEPTH,
} from "../services/jsonDataBoundary.js";

/**
 * Serialize only own JSON data, without invoking accessors or toJSON hooks.
 * The incremental byte budget also bounds repeated references in shared DAGs.
 * @param {unknown} input
 * @returns {{success: true, json: string, value: import('../../types/data-contracts.js').JsonValue} | {success: false, error: import('../../types/storage-contracts.js').RepositoryInputError}}
 */
export function serializeRepositoryData(input) {
  const invalid = new TypeError("invalid_repository_data");
  const ancestors = new WeakSet();
  const encoder = new TextEncoder();
  /** @type {string[]} */
  const chunks = [];
  let bytes = 0;

  /** @param {string} chunk */
  function append(chunk) {
    if (chunk.length > MAX_PROJECT_JSON_BYTES - bytes) throw invalid;
    bytes += encoder.encode(chunk).byteLength;
    if (bytes > MAX_PROJECT_JSON_BYTES) throw invalid;
    chunks.push(chunk);
  }

  /** @param {string} value */
  function quoted(value) {
    if (value.length > MAX_PROJECT_JSON_BYTES - bytes) throw invalid;
    append(JSON.stringify(value));
  }

  /** @param {object} value @param {string} key */
  function ownValue(value, key) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw invalid;
    return descriptor.value;
  }

  /** @param {unknown} value @param {number} depth */
  function visit(value, depth) {
    if (depth > MAX_PROJECT_JSON_DEPTH) throw invalid;
    if (typeof value === "string") return quoted(value);
    if (value === null || typeof value === "boolean") {
      append(String(value));
      return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      append(String(value));
      return;
    }
    if (typeof value !== "object" || value === null || ancestors.has(value)) {
      throw invalid;
    }
    ancestors.add(value);
    const prototype = Object.getPrototypeOf(value);
    const keys = Reflect.ownKeys(value);
    if (Array.isArray(value)) {
      const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
      if (
        prototype !== Array.prototype ||
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > MAX_PROJECT_JSON_BYTES / 2 ||
        keys.length !== length + 1
      ) {
        throw invalid;
      }
      append("[");
      for (let index = 0; index < length; index++) {
        if (index > 0) append(",");
        visit(ownValue(value, String(index)), depth + 1);
      }
      append("]");
    } else {
      if (prototype !== Object.prototype && prototype !== null) throw invalid;
      append("{");
      for (const [index, key] of keys.entries()) {
        if (typeof key !== "string") throw invalid;
        assertSafeDataKey(key, key);
        const child = ownValue(value, key);
        if (index > 0) append(",");
        quoted(key);
        append(":");
        visit(child, depth + 1);
      }
      append("}");
    }
    ancestors.delete(value);
  }

  try {
    visit(input, 0);
  } catch {
    return { success: false, error: "invalid_data" };
  }
  try {
    const json = chunks.join("");
    return { success: true, json, value: JSON.parse(json) };
  } catch {
    return { success: false, error: "serialization_failed" };
  }
}
