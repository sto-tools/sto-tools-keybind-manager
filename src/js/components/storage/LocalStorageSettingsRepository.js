import {
  decodeSettingsRepositoryJson,
  prepareSettingsRepositoryValue,
} from "./settingsRepositoryBoundary.js";
import { storageFailureCategory } from "./repositoryResults.js";

const SETTINGS_KEY = "sto_keybind_settings";

/** @typedef {import('./SettingsRepository.js').SettingsRepositoryPort} SettingsRepositoryPort */

/**
 * Complete standalone-settings persistence; never an owner or event source.
 * @implements {SettingsRepositoryPort}
 */
export default class LocalStorageSettingsRepository {
  /** @type {import('../../types/storage-contracts.js').RepositoryStorageCapability} */
  #storage;
  /** @type {import('../../types/data-contracts.js').CanonicalSettings} */
  #defaults;

  /**
   * @param {{storage: import('../../types/storage-contracts.js').RepositoryStorageCapability, defaults: import('../../types/data-contracts.js').CanonicalSettings}} options
   */
  constructor({ storage, defaults }) {
    if (
      !storage ||
      typeof storage.getItem !== "function" ||
      typeof storage.setItem !== "function" ||
      typeof storage.removeItem !== "function"
    ) {
      throw new TypeError("invalid_storage_capability");
    }
    const prepared = prepareSettingsRepositoryValue(defaults);
    if (!prepared.success) throw new TypeError("invalid_settings_defaults");
    this.#storage = storage;
    this.#defaults = prepared.value;
  }

  /**
   * Read-only preflight capability; does not establish verified-write history.
   * @returns {Readonly<import('./SettingsRepository.js').SettingsMigrationInspectionPort>}
   */
  createMigrationInspectionPort() {
    return Object.freeze({
      inspectRaw: () => this.#inspectRaw(),
      verify: (/** @type {unknown} */ expected) => this.#verify(expected),
    });
  }

  /** @returns {import('../../types/storage-contracts.js').RepositoryRawInspectionResult} */
  #inspectRaw() {
    try {
      return { status: "read", raw: this.#storage.getItem(SETTINGS_KEY) };
    } catch (error) {
      return {
        status: "read_failed",
        error: "storage_read_failed",
        category: storageFailureCategory(error),
      };
    }
  }

  /**
   * Strict expected-value validation precedes every storage read. Equality
   * verifies current bytes only, never a claimed acknowledgement or readiness.
   * @param {unknown} expected
   * @returns {import('../../types/storage-contracts.js').SettingsVerificationResult}
   */
  #verify(expected) {
    /** @param {import('../../types/storage-contracts.js').VerificationFailure['reason']} reason */
    const failed = (reason) =>
      /** @type {const} */ ({
        status: "failed",
        error: "verification_failed",
        reason,
      });
    const prepared = prepareSettingsRepositoryValue(expected);
    if (!prepared.success) return failed("invalid_data");
    const inspected = this.#inspectRaw();
    if (inspected.status === "read_failed") return failed("read_failed");
    if (inspected.raw !== prepared.json) return failed("value_mismatch");
    try {
      const verified = prepareSettingsRepositoryValue(
        JSON.parse(inspected.raw),
      );
      return verified.success ? { status: "verified" } : failed("invalid_data");
    } catch {
      return failed("invalid_data");
    }
  }

  /** @returns {import('../../types/storage-contracts.js').SettingsLoadResult} */
  load() {
    let content;
    try {
      content = this.#storage.getItem(SETTINGS_KEY);
    } catch (error) {
      return {
        status: "read_failed",
        error: "storage_read_failed",
        category: storageFailureCategory(error),
      };
    }
    return decodeSettingsRepositoryJson(content, this.#defaults);
  }

  /**
   * @param {import('../../types/data-contracts.js').CanonicalSettings} settings
   * @returns {import('../../types/storage-contracts.js').SettingsWriteResult}
   */
  replace(settings) {
    const prepared = prepareSettingsRepositoryValue(settings);
    if (!prepared.success) {
      return {
        status: "rejected",
        error: prepared.error,
        write: { status: "not_attempted" },
        verification: { status: "not_attempted" },
      };
    }
    try {
      this.#storage.setItem(SETTINGS_KEY, prepared.json);
    } catch (error) {
      return {
        status: "write_failed",
        error: "storage_write_failed",
        write: {
          status: "indeterminate",
          error: "storage_write_failed",
          category: storageFailureCategory(error),
        },
        verification: { status: "not_attempted" },
      };
    }

    let actual;
    try {
      actual = this.#storage.getItem(SETTINGS_KEY);
    } catch {
      return this.#verificationFailure("read_failed");
    }
    if (actual !== prepared.json) {
      return this.#verificationFailure("value_mismatch");
    }
    try {
      const verified = prepareSettingsRepositoryValue(JSON.parse(actual));
      if (!verified.success) return this.#verificationFailure("invalid_data");
      return {
        status: "committed",
        value: verified.value,
        write: { status: "acknowledged" },
        verification: { status: "verified" },
      };
    } catch {
      return this.#verificationFailure("invalid_data");
    }
  }

  /** @returns {import('../../types/storage-contracts.js').SettingsClearResult} */
  clear() {
    try {
      this.#storage.removeItem(SETTINGS_KEY);
      return { status: "cleared", removal: { status: "acknowledged" } };
    } catch (error) {
      return {
        status: "clear_failed",
        removal: {
          status: "indeterminate",
          error: "storage_write_failed",
          category: storageFailureCategory(error),
        },
      };
    }
  }

  /**
   * @param {import('../../types/storage-contracts.js').VerificationFailure['reason']} reason
   * @returns {Extract<import('../../types/storage-contracts.js').SettingsWriteResult, {status: "verification_failed"}>}
   */
  #verificationFailure(reason) {
    return {
      status: "verification_failed",
      error: "verification_failed",
      write: { status: "acknowledged" },
      verification: { status: "failed", error: "verification_failed", reason },
    };
  }
}
