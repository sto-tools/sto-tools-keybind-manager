import { storageFailureCategory } from "./repositoryResults.js";
import { projectResetCheckpointState } from "../../core/projectResetCheckpoint.js";

const KEYS = [
  "sto_keybind_manager",
  "sto_keybind_manager_backup",
  "sto_app_reset",
];
const FIELDS = ["rootRemoval", "backupRemoval", "sentinelWrite"];
const STAGES = ["rootClear", "backupClear", "resetSentinel"];
const TARGETS = [null, null, "true"];

/**
 * Fixed-key ordered reset with an optional private resumable checkpoint.
 * Fresh reads prove every completed stage before any retry writes. A throwing
 * write remains indeterminate; a subsequent target read is reported as verified,
 * never retroactively as a write acknowledgement.
 * @param {import('../../types/storage-contracts.js').RepositoryStorageCapability} storage
 * @param {import('../../types/storage-contracts.js').ProjectResetCheckpoint} [checkpoint]
 * @returns {import('../../types/storage-contracts.js').ProjectResetResult}
 */
export function resetProjectRepository(storage, checkpoint) {
  const retained = projectResetCheckpointState(checkpoint);
  const state = retained ?? {
    values: null,
    steps:
      /** @type {import('../../core/projectResetCheckpoint.js').Step[]} */ (
        [0, 1, 2].map(() => ({ status: "not_attempted" }))
      ),
  };
  /** @param {boolean} success @param {number} [index] @param {'storage_read_failed' | 'verification_failed'} [error] */
  const result = (success, index = 0, error) =>
    /** @type {import('../../types/storage-contracts.js').ProjectResetResult} */ ({
      status: success ? "reset" : "reset_failed",
      ...Object.fromEntries(
        FIELDS.map((field, i) => [field, { ...state.steps[i] }]),
      ),
      ...(error ? { error, stage: STAGES[index] } : {}),
    });

  if (retained) {
    let actual;
    try {
      actual = KEYS.map((key) => storage.getItem(key));
    } catch {
      return result(false, 0, "storage_read_failed");
    }
    if (!state.values) state.values = actual;
    for (let index = 0; index < KEYS.length; index++) {
      const step = state.steps[index];
      const completed =
        step.status === "acknowledged" || step.status === "verified";
      const expected = completed ? TARGETS[index] : state.values[index];
      if (step.status === "indeterminate" && actual[index] === TARGETS[index]) {
        state.steps[index] = { status: "verified" };
        continue;
      }
      if (actual[index] !== expected) {
        return result(false, index, "verification_failed");
      }
    }
  }

  for (let index = 0; index < KEYS.length; index++) {
    const step = state.steps[index];
    if (step.status === "acknowledged" || step.status === "verified") continue;
    try {
      if (index === 2) storage.setItem("sto_app_reset", "true");
      else if (index === 0) storage.removeItem("sto_keybind_manager");
      else storage.removeItem("sto_keybind_manager_backup");
      state.steps[index] = { status: "acknowledged" };
    } catch (error) {
      state.steps[index] = {
        status: "indeterminate",
        error: "storage_write_failed",
        category: storageFailureCategory(error),
      };
      return result(false);
    }
  }
  return result(true);
}
