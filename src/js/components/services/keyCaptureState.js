/**
 * @typedef {Readonly<{
 *   authorityEpoch: number,
 *   revision: number,
 *   isCapturing: boolean,
 *   context: string,
 *   locationSpecific: boolean,
 *   pressedCodes: readonly string[],
 *   currentChord: string,
 *   capturedChord: string | null
 * }>} KeyCaptureState
 */

/**
 * @typedef {{
 *   isCapturing?: boolean,
 *   context?: string,
 *   locationSpecific?: boolean,
 *   pressedCodes?: readonly string[],
 *   currentChord?: string,
 *   capturedChord?: string | null
 * }} KeyCaptureStateOptions
 */

const STATE_FIELDS = Object.freeze([
  "isCapturing",
  "context",
  "locationSpecific",
  "pressedCodes",
  "currentChord",
  "capturedChord",
]);
const STATE_FIELD_SET = new Set(STATE_FIELDS);

let latestAuthorityEpoch = 0;

/** @returns {number} */
export function nextKeyCaptureAuthorityEpoch() {
  latestAuthorityEpoch += 1;
  return latestAuthorityEpoch;
}

/** @param {unknown} value @returns {value is Record<PropertyKey, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is string[]} */
function isUniqueNonEmptyStrings(value) {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry.length > 0) &&
    new Set(value).size === value.length
  );
}

/** @param {unknown} value @returns {value is KeyCaptureState} */
function isValidKeyCaptureState(value) {
  if (!isRecord(value)) return false;

  return (
    Number.isSafeInteger(value.authorityEpoch) &&
    Number(value.authorityEpoch) > 0 &&
    Number.isSafeInteger(value.revision) &&
    Number(value.revision) >= 0 &&
    typeof value.isCapturing === "boolean" &&
    typeof value.context === "string" &&
    value.context.length > 0 &&
    typeof value.locationSpecific === "boolean" &&
    isUniqueNonEmptyStrings(value.pressedCodes) &&
    typeof value.currentChord === "string" &&
    (typeof value.capturedChord === "string" || value.capturedChord === null)
  );
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {asserts value is KeyCaptureState}
 */
function assertValidKeyCaptureState(value, label) {
  if (!isValidKeyCaptureState(value)) {
    throw new TypeError(`${label} must be a complete valid key-capture state`);
  }
}

/**
 * Materialize a detached, immutable snapshot. No caller-owned array or object
 * is retained by the state boundary.
 *
 * @param {KeyCaptureState} state
 * @returns {KeyCaptureState}
 */
function materializeKeyCaptureState(state) {
  const pressedCodes = Object.freeze([...state.pressedCodes]);
  return Object.freeze({
    authorityEpoch: state.authorityEpoch,
    revision: state.revision,
    isCapturing: state.isCapturing,
    context: state.context,
    locationSpecific: state.locationSpecific,
    pressedCodes,
    currentChord: state.currentChord,
    capturedChord: state.capturedChord,
  });
}

/**
 * @param {unknown} value
 * @param {ReadonlySet<string>} allowed
 * @param {string} label
 * @param {boolean} allowEmpty
 */
function assertKnownOwnFields(value, allowed, label, allowEmpty) {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object`);
  }

  const keys = Reflect.ownKeys(value);
  if (!allowEmpty && keys.length === 0) {
    throw new TypeError(`${label} must contain an explicit state field`);
  }
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
    throw new TypeError(`${label} contains an unknown state field`);
  }
}

/**
 * Create a complete initial owner state from an explicit identity and optional
 * capture values.
 *
 * @param {{ authorityEpoch: number, revision?: number }} identity
 * @param {KeyCaptureStateOptions} [options]
 * @returns {KeyCaptureState}
 */
export function createKeyCaptureState(identity, options = {}) {
  if (!isRecord(identity)) {
    throw new TypeError("Key-capture identity must be an object");
  }
  assertKnownOwnFields(options, STATE_FIELD_SET, "Key-capture options", true);

  const state = {
    authorityEpoch: identity.authorityEpoch,
    revision: Object.hasOwn(identity, "revision") ? identity.revision : 0,
    isCapturing: Object.hasOwn(options, "isCapturing")
      ? options.isCapturing
      : false,
    context: Object.hasOwn(options, "context")
      ? options.context
      : "keySelectionModal",
    locationSpecific: Object.hasOwn(options, "locationSpecific")
      ? options.locationSpecific
      : false,
    pressedCodes: Object.hasOwn(options, "pressedCodes")
      ? options.pressedCodes
      : [],
    currentChord: Object.hasOwn(options, "currentChord")
      ? options.currentChord
      : "",
    capturedChord: Object.hasOwn(options, "capturedChord")
      ? options.capturedChord
      : null,
  };

  assertValidKeyCaptureState(state, "Key-capture initial state");
  return materializeKeyCaptureState(state);
}

/**
 * @param {KeyCaptureState} state
 * @returns {KeyCaptureState}
 */
export function cloneKeyCaptureState(state) {
  assertValidKeyCaptureState(state, "Key-capture state");
  return materializeKeyCaptureState(state);
}

/**
 * Apply one explicit owner transition. Identity fields cannot be patched and
 * every transition advances the revision exactly once.
 *
 * @param {KeyCaptureState} state
 * @param {KeyCaptureStateOptions} patch
 * @returns {KeyCaptureState}
 */
export function advanceKeyCaptureState(state, patch) {
  assertValidKeyCaptureState(state, "Key-capture predecessor state");
  assertKnownOwnFields(patch, STATE_FIELD_SET, "Key-capture patch", false);
  if (state.revision === Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Key-capture state revision cannot advance safely");
  }

  const next = {
    authorityEpoch: state.authorityEpoch,
    revision: state.revision + 1,
    isCapturing: Object.hasOwn(patch, "isCapturing")
      ? patch.isCapturing
      : state.isCapturing,
    context: Object.hasOwn(patch, "context") ? patch.context : state.context,
    locationSpecific: Object.hasOwn(patch, "locationSpecific")
      ? patch.locationSpecific
      : state.locationSpecific,
    pressedCodes: Object.hasOwn(patch, "pressedCodes")
      ? patch.pressedCodes
      : state.pressedCodes,
    currentChord: Object.hasOwn(patch, "currentChord")
      ? patch.currentChord
      : state.currentChord,
    capturedChord: Object.hasOwn(patch, "capturedChord")
      ? patch.capturedChord
      : state.capturedChord,
  };

  assertValidKeyCaptureState(next, "Key-capture next state");
  return materializeKeyCaptureState(next);
}

/**
 * Adopt a detached valid snapshot only when it starts a newer owner at
 * revision zero or advances the current owner strictly forward. With no
 * predecessor, any valid late-join snapshot is accepted.
 *
 * @param {unknown} candidate
 * @param {KeyCaptureState | null | undefined} current
 * @returns {KeyCaptureState | null}
 */
export function adoptKeyCaptureState(candidate, current) {
  if (!isValidKeyCaptureState(candidate)) return null;
  if (current != null && !isValidKeyCaptureState(current)) return null;

  if (current) {
    const sameAuthority = candidate.authorityEpoch === current.authorityEpoch;
    const advancesCurrent =
      sameAuthority && candidate.revision > current.revision;
    const startsNewAuthority =
      candidate.authorityEpoch > current.authorityEpoch &&
      candidate.revision === 0;

    if (!advancesCurrent && !startsNewAuthority) return null;
  }

  return materializeKeyCaptureState(candidate);
}
