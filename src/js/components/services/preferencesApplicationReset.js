import { needsLanguageActivation } from "./preferencesApplicationEffects.js";
import { collectPreferenceChanges } from "./preferencesMutationBoundary.js";
import {
  materializeCanonicalPreferences,
  materializeSettingsClearResult,
} from "./preferencesRepositoryBoundary.js";

/** @typedef {import('../../types/events/base.js').PreferencesSettings} PreferencesSettings */
/** @typedef {import('../../types/storage-contracts.js').ApplicationPreferencesResetReceipt} PreferencesResetReceipt */
/** @typedef {import('../../types/storage-contracts.js').ApplicationPreferencesResetResult} PreferencesResetOwnerResult */
/** @typedef {import('../../types/storage-contracts.js').OwnerActionCompletion<PreferencesResetOwnerResult>} PreferencesResetOwnerCompletion */
/** @typedef {{resetPreferences: import('../../types/storage-contracts.js').ApplicationPreferencesResetAction, assertActive: () => void}} PreferencesResetCapabilities */

const resetStageSkipped = () =>
  Object.freeze({ status: /** @type {const} */ ("skipped"), committed: false });

/** @param {PreferencesResetReceipt} receipt */
const cloneResetReceipt = (receipt) => structuredClone(receipt);

/** @param {unknown} error */
const resetFailureCode = (error) =>
  error instanceof Error && error.message === "operation_cancelled"
    ? /** @type {const} */ ("operation_cancelled")
    : /** @type {const} */ ("preferences_activation_failed");

/** @param {PreferencesResetOwnerResult} result @param {PromiseLike<unknown>[]} [settlements] @returns {PreferencesResetOwnerCompletion} */
function preferencesResetCompletion(result, settlements = []) {
  return {
    result: structuredClone(result),
    settlement: Promise.allSettled(settlements).then(() => undefined),
  };
}

/** @param {PreferencesResetReceipt} receipt @param {unknown} error */
function resetAdoptionFailure(receipt, error) {
  const code = resetFailureCode(error);
  receipt.preferencesOwnerAdoption = {
    status: "failed",
    committed: false,
    error: code,
  };
  return preferencesResetCompletion({
    success: false,
    error: code,
    stage: "preferencesOwnerAdoption",
    durable: true,
    params: { reason: code },
    receipt: cloneResetReceipt(receipt),
  });
}

/**
 * Reset the standalone settings record and adopt verified defaults while the
 * caller owns the Preferences mutation queue. Publication promises are invoked
 * here but deliberately returned to the outer workflow without being awaited.
 *
 * @param {import('./PreferencesService.js').default} owner
 * @param {number} generation
 * @param {PreferencesSettings} defaults
 * @returns {Promise<PreferencesResetOwnerCompletion>}
 */
