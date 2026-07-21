import { hasOwnDataField, isDataRecord } from "./jsonDataBoundary.js";

const missing = Symbol("missing-data-field");

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isSafeDataRecord(value) {
  try {
    return isDataRecord(value);
  } catch {
    return false;
  }
}

/** @param {object} record @param {PropertyKey} key */
function ownDataValue(record, key) {
  try {
    if (!hasOwnDataField(record, key)) return missing;
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && "value" in descriptor ? descriptor.value : missing;
  } catch {
    return missing;
  }
}

/** @param {unknown} value */
function isCurrentProfile(value) {
  return value === null || typeof value === "string";
}

/** @param {unknown} value */
function materializeImportedSummary(value) {
  if (!isSafeDataRecord(value)) return null;
  const profiles = ownDataValue(value, "profiles");
  const settings = ownDataValue(value, "settings");
  if (
    !Number.isInteger(profiles) ||
    /** @type {number} */ (profiles) < 0 ||
    typeof settings !== "boolean"
  ) {
    return null;
  }
  return { profiles: /** @type {number} */ (profiles), settings };
}

/** @param {unknown} value */
function materializeDenseStringArray(value) {
  try {
    if (!Array.isArray(value)) return null;
  } catch {
    return null;
  }
  const length = ownDataValue(value, "length");
  if (!Number.isSafeInteger(length) || /** @type {number} */ (length) < 0) {
    return null;
  }
  /** @type {string[]} */
  const result = [];
  for (let index = 0; index < /** @type {number} */ (length); index += 1) {
    const item = ownDataValue(value, index);
    if (typeof item !== "string") return null;
    result.push(item);
  }
  return result;
}

/** @param {unknown} value */
function materializeStorageWriteFailure(value) {
  const partial = isSafeDataRecord(value)
    ? ownDataValue(value, "partial")
    : missing;
  if (
    !isSafeDataRecord(value) ||
    ownDataValue(value, "success") !== false ||
    ownDataValue(value, "error") !== "storage_write_failed" ||
    typeof partial !== "boolean"
  ) {
    return null;
  }
  const params = ownDataValue(value, "params");
  const committed = ownDataValue(value, "committed");
  if (!isSafeDataRecord(params) || !isSafeDataRecord(committed)) return null;
  const operation = ownDataValue(params, "operation");
  if (
    operation !== "settings" &&
    operation !== "project" &&
    !(
      operation === "profile" &&
      typeof ownDataValue(params, "profileId") === "string"
    )
  ) {
    return null;
  }
  const profiles = materializeDenseStringArray(
    ownDataValue(committed, "profiles"),
  );
  const settings = ownDataValue(committed, "settings");
  const project = ownDataValue(committed, "project");
  if (
    !profiles ||
    typeof settings !== "boolean" ||
    typeof project !== "boolean"
  ) {
    return null;
  }
  const hasCommittedWrites = profiles.length > 0 || settings || project;
  return {
    partial,
    hasCommittedWrites,
    consistent: partial === hasCommittedWrites,
  };
}

/** @param {unknown} value */
function isStorageWriteFailure(value) {
  const receipt = materializeStorageWriteFailure(value);
  return receipt !== null && receipt.consistent;
}

/**
 * @param {unknown} value
 * @returns {{ currentProfile: string | null, imported: { profiles: number, settings: boolean } } | null}
 */
export function materializeProjectImportSuccess(value) {
  if (
    !isSafeDataRecord(value) ||
    ownDataValue(value, "success") !== true ||
    typeof ownDataValue(value, "message") !== "string"
  ) {
    return null;
  }
  const imported = materializeImportedSummary(ownDataValue(value, "imported"));
  const currentProfile = ownDataValue(value, "currentProfile");
  if (!imported || !isCurrentProfile(currentProfile)) return null;
  return { currentProfile, imported };
}

/**
 * @param {unknown} value
 * @returns {value is Extract<import('../../types/rpc/import-export.js').ProjectImportResult, { success: true }>}
 */
export function isProjectImportSuccess(value) {
  return materializeProjectImportSuccess(value) !== null;
}

/**
 * @param {unknown} value
 * @returns {value is Extract<import('../../types/rpc/import-export.js').ProjectImportResult, { success: false }>}
 */
export function isProjectImportFailure(value) {
  if (!isSafeDataRecord(value) || ownDataValue(value, "success") !== false) {
    return false;
  }
  const error = ownDataValue(value, "error");
  if (
    error === "storage_not_available" ||
    error === "import_failed_invalid_json"
  ) {
    return true;
  }
  const params = ownDataValue(value, "params");
  if (!isSafeDataRecord(params)) return false;
  const path = ownDataValue(params, "path");
  if (error === "invalid_project_file") return typeof path === "string";
  if (error === "invalid_project_options") {
    return path === "$.options" || path === "$.options.importSettings";
  }
  return error === "storage_write_failed" && isStorageWriteFailure(value);
}

/**
 * @param {unknown} value
 * @returns {value is Extract<import('../../types/rpc/application.js').ProjectRestoreResult, { success: true }>}
 */
export function isProjectRestoreSuccess(value) {
  const imported = isSafeDataRecord(value)
    ? materializeImportedSummary(ownDataValue(value, "imported"))
    : null;
  return (
    isSafeDataRecord(value) &&
    ownDataValue(value, "success") === true &&
    imported !== null &&
    isCurrentProfile(ownDataValue(value, "currentProfile"))
  );
}

