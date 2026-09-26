import { materializeSettingsWriteResult } from "../services/preferencesRepositoryBoundary.js";
import {
  isDataRecord,
  MAX_PROJECT_JSON_BYTES,
} from "../services/jsonDataBoundary.js";
import { decodeStoredApplicationJson } from "../services/storedApplicationDataBoundary.js";
import { prepareSettingsRepositoryValue } from "./settingsRepositoryBoundary.js";
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
    // The current boundary adds legacy defaults when settings is absent.
    // Discard only that synthetic field for comparison; never inspect an
    // embedded value. Tranche 9 will install the settings-free boundary.
    const decoded = decodeStoredApplicationJson(raw, {
      version: typeof parsed.version === "string" ? parsed.version : "",
      defaults: {
        version: "",
        lastModified: "",
        profiles: {},
        currentProfile: null,
        settings: {},
      },
    });
    if (!decoded.success) return true;
    /** @type {Record<string, unknown>} */
    const observed = { ...decoded.value };
    delete observed.settings;
    return JSON.stringify(observed) !== JSON.stringify(parsed);
  } catch {
    return true;
  }
}

/**
 * Read-only preparation, deliberately uninstalled in production until the
 * later layout-activation tranche. The caller is trusted composition/test
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
