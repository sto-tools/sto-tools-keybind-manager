/**
 * Materialize a small, flat own-data envelope without invoking accessors.
 * Raw strings are not JSON-escaped here: their document budget is checked by
 * the consuming decoder, independently of the inspection envelope overhead.
 * @param {unknown} input
 * @param {readonly string[]} allowed
 * @returns {Record<string, string | boolean | null> | null}
 */
export function materializeStorageMigrationRecord(input, allowed) {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      return null;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(input);
    if (keys.length > allowed.length) return null;
    /** @type {Record<string, string | boolean | null>} */
    const result = {};
    for (const key of keys) {
      if (typeof key !== "string" || !allowed.includes(key)) return null;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) return null;
      const value = descriptor.value;
      if (
        value !== null &&
        typeof value !== "string" &&
        typeof value !== "boolean"
      )
        return null;
      Object.defineProperty(result, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return result;
  } catch {
    return null;
  }
}

const stages = new Set([
  "settings_read",
  "settings_write",
  "settings_verify",
  "legacy_root_decode",
  "legacy_root_backup",
  "canonical_root_commit",
  "canonical_root_verify",
]);
const errors = new Set([
  "invalid_json",
  "invalid_data",
  "serialization_failed",
  "storage_read_failed",
  "storage_write_failed",
  "backup_write_failed",
  "verification_failed",
  "operation_cancelled",
]);

/**
 * Validate all four design receipt variants, including future activation's
 * complete receipt. Shape validation is not proof that a migration occurred.
 * @param {unknown} input
 * @returns {import('../../types/storage-migration-contracts.js').EmbeddedSettingsMigrationReceipt | null}
 */
export function materializeStorageSchemaMigrationReceipt(input) {
  const value = materializeStorageMigrationRecord(input, [
    "status",
    "settingsVerified",
    "source",
    "exactPriorRootBackedUp",
    "rootLayout",
    "stage",
    "error",
  ]);
  if (!value) return null;
  const size = Object.keys(value).length;
  if (
    value.status === "absent" &&
    size === 2 &&
    value.settingsVerified === true
  )
    return { status: "absent", settingsVerified: true };
  if (
    value.status === "complete" &&
    size === 5 &&
    value.settingsVerified === true &&
    (value.source === "legacy" ||
      value.source === "recovered_invalid" ||
      value.source === "missing") &&
    typeof value.exactPriorRootBackedUp === "boolean" &&
    value.rootLayout === "settings-free"
  )
    return {
      status: "complete",
      settingsVerified: true,
      source: value.source,
      exactPriorRootBackedUp: value.exactPriorRootBackedUp,
      rootLayout: "settings-free",
    };
  if (
    value.status === "pending" &&
    size === 3 &&
    value.settingsVerified === true &&
    (value.stage === "legacy_root_backup" ||
      value.stage === "canonical_root_commit")
  )
    return {
      status: "pending",
      settingsVerified: true,
      stage: value.stage,
    };
  if (
    value.status === "failed" &&
    size === 4 &&
    typeof value.settingsVerified === "boolean" &&
    typeof value.stage === "string" &&
    stages.has(value.stage) &&
    typeof value.error === "string" &&
    errors.has(value.error)
  )
    return {
      status: "failed",
      settingsVerified: value.settingsVerified,
      stage:
        /** @type {import('../../types/storage-migration-contracts.js').StorageMigrationStage} */ (
          value.stage
        ),
      error:
        /** @type {import('../../types/storage-migration-contracts.js').StorageMigrationErrorCode} */ (
          value.error
        ),
    };
  return null;
}
