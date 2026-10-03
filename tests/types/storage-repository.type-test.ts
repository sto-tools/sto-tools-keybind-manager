import type { ProjectRepositoryPort } from "../../src/js/components/storage/ProjectRepository.js";
import type { SettingsRepositoryPort } from "../../src/js/components/storage/SettingsRepository.js";
import type {
  CanonicalSettings,
  StoredApplicationData,
} from "../../src/js/types/data-contracts.js";
import type {
  ProjectCommitResult,
  ProjectWriteOptions,
  SettingsWriteResult,
  ProjectSchemaMigrationPort,
} from "../../src/js/types/storage-contracts.js";

declare const project: ProjectRepositoryPort;
declare const settings: SettingsRepositoryPort;
declare const root: StoredApplicationData;
declare const canonical: CanonicalSettings;
declare const migration: ProjectSchemaMigrationPort;

project.commit(root);
project.commit(root, {
  verification: "required",
  consumeResetSentinel: "false",
});
project.reset();
project.commit(root, { verification: "required", purpose: "startup_recovery" });
migration.preserveExactBackup("captured bytes", {
  timestamp: "captured",
  version: "2.0.0",
});
migration.commitMigratedRoot("captured bytes", root);
// @ts-expect-error Migration factories are not part of the owner port.
project.createSchemaMigrationPort();
// @ts-expect-error Privileged mutations are not owner capabilities.
project.preserveExactBackup("captured bytes", {
  timestamp: "captured",
  version: "2.0.0",
});
// @ts-expect-error Migration preservation is not an arbitrary option.
project.commit(root, { purpose: "preserve_backup" });
// @ts-expect-error Startup recovery requires explicit verified durability.
project.commit(root, { purpose: "startup_recovery" });
settings.replace(canonical);
settings.clear();

// @ts-expect-error A repository is not a profile domain owner.
project.saveProfile("captain", {});
// @ts-expect-error Repositories have no generic key-value capability.
settings.setItem("sto_keybind_manager", "{}");
// @ts-expect-error Partial settings cannot replace the complete canonical record.
settings.replace({ theme: "dark" });
// @ts-expect-error Structural migration authority is not on the ordinary port.
project.commit(root, { preserveBackup: true });
// @ts-expect-error Sentinel removal requires explicit verification.
project.commit(root, { consumeResetSentinel: "true" });
// @ts-expect-error Explicitly unverified writes cannot consume the sentinel.
const unverified: ProjectWriteOptions = {
  verification: "not_requested",
  consumeResetSentinel: "true",
};
void unverified;

const projectLoad = project.load();
if (projectLoad.status === "read_failed") {
  projectLoad.category satisfies "quota" | "security" | "unknown";
  // @ts-expect-error A read failure has no adoptable default snapshot.
  projectLoad.value;
} else {
  projectLoad.value satisfies StoredApplicationData;
}

const settingsLoad = settings.load();
if (settingsLoad.status !== "read_failed") {
  settingsLoad.value satisfies CanonicalSettings;
  settingsLoad.value.autoSave satisfies boolean;
}

declare const projectCommit: ProjectCommitResult;
if (projectCommit.status === "verification_failed") {
  projectCommit.rootWrite.status satisfies "acknowledged";
  projectCommit.verification.status satisfies "failed";
  projectCommit.resetSentinel.status satisfies "not_attempted";
  // @ts-expect-error A failed verification cannot claim an accepted snapshot.
  projectCommit.value;
}
if (projectCommit.status === "sentinel_failed") {
  projectCommit.rootWrite.status satisfies "acknowledged" | "skipped";
  projectCommit.verification.status satisfies "verified";
}
if (
  projectCommit.status === "committed" &&
  projectCommit.rootWrite.status === "skipped"
) {
  projectCommit.rootWrite.reason satisfies "already_current";
}
const badSkippedRoot: Extract<
  ProjectCommitResult,
  { status: "committed" }
>["rootWrite"] = {
  status: "skipped",
  // @ts-expect-error A skipped verified root has only the exact current-root reason.
  reason: "unknown",
};
void badSkippedRoot;
if (projectCommit.status === "rejected") {
  projectCommit.rootWrite.status satisfies "not_attempted";
  projectCommit.backup.status satisfies "not_attempted";
}
if (projectCommit.status === "committed") {
  projectCommit.value satisfies StoredApplicationData;
  // @ts-expect-error Acknowledged success cannot be indeterminate.
  projectCommit.rootWrite.status satisfies "indeterminate";
}

