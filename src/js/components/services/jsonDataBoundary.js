const dangerousKeys = new Set(["__proto__", "prototype", "constructor"]);

export const MAX_PROJECT_JSON_BYTES = 16 * 1024 * 1024;
export const MAX_PROJECT_JSON_DEPTH = 100;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function isDataRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** @param {object} value @param {PropertyKey} key */
export function hasOwnDataField(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Define dynamic data without consulting inherited setters.
 * @template Value
 * @param {Record<string, Value>} target
 * @param {string} key
 * @param {Value} value
 */
export function setOwnDataField(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

/** @param {string} path @returns {never} */
export function invalidProjectData(path) {
  const error = new TypeError("invalid_project_file");
  Object.defineProperty(error, "cause", {
    value: { path },
    enumerable: false,
  });
  throw error;
}

/** @param {unknown} error */
export function getInvalidDataPath(error) {
  if (!(error instanceof Error) || !isDataRecord(error.cause)) return undefined;
  return typeof error.cause.path === "string" ? error.cause.path : undefined;
}

/** @param {string} key @param {string} path */
export function assertSafeDataKey(key, path) {
  if (dangerousKeys.has(key)) invalidProjectData(path);
}

/**
 * Validate and detach an arbitrary JSON-compatible extension value.
 * @param {unknown} value
 * @param {string} path
 * @param {number} [depth]
 * @returns {import('../../types/data-contracts.js').JsonValue}
 */
export function cloneJsonData(value, path, depth = 0) {
  if (depth > MAX_PROJECT_JSON_DEPTH) invalidProjectData(path);
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalidProjectData(path);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      cloneJsonData(item, `${path}[${index}]`, depth + 1),
    );
  }
  if (!isDataRecord(value)) invalidProjectData(path);

  /** @type {import('../../types/data-contracts.js').JsonObject} */
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    assertSafeDataKey(key, `${path}.${key}`);
    setOwnDataField(
      result,
      key,
      cloneJsonData(item, `${path}.${key}`, depth + 1),
    );
  }
  return result;
}
