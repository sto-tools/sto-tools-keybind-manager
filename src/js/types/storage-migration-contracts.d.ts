/** Closed metadata only: migration receipts never contain persisted user data. */
export type StorageMigrationErrorCode =
  | "invalid_json"
  | "invalid_data"
  | "serialization_failed"
  | "storage_read_failed"
  | "storage_write_failed"
  | "backup_write_failed"
  | "verification_failed"
  | "operation_cancelled";

export type StorageMigrationStage =
  | "settings_read"
  | "settings_write"
  | "settings_verify"
  | "legacy_root_decode"
  | "legacy_root_backup"
  | "canonical_root_commit"
  | "canonical_root_verify";

export type EmbeddedSettingsMigrationReceipt =
  | { status: "absent"; settingsVerified: true }
  | {
      status: "complete";
      settingsVerified: true;
      source: "legacy" | "recovered_invalid" | "missing";
      exactPriorRootBackedUp: boolean;
      rootLayout: "settings-free";
    }
  | {
      status: "pending";
      settingsVerified: true;
      stage: "legacy_root_backup" | "canonical_root_commit";
    }
  | {
      status: "failed";
      settingsVerified: boolean;
      stage: StorageMigrationStage;
      error: StorageMigrationErrorCode;
    };

/** A diagnostic observation, never a startup authorization or migration run. */
export interface StorageSchemaMigrationPreflight {
  mode: "preflight";
  schemaComplete: false;
  receipt: Exclude<EmbeddedSettingsMigrationReceipt, { status: "complete" }>;
}
