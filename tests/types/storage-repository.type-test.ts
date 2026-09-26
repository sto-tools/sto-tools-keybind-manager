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
} from "../../src/js/types/storage-contracts.js";

declare const project: ProjectRepositoryPort;
declare const settings: SettingsRepositoryPort;
declare const root: StoredApplicationData;
declare const canonical: CanonicalSettings;

project.commit(root);
project.commit(root, {
  verification: "required",
  consumeResetSentinel: "false",
});
project.reset();
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
  projectCommit.rootWrite.status satisfies "acknowledged";
  projectCommit.verification.status satisfies "verified";
}
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