declare const settingsWrite: SettingsWriteResult;
if (settingsWrite.status === "committed") {
  settingsWrite.value satisfies CanonicalSettings;
  settingsWrite.verification.status satisfies "verified";
}
if (settingsWrite.status === "write_failed") {
  settingsWrite.write.status satisfies "indeterminate";
  settingsWrite.verification.status satisfies "not_attempted";
}
// @ts-expect-error An acknowledged write cannot inhabit the throwing-write arm.
const contradictory: SettingsWriteResult = {
  status: "write_failed",
  error: "storage_write_failed",
  write: { status: "acknowledged" },
  verification: { status: "not_attempted" },
};
void contradictory;

// Imported project split completion is private owner wiring, not an RPC payload.
declare const ordinaryImport: import("../../src/js/types/storage-contracts.js").ImportedProjectOwnerAction;
declare const completedImport: import("../../src/js/types/storage-contracts.js").ImportedProjectOwnerCompletionAction;
declare const importedOwnerResult: import("../../src/js/types/storage-contracts.js").ImportedProjectOwnerResult;
completedImport({}).then((completion) => {
  completion.result satisfies import("../../src/js/types/storage-contracts.js").ImportedProjectOwnerResult;
  completion.settlement satisfies Promise<void>;
});
// @ts-expect-error Ordinary listener-settled owner replies cannot enter a leased completion slot.
const missingCompletionCapability: typeof completedImport = ordinaryImport;
// @ts-expect-error A completion must carry its independently awaited settlement.
const missingSettlement: import("../../src/js/types/storage-contracts.js").OwnerActionCompletion<
  typeof importedOwnerResult
> = { result: importedOwnerResult };
const invalidSettlement: import("../../src/js/types/storage-contracts.js").OwnerActionCompletion<
  typeof importedOwnerResult
> = {
  result: importedOwnerResult,
  // @ts-expect-error Settlement is asynchronous completion, not a boolean acknowledgement.
  settlement: true,
};
void missingCompletionCapability;
void missingSettlement;
void invalidSettlement;
declare const publicProjectImport: import("../../src/js/types/rpc/import-export.js").ProjectImportResult;
// @ts-expect-error Private listener completion is not a public import reply field.
publicProjectImport.settlement;
declare const publicProjectRestore: import("../../src/js/types/rpc/application.js").ProjectRestoreResult;
// @ts-expect-error Private listener completion is not a public restore reply field.
publicProjectRestore.settlement;

// Reset checkpoints are opaque internal identities, never caller receipts.
declare const projectResetCheckpoint: import("../../src/js/types/storage-contracts.js").ProjectResetCheckpoint;
declare const applicationResetCheckpoint: import("../../src/js/types/storage-contracts.js").ApplicationResetCheckpoint;
project.reset(projectResetCheckpoint);
// @ts-expect-error Empty caller objects are not repository reset identities.
project.reset({});
project.reset({
  // @ts-expect-error A claimed durable receipt cannot forge a reset identity.
  rootRemoval: { status: "acknowledged" },
  backupRemoval: { status: "acknowledged" },
  sentinelWrite: { status: "acknowledged" },
});
// @ts-expect-error Empty caller objects are not application reset identities.
const forgedApplicationReset: typeof applicationResetCheckpoint = {};
// @ts-expect-error A repository token cannot enter the application saga slot.
const wrongResetDomain: typeof applicationResetCheckpoint =
  projectResetCheckpoint;
void forgedApplicationReset;
void wrongResetDomain;
// @ts-expect-error Later stages cannot be acknowledged before root removal is attempted.
const unorderedReset: import("../../src/js/types/storage-contracts.js").ProjectResetResult =
  {
    status: "reset_failed",
    rootRemoval: { status: "not_attempted" },
    backupRemoval: { status: "acknowledged" },
    sentinelWrite: { status: "not_attempted" },
  };
// @ts-expect-error An all-complete failed reset requires explicit retry verification/read failure.
const unexplainedCompletedReset: import("../../src/js/types/storage-contracts.js").ProjectResetResult =
  {
    status: "reset_failed",
    rootRemoval: { status: "acknowledged" },
    backupRemoval: { status: "acknowledged" },
    sentinelWrite: { status: "verified" },
  };
void unorderedReset;
void unexplainedCompletedReset;
