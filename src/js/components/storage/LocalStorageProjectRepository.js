import {
  createProjectRepositoryDefaults,
  decodeProjectRepositoryJson,
  prepareProjectMigrationCommit,
  prepareProjectRepositoryCommit,
} from "./projectRepositoryBoundary.js";
import { storageFailureCategory } from "./repositoryResults.js";
import {
  createProjectSchemaMigrationPort,
  findMatchingMigrationCheckpoint,
} from "./projectSchemaMigrationPersistence.js";

/** @typedef {import('../../types/storage-contracts.js').ProjectWriteOptions} ProjectWriteOptions */
/** @typedef {import('../../types/storage-contracts.js').BackupReceipt} BackupReceipt */
/** @typedef {import('../../types/storage-contracts.js').ReadFailure} ReadFailure */
/** @typedef {import('../../types/storage-contracts.js').IndeterminateWrite} IndeterminateWrite */
/** @typedef {import('./ProjectRepository.js').ProjectRepositoryPort} ProjectRepositoryPort */

const ROOT_KEY = "sto_keybind_manager";
const BACKUP_KEY = "sto_keybind_manager_backup";
const RESET_KEY = "sto_app_reset";

/** @param {unknown} error @returns {ReadFailure} */
function readFailure(error) {
  return {
    status: "read_failed",
    error: "storage_read_failed",
    category: storageFailureCategory(error),
  };
}

/** @param {unknown} error @returns {IndeterminateWrite} */
function writeFailure(error) {
  return {
    status: "indeterminate",
    error: "storage_write_failed",
    category: storageFailureCategory(error),
  };
}

/**
 * Read options as own data only, without invoking caller-owned accessors.
 * @param {unknown} input
 * @returns {{verification: "required" | "not_requested", consumeResetSentinel?: string, purpose?: "startup_recovery"} | null}
 */
function decodeWriteOptions(input) {
  if (input === undefined) return { verification: "not_requested" };
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.some(
        (key) =>
          (key !== "verification" &&
            key !== "consumeResetSentinel" &&
            key !== "purpose") ||
          !descriptors[key].enumerable ||
          !("value" in descriptors[key]),
      )
    ) {
      return null;
    }
    const verification =
      descriptors.verification?.value === undefined
        ? "not_requested"
        : descriptors.verification.value;
    const consumeResetSentinel = descriptors.consumeResetSentinel?.value;
    const purpose = descriptors.purpose?.value;
    if (
      purpose !== undefined &&
      (purpose !== "startup_recovery" || verification !== "required")
    )
      return null;
    if (verification !== "required" && verification !== "not_requested") {
      return null;
    }
    if (
      consumeResetSentinel !== undefined &&
      (verification !== "required" ||
        typeof consumeResetSentinel !== "string" ||
        consumeResetSentinel.length === 0)
    ) {
      return null;
    }
    return { verification, consumeResetSentinel, purpose };
  } catch {
    return null;
  }
}

/**
 * Whole settings-free roots, exact previous-root backups, and reset sentinel
 * only. DataCoordinator is the sole owner of this capability and supplies all
 * domain planning, adoption, and publication. No cache, owner effects, or
 * global lookup live in this adapter.
 * @implements {ProjectRepositoryPort}
 */
export default class LocalStorageProjectRepository {
  #storage;
  #version;
  #now;

  /**
   * @param {{storage: import('../../types/storage-contracts.js').RepositoryStorageCapability, version: string, now: () => string}} options
   */
  constructor({ storage, version, now }) {
    if (
      !storage ||
      typeof storage.getItem !== "function" ||
      typeof storage.setItem !== "function" ||
      typeof storage.removeItem !== "function" ||
      typeof version !== "string" ||
      typeof now !== "function"
    ) {
      throw new TypeError("invalid_repository_capability");
    }
    this.#storage = storage;
    this.#version = version;
    this.#now = now;
  }

