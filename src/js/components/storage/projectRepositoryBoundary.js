import { decodeStoredApplicationJson } from "../services/storedApplicationDataBoundary.js";
import { isDataRecord } from "../services/jsonDataBoundary.js";
import { serializeRepositoryData } from "./repositoryJsonBoundary.js";

/** @typedef {import('../../types/data-contracts.js').StoredApplicationData} StoredApplicationData */
/**
 * Create a settings-free empty root. First-run profile creation remains an
 * owner operation; Preferences owns its independent defaults.
 * @param {{version: string, timestamp: string}} options
 * @returns {StoredApplicationData}
 */
export function createProjectRepositoryDefaults({ version, timestamp }) {
  return {
    version,
    created: timestamp,
    lastModified: timestamp,
    currentProfile: null,
    profiles: {},
    globalAliases: {},
  };
}

/**
 * Read decoding remains forgiving and uses the stored representation, never
 * project-import profile normalization. This pure boundary performs no writes.
 * @param {string | null} raw
 * @param {{defaults: StoredApplicationData, version: string, resetSentinel: string | null}} options
 * @returns {Exclude<import('../../types/storage-contracts.js').ProjectLoadResult, import('../../types/storage-contracts.js').ReadFailure>}
 */
export function decodeProjectRepositoryJson(
  raw,
  { defaults, version, resetSentinel },
) {
  const resetRecovery = resetSentinel
    ? {
        status: /** @type {const} */ ("pending_consumption"),
        expectedValue: resetSentinel,
      }
    : { status: /** @type {const} */ ("not_applicable") };
  if (!raw) {
    // The historical sentinel contract is truthiness, not key existence.
    return {
      status: "repair_required",
      value: structuredClone(defaults),
      reason: "missing",
      resetSentinel: resetRecovery,
    };
  }
  const decoded = decodeStoredApplicationJson(raw, { defaults, version });
  if (!decoded.success) {
    return {
      status: "repair_required",
      value: structuredClone(defaults),
      reason: decoded.error,
      resetSentinel: resetRecovery,
    };
  }
  if (!decoded.changed) {
    if (!resetSentinel) return { status: "current", value: decoded.value };
    return {
      status: "repair_required",
      value: decoded.value,
      reason: "reset_pending",
      resetSentinel: resetRecovery,
    };
  }
  return {
    status: "repair_required",
    value: decoded.value,
    reason: decoded.migrated ? "legacy" : "repaired",
    resetSentinel: resetRecovery,
  };
}

/**
 * Prepare the complete accepted wire value before any persistence mutation.
 * Strict JSON materialization precedes all domain reads, so accessors, cycles,
 * exotic values, and unsupported extensions cannot disappear in stringify.
 * @param {unknown} root
 * @param {{version: string, timestamp: string, defaults: StoredApplicationData}} options
 * @returns {{success: true, json: string, value: StoredApplicationData} | {success: false, error: import('../../types/storage-contracts.js').RepositoryInputError}}
 */
export function prepareProjectRepositoryCommit(
  root,
  { version, timestamp, defaults },
) {
  const input = serializeRepositoryData(root);
  if (!input.success) return input;
  if (
    !isDataRecord(input.value) ||
    Object.hasOwn(input.value, "settings") ||
    typeof input.value.version !== "string" ||
    typeof input.value.lastModified !== "string" ||
    (Object.hasOwn(input.value, "lastBackup") &&
      typeof input.value.lastBackup !== "string")
  ) {
    return { success: false, error: "invalid_data" };
  }
  try {
    // Version and write timestamps are the only commit-time normalization.
    // Selection repair, legacy migration, and recovered fields belong to load
    // and the owner, not an ordinary whole-root replacement.
    const accepted = serializeRepositoryData({
      ...input.value,
      version,
      lastModified: timestamp,
      lastBackup: timestamp,
    });
    if (!accepted.success) return accepted;
    const decoded = decodeStoredApplicationJson(accepted.json, {
      defaults,
      version,
    });
    if (!decoded.success || decoded.changed || decoded.migrated) {
      return { success: false, error: "invalid_data" };
    }
    return {
      success: true,
      json: accepted.json,
      value: /** @type {StoredApplicationData} */ (accepted.value),
    };
  } catch {
    return { success: false, error: "invalid_data" };
  }
}

/**
 * Strict structural-migration preparation. The planner supplies version and
 * repaired fields explicitly; this boundary never stamps timestamps or writes
 * a backup, preserving the exact migration draft for verified replacement.
 * @param {unknown} root
 * @param {{version: string, defaults: StoredApplicationData}} options
 * @returns {{success: true, json: string, value: StoredApplicationData} | {success: false, error: import('../../types/storage-contracts.js').RepositoryInputError}}
 */
export function prepareProjectMigrationCommit(root, { version, defaults }) {
  const input = serializeRepositoryData(root);
  if (!input.success) return input;
  const decoded = decodeStoredApplicationJson(input.json, {
    defaults,
    version,
  });
  if (!decoded.success || decoded.changed || decoded.migrated) {
    return { success: false, error: "invalid_data" };
  }
  return {
    success: true,
    json: input.json,
    value: /** @type {StoredApplicationData} */ (input.value),
  };
}
