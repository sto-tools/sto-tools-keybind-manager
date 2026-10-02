import { materializeSettingsWriteResult } from "../services/preferencesRepositoryBoundary.js";
import {
  isDataRecord,
  MAX_PROJECT_JSON_BYTES,
} from "../services/jsonDataBoundary.js";
import { decodeStoredApplicationJson } from "../services/storedApplicationDataBoundary.js";
import { prepareSettingsRepositoryValue } from "./settingsRepositoryBoundary.js";
import { decodeSettingsRepositoryJson } from "./settingsRepositoryBoundary.js";
import {
  createProjectRepositoryDefaults,
  prepareProjectMigrationCommit,
} from "./projectRepositoryBoundary.js";
import { decodeLegacyStoredApplicationJson } from "../services/storedApplicationDataBoundary.js";
import { materializeStorageMigrationRecord } from "./storageSchemaMigrationReceipt.js";

/** @typedef {import('../../types/storage-migration-contracts.js').StorageSchemaMigrationPreflight} Preflight */

/**
 * Inspect only the original root's layout. A legacy field, invalid root, or
 * other required recovery needs an exact-source backup in the future migrator.
 * No recovered root is returned, cached, persisted, or adopted here.
 * @param {string | null} raw
 */
function rootRequiresRewrite(raw) {
  if (raw === null) return false;
  if (
    raw.length > MAX_PROJECT_JSON_BYTES ||
    new TextEncoder().encode(raw).byteLength > MAX_PROJECT_JSON_BYTES
  )
    return true;
  try {
    const parsed = JSON.parse(raw);
    if (!isDataRecord(parsed) || Object.hasOwn(parsed, "settings")) return true;
    const decoded = decodeStoredApplicationJson(raw, {
      version: typeof parsed.version === "string" ? parsed.version : "",
      defaults: {
        version: "",
        lastModified: "",
        profiles: {},
        currentProfile: null,
      },
    });
    if (!decoded.success) return true;
    return JSON.stringify(decoded.value) !== JSON.stringify(parsed);
  } catch {
    return true;
  }
}

