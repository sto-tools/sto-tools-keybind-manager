import { isDataRecord } from "./jsonDataBoundary.js";
import { materializeMutationRequest } from "./mutationRequestBoundary.js";
import { durableStage } from "./storageWorkflowReceipt.js";
import { applicationResetCheckpointState } from "./applicationResetCheckpoint.js";

/** @typedef {Extract<import('../../types/rpc/application.js').ApplicationResetResult, {success: false}>} ApplicationResetFailure */
/** @typedef {ApplicationResetFailure['stage']} ApplicationResetStage */

const PROJECT_PERSISTENCE_FIELDS = Object.freeze(
  /** @type {const} */ (["rootClear", "backupClear", "resetSentinel"]),
);
const DATA_ADOPTION_FIELDS = Object.freeze(
  /** @type {const} */ (["dataOwnerAdoption"]),
);
const PREFERENCES_RECEIPT_FIELDS = Object.freeze(
  /** @type {const} */ ([
    "settingsClear",
    "settingsDefaults",
    "preferencesOwnerAdoption",
  ]),
);
/** @type {readonly (keyof import('../../types/rpc/application.js').ApplicationResetReceipt)[]} */
const RESET_RECEIPT_FIELDS = Object.freeze([
  "validation",
  ...PROJECT_PERSISTENCE_FIELDS,
  ...PREFERENCES_RECEIPT_FIELDS,
  ...DATA_ADOPTION_FIELDS,
]);
const STAGE_STATUSES = new Set(["complete", "pending", "skipped", "failed"]);

const pending = () => durableStage("pending", false);
const skipped = () => durableStage("skipped", false);

