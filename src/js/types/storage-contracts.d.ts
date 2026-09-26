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

export type DurableStageStatus = "complete" | "pending" | "skipped" | "failed";

export type StorageWorkflowErrorCode =
  | "invalid_data"
  | "storage_write_failed"
  | "verification_failed"
  | "preferences_activation_failed"
  | "operation_cancelled";

export interface DurableStageReceipt {
  status: DurableStageStatus;
  committed: boolean | "indeterminate";
  fingerprint?: string;
  error?: StorageWorkflowErrorCode;
  /** Owner-specific repository evidence retained behind the typed stage core. */
  [detail: string]: unknown;
}

export interface ApplicationProjectResetPersistenceReceipt {
  rootClear: DurableStageReceipt;
  backupClear: DurableStageReceipt;
  resetSentinel: DurableStageReceipt;
}

export interface ApplicationDataResetAdoptionReceipt {
  dataOwnerAdoption: DurableStageReceipt;
}

export type ApplicationProjectResetReceipt =
  ApplicationProjectResetPersistenceReceipt &
    ApplicationDataResetAdoptionReceipt;

export interface ApplicationPreferencesResetReceipt {
  settingsClear: DurableStageReceipt;
  settingsDefaults: DurableStageReceipt;
  preferencesOwnerAdoption: DurableStageReceipt;
}

export type ApplicationProjectResetPersistenceResult =
  | {
      success: true;
      receipt: ApplicationProjectResetPersistenceReceipt;
    }
  | {
      success: false;
      error: "storage_write_failed" | "operation_cancelled";
      stage: "rootClear" | "backupClear" | "resetSentinel";
      durable: false | "indeterminate" | true;
      params: { reason: string };
      receipt: ApplicationProjectResetPersistenceReceipt;
    };

export type ApplicationDataResetAdoptionResult =
  | {
      success: true;
      currentProfile: null;
      receipt: ApplicationDataResetAdoptionReceipt;
    }
  | {
      success: false;
      error: "operation_cancelled";
      stage: "dataOwnerAdoption";
      durable: true;
      params: { reason: string };
      receipt: ApplicationDataResetAdoptionReceipt;
    };

export type ApplicationPreferencesResetResult =
  | {
      success: true;
      changed: boolean;
      revision: number;
      effects: "applied" | "degraded";
      receipt: ApplicationPreferencesResetReceipt;
    }
  | {
      success: false;
      error:
        | "storage_write_failed"
        | "verification_failed"
        | "preferences_activation_failed"
        | "operation_cancelled";
      stage: "settingsClear" | "settingsDefaults" | "preferencesOwnerAdoption";
      durable: false | "indeterminate" | true;
      params: { reason: string };
      receipt: ApplicationPreferencesResetReceipt;
    };

export interface OwnerActionCompletion<Result> {
  result: Result;
  settlement: Promise<void>;
}

export type ApplicationProjectResetPersistenceAction =
  () => Promise<ApplicationProjectResetPersistenceResult>;

export type ApplicationDataResetAdoptionAction =
  () => Promise<ApplicationDataResetAdoptionResult>;

export type ApplicationPreferencesResetAction = () => Promise<
  OwnerActionCompletion<ApplicationPreferencesResetResult>
>;

export interface ApplicationDataResetCapabilities {
  resetProjectPersistence: ApplicationProjectResetPersistenceAction;
  adoptEmptyProject: ApplicationDataResetAdoptionAction;
  assertActive: () => void;
}

export type ApplicationDataResetTransitionRunner = <Result>(
  operation: (
    capabilities: ApplicationDataResetCapabilities,
  ) => Result | Promise<Result>,
) => Promise<OwnerActionCompletion<Result>>;

export type ApplicationPreferencesResetTransitionRunner = <Result>(
  operation: (capabilities: {
    resetPreferences: ApplicationPreferencesResetAction;
    assertActive: () => void;
  }) => Result | Promise<Result>,
) => Promise<Result>;

export interface ProjectRestoreReceipt {
  validation: DurableStageReceipt;
  settings: DurableStageReceipt;
  project: DurableStageReceipt;
  preferencesActivation: DurableStageReceipt;
  dataActivation: DurableStageReceipt;
}

export type ImportedProjectOwnerResult =
  | {
      success: true;
      currentProfile: string | null;
      importedProfiles: number;
      receipt: ProjectRestoreReceipt;
      activationMaterial: {
        project: ArtifactProjectProjection;
        settings?: CanonicalSettings;
      };
    }
  | {
      success: false;
      error: "invalid_project_file";
      params: { path: string };
      durable: false;
      receipt: ProjectRestoreReceipt;
    }
  | {
      success: false;
      error: "storage_write_failed" | "operation_cancelled";
      stage: "settings" | "project" | "dataActivation";
      durable: false | "indeterminate" | true;
      receipt: ProjectRestoreReceipt;
      activationMaterial?: {
        project: ArtifactProjectProjection;
        settings?: CanonicalSettings;
      };
    };

export interface ImportedProjectOwnerActionOptions {
  persistImportedSettings?: (patch: unknown) => Promise<SettingsWriteResult>;
}

export type ImportedProjectOwnerAction = (
  projectData: unknown,
  options?: ImportedProjectOwnerActionOptions,
) => Promise<ImportedProjectOwnerResult>;

export type ImportedProjectActivationResult =
  | {
      success: true;
      currentProfile: string | null;
      receipt: DurableStageReceipt;
    }
  | {
      success: false;
      error: "invalid_project_activation" | "operation_cancelled";
      retryable: true;
      receipt: DurableStageReceipt;
    };

export type ImportedProjectActivationAction = (
  project: unknown,
  options: { fingerprint: string },
) => Promise<ImportedProjectActivationResult>;

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
  | "repaired"
  | "reset_pending";

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