/** @param {unknown} value */
function isArtifactRetryableRestoreFailure(value) {
  if (!isSafeDataRecord(value) || ownDataValue(value, "success") !== false) {
    return false;
  }
  const error = ownDataValue(value, "error");
  if (error === "storage_write_failed") {
    // The receipt records only stages that returned successfully. The current
    // boolean storage API cannot prove that a failed stage made no durable
    // change: saveAllData, for example, can write its backup before the root
    // write fails. Every storage failure is therefore durability-indeterminate
    // and terminal until an explicit no-write acknowledgement exists.
    return false;
  }
  const params = ownDataValue(value, "params");
  if (!isSafeDataRecord(params)) return false;
  const reason = ownDataValue(params, "reason");
  if (typeof reason !== "string") return false;
  if (error === "project_restore_import_failed") {
    return ownDataValue(value, "durable") === false;
  }
  return false;
}

/**
 * Materialize the acknowledged durable import phase without retaining any
 * response-owned objects. Only this exact receipt permits an activation-only
 * retry; malformed durable-looking failures remain terminal.
 *
 * @param {unknown} value
 * @param {string} error
 * @param {Record<string, unknown> | undefined} params
 * @returns {{ currentProfile: string | null, imported: { profiles: number, settings: boolean } } | null}
 */
function materializeRestoreActivationReceipt(value, error, params) {
  if (
    error !== "project_restore_reload_failed" ||
    !params ||
    typeof params.reason !== "string" ||
    !isSafeDataRecord(value) ||
    ownDataValue(value, "durable") !== true
  ) {
    return null;
  }

  const currentProfile = ownDataValue(value, "currentProfile");
  const imported = materializeImportedSummary(ownDataValue(value, "imported"));
  if (!isCurrentProfile(currentProfile) || !imported) {
    return null;
  }

  return {
    currentProfile,
    imported,
  };
}

/** @param {string} error @param {unknown} value */
function materializeFailureParams(error, value) {
  if (!isSafeDataRecord(value)) return undefined;
  if (
    error === "project_restore_import_failed" ||
    error === "project_restore_reload_failed"
  ) {
    const reason = ownDataValue(value, "reason");
    return typeof reason === "string" ? { reason } : undefined;
  }
  if (error === "invalid_project_file" || error === "invalid_project_options") {
    const path = ownDataValue(value, "path");
    return typeof path === "string" ? { path } : undefined;
  }
  if (error === "storage_write_failed") {
    const operation = ownDataValue(value, "operation");
    const profileId = ownDataValue(value, "profileId");
    if (operation === "profile" && typeof profileId === "string") {
      return { operation, profileId };
    }
    if (operation === "settings" || operation === "project") {
      return { operation };
    }
  }
  return undefined;
}

/**
 * Classify an untrusted restore response without consulting inherited fields.
 * Explicit failure results retain the established terminal-by-default policy.
 * Malformed results remain a distinct classification, but callers must not
 * replay them after dispatch because they cannot prove that no durable effect
 * occurred. The same applies to an own-data storage failure marker: the current
 * storage boundary cannot prove a failed stage had no durable effect, so even
 * an exact receipt with no acknowledged commits is terminal.
 *
 * @param {unknown} value
 * @returns {
 *   | { kind: 'success' }
 *   | { kind: 'retryable-failure' | 'terminal-failure', error: string, params?: Record<string, unknown>, reason?: string }
 *   | { kind: 'activation-retryable-failure', error: 'project_restore_reload_failed', params: { reason: string }, reason: string, receipt: { currentProfile: string | null, imported: { profiles: number, settings: boolean } } }
 *   | { kind: 'malformed' }
 * }
 */
export function classifyProjectRestoreResult(value) {
  if (isProjectRestoreSuccess(value)) return { kind: "success" };
  if (!isSafeDataRecord(value)) return { kind: "malformed" };

  const success = ownDataValue(value, "success");
  const rawError = ownDataValue(value, "error");
  const error = typeof rawError === "string" ? rawError : "import_failed";
  const rawParams = ownDataValue(value, "params");
  const params = materializeFailureParams(error, rawParams);
  if (success !== false) {
    return rawError === "storage_write_failed"
      ? {
          kind: /** @type {const} */ ("terminal-failure"),
          error: "storage_write_failed",
          ...(params ? { params } : {}),
        }
      : { kind: /** @type {const} */ ("malformed") };
  }
  const reason =
    (error === "project_restore_import_failed" ||
      error === "project_restore_reload_failed") &&
    params &&
    typeof params.reason === "string"
      ? params.reason
      : undefined;
  const receipt = materializeRestoreActivationReceipt(value, error, params);
  if (receipt && reason !== undefined) {
    return {
      kind: /** @type {const} */ ("activation-retryable-failure"),
      error: /** @type {const} */ ("project_restore_reload_failed"),
      params: { reason },
      reason,
      receipt,
    };
  }
  return {
    kind: isArtifactRetryableRestoreFailure(value)
      ? "retryable-failure"
      : "terminal-failure",
    error,
    ...(params ? { params } : {}),
    ...(reason !== undefined ? { reason } : {}),
  };
}

/**
 * @param {unknown} value
 * @returns {{ kind: 'success' } | { kind: 'failure', error: string } | { kind: 'malformed' }}
 */
export function classifyDataReloadResult(value) {
  if (!isSafeDataRecord(value)) return { kind: "malformed" };
  const success = ownDataValue(value, "success");
  if (success === false) {
    const error = ownDataValue(value, "error");
    return typeof error === "string"
      ? { kind: "failure", error }
      : { kind: "malformed" };
  }
  if (
    success === true &&
    Number.isInteger(ownDataValue(value, "profiles")) &&
    /** @type {number} */ (ownDataValue(value, "profiles")) >= 0 &&
    isCurrentProfile(ownDataValue(value, "currentProfile")) &&
    typeof ownDataValue(value, "environment") === "string"
  ) {
    return { kind: "success" };
  }
  return { kind: "malformed" };
}
