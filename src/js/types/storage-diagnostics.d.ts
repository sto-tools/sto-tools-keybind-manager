import type { EmbeddedSettingsMigrationReceipt } from "./storage-migration-contracts.js";

export type StorageDiagnosticDomain =
  | "project"
  | "settings"
  | "presentation"
  | "key-browser"
  | "welcome"
  | "diagnostic"
  | "sync-capability";

export type StorageDiagnosticOperation =
  | "load"
  | "commit"
  | "reset"
  | "replace"
  | "clear"
  | "replaceCategory"
  | "replaceGroup"
  | "replaceMode"
  | "replaceBindset"
  | "isCategoryCollapsed"
  | "isBindsetCollapsed"
  | "loadExact"
  | "markVisited"
  | "compensate"
  | "isEnabled"
  | "getSyncDirectoryState"
  | "beginSyncDirectoryTransition"
  | "completeSyncDirectoryTransition"
  | "restoreSyncDirectoryState"
  | "restore"
  | "activation"
  | "folder-selection";

export type StorageDiagnosticStatus =
  | "current"
  | "repair_required"
  | "read_failed"
  | "committed"
  | "rejected"
  | "write_failed"
  | "verification_failed"
  | "sentinel_failed"
  | "reset"
  | "reset_failed"
  | "cleared"
  | "clear_failed"
  | "acknowledged"
  | "skipped"
  | "failed"
  | "complete"
  | "pending"
  | "not_attempted"
  | "not_requested"
  | "verified"
  | "indeterminate"
  | "preparation_failed"
  | "changed"
  | "succeeded"
  | "invalid_observation";

export type StorageDiagnosticError =
  | "invalid_json"
  | "invalid_data"
  | "serialization_failed"
  | "storage_read_failed"
  | "storage_write_failed"
  | "backup_write_failed"
  | "verification_failed"
  | "operation_cancelled"
  | "reset_sentinel_consumption_failed"
  | "reset_sentinel_changed"
  | "preferences_activation_failed"
  | "invalid_project_file"
  | "invalid_project_activation"
  | "sync_folder_load_failed"
  | "sync_folder_transition_incomplete"
  | "sync_folder_capability_invalid"
  | "unknown";

export type StorageDiagnosticLayout =
  | "not-observed"
  | "settings-free"
  | "standalone-settings"
  | "repair-required"
  | "missing"
  | "invalid"
  | "scalar-namespace"
  | "capability-present"
  | "transition-pending"
  | "transition-clean";

export type StorageDiagnosticReason =
  | "missing"
  | "invalid_json"
  | "invalid_data"
  | "legacy"
  | "repaired"
  | "reset_pending"
  | "read_failed"
  | "value_mismatch"
  | "already_current";

export type StorageDiagnosticStageName =
  | "backup"
  | "rootWrite"
  | "verification"
  | "resetSentinel"
  | "rootRemoval"
  | "backupRemoval"
  | "sentinelWrite"
  | "write"
  | "removal"
  | "rootClear"
  | "backupClear"
  | "settingsClear"
  | "settingsDefaults"
  | "dataOwnerAdoption"
  | "preferencesOwnerAdoption"
  | "validation"
  | "settings"
  | "project"
  | "preferencesActivation"
  | "dataActivation";

export interface StorageDiagnosticStage {
  readonly stage: StorageDiagnosticStageName;
  readonly status: StorageDiagnosticStatus;
  readonly committed: boolean | "indeterminate" | null;
  readonly error: StorageDiagnosticError | null;
  readonly category: "quota" | "security" | "unknown" | null;
}

export interface StorageDiagnosticObservation {
  readonly operation: StorageDiagnosticOperation;
  readonly status: StorageDiagnosticStatus;
  readonly error: StorageDiagnosticError | null;
  readonly category: "quota" | "security" | "unknown" | null;
  readonly committed: boolean | "indeterminate" | null;
  readonly reason: StorageDiagnosticReason | null;
  readonly stages: readonly StorageDiagnosticStage[];
}

export interface StorageDiagnosticRow {
  readonly domain: StorageDiagnosticDomain;
  readonly owner: string;
  readonly port: string;
  readonly adapter: string;
  /** Composition registered this narrow port; does not assert owner readiness. */
  readonly portRegistered: boolean;
  readonly structuralLayout: StorageDiagnosticLayout;
  readonly lastOperation: StorageDiagnosticObservation | null;
  readonly lastMigration: Readonly<EmbeddedSettingsMigrationReceipt> | null;
}

export interface StorageRuntimeDiagnosticSnapshot {
  readonly domains: readonly StorageDiagnosticRow[];
}

export type StorageDiagnosticSnapshot = StorageRuntimeDiagnosticSnapshot;

export type StorageRuntimeDiagnosticsProvider =
  () => StorageRuntimeDiagnosticSnapshot;
