import { decodeLegacyStoredApplicationJson } from "../services/storedApplicationDataBoundary.js";
import {
  createProjectRepositoryDefaults,
  prepareProjectMigrationCommit,
} from "./projectRepositoryBoundary.js";
import { storageFailureCategory } from "./repositoryResults.js";

const ROOT_KEY = "sto_keybind_manager";
const BACKUP_KEY = "sto_keybind_manager_backup";

/** @typedef {import('../../types/storage-contracts.js').RepositoryStorageCapability} StorageCapability */
/** @typedef {import('../../types/storage-migration-contracts.js').StorageMigrationErrorCode} MigrationError */

/** @param {unknown} input @returns {{timestamp: string, version: string} | null} */
function decodeMetadata(input) {
  try {
    if (typeof input !== "object" || input === null) return null;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (
      Reflect.ownKeys(descriptors).length !== 2 ||
      !["timestamp", "version"].every(
        (key) =>
          descriptors[key]?.enumerable &&
          "value" in descriptors[key] &&
          typeof descriptors[key].value === "string" &&
          descriptors[key].value.length > 0,
      )
    )
      return null;
    return {
      timestamp: descriptors.timestamp.value,
      version: descriptors.version.value,
    };
  } catch {
    return null;
  }
}

/** @param {string | null} raw @returns {{data: string, timestamp: string, version: string} | null} */
function decodeBackup(raw) {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Object.keys(value).length !== 3 ||
      typeof value.data !== "string" ||
      !decodeMetadata({ timestamp: value.timestamp, version: value.version })
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

/** @param {MigrationError} error @returns {import('../../types/storage-contracts.js').ProjectCommitResult} */
function rejected(error) {
  return {
    status: "rejected",
    error,
    backup: { status: "not_attempted" },
    rootWrite: { status: "not_attempted" },
    verification: { status: "not_attempted" },
    resetSentinel: { status: "not_attempted" },
  };
}

/**
 * Stateless privileged capability; no captured root or backup proof survives a call.
 * @param {{storage: StorageCapability, version: string, defaults: () => import('../../types/data-contracts.js').StoredApplicationData, inspectRaw: () => import('../../types/storage-contracts.js').RepositoryRawInspectionResult}} options
 * @returns {Readonly<import('../../types/storage-contracts.js').ProjectSchemaMigrationPort>}
 */
export function createProjectSchemaMigrationPort({
  storage,
  version,
  defaults,
  inspectRaw,
}) {
  /** @type {import('../../types/storage-contracts.js').ProjectSchemaMigrationPort} */
  const port = {
    inspectRaw,
    preserveExactBackup(expectedRaw, metadata) {
      const accepted = decodeMetadata(metadata);
      if (typeof expectedRaw !== "string" || !accepted) {
        return { status: "failed", error: "invalid_data" };
      }
      let existing;
      try {
        if (storage.getItem(ROOT_KEY) !== expectedRaw) {
          return { status: "failed", error: "operation_cancelled" };
        }
        existing = storage.getItem(BACKUP_KEY);
      } catch {
        return { status: "failed", error: "storage_read_failed" };
      }
      if (decodeBackup(existing)?.data === expectedRaw) {
        return { status: "verified" };
      }
      let json;
      try {
        json = JSON.stringify({ data: expectedRaw, ...accepted });
      } catch {
        return { status: "failed", error: "serialization_failed" };
      }
      try {
        // Recheck immediately before mutation, including storage callback races.
        if (storage.getItem(ROOT_KEY) !== expectedRaw) {
          return { status: "failed", error: "operation_cancelled" };
        }
      } catch {
        return { status: "failed", error: "storage_read_failed" };
      }
      try {
        storage.setItem(BACKUP_KEY, json);
      } catch {
        return { status: "failed", error: "backup_write_failed" };
      }
      try {
        if (storage.getItem(BACKUP_KEY) !== json) {
          return { status: "failed", error: "verification_failed" };
        }
      } catch {
        return { status: "failed", error: "storage_read_failed" };
      }
      return { status: "verified" };
    },
    commitMigratedRoot(expectedRaw, root) {
      if (typeof expectedRaw !== "string") return rejected("invalid_data");
      let prepared;
      try {
        prepared = prepareProjectMigrationCommit(root, {
          version,
          defaults: defaults(),
        });
      } catch {
        return rejected("invalid_data");
      }
      if (!prepared.success) return rejected(prepared.error);
      try {
        if (storage.getItem(ROOT_KEY) !== expectedRaw)
          return rejected("operation_cancelled");
        if (decodeBackup(storage.getItem(BACKUP_KEY))?.data !== expectedRaw) {
          return rejected("verification_failed");
        }
        if (storage.getItem(ROOT_KEY) !== expectedRaw)
          return rejected("operation_cancelled");
      } catch {
        return rejected("storage_read_failed");
      }
      const backup = /** @type {const} */ ({ status: "acknowledged" });
      try {
        storage.setItem(ROOT_KEY, prepared.json);
      } catch (error) {
        return {
          status: "write_failed",
          error: "storage_write_failed",
          backup,
          rootWrite: {
            status: "indeterminate",
            error: "storage_write_failed",
            category: storageFailureCategory(error),
          },
          verification: { status: "not_attempted" },
          resetSentinel: { status: "not_attempted" },
        };
      }
      const rootWrite = /** @type {const} */ ({ status: "acknowledged" });
      /** @type {"read_failed" | "value_mismatch" | undefined} */
      let reason;
      try {
        if (storage.getItem(ROOT_KEY) !== prepared.json)
          reason = "value_mismatch";
      } catch {
        reason = "read_failed";
      }
      if (reason) {
        return {
          status: "verification_failed",
          error: "verification_failed",
          backup,
          rootWrite,
          verification: {
            status: "failed",
            error: "verification_failed",
            reason,
          },
          resetSentinel: { status: "not_attempted" },
        };
      }
      return {
        status: "committed",
        value: structuredClone(prepared.value),
        backup,
        rootWrite,
        verification: { status: "verified" },
        resetSentinel: { status: "not_requested" },
      };
    },
  };
  return Object.freeze(port);
}

/** @param {unknown} left @param {unknown} right @returns {boolean} */
function sameJson(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        sameJson(
          /** @type {Record<string, import('../../types/data-contracts.js').JsonValue>} */ (
            left
          )[key],
          /** @type {Record<string, import('../../types/data-contracts.js').JsonValue>} */ (
            right
          )[key],
        ),
    )
  );
}