async function resetPersistedPreferencesWithinMutation(
  owner,
  generation,
  defaults,
) {
  /** @type {PreferencesResetReceipt} */
  const receipt = {
    settingsClear: resetStageSkipped(),
    settingsDefaults: resetStageSkipped(),
    preferencesOwnerAdoption: resetStageSkipped(),
  };
  owner._assertCurrentLifecycle(generation);
  if (!owner.settingsRepository) {
    receipt.settingsClear = {
      status: "failed",
      committed: false,
      error: "storage_write_failed",
      removal: { status: "not_attempted" },
    };
    return preferencesResetCompletion({
      success: false,
      error: "storage_write_failed",
      stage: "settingsClear",
      durable: false,
      params: { reason: "storage_write_failed" },
      receipt: cloneResetReceipt(receipt),
    });
  }

  let removal;
  try {
    removal = materializeSettingsClearResult(owner.settingsRepository.clear());
  } catch {
    removal = null;
  }
  if (
    removal?.status !== "cleared" ||
    removal.removal?.status !== "acknowledged"
  ) {
    receipt.settingsClear = {
      status: "failed",
      committed: "indeterminate",
      error: "storage_write_failed",
      removal: removal?.removal ?? {
        status: "indeterminate",
        error: "storage_write_failed",
        category: "unknown",
      },
    };
    return preferencesResetCompletion({
      success: false,
      error: "storage_write_failed",
      stage: "settingsClear",
      durable: "indeterminate",
      params: { reason: "storage_write_failed" },
      receipt: cloneResetReceipt(receipt),
    });
  }
  receipt.settingsClear = {
    status: "complete",
    committed: true,
    removal: structuredClone(removal.removal),
  };

  try {
    owner._assertCurrentLifecycle(generation);
  } catch (error) {
    return resetAdoptionFailure(receipt, error);
  }

  let persisted;
  try {
    persisted = owner.persistSettings(defaults);
  } catch {
    persisted = null;
  }
  if (persisted?.status !== "committed") {
    const error =
      persisted?.status === "verification_failed"
        ? /** @type {const} */ ("verification_failed")
        : persisted?.status === "write_failed"
          ? /** @type {const} */ ("storage_write_failed")
          : /** @type {const} */ ("verification_failed");
    const indeterminate =
      persisted?.status === "write_failed" ||
      persisted?.status === "verification_failed" ||
      persisted == null;
    receipt.settingsDefaults = {
      status: "failed",
      committed: indeterminate ? "indeterminate" : false,
      error,
      write: structuredClone(
        persisted?.write ?? {
          status: "indeterminate",
          error: "storage_write_failed",
          category: "unknown",
        },
      ),
      verification: structuredClone(
        persisted?.verification ?? { status: "not_attempted" },
      ),
    };
    return preferencesResetCompletion({
      success: false,
      error,
      stage: "settingsDefaults",
      // The acknowledged clear is already a durable reset even if eager
      // default materialization cannot be verified in this lifecycle.
      durable: true,
      params: { reason: error },
      receipt: cloneResetReceipt(receipt),
    });
  }
  receipt.settingsDefaults = {
    status: "complete",
    committed: true,
    write: structuredClone(persisted.write),
    verification: structuredClone(persisted.verification),
  };

  /** @type {PromiseLike<unknown>[]} */
  const settlements = [];
  try {
    owner._assertCurrentLifecycle(generation);
    const nextSettings = materializeCanonicalPreferences(persisted.value);
    if (!nextSettings)
      throw new Error("preferences_settings_verification_failed");
    const oldSettings = owner.getSettings();
    const changes = collectPreferenceChanges(oldSettings, nextSettings);
    const changed = Object.keys(changes).length > 0;
    const activateLanguage = needsLanguageActivation(
      !Object.is(oldSettings.language, nextSettings.language),
      owner._languageActivationDirty,
      owner.i18n?.language,
      nextSettings.language,
    );
    const prepared = owner._prepareSettingsTransition(nextSettings);
    owner._assertCurrentLifecycle(generation);
    const nextState = owner._adoptPreparedTransition(prepared);
    const activation = await owner._applyAndPublishTransition(
      nextState,
      "settings-reset",
      {
        generation,
        localizeCommands: activateLanguage,
        synchronousPublication: true,
      },
    );
    settlements.push(activation.stateSettlement);
    owner._languageActivationDirty = activation.languageActivationFailed;

    if (changed) {
      settlements.push(
        owner.emit(
          "preferences:changed",
          {
            changes: structuredClone(changes),
            settings: owner.getSettings(),
          },
          { synchronous: true },
        ),
      );
      owner._assertCurrentLifecycle(generation);
    }
    if (activateLanguage && !activation.languageActivationFailed) {
      settlements.push(
        owner.emit(
          "language:changed",
          { language: nextSettings.language },
          { synchronous: true },
        ),
      );
      owner._assertCurrentLifecycle(generation);
    }

    receipt.preferencesOwnerAdoption = {
      status: "complete",
      committed: true,
      revision: nextState.revision,
      effects: activation.effectsDegraded ? "degraded" : "applied",
    };
    return preferencesResetCompletion(
      {
        success: true,
        changed,
        revision: nextState.revision,
        effects: activation.effectsDegraded ? "degraded" : "applied",
        receipt: cloneResetReceipt(receipt),
      },
      settlements,
    );
  } catch (error) {
    const failed = resetAdoptionFailure(receipt, error);
    return preferencesResetCompletion(failed.result, settlements);
  }
}

/**
 * Hold the Preferences owner queue across one application-reset workflow. The
 * reset capability is one-shot and lifecycle-bound. Started reset work is
 * drained before the lease closes, while its listener settlement remains an
 * explicit part of the returned operation envelope for the outer orchestrator.
 *
 * Defaults are validated and detached before readiness/generation capture, so
 * malformed reset material cannot enter or block the owner queue.
 *
 * @template Result
 * @param {import('./PreferencesService.js').default} owner
 * @param {(capabilities: PreferencesResetCapabilities) => Result | Promise<Result>} operation
 * @returns {Promise<Result>}
 */
export function runApplicationPreferencesReset(owner, operation) {
  if (typeof operation !== "function") {
    throw new TypeError("invalid_preferences_reset_transaction");
  }
  const defaults = materializeCanonicalPreferences(owner.defaultSettings);
  if (!defaults) throw new TypeError("invalid_preferences_defaults");
  const generation = owner._readyMutationGeneration();
  return owner._enqueueMutation(async () => {
    let transactionActive = true;
    let acceptingCapabilities = true;
    const assertActive = () => {
      if (!transactionActive || !acceptingCapabilities) {
        throw new Error("operation_cancelled");
      }
      owner._assertCurrentLifecycle(generation);
    };
    assertActive();
    let resetUsed = false;
    /** @type {Promise<PreferencesResetOwnerCompletion> | null} */
    let resetPromise = null;
    const resetPreferences = () => {
      try {
        assertActive();
        if (resetUsed) throw new Error("preferences_reset_already_used");
        resetUsed = true;
        resetPromise = resetPersistedPreferencesWithinMutation(
          owner,
          generation,
          defaults,
        );
        void resetPromise.catch(() => undefined);
        return resetPromise;
      } catch (error) {
        const code = resetFailureCode(error);
        /** @type {PreferencesResetReceipt} */
        const receipt = {
          settingsClear: resetStageSkipped(),
          settingsDefaults: resetStageSkipped(),
          preferencesOwnerAdoption: {
            status: "failed",
            committed: false,
            error: code,
          },
        };
        return Promise.resolve(
          preferencesResetCompletion({
            success: false,
            error: code,
            stage: "preferencesOwnerAdoption",
            durable: false,
            params: { reason: code },
            receipt: cloneResetReceipt(receipt),
          }),
        );
      }
    };
    const settleInFlight = async () => {
      if (!resetPromise) return;
      await resetPromise;
    };
    try {
      const result = await operation({ resetPreferences, assertActive });
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
