import {
  enqueueDataCoordinatorMutationWithSettlement,
  recordDataCoordinatorPublication,
} from "./dataCoordinatorMutationQueue.js";
import { durableStage } from "./storageWorkflowReceipt.js";
import { applicationResetCheckpointState } from "./applicationResetCheckpoint.js";
import {
  adoptPendingCoordinatorProjectRoot,
  loadCoordinatorProjectRoot,
} from "./dataCoordinatorProjectPersistence.js";

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
 * @param {import('../../types/storage-contracts.js').ProjectResetResult['rootRemoval']} receipt
 */
function translateRepositoryStage(receipt) {
  if (receipt?.status === "acknowledged" || receipt?.status === "verified") {
    return durableStage("complete", true);
  }
  if (receipt?.status === "indeterminate") {
    return durableStage("failed", "indeterminate", {
      error: "storage_write_failed",
    });
  }
  if (receipt?.status === "read_failed" || receipt?.status === "failed") {
    return durableStage("failed", false, { error: receipt.error });
  }
  return pending();
}

/** @template T @param {T} receipt @returns {T} */
const cloneReceipt = (receipt) => structuredClone(receipt);

/**
 * @param {import('./DataCoordinator.js').default} owner
 * @param {number} operation
 * @param {import('./applicationResetCheckpoint.js').Saga | null} saga
 * @returns {Promise<import('../../types/storage-contracts.js').ApplicationProjectResetPersistenceResult>}
 */
async function resetProjectPersistence(owner, operation, saga) {
  const receipt = persistenceReceipt();
  owner._assertCurrentOperation(operation);
  if (saga && !saga.active) throw new Error("operation_cancelled");
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
    resetResult = saga
      ? owner.projectRepository.reset(saga.project)
      : owner.projectRepository.reset();
  } catch {
    receipt.rootClear = durableStage("failed", "indeterminate", {
      error: "storage_write_failed",
    });
  } finally {
    // Any reset attempt makes the previously accepted root unsafe to reuse.
    // Recovery must fresh-load the repository before another project commit.
    if (!saga?.data?.adopted) {
      owner._projectRoot = null;
      owner._pendingResetSentinel = null;
    }
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
    resetResult?.status === "reset_failed" && resetResult.stage
      ? resetResult.stage
      : receipt.rootClear.status === "failed"
        ? "rootClear"
        : receipt.backupClear.status === "failed"
          ? "backupClear"
          : "resetSentinel";
  const error =
    resetResult?.status === "reset_failed" && resetResult.error
      ? resetResult.error
      : "storage_write_failed";
  return {
    success: false,
    error,
    stage,
    durable: Object.values(receipt).some((step) => step.committed === true)
      ? true
      : Object.values(receipt).some(
            (step) => step.committed === "indeterminate",
          )
        ? "indeterminate"
        : false,
    params: { reason: error },
    receipt: cloneReceipt(receipt),
  };
}

/**
 * @param {import('./DataCoordinator.js').default} owner
 * @param {number} operation
 * @param {import('./applicationResetCheckpoint.js').Saga | null} saga
 * @returns {Promise<import('../../types/storage-contracts.js').ApplicationDataResetAdoptionResult>}
 */
async function adoptEmptyProject(owner, operation, saga) {
  const receipt = adoptionReceipt();
  const assertActive = () => {
    owner._assertCurrentOperation(operation);
    if (saga && !saga.active) throw new Error("operation_cancelled");
  };
  try {
    assertActive();
    if (saga?.data?.adopted) {
      if (!saga.data.published) throw new Error("operation_cancelled");
      return {
        success: true,
        currentProfile: null,
        receipt: { dataOwnerAdoption: durableStage("complete", true) },
      };
    }
    const loaded = loadCoordinatorProjectRoot(owner);
    if (!loaded.repairRequired || !loaded.resetSentinel) {
      throw new Error("operation_cancelled");
    }
    adoptPendingCoordinatorProjectRoot(owner, loaded, operation);

    if (saga?.data) saga.data.adopted = true;

    owner._publishState("storage-reset");
    if (saga?.data) saga.data.revision = owner._stateRevision;
    assertActive();
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
    assertActive();
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
    assertActive();
    receipt.dataOwnerAdoption = durableStage("complete", true);
    if (saga?.data) saga.data.published = true;
    return {
      success: true,
      currentProfile: null,
      receipt: cloneReceipt(receipt),
    };
  } catch {
    if (saga?.data?.adopted) saga.data.revision = owner._stateRevision;
    receipt.dataOwnerAdoption = durableStage(
      "failed",
      Boolean(saga?.data?.adopted),
      {
        error: "operation_cancelled",
      },
    );
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
 * @param {import('../../types/storage-contracts.js').ApplicationResetCheckpoint} [checkpoint]
 * @returns {Promise<import('../../types/storage-contracts.js').OwnerActionCompletion<Result>>}
 */
export async function runApplicationDataReset(owner, operation, checkpoint) {
  if (typeof operation !== "function") {
    throw new TypeError("invalid_data_reset_transaction");
  }
  const saga = applicationResetCheckpointState(checkpoint);
  await owner._initialStateCommitted;
  const generation = owner._captureOperationGeneration();
  return enqueueDataCoordinatorMutationWithSettlement(owner, async () => {
    if (saga && !saga.active) throw new Error("operation_cancelled");
    const expected = saga?.data;
    if (
      expected &&
      (expected.authorityEpoch !== owner._stateAuthorityEpoch ||
        expected.revision !== owner._stateRevision ||
        expected.generation !== generation)
    )
      throw new Error("operation_cancelled");
    if (saga && !expected)
      saga.data = {
        authorityEpoch: owner._stateAuthorityEpoch,
        revision: owner._stateRevision,
        generation,
        adopted: false,
        published: false,
      };
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
      if (saga && !saga.active) throw new Error("operation_cancelled");
      assertAccepting();
      owner._assertCurrentOperation(generation);
    };
    const resetPersistence = () => {
      assertActive();
      if (persistenceUsed) throw new Error("project_reset_already_used");
      persistenceUsed = true;
      const started = resetProjectPersistence(owner, generation, saga).then(
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
      const started = adoptEmptyProject(owner, generation, saga);
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