/** @param {unknown} value @param {PropertyKey} key */
function ownDataValue(value, key) {
  try {
    if (!isDataRecord(value)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable && "value" in descriptor
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

/** @param {unknown} value */
function materializeStageReceipt(value) {
  const status = ownDataValue(value, "status");
  const committed = ownDataValue(value, "committed");
  const fingerprint = ownDataValue(value, "fingerprint");
  const error = ownDataValue(value, "error");
  if (
    typeof status !== "string" ||
    !STAGE_STATUSES.has(status) ||
    (typeof committed !== "boolean" && committed !== "indeterminate") ||
    (fingerprint !== undefined && typeof fingerprint !== "string") ||
    (error !== undefined && typeof error !== "string")
  ) {
    return null;
  }
  return durableStage(
    /** @type {import('../../types/storage-contracts.js').DurableStageStatus} */ (
      status
    ),
    committed,
    {
      ...(fingerprint === undefined ? {} : { fingerprint }),
      ...(error === undefined ? {} : { error }),
    },
  );
}

/** @param {unknown} value @param {readonly string[]} fields */
function materializeOwnerReceipt(value, fields) {
  if (!isDataRecord(value)) return null;
  /** @type {Record<string, ReturnType<typeof durableStage>>} */
  const receipt = {};
  for (const field of fields) {
    const stage = materializeStageReceipt(ownDataValue(value, field));
    if (!stage) return null;
    receipt[field] = stage;
  }
  return Object.freeze(receipt);
}

/** @param {unknown} value @param {readonly string[]} receiptFields */
function materializeOwnerResult(value, receiptFields) {
  const success = ownDataValue(value, "success");
  const receipt = materializeOwnerReceipt(
    ownDataValue(value, "receipt"),
    receiptFields,
  );
  if (!receipt || typeof success !== "boolean") return null;
  if (success) return Object.freeze({ success: true, receipt });

  const stage = ownDataValue(value, "stage");
  const durable = ownDataValue(value, "durable");
  const params = ownDataValue(value, "params");
  const reason = ownDataValue(params, "reason");
  if (
    typeof stage !== "string" ||
    !receiptFields.includes(stage) ||
    (typeof durable !== "boolean" && durable !== "indeterminate") ||
    typeof reason !== "string"
  ) {
    return null;
  }
  return Object.freeze({
    success: false,
    stage,
    durable,
    params: Object.freeze({ reason }),
    receipt,
  });
}

/** @param {unknown} value @param {readonly string[]} receiptFields */
function materializeOwnerAction(value, receiptFields) {
  const result = materializeOwnerResult(
    ownDataValue(value, "result"),
    receiptFields,
  );
  const settlement = ownDataValue(value, "settlement");
  if (
    !result ||
    (typeof settlement !== "object" && typeof settlement !== "function") ||
    settlement === null ||
    typeof settlement.then !== "function"
  ) {
    return null;
  }
  return Object.freeze({ result, settlement: Promise.resolve(settlement) });
}

/** @param {unknown} value @param {unknown} expectedResult */
function materializeTransitionAction(value, expectedResult) {
  const result = ownDataValue(value, "result");
  const settlement = ownDataValue(value, "settlement");
  if (
    result !== expectedResult ||
    (typeof settlement !== "object" && typeof settlement !== "function") ||
    settlement === null ||
    typeof settlement.then !== "function"
  ) {
    return null;
  }
  return Object.freeze({ settlement: Promise.resolve(settlement) });
}

function createPendingReceipt() {
  return {
    validation: durableStage("complete", true),
    rootClear: pending(),
    backupClear: pending(),
    resetSentinel: pending(),
    settingsClear: pending(),
    settingsDefaults: pending(),
    dataOwnerAdoption: pending(),
    preferencesOwnerAdoption: pending(),
  };
}

function invalidReceipt() {
  return Object.freeze({
    validation: durableStage("failed", false, { error: "invalid_data" }),
    rootClear: skipped(),
    backupClear: skipped(),
    resetSentinel: skipped(),
    settingsClear: skipped(),
    settingsDefaults: skipped(),
    dataOwnerAdoption: skipped(),
    preferencesOwnerAdoption: skipped(),
  });
}

/**
 * @param {import('../../types/rpc/application.js').ApplicationResetReceipt} receipt
 * @returns {import('../../types/rpc/application.js').ApplicationResetReceipt}
 */
function freezeReceipt(receipt) {
  return /** @type {import('../../types/rpc/application.js').ApplicationResetReceipt} */ (
    /** @type {unknown} */ (
      Object.freeze(
        Object.fromEntries(
          RESET_RECEIPT_FIELDS.map((field) => [field, receipt[field]]),
        ),
      )
    )
  );
}

/** @param {import('../../types/rpc/application.js').ApplicationResetReceipt} receipt */
function resetDurability(receipt) {
  const stages = RESET_RECEIPT_FIELDS.filter(
    (field) => field !== "validation",
  ).map((field) => receipt[field]);
  if (stages.some(({ committed }) => committed === true)) return true;
  if (stages.some(({ committed }) => committed === "indeterminate")) {
    return "indeterminate";
  }
  return false;
}

/**
 * @param {import('../../types/rpc/application.js').ApplicationResetReceipt} receipt
 * @param {ApplicationResetStage} stage
 * @param {boolean | 'indeterminate'} durable
 * @param {string} reason
 * @param {'application_reset_failed' | 'invalid_reset_request'} [error]
 * @returns {Extract<import('../../types/rpc/application.js').ApplicationResetResult, {success: false}>}
 */
function failure(
  receipt,
  stage,
  durable,
  reason,
  error = "application_reset_failed",
) {
  return Object.freeze({
    success: false,
    error,
    stage,
    durable,
    params: Object.freeze({ reason }),
    receipt: freezeReceipt(receipt),
  });
}

/** @param {unknown} error */
function safeFailureReason(error) {
  return error instanceof Error && error.message === "operation_cancelled"
    ? "operation_cancelled"
    : "application_reset_failed";
}

/**
 * Coordinate application reset through the two runtime owners. This seam has
 * no storage or repository capability: only the serialized Preferences lease
 * and the Data owner action cross the boundary.
 *
 * @param {{
 *   payload: unknown,
 *   checkpoint?: import('../../types/storage-contracts.js').ApplicationResetCheckpoint,
 *   recordWorkCompletion?: (result: import('../../types/rpc/application.js').ApplicationResetResult) => void,
 *   recordWorkFailure?: (error: unknown) => void,
 *   runPreferencesResetTransition: import('../../types/storage-contracts.js').ApplicationPreferencesResetTransitionRunner | null | undefined,
 *   runDataResetTransition: import('../../types/storage-contracts.js').ApplicationDataResetTransitionRunner | null | undefined
 * }} options
 * @returns {Promise<import('../../types/rpc/application.js').ApplicationResetResult>}
 */
export async function orchestrateApplicationReset({
  payload,
  checkpoint,
  recordWorkCompletion,
  recordWorkFailure,
  runPreferencesResetTransition,
  runDataResetTransition,
}) {
  try {
    materializeMutationRequest(payload, []);
  } catch {
    return failure(
      invalidReceipt(),
      "validation",
      false,
      "invalid_mutation_request",
      "invalid_reset_request",
    );
  }

  const saga = applicationResetCheckpointState(checkpoint);
  const receipt = saga?.receipt
    ? structuredClone(saga.receipt)
    : createPendingReceipt();
  if (
    typeof runPreferencesResetTransition !== "function" ||
    typeof runDataResetTransition !== "function"
  ) {
    return failure(
      receipt,
      "validation",
      false,
      "application_reset_unavailable",
    );
  }

  /** @type {Array<{stage: ApplicationResetStage, settlement: Promise<unknown>}>} */
  const settlements = [];
  /** @type {ReturnType<typeof failure> | {success: true} | null} */
  let callbackOutcome = null;
  /** @type {ApplicationResetStage} */
  let activeStage = "rootClear";

  try {
    const transitionOutcome = await runPreferencesResetTransition(
      async (preferencesCapabilities) => {
        if (
          !isDataRecord(preferencesCapabilities) ||
          typeof ownDataValue(preferencesCapabilities, "resetPreferences") !==
            "function" ||
          typeof ownDataValue(preferencesCapabilities, "assertActive") !==
            "function"
        ) {
          callbackOutcome = failure(
            receipt,
            activeStage,
            resetDurability(receipt),
            "application_reset_unavailable",
          );
          return callbackOutcome;
        }
        const resetPreferences = ownDataValue(
          preferencesCapabilities,
          "resetPreferences",
        );
        const assertPreferencesOwnerActive = ownDataValue(
          preferencesCapabilities,
          "assertActive",
        );
        const assertPreferencesActive = () => {
          if (saga && !saga.active) throw new Error("operation_cancelled");
          assertPreferencesOwnerActive();
        };

        assertPreferencesActive();
        const dataTransitionValue = await runDataResetTransition(
          async (dataCapabilities) => {
            if (
              !isDataRecord(dataCapabilities) ||
              typeof ownDataValue(
                dataCapabilities,
                "resetProjectPersistence",
              ) !== "function" ||
              typeof ownDataValue(dataCapabilities, "adoptEmptyProject") !==
                "function" ||
              typeof ownDataValue(dataCapabilities, "assertActive") !==
                "function"
            ) {
              callbackOutcome = failure(
                receipt,
                activeStage,
                resetDurability(receipt),
                "application_reset_unavailable",
              );
              return callbackOutcome;
            }
            const resetProjectPersistence = ownDataValue(
              dataCapabilities,
              "resetProjectPersistence",
            );
            const adoptEmptyProject = ownDataValue(
              dataCapabilities,
              "adoptEmptyProject",
            );
            const assertDataOwnerActive = ownDataValue(
              dataCapabilities,
              "assertActive",
            );
            const assertDataActive = () => {
              if (saga && !saga.active) throw new Error("operation_cancelled");
              assertDataOwnerActive();
            };
            const requireDataActiveAfterPersistence = () => {
              try {
                assertDataActive();
                return true;
              } catch (error) {
                if (safeFailureReason(error) !== "operation_cancelled") {
                  throw error;
                }
                receipt.dataOwnerAdoption = durableStage("failed", false, {
                  error: "operation_cancelled",
                });
                activeStage = "dataOwnerAdoption";
                callbackOutcome = failure(
                  receipt,
                  activeStage,
                  resetDurability(receipt),
                  "operation_cancelled",
                );
                return false;
              }
            };

            assertPreferencesActive();
            assertDataActive();
            const projectResult = materializeOwnerResult(
              await resetProjectPersistence(),
              PROJECT_PERSISTENCE_FIELDS,
            );
            if (!projectResult) {
              callbackOutcome = failure(
                receipt,
                activeStage,
                resetDurability(receipt),
                "invalid_project_reset_result",
              );
              return callbackOutcome;
            }
            Object.assign(receipt, projectResult.receipt);
            if (!projectResult.success) {
              callbackOutcome = failure(
                receipt,
                /** @type {ApplicationResetStage} */ (projectResult.stage),
                projectResult.durable,
                projectResult.params.reason,
              );
              return callbackOutcome;
            }

            assertPreferencesActive();
            if (!requireDataActiveAfterPersistence()) return callbackOutcome;
            activeStage = "settingsClear";
            const preferencesAction = materializeOwnerAction(
              await resetPreferences(),
              PREFERENCES_RECEIPT_FIELDS,
            );
            if (!preferencesAction) {
              callbackOutcome = failure(
                receipt,
                activeStage,
                resetDurability(receipt),
                "invalid_preferences_reset_result",
              );
              return callbackOutcome;
            }
            Object.assign(receipt, preferencesAction.result.receipt);
            settlements.push({
              stage: "preferencesOwnerAdoption",
              settlement: preferencesAction.settlement,
            });
            if (!preferencesAction.result.success) {
              callbackOutcome = failure(
                receipt,
                /** @type {ApplicationResetStage} */ (
                  preferencesAction.result.stage
                ),
                preferencesAction.result.durable,
                preferencesAction.result.params.reason,
              );
              return callbackOutcome;
            }

            assertPreferencesActive();
            if (!requireDataActiveAfterPersistence()) return callbackOutcome;
            activeStage = "dataOwnerAdoption";
            const adoptionResult = materializeOwnerResult(
              await adoptEmptyProject(),
              DATA_ADOPTION_FIELDS,
            );
            if (!adoptionResult) {
              callbackOutcome = failure(
                receipt,
                activeStage,
                resetDurability(receipt),
                "invalid_data_reset_result",
              );
              return callbackOutcome;
            }
            Object.assign(receipt, adoptionResult.receipt);
            if (!adoptionResult.success) {
              callbackOutcome = failure(
                receipt,
                /** @type {ApplicationResetStage} */ (adoptionResult.stage),
                adoptionResult.durable,
                adoptionResult.params.reason,
              );
              return callbackOutcome;
            }

            assertPreferencesActive();
            assertDataActive();
            callbackOutcome = { success: true };
            return callbackOutcome;
          },
          checkpoint,
        );
        const dataTransitionAction = materializeTransitionAction(
          dataTransitionValue,
          callbackOutcome,
        );
        if (!dataTransitionAction) {
          callbackOutcome = failure(
            receipt,
            activeStage,
            resetDurability(receipt),
            "invalid_data_reset_transition_result",
          );
          return callbackOutcome;
        }
        settlements.push({
          stage: "dataOwnerAdoption",
          settlement: dataTransitionAction.settlement,
        });
        return callbackOutcome;
      },
      checkpoint,
    );

    if (transitionOutcome !== callbackOutcome || !callbackOutcome) {
      callbackOutcome = failure(
        receipt,
        activeStage,
        resetDurability(receipt),
        "invalid_reset_transition_result",
      );
    }
  } catch (error) {
    callbackOutcome = failure(
      receipt,
      activeStage,
      resetDurability(receipt),
      safeFailureReason(error),
    );
  }

  // Both owner leases are released and the complete business outcome is fixed.
  // A coalesced action starts no publications and must not inherit this action's
  // listener wait: a required listener may itself await that coalesced action.
  /** @type {{result: import('../../types/rpc/application.js').ApplicationResetResult} | {exceptional: unknown}} */
  let workOutcome;
  try {
    if (saga) saga.receipt = structuredClone(freezeReceipt(receipt));
    const result = callbackOutcome.success
      ? Object.freeze({ success: true, receipt: freezeReceipt(receipt) })
      : callbackOutcome;
    workOutcome = { result };
    recordWorkCompletion?.(result);
  } catch (error) {
    // Reject joiners now so a listener awaiting one can drain. The initiating
    // action must still await its own started publications before rethrowing.
    workOutcome = { exceptional: error };
    recordWorkFailure?.(error);
  }
  // The initiating action still awaits every required publication it started.
  const settlementResults = await Promise.allSettled(
    settlements.map(({ settlement }) => settlement),
  );
  // Property discrimination preserves even thrown null/undefined values.
  if ("exceptional" in workOutcome) throw workOutcome.exceptional;
  const rejectedIndex = settlementResults.findIndex(
    ({ status }) => status === "rejected",
  );
  if (rejectedIndex >= 0) {
    return failure(
      receipt,
      settlements[rejectedIndex].stage,
      resetDurability(receipt),
      "owner_settlement_failed",
    );
  }

  return workOutcome.result;
}
