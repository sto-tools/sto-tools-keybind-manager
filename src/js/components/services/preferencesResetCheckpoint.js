import { materializeSettingsLoadResult } from "./preferencesRepositoryBoundary.js";

/**
 * Verify the actual standalone record without rewriting acknowledged stages.
 * A verified defaults write subsumes the prior settings-clear absence check.
 * @param {import('./PreferencesService.js').default} owner
 * @param {import('./applicationResetCheckpoint.js').PreferencesCheckpoint} checkpoint
 * @returns {import('../../types/data-contracts.js').CanonicalSettings | null}
 */
export function verifyPreferencesResetCheckpoint(owner, checkpoint) {
  let loaded;
  try {
    loaded = materializeSettingsLoadResult(owner.settingsRepository?.load());
  } catch {
    throw new Error("storage_read_failed");
  }
  if (!loaded || loaded.status === "read_failed")
    throw new Error("storage_read_failed");
  const missing =
    loaded.status === "repair_required" && loaded.reason === "missing";
  const json = missing ? null : JSON.stringify(loaded.value);
  const receipt = checkpoint.receipt;
  if (checkpoint.priorJson === undefined) checkpoint.priorJson = json;
  if (receipt.settingsDefaults.status === "complete") {
    if (loaded.status !== "current" || json !== checkpoint.defaultsJson)
      throw new Error("verification_failed");
    return loaded.value;
  }
  if (
    receipt.settingsDefaults.committed === "indeterminate" &&
    loaded.status === "current" &&
    json === checkpoint.defaultsJson
  ) {
    receipt.settingsDefaults = {
      ...receipt.settingsDefaults,
      status: "complete",
      committed: true,
      verification: { status: "verified" },
    };
    return loaded.value;
  }
  if (receipt.settingsClear.status === "complete") {
    if (!missing) throw new Error("verification_failed");
  } else if (receipt.settingsClear.committed === "indeterminate" && missing) {
    receipt.settingsClear = {
      ...receipt.settingsClear,
      status: "complete",
      committed: true,
      verification: { status: "verified" },
    };
  } else if (json !== checkpoint.priorJson) {
    throw new Error("verification_failed");
  }
  return null;
}
