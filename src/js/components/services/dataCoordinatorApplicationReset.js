import {
  enqueueDataCoordinatorMutationWithSettlement,
  recordDataCoordinatorPublication,
} from "./dataCoordinatorMutationQueue.js";
import { durableStage } from "./storageWorkflowReceipt.js";

const pending = () => durableStage("pending", false);

function persistenceReceipt() {
  return {
    rootClear: pending(),
    backupClear: pending(),
    resetSentinel: pending(),
  };
}

const adoptionReceipt = () => ({ dataOwnerAdoption: pending() });

/**
 * @param {import('../../types/storage-contracts.js').Acknowledged | import('../../types/storage-contracts.js').IndeterminateWrite | import('../../types/storage-contracts.js').NotAttempted} receipt
 */
function translateRepositoryStage(receipt) {
  if (receipt?.status === "acknowledged") {
    return durableStage("complete", true);
  }
  if (receipt?.status === "indeterminate") {
    return durableStage("failed", "indeterminate", {
      error: "storage_write_failed",
    });
  }
  return pending();
}

/** @template T @param {T} receipt @returns {T} */
const cloneReceipt = (receipt) => structuredClone(receipt);

/**
 * @param {import('./DataCoordinator.js').default} owner
 * @param {number} operation
 * @returns {Promise<import('../../types/storage-contracts.js').ApplicationProjectResetPersistenceResult>}
 */
async function resetProjectPersistence(owner, operation) {
  const receipt = persistenceReceipt();
  owner._assertCurrentOperation(operation);
  if (!owner._stateReady || !owner.projectRepository) {
    const error = owner._stateReady
      ? /** @type {const} */ ("storage_write_failed")
      : /** @type {const} */ ("operation_cancelled");
    receipt.rootClear = durableStage("failed", false, { error });
    return {
      success: false,
      error,
      stage: "rootClear",
      durable: false,
      params: { reason: error },
      receipt: cloneReceipt(receipt),
    };
  }

  /** @type {import('../../types/storage-contracts.js').ProjectResetResult | null} */
  let resetResult = null;
  try {
    resetResult = owner.projectRepository.reset();
  } catch {
    receipt.rootClear = durableStage("failed", "indeterminate", {
      error: "storage_write_failed",
    });
  } finally {
    // Reset may mutate before reporting failure. The legacy writer must never
    // resurrect its cached pre-reset root after any attempted repository reset.
    owner.storage.invalidateCache();
  }

  if (resetResult) {
    receipt.rootClear = translateRepositoryStage(resetResult.rootRemoval);
    receipt.backupClear = translateRepositoryStage(resetResult.backupRemoval);
    receipt.resetSentinel = translateRepositoryStage(resetResult.sentinelWrite);
  }
  if (resetResult?.status === "reset") {
    return { success: true, receipt: cloneReceipt(receipt) };
  }

  const stage =
    receipt.rootClear.status === "failed"
      ? "rootClear"
      : receipt.backupClear.status === "failed"
        ? "backupClear"
        : "resetSentinel";
  return {
    success: false,
    error: "storage_write_failed",
    stage,
    durable: "indeterminate",
    params: { reason: "storage_write_failed" },
    receipt: cloneReceipt(receipt),
  };
}

/**
 * @param {import('./DataCoordinator.js').default} owner
 * @param {number} operation
 * @returns {Promise<import('../../types/storage-contracts.js').ApplicationDataResetAdoptionResult>}
 */
async function adoptEmptyProject(owner, operation) {
  const receipt = adoptionReceipt();
  try {
    owner._assertCurrentOperation(operation);
    owner.state.currentProfile = null;
    owner.state.profiles = {};
    owner.state.currentEnvironment = "space";
    owner.state.metadata = {
      lastModified: new Date().toISOString(),
      version: owner.storage.version || owner.state.metadata.version || "1.0.0",
    };

    owner._publishState("storage-reset");
    owner._assertCurrentOperation(operation);
    recordDataCoordinatorPublication(
      owner,
      owner.emit(
        "profile:updated",
        {
          profileId: null,
          profile: null,
          updateSource: "DataCoordinator-Reset",
        },
        { synchronous: true },
      ),
    );
    owner._assertCurrentOperation(operation);
    recordDataCoordinatorPublication(
      owner,
      owner.emit(
        "profile:switched",
        {
          profileId: null,
          profile: null,
          environment: "space",
          updateSource: "DataCoordinator-Reset",
        },
        { synchronous: true },
      ),
    );
    owner._assertCurrentOperation(operation);
    receipt.dataOwnerAdoption = durableStage("complete", true);
    return {
      success: true,
      currentProfile: null,
      receipt: cloneReceipt(receipt),
    };
  } catch {
    receipt.dataOwnerAdoption = durableStage("failed", false, {
      error: "operation_cancelled",
    });
    return {
      success: false,
      error: "operation_cancelled",
      stage: "dataOwnerAdoption",
      durable: true,
      params: { reason: "operation_cancelled" },
      receipt: cloneReceipt(receipt),
    };
  }
}

/**
 * Hold the DataCoordinator queue across project persistence, the nested
 * Preferences reset, and the later empty-state adoption. Capabilities are
 * one-shot, lifecycle-bound, and never expose either storage owner.
 *
 * @template Result
 * @param {import('./DataCoordinator.js').default} owner
 * @param {(capabilities: import('../../types/storage-contracts.js').ApplicationDataResetCapabilities) => Result | Promise<Result>} operation
 * @returns {Promise<import('../../types/storage-contracts.js').OwnerActionCompletion<Result>>}
 */
export async function runApplicationDataReset(owner, operation) {
  if (typeof operation !== "function") {
    throw new TypeError("invalid_data_reset_transaction");
  }
  await owner._initialStateCommitted;
  const generation = owner._captureOperationGeneration();
  return enqueueDataCoordinatorMutationWithSettlement(owner, async () => {
    let transactionActive = true;
    let acceptingCapabilities = true;
    let persistenceUsed = false;
    let adoptionUsed = false;
    let persistenceSucceeded = false;
    /** @type {Promise<unknown>[]} */
    const inFlight = [];
    const assertAccepting = () => {
      if (!transactionActive || !acceptingCapabilities) {
        throw new Error("operation_cancelled");
      }
    };
    const assertActive = () => {
      assertAccepting();
      owner._assertCurrentOperation(generation);
    };
    const resetPersistence = () => {
      assertActive();
      if (persistenceUsed) throw new Error("project_reset_already_used");
      persistenceUsed = true;
      const started = resetProjectPersistence(owner, generation).then(
        (result) => {
          persistenceSucceeded = result.success;
          return result;
        },
      );
      inFlight.push(started);
      void started.catch(() => undefined);
      return started;
    };
    const adoptEmpty = () => {
      assertAccepting();
      if (adoptionUsed) throw new Error("data_reset_adoption_already_used");
      if (!persistenceSucceeded) throw new Error("project_reset_not_committed");
      adoptionUsed = true;
      const started = adoptEmptyProject(owner, generation);
      inFlight.push(started);
      void started.catch(() => undefined);
      return started;
    };
    const settleInFlight = () => Promise.allSettled(inFlight);
    try {
      assertActive();
      const result = await operation({
        resetProjectPersistence: resetPersistence,
        adoptEmptyProject: adoptEmpty,
        assertActive,
      });
      acceptingCapabilities = false;
      await settleInFlight();
      return result;
    } finally {
      acceptingCapabilities = false;
      try {
        await settleInFlight();
      } finally {
        transactionActive = false;
      }
    }
  });
}