/**
 * Derive checkpoint authority anew from durable source and current root. Only
 * startup recovery uses this proof; ordinary actions always back up their root.
 * @param {StorageCapability} storage @param {string} raw @param {string} version
 * @returns {import('../../types/storage-contracts.js').BackupMetadata | import('../../types/storage-contracts.js').ReadFailure | null}
 */
export function findMatchingMigrationCheckpoint(storage, raw, version) {
  let rawBackup;
  try {
    rawBackup = storage.getItem(BACKUP_KEY);
  } catch (error) {
    return {
      status: "read_failed",
      error: "storage_read_failed",
      category: storageFailureCategory(error),
    };
  }
  try {
    const backup = decodeBackup(rawBackup);
    if (!backup) return null;
    const current = JSON.parse(raw);
    if (typeof current?.lastModified !== "string") return null;
    const defaults = createProjectRepositoryDefaults({
      version,
      timestamp: current.created ?? current.lastModified,
    });
    defaults.lastModified = current.lastModified;
    if (Object.hasOwn(current, "lastBackup"))
      defaults.lastBackup = current.lastBackup;
    const acceptedCurrent = prepareProjectMigrationCommit(current, {
      version,
      defaults,
    });
    if (!acceptedCurrent.success || current.version !== version) return null;
    const decoded = decodeLegacyStoredApplicationJson(backup.data, {
      defaults,
      version,
    });
    const draft = decoded.success ? decoded.value : structuredClone(defaults);
    draft.version = version;
    const acceptedDraft = prepareProjectMigrationCommit(draft, {
      version,
      defaults,
    });
    if (!acceptedDraft.success) return null;
    // Only the repository writer manages these root metadata fields. Both
    // records were validated above; nested timestamps and every domain/open
    // extension field must still match the reproduced migration checkpoint.
    const left = { ...acceptedDraft.value };
    const right = { ...acceptedCurrent.value };
    delete (/** @type {Partial<typeof left>} */ (left).lastModified);
    delete (/** @type {Partial<typeof right>} */ (right).lastModified);
    delete left.lastBackup;
    delete right.lastBackup;
    return sameJson(left, right)
      ? { timestamp: backup.timestamp, version: backup.version }
      : null;
  } catch {
    return null;
  }
}
