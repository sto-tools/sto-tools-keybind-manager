import type {
  ArtifactCaptureResult,
  ArtifactProjectProjection,
  CanonicalSettings,
  StoredApplicationData,
} from "./data-contracts.js";

export interface OwnerReadLease<Value = unknown> {
  readonly authorityEpoch: number;
  readonly revision: number;
  readonly value: Value;
  release(): void;
}

export interface ArtifactCapturePort {
  capture(): Promise<ArtifactCaptureResult>;
}

export interface CurrentProjectArtifactSerialization {
  artifact: string;
  capture: ArtifactCaptureResult;
  exported: string;
}

export interface CurrentProjectArtifactSerializerPort {
  serialize(): Promise<CurrentProjectArtifactSerialization>;
}

export type CurrentProjectArtifactSerializer =
  CurrentProjectArtifactSerializerPort;

export type ProjectOwnerReadLease = OwnerReadLease<ArtifactProjectProjection>;
export type PreferencesOwnerReadLease = OwnerReadLease<CanonicalSettings>;

/** Adapter construction capability only; never the port injected into owners. */
export type RepositoryStorageCapability = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export type StorageFailureCategory = "quota" | "security" | "unknown";
export type NotAttempted = { status: "not_attempted" };
export type Acknowledged = { status: "acknowledged" };
export type IndeterminateWrite = {
  status: "indeterminate";
  error: "storage_write_failed";
  category: StorageFailureCategory;
};
export type ReadFailure = {
  status: "read_failed";
  error: "storage_read_failed";
  category: StorageFailureCategory;
};
export type VerificationAccepted =
  | { status: "not_requested" }
  | { status: "verified" };
export type VerificationFailure = {
  status: "failed";
  error: "verification_failed";
  reason: "read_failed" | "value_mismatch" | "invalid_data";
};
export type RepositoryInputError = "invalid_data" | "serialization_failed";
export type RepairReason =
  | "missing"
  | "invalid_json"
  | "invalid_data"
  | "legacy"
  | "repaired";

export type ResetRecovery =
  | { status: "not_applicable" }
  | { status: "pending_consumption"; expectedValue: string };

export type ProjectLoadResult =
  | { status: "current"; value: StoredApplicationData }
  | {
      status: "repair_required";
      value: StoredApplicationData;
      reason: RepairReason;
      resetSentinel: ResetRecovery;
    }
  | ReadFailure;

/** Sentinel consumption always requires successful root verification first. */
export type ProjectWriteOptions =
  | { verification?: "not_requested"; consumeResetSentinel?: never }
  | { verification: "required"; consumeResetSentinel?: string };

export type BackupReceipt =
  | NotAttempted
  | { status: "skipped"; reason: "missing" }
  | Acknowledged
  | ReadFailure
  | { status: "preparation_failed"; error: RepositoryInputError }
  | {
      status: "indeterminate";
      error: "backup_write_failed";
      category: StorageFailureCategory;
    };

export type SentinelAccepted = { status: "not_requested" } | Acknowledged;
export type SentinelFailure =
  | ReadFailure
  | { status: "changed"; error: "reset_sentinel_changed" }
  | IndeterminateWrite;

export type ProjectCommitResult =
  | {
      status: "committed";
      value: StoredApplicationData;
      backup: BackupReceipt;
      rootWrite: Acknowledged;
      verification: VerificationAccepted;
      resetSentinel: SentinelAccepted;
    }
  | {
      status: "rejected";
      error: RepositoryInputError;
      backup: NotAttempted;
      rootWrite: NotAttempted;
      verification: NotAttempted;
      resetSentinel: NotAttempted;
    }
  | {
      status: "write_failed";
      error: "storage_write_failed";
      backup: BackupReceipt;
      rootWrite: IndeterminateWrite;
      verification: NotAttempted;
      resetSentinel: NotAttempted;
    }
  | {
      status: "verification_failed";
      error: "verification_failed";
      backup: BackupReceipt;
      rootWrite: Acknowledged;
      verification: VerificationFailure;
      resetSentinel: NotAttempted;
    }
  | {
      status: "sentinel_failed";
      error: "reset_sentinel_consumption_failed";
      backup: BackupReceipt;
      rootWrite: Acknowledged;
      verification: { status: "verified" };
      resetSentinel: SentinelFailure;
    };

export type ProjectResetResult =
  | {
      status: "reset";
      rootRemoval: Acknowledged;
      backupRemoval: Acknowledged;
      sentinelWrite: Acknowledged;
    }
  | {
      status: "reset_failed";
      rootRemoval: IndeterminateWrite;
      backupRemoval: NotAttempted;
      sentinelWrite: NotAttempted;
    }
  | {
      status: "reset_failed";
      rootRemoval: Acknowledged;
      backupRemoval: IndeterminateWrite;
      sentinelWrite: NotAttempted;
    }
  | {
      status: "reset_failed";
      rootRemoval: Acknowledged;
      backupRemoval: Acknowledged;
      sentinelWrite: IndeterminateWrite;
    };

export type SettingsLoadResult =
  | { status: "current"; value: CanonicalSettings }
  | {
      status: "repair_required";
      value: CanonicalSettings;
      reason: Exclude<RepairReason, "legacy">;
    }
  | ReadFailure;

/** Replacement always verifies the complete standalone record. */
export type SettingsWriteResult =
  | {
      status: "committed";
      value: CanonicalSettings;
      write: Acknowledged;
      verification: { status: "verified" };
    }
  | {
      status: "rejected";
      error: RepositoryInputError;
      write: NotAttempted;
      verification: NotAttempted;
    }
  | {
      status: "write_failed";
      error: "storage_write_failed";
      write: IndeterminateWrite;
      verification: NotAttempted;
    }
  | {
      status: "verification_failed";
      error: "verification_failed";
      write: Acknowledged;
      verification: VerificationFailure;
    };

export type SettingsClearResult =
  | { status: "cleared"; removal: Acknowledged }
  | { status: "clear_failed"; removal: IndeterminateWrite };

/** Exact raw evidence for read-only migration preflight, never owner state. */
export type RepositoryRawInspectionResult =
  | { status: "read"; raw: string | null }
  | ReadFailure;

/** Current readback equality only; does not assert that a write occurred. */
export type SettingsVerificationResult =
  | { status: "verified" }
  | VerificationFailure;

/** Separate least-authority view; no root, backup, or sentinel mutations. */
export interface ProjectMigrationInspectionPort {
  inspectRaw(): RepositoryRawInspectionResult;
}

/** Separate read-only view; verified-write evidence remains the caller's duty. */
export interface SettingsMigrationInspectionPort {
  inspectRaw(): RepositoryRawInspectionResult;
  verify(expected: unknown): SettingsVerificationResult;
}

export interface ProjectRepositoryPort {
  load(): ProjectLoadResult;
  commit(
    root: StoredApplicationData,
    options?: ProjectWriteOptions,
  ): ProjectCommitResult;
  reset(): ProjectResetResult;
}

export interface SettingsRepositoryPort {
  load(): SettingsLoadResult;
  replace(settings: CanonicalSettings): SettingsWriteResult;
  clear(): SettingsClearResult;
}