/** @param {unknown} result @param {string} key @returns {unknown} */
function receiptField(result, key) {
  try {
    if (!isDataRecord(result)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(result, key);
    return descriptor?.enumerable && "value" in descriptor
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

/** @param {unknown} value @param {import('../../types/storage-migration-contracts.js').StorageMigrationErrorCode} fallback */
function migrationError(value, fallback) {
  return typeof value === "string" &&
    [
      "invalid_json",
      "invalid_data",
      "serialization_failed",
      "storage_read_failed",
      "storage_write_failed",
      "backup_write_failed",
      "verification_failed",
      "operation_cancelled",
    ].includes(value)
    ? /** @type {import('../../types/storage-migration-contracts.js').StorageMigrationErrorCode} */ (
        value
      )
    : fallback;
}

/**
 * Execute the structural migration before either runtime owner becomes ready.
 * The project capability is separate from the ordinary owner port: migration
 * backup is mandatory, verified, and never replaced by its root write.
 * Embedded settings are neither decoded nor copied into standalone settings.
 * @param {{
 *   settingsRepository: import('../../types/storage-contracts.js').SettingsRepositoryPort,
 *   settingsInspection: import('../../types/storage-contracts.js').SettingsMigrationInspectionPort,
 *   projectMigration: import('../../types/storage-contracts.js').ProjectSchemaMigrationPort,
 *   defaults: import('../../types/data-contracts.js').CanonicalSettings,
 *   version: string,
 *   now: () => string
 * }} options
 * @returns {import('../../types/storage-migration-contracts.js').EmbeddedSettingsMigrationReceipt}
 */
export function runStorageSchemaMigration({
  settingsRepository,
  settingsInspection,
  projectMigration,
  defaults,
  version,
  now,
}) {
  /** @type {import('../../types/storage-migration-contracts.js').StorageMigrationStage} */
  let stage = "settings_read";
  let settingsVerified = false;
  /** @param {import('../../types/storage-migration-contracts.js').StorageMigrationErrorCode} error */
  const failed = (error) => ({
    status: /** @type {const} */ ("failed"),
    settingsVerified,
    stage,
    error,
  });
  try {
    const standalone = materializeStorageMigrationRecord(
      settingsInspection.inspectRaw(),
      ["status", "raw", "error", "category"],
    );
    if (standalone?.status === "read_failed")
      return failed("storage_read_failed");
    if (
      standalone?.status !== "read" ||
      Object.keys(standalone).length !== 2 ||
      (standalone.raw !== null && typeof standalone.raw !== "string")
    )
      return failed("invalid_data");

    stage = "legacy_root_decode";
    const captured = materializeStorageMigrationRecord(
      projectMigration.inspectRaw(),
      ["status", "raw", "error", "category"],
    );
    if (captured?.status === "read_failed")
      return failed("storage_read_failed");
    if (
      captured?.status !== "read" ||
      Object.keys(captured).length !== 2 ||
      (captured.raw !== null && typeof captured.raw !== "string")
    )
      return failed("invalid_data");

    stage = "settings_read";
    const recovered = decodeSettingsRepositoryJson(standalone.raw, defaults);
    stage = "settings_write";
    const written = materializeSettingsWriteResult(
      settingsRepository.replace(recovered.value),
    );
    if (!written) return failed("verification_failed");
    if (written.status === "rejected" || written.status === "write_failed")
      return failed(written.error);
    stage = "settings_verify";
    if (written.status === "verification_failed")
      return failed(
        written.verification.reason === "read_failed"
          ? "storage_read_failed"
          : "verification_failed",
      );

    let settingsVerificationError =
      /** @type {import('../../types/storage-migration-contracts.js').StorageMigrationErrorCode} */ (
        "verification_failed"
      );
    const verifySettings = () => {
      const verified = materializeStorageMigrationRecord(
        settingsInspection.verify(written.value),
        ["status", "error", "reason"],
      );
      settingsVerified =
        verified?.status === "verified" && Object.keys(verified).length === 1;
      settingsVerificationError =
        verified?.reason === "read_failed"
          ? "storage_read_failed"
          : "verification_failed";
      return settingsVerified;
    };
    if (!verifySettings()) return failed(settingsVerificationError);
    const unchangedRoot = () => {
      const current = materializeStorageMigrationRecord(
        projectMigration.inspectRaw(),
        ["status", "raw", "error", "category"],
      );
      if (current?.status === "read_failed")
        return failed("storage_read_failed");
      if (current?.status !== "read" || Object.keys(current).length !== 2)
        return failed("invalid_data");
      if (current.raw !== captured.raw) return failed("operation_cancelled");
      return {
        status: /** @type {const} */ ("absent"),
        settingsVerified: /** @type {const} */ (true),
      };
    };
    stage = "legacy_root_decode";
    if (captured.raw === null) return unchangedRoot();

    stage = "legacy_root_decode";
    const timestamp = now();
    if (typeof timestamp !== "string" || typeof version !== "string")
      return failed("invalid_data");
    const rootDefaults = createProjectRepositoryDefaults({
      version,
      timestamp,
    });
    const canonical = decodeStoredApplicationJson(captured.raw, {
      defaults: rootDefaults,
      version,
    });
    // Settings-free readable roots retain ordinary Data-owned repair semantics.
    if (canonical.success) return unchangedRoot();
    const legacy = decodeLegacyStoredApplicationJson(captured.raw, {
      defaults: rootDefaults,
      version,
    });
    const source = legacy.success ? "legacy" : "recovered_invalid";
    const draft = legacy.success ? legacy.value : rootDefaults;
    draft.version = version;
    const prepared = prepareProjectMigrationCommit(draft, {
      version,
      defaults: rootDefaults,
    });
    if (!prepared.success) return failed(prepared.error);

    stage = "legacy_root_backup";
    const backup = materializeStorageMigrationRecord(
      projectMigration.preserveExactBackup(captured.raw, {
        timestamp,
        version,
      }),
      ["status", "error"],
    );
    if (backup?.status !== "verified" || Object.keys(backup).length !== 1)
      return failed(migrationError(backup?.error, "backup_write_failed"));

    stage = "settings_verify";
    if (!verifySettings()) return failed(settingsVerificationError);
    stage = "canonical_root_commit";
    const committed = projectMigration.commitMigratedRoot(
      captured.raw,
      prepared.value,
    );
    if (receiptField(committed, "status") !== "committed") {
      if (receiptField(committed, "status") === "verification_failed") {
        stage = "canonical_root_verify";
        return failed(
          receiptField(receiptField(committed, "verification"), "reason") ===
            "read_failed"
            ? "storage_read_failed"
            : "verification_failed",
        );
      }
      return failed(
        migrationError(
          receiptField(committed, "error"),
          "storage_write_failed",
        ),
      );
    }

    stage = "canonical_root_verify";
    const verification = materializeStorageMigrationRecord(
      receiptField(committed, "verification"),
      ["status"],
    );
    if (verification?.status !== "verified")
      return failed("verification_failed");
    const readback = materializeStorageMigrationRecord(
      projectMigration.inspectRaw(),
      ["status", "raw", "error", "category"],
    );
    if (readback?.status === "read_failed")
      return failed("storage_read_failed");
    if (readback?.status !== "read" || readback.raw !== prepared.json)
      return failed("verification_failed");
    if (!verifySettings()) return failed(settingsVerificationError);
    return {
      status: "complete",
      settingsVerified: true,
      source,
      exactPriorRootBackedUp: true,
      rootLayout: "settings-free",
    };
  } catch {
    return failed(
      stage === "settings_read" || stage === "legacy_root_decode"
        ? "storage_read_failed"
        : "verification_failed",
    );
  }
}

/**
 * Read-only diagnostic preparation, never a production startup authorization.
 * The caller is trusted composition/test
 * code and must supply the actual receipt captured from the existing owner's
 * settings replacement. Receipt validation checks shape, not provenance.
 * Current bytes and a fresh strict readback are checked again; no historical
 * receipt or structurally valid record alone establishes verification.
 *
 * This result never authorizes owner readiness, including its absent arm.
 * It cannot execute, acknowledge, or resume a root/settings/backup write.
 * @param {{settingsInspection: import('../../types/storage-contracts.js').SettingsMigrationInspectionPort, projectInspection: import('../../types/storage-contracts.js').ProjectMigrationInspectionPort, settingsWriteResult?: unknown}} options
 * @returns {Preflight}
 */
export function preflightStorageSchemaMigration({
  settingsInspection,
  projectInspection,
  settingsWriteResult,
}) {
  /**
   * @param {import('../../types/storage-migration-contracts.js').StorageMigrationStage} stage
   * @param {import('../../types/storage-migration-contracts.js').StorageMigrationErrorCode} error
   * @param {boolean} [settingsVerified]
   * @returns {Preflight}
   */
  function failed(stage, error, settingsVerified = false) {
    return {
      mode: "preflight",
      schemaComplete: false,
      receipt: { status: "failed", settingsVerified, stage, error },
    };
  }

  const written = materializeSettingsWriteResult(settingsWriteResult);
  if (settingsWriteResult !== undefined && !written)
    return failed("settings_verify", "verification_failed");
  if (written?.status === "write_failed" || written?.status === "rejected")
    return failed("settings_write", written.error);
  if (written?.status === "verification_failed")
    return failed("settings_verify", "verification_failed");

  let standalone;
  try {
    standalone = materializeStorageMigrationRecord(
      settingsInspection.inspectRaw(),
      ["status", "raw", "error", "category"],
    );
  } catch {
    return failed("settings_read", "storage_read_failed");
  }
  if (standalone?.status === "read_failed")
    return failed("settings_read", "storage_read_failed");
  if (
    !standalone ||
    standalone.status !== "read" ||
    Object.keys(standalone).length !== 2 ||
    (standalone.raw !== null && typeof standalone.raw !== "string")
  )
    return failed("settings_read", "invalid_data");

  if (!written) return failed("settings_verify", "verification_failed");
  const candidate = prepareSettingsRepositoryValue(written.value);
  if (!candidate.success || candidate.json !== standalone.raw)
    return failed("settings_verify", "verification_failed");
  try {
    const verified = materializeStorageMigrationRecord(
      settingsInspection.verify(candidate.value),
      ["status"],
    );
    if (verified?.status !== "verified")
      return failed("settings_verify", "verification_failed");
  } catch {
    return failed("settings_verify", "verification_failed");
  }

  let root;
  try {
    root = materializeStorageMigrationRecord(projectInspection.inspectRaw(), [
      "status",
      "raw",
      "error",
      "category",
    ]);
  } catch {
    return failed("legacy_root_decode", "storage_read_failed", true);
  }
  if (root?.status === "read_failed")
    return failed("legacy_root_decode", "storage_read_failed", true);
  if (
    !root ||
    root.status !== "read" ||
    Object.keys(root).length !== 2 ||
    (root.raw !== null && typeof root.raw !== "string")
  )
    return failed("legacy_root_decode", "invalid_data", true);
  return {
    mode: "preflight",
    schemaComplete: false,
    receipt: rootRequiresRewrite(root.raw)
      ? {
          status: "pending",
          settingsVerified: true,
          stage: "legacy_root_backup",
        }
      : { status: "absent", settingsVerified: true },
  };
}
