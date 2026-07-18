const unsafeDataKeys = new Set(["__proto__", "prototype", "constructor"]);
const maxDataDepth = 100;

class InvalidActivityData extends TypeError {
  /** @param {string} path */
  constructor(path) {
    super("invalid_kbf_activity");
    this.path = path;
  }
}

/** @param {string} path @returns {never} */
const invalid = (path) => {
  throw new InvalidActivityData(path);
};

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isDataRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** @param {Record<string, any>} target @param {string} key @param {any} value */
function setOwnDataField(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {number} [depth]
 * @returns {import('../../types/data-contracts.js').JsonValue}
 */
function cloneData(value, path, depth = 0) {
  if (depth > maxDataDepth) invalid(path);
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid(path);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      cloneData(item, `${path}[${index}]`, depth + 1),
    );
  }
  if (!isDataRecord(value)) invalid(path);
  /** @type {import('../../types/data-contracts.js').JsonObject} */
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (unsafeDataKeys.has(key)) invalid(`${path}.${key}`);
    setOwnDataField(result, key, cloneData(item, `${path}.${key}`, depth + 1));
  }
  return result;
}

/** @param {unknown} value @param {string} path @param {{ min?: number, max?: number }} [range] */
function decodeSafeInteger(value, path, range = {}) {
  if (!Number.isSafeInteger(value)) invalid(path);
  const integer = /** @type {number} */ (value);
  if (range.min !== undefined && integer < range.min) invalid(path);
  if (range.max !== undefined && integer > range.max) invalid(path);
  return integer;
}

/** @param {unknown} error @param {string} fallbackPath @returns {import('../../types/kbf-boundary.js').KBFActivityFailure} */
function activityFailure(error, fallbackPath) {
  if (!(error instanceof InvalidActivityData)) throw error;
  return {
    success: false,
    error: "invalid_kbf_activity",
    params: { path: error.path || fallbackPath },
  };
}

/** @param {unknown} value @param {string} path @param {{ min?: number, max?: number }} [range] @returns {import('../../types/kbf-boundary.js').KBFActivityIntegerResult} */
function activityIntegerResult(value, path, range = {}) {
  try {
    return { success: true, value: decodeSafeInteger(value, path, range) };
  } catch (error) {
    return activityFailure(error, path);
  }
}

/** @param {unknown} value @param {string} [path] @returns {import('../../types/kbf-boundary.js').KBFActivityIntegerResult} */
export const decodeKBFActivityInteger = (value, path = "$") =>
  activityIntegerResult(value, path);

/** @param {unknown} value @param {string} [path] @returns {import('../../types/kbf-boundary.js').KBFActivityIntegerResult} */
export const decodeKBFActivityOrder = (value, path = "$.order") =>
  activityIntegerResult(value, path, { min: 0 });

/** @param {Record<string, unknown>} value @param {'n1' | 'n2' | 'n3'} field @param {string} path */
function decodeActivityNumberOrZero(value, field, path) {
  const fieldValue = value[field];
  if (fieldValue === null || fieldValue === undefined) return 0;
  return decodeSafeInteger(fieldValue, `${path}.${field}`);
}

/** @param {unknown} value @param {string} [path] @returns {import('../../types/kbf-boundary.js').KBFActivity95RangeResult} */
export function decodeKBFActivity95Range(value, path = "$") {
  try {
    if (!isDataRecord(value)) invalid(path);
    const tray = decodeActivityNumberOrZero(value, "n1", path);
    if (tray < 0) invalid(`${path}.n1`);
    const fromSlot = decodeActivityNumberOrZero(value, "n2", path);
    const toSlot = decodeActivityNumberOrZero(value, "n3", path);
    if (fromSlot < 0 || fromSlot > 9) invalid(`${path}.n2`);
    if (toSlot < 0 || toSlot > 9 || fromSlot > toSlot) {
      invalid(`${path}.n3`);
    }
    const outputCount = toSlot - fromSlot + 1;
    if (outputCount > 10) invalid(`${path}.n3`);
    return { success: true, value: { tray, fromSlot, toSlot, outputCount } };
  } catch (error) {
    return activityFailure(error, path);
  }
}

/** @param {unknown} activityData @param {string} [path] @returns {import('../../types/kbf-boundary.js').KBFActivitySemanticResult} */
export function validateKBFActivitySemantics(activityData, path = "$") {
  try {
    if (!isDataRecord(activityData)) invalid(path);
    const value = cloneData(activityData, path);
    if (!isDataRecord(value)) invalid(path);
    const activity = decodeSafeInteger(value.activity, `${path}.activity`, {
      min: 0,
      max: 123,
    });
    const order = decodeSafeInteger(value.order ?? 0, `${path}.order`, {
      min: 0,
    });
    value.activity = activity;
    value.order = order;
    for (const field of ["n1", "n2", "n3"]) {
      if (value[field] !== null && value[field] !== undefined) {
        value[field] = decodeSafeInteger(value[field], `${path}.${field}`);
      }
    }
    for (const field of ["text", "text2"]) {
      if (
        value[field] !== null &&
        value[field] !== undefined &&
        typeof value[field] !== "string"
      ) {
        invalid(`${path}.${field}`);
      }
    }
    if (activity === 95) {
      const range = decodeKBFActivity95Range(value, path);
      if (!range.success) invalid(range.params.path);
      value.n1 = range.value.tray;
      value.n2 = range.value.fromSlot;
      value.n3 = range.value.toSlot;
    }
    return {
      success: true,
      value:
        /** @type {import('../../types/kbf-boundary.js').KBFActivityData} */ (
          /** @type {unknown} */ (value)
        ),
    };
  } catch (error) {
    return activityFailure(error, path);
  }
}