  /** @param {string} timestamp */
  #defaults(timestamp) {
    return createProjectRepositoryDefaults({
      version: this.#version,
      timestamp,
    });
  }

  /**
   * Read-only preflight capability; deliberately not part of the owner port.
   * @returns {Readonly<import('./ProjectRepository.js').ProjectMigrationInspectionPort>}
   */
  createMigrationInspectionPort() {
    return Object.freeze({ inspectRaw: () => this.#inspectRaw() });
  }

  /** Infrastructure-only capability, never part of ProjectRepositoryPort.
   * @returns {Readonly<import('./ProjectRepository.js').ProjectSchemaMigrationPort>}
   */
  createSchemaMigrationPort() {
    return createProjectSchemaMigrationPort({
      storage: this.#storage,
      version: this.#version,
      defaults: () => this.#defaults(this.#now()),
      inspectRaw: () => this.#inspectRaw(),
    });
  }

  /** @returns {import('../../types/storage-contracts.js').RepositoryRawInspectionResult} */
  #inspectRaw() {
    try {
      return { status: "read", raw: this.#storage.getItem(ROOT_KEY) };
    } catch (error) {
      return readFailure(error);
    }
  }

  /** @returns {import('../../types/storage-contracts.js').ProjectLoadResult} */
  load() {
    let raw;
    let resetSentinel;
    try {
      raw = this.#storage.getItem(ROOT_KEY);
      resetSentinel = this.#storage.getItem(RESET_KEY);
    } catch (error) {
      return readFailure(error);
    }
    return decodeProjectRepositoryJson(raw, {
      defaults: this.#defaults(this.#now()),
      version: this.#version,
      resetSentinel,
    });
  }

  /** @param {string} timestamp @param {"startup_recovery" | undefined} purpose @returns {BackupReceipt & {checkpoint?: import('../../types/storage-contracts.js').BackupMetadata}} */
  #backup(timestamp, purpose) {
    let previous;
    try {
      previous = this.#storage.getItem(ROOT_KEY);
    } catch (error) {
      return readFailure(error);
    }
    if (!previous) return { status: "skipped", reason: "missing" };
    if (purpose === "startup_recovery") {
      const checkpoint = findMatchingMigrationCheckpoint(
        this.#storage,
        previous,
        this.#version,
      );
      if (checkpoint && "status" in checkpoint) return checkpoint;
      if (checkpoint) return { status: "acknowledged", checkpoint };
    }
    let backup;
    try {
      // This envelope wraps trusted strings. Escaping can exceed the root's
      // byte cap without making the exact prior-root backup invalid.
      backup = JSON.stringify({
        data: previous,
        timestamp,
        version: this.#version,
      });
    } catch {
      return { status: "preparation_failed", error: "serialization_failed" };
    }
    try {
      this.#storage.setItem(BACKUP_KEY, backup);
      return { status: "acknowledged" };
    } catch (error) {
      return {
        status: "indeterminate",
        error: "backup_write_failed",
        category: storageFailureCategory(error),
      };
    }
  }

  /**
   * @param {import('../../types/data-contracts.js').StoredApplicationData} root
   * @param {ProjectWriteOptions} [options]
   * @returns {import('../../types/storage-contracts.js').ProjectCommitResult}
   */
  commit(root, options) {
    const rejected = /** @type {const} */ ({
      status: "rejected",
      backup: { status: "not_attempted" },
      rootWrite: { status: "not_attempted" },
      verification: { status: "not_attempted" },
      resetSentinel: { status: "not_attempted" },
    });
    const acceptedOptions = decodeWriteOptions(options);
    if (!acceptedOptions) return { ...rejected, error: "invalid_data" };
    let prepared;
    let timestamp;
    try {
      timestamp = this.#now();
      if (typeof timestamp !== "string") {
        return { ...rejected, error: "invalid_data" };
      }
      prepared = prepareProjectRepositoryCommit(root, {
        version: this.#version,
        timestamp,
        defaults: this.#defaults(timestamp),
      });
    } catch {
      return { ...rejected, error: "invalid_data" };
    }
    if (!prepared.success) return { ...rejected, error: prepared.error };
    if (
      acceptedOptions.purpose &&
      acceptedOptions.consumeResetSentinel !== undefined
    ) {
      const current = prepareProjectMigrationCommit(root, {
        version: this.#version,
        defaults: this.#defaults(timestamp),
      });
      if (current.success) {
        const verification = this.#verify(current.json, timestamp);
        if (verification.status === "verified") {
          const resetSentinel = this.#consumeSentinel(
            acceptedOptions.consumeResetSentinel,
          );
          const durable = /** @type {const} */ ({
            backup: { status: "not_attempted" },
            rootWrite: { status: "skipped", reason: "already_current" },
            verification,
          });
          if (resetSentinel.status !== "acknowledged")
            return {
              status: "sentinel_failed",
              error: "reset_sentinel_consumption_failed",
              ...durable,
              resetSentinel,
            };
          return {
            status: "committed",
            ...durable,
            value: structuredClone(current.value),
            resetSentinel,
          };
        }
        if (verification.reason === "read_failed")
          return { ...rejected, error: "storage_read_failed" };
      }
    }
    const { checkpoint, ...backup } = this.#backup(
      timestamp,
      acceptedOptions.purpose,
    );
    if (acceptedOptions.purpose && backup.status === "read_failed") {
      return { ...rejected, error: "storage_read_failed" };
    }
    if (checkpoint) {
      // Reusing a verified backup is not a fresh backup write. Keep the new
      // primary-write timestamp but report the actual checkpoint timestamp.
      prepared = prepareProjectMigrationCommit(
        { ...prepared.value, lastBackup: checkpoint.timestamp },
        { version: this.#version, defaults: this.#defaults(timestamp) },
      );
      if (!prepared.success) return { ...rejected, error: prepared.error };
    }
    try {
      this.#storage.setItem(ROOT_KEY, prepared.json);
    } catch (error) {
      return {
        status: "write_failed",
        error: "storage_write_failed",
        backup,
        rootWrite: writeFailure(error),
        verification: { status: "not_attempted" },
        resetSentinel: { status: "not_attempted" },
      };
    }
    const acknowledged = /** @type {const} */ ({
      backup,
      rootWrite: { status: "acknowledged" },
    });
    if (acceptedOptions.verification === "required") {
      const verification = this.#verify(prepared.json, timestamp);
      if (verification.status === "failed") {
        return {
          status: "verification_failed",
          error: "verification_failed",
          ...acknowledged,
          verification,
          resetSentinel: { status: "not_attempted" },
        };
      }
      if (acceptedOptions.consumeResetSentinel !== undefined) {
        const resetSentinel = this.#consumeSentinel(
          acceptedOptions.consumeResetSentinel,
        );
        if (resetSentinel.status !== "acknowledged") {
          return {
            status: "sentinel_failed",
            error: "reset_sentinel_consumption_failed",
            ...acknowledged,
            verification,
            resetSentinel,
          };
        }
        return {
          status: "committed",
          ...acknowledged,
          value: structuredClone(prepared.value),
          verification,
          resetSentinel,
        };
      }
    }
    return {
      status: "committed",
      ...acknowledged,
      value: structuredClone(prepared.value),
      verification: {
        status:
          acceptedOptions.verification === "required"
            ? "verified"
            : "not_requested",
      },
      resetSentinel: { status: "not_requested" },
    };
  }

  /**
   * @param {string} expected
   * @param {string} timestamp
   * @returns {{status: "verified"} | import('../../types/storage-contracts.js').VerificationFailure}
   */
  #verify(expected, timestamp) {
    let raw;
    try {
      raw = this.#storage.getItem(ROOT_KEY);
    } catch {
      return {
        status: "failed",
        error: "verification_failed",
        reason: "read_failed",
      };
    }
    if (raw !== expected) {
      return {
        status: "failed",
        error: "verification_failed",
        reason: "value_mismatch",
      };
    }
    const decoded = decodeProjectRepositoryJson(raw, {
      defaults: this.#defaults(timestamp),
      version: this.#version,
      resetSentinel: null,
    });
    if (decoded.status !== "current") {
      return {
        status: "failed",
        error: "verification_failed",
        reason: "invalid_data",
      };
    }
    return { status: "verified" };
  }

  /**
   * @param {string} expected
   * @returns {import('../../types/storage-contracts.js').Acknowledged | import('../../types/storage-contracts.js').SentinelFailure}
   */
  #consumeSentinel(expected) {
    let current;
    try {
      current = this.#storage.getItem(RESET_KEY);
    } catch (error) {
      return readFailure(error);
    }
    if (current !== expected) {
      return { status: "changed", error: "reset_sentinel_changed" };
    }
    try {
      this.#storage.removeItem(RESET_KEY);
      return { status: "acknowledged" };
    } catch (error) {
      return writeFailure(error);
    }
  }

  /** @returns {import('../../types/storage-contracts.js').ProjectResetResult} */
  reset() {
    try {
      this.#storage.removeItem(ROOT_KEY);
    } catch (error) {
      return {
        status: "reset_failed",
        rootRemoval: writeFailure(error),
        backupRemoval: { status: "not_attempted" },
        sentinelWrite: { status: "not_attempted" },
      };
    }
    try {
      this.#storage.removeItem(BACKUP_KEY);
    } catch (error) {
      return {
        status: "reset_failed",
        rootRemoval: { status: "acknowledged" },
        backupRemoval: writeFailure(error),
        sentinelWrite: { status: "not_attempted" },
      };
    }
    try {
      this.#storage.setItem(RESET_KEY, "true");
    } catch (error) {
      return {
        status: "reset_failed",
        rootRemoval: { status: "acknowledged" },
        backupRemoval: { status: "acknowledged" },
        sentinelWrite: writeFailure(error),
      };
    }
    return {
      status: "reset",
      rootRemoval: { status: "acknowledged" },
      backupRemoval: { status: "acknowledged" },
      sentinelWrite: { status: "acknowledged" },
    };
  }
}
