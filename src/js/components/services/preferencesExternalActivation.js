import { needsLanguageActivation } from "./preferencesApplicationEffects.js";
import { settleOwnerPublications } from "./ownerPublicationSettlement.js";
import {
  collectPreferenceChanges,
  isPreferencesActivationSource,
  materializePreferenceSettingsMutation,
  preferencesActivationFailure,
} from "./preferencesMutationBoundary.js";
import {
  materializeCanonicalPreferences,
  materializeSettingsLoadResult,
} from "./preferencesRepositoryBoundary.js";
import { sanitizeStoredSettingsPatch } from "./settingsDataBoundary.js";
/** @typedef {import('../../types/events/base.js').PreferencesSettings} PreferencesSettings */
/** @typedef {import('../../types/rpc/parameters-preferences.js').PreferencesActivationSource} PreferencesActivationSource */
/** @typedef {import('./preferencesOwnerMutationOperations.js').PersistImportedPreferences} PersistImportedPreferences */

/**
 * Activate the standalone record while the caller already owns the Preferences
 * mutation queue. Application reset also clears that record here, keeping the
 * durable settings transition and owner adoption indivisible with respect to
 * queued preference mutations.
 *
 * @param {import('./PreferencesService.js').default} owner
 * @param {PreferencesActivationSource} source
 * @param {number} generation
 * @param {import('../../types/data-contracts.js').CanonicalSettings} [stagedSettings]
 * @param {PromiseLike<unknown>[]} [publications]
 * @returns {Promise<import('../../types/rpc/parameters-preferences.js').PreferencesActivationResult>}
 */
export async function activatePersistedPreferencesWithinMutation(
  owner,
  source,
  generation,
  stagedSettings,
  publications,
) {
  owner._assertCurrentLifecycle(generation);
  if (!owner.settingsRepository)
    throw new Error("preferences_storage_unavailable");

  /** @type {PreferencesSettings | null} */
  let nextSettings = null;
  if (stagedSettings !== undefined) {
    nextSettings = materializeCanonicalPreferences(stagedSettings);
  } else {
    const loaded = materializeSettingsLoadResult(
      owner.settingsRepository.load(),
    );
    owner._assertCurrentLifecycle(generation);
    if (loaded?.status !== "current")
      throw new Error("preferences_settings_read_failed");
    nextSettings = materializeCanonicalPreferences(loaded.value);
  }
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
    "project-settings-activated",
    {
      generation,
      localizeCommands: activateLanguage,
      synchronousPublication: publications !== undefined,
      recordPublication: publications
        ? (settlement) => publications.push(settlement)
        : undefined,
    },
  );
  owner._languageActivationDirty = activation.languageActivationFailed;

  if (changed) {
    const changedSettlement = owner.emit(
      "preferences:changed",
      {
        changes: structuredClone(changes),
        settings: owner.getSettings(),
      },
      { synchronous: publications !== undefined },
    );
    if (publications) publications.push(changedSettlement);
    owner._assertCurrentLifecycle(generation);
  }
  if (activateLanguage && !activation.languageActivationFailed) {
    const languageSettlement = owner.emit(
      "language:changed",
      { language: nextSettings.language },
      { synchronous: publications !== undefined },
    );
    if (publications) publications.push(languageSettlement);
    owner._assertCurrentLifecycle(generation);
  }

  return Object.freeze({
    success: true,
    changed,
    revision: nextState.revision,
    effects: activation.effectsDegraded ? "degraded" : "applied",
  });
}

/**
 * Hold the Preferences mutation queue across an external durable workflow and
 * its optional persisted-settings activation. The operation receives a
 * one-shot activation capability; callers that encounter a partial failure
 * simply do not invoke it, preserving the established durable receipt and live
 * owner behavior.
 *
 * @template Result
 * @param {import('./PreferencesService.js').default} owner
 * @param {PreferencesActivationSource} source
 * @param {(
 *   activatePersistedSettings: () => Promise<import('../../types/rpc/parameters-preferences.js').PreferencesActivationResult>,
 *   assertTransitionActive: () => void,
 *   persistImportedSettings: PersistImportedPreferences
 * ) => Result | Promise<Result>} operation
 * @returns {Promise<Result>}
 */
export function runExternalPreferencesActivation(owner, source, operation) {
  if (
    !isPreferencesActivationSource(source) ||
    typeof operation !== "function"
  ) {
    throw new TypeError("invalid_preferences_activation_transaction");
  }
  const generation = owner._readyMutationGeneration();
  /** @type {PromiseLike<unknown>[]} */
  const publications = [];
  const committed = owner._enqueueMutation(async () => {
    let transactionActive = true;
    let acceptingCapabilities = true;
    const assertTransitionActive = () => {
      if (!transactionActive) throw new Error("operation_cancelled");
      owner._assertCurrentLifecycle(generation);
    };
    const assertCapabilityAvailable = () => {
      if (!acceptingCapabilities) throw new Error("operation_cancelled");
      assertTransitionActive();
    };
    assertTransitionActive();
    let activationUsed = false;
    let persistenceUsed = false;
    /** @type {import('../../types/storage-contracts.js').SettingsWriteResult | null} */
    let stagedReceipt = null;
    /** @type {Promise<import('../../types/storage-contracts.js').SettingsWriteResult> | null} */
    let persistencePromise = null;
    /** @type {Promise<import('../../types/rpc/parameters-preferences.js').PreferencesActivationResult> | null} */
    let activationPromise = null;
    const activatePersistedSettings = () => {
      try {
        assertCapabilityAvailable();
        if (activationUsed) {
          throw new Error("preferences_activation_already_used");
        }
        activationUsed = true;
        activationPromise = (async () => {
          if (persistencePromise) await persistencePromise;
          assertTransitionActive();
          if (persistenceUsed && stagedReceipt?.status !== "committed") {
            throw new Error("preferences_settings_verification_failed");
          }
          return activatePersistedPreferencesWithinMutation(
            owner,
            source,
            generation,
            stagedReceipt?.status === "committed"
              ? stagedReceipt.value
              : undefined,
            publications,
          );
        })().catch((error) => preferencesActivationFailure(error));
        return activationPromise;
      } catch (error) {
        return Promise.resolve(preferencesActivationFailure(error));
      }
    };
    /** @type {PersistImportedPreferences} */
    const persistImportedSettings = (patch) => {
      const detached = materializePreferenceSettingsMutation(patch);
      const decoded = detached ? sanitizeStoredSettingsPatch(detached) : null;
      try {
        assertCapabilityAvailable();
        if (source !== "project-restore" || persistenceUsed || activationUsed) {
          throw new Error("preferences_import_persistence_unavailable");
        }
        persistenceUsed = true;
        if (!decoded || decoded.repaired) {
          stagedReceipt = {
            status: "rejected",
            error: "invalid_data",
            write: { status: "not_attempted" },
            verification: { status: "not_attempted" },
          };
          persistencePromise = Promise.resolve(structuredClone(stagedReceipt));
          return persistencePromise;
        }
        persistencePromise = Promise.resolve().then(() => {
          assertTransitionActive();
          const current = materializeCanonicalPreferences(owner.getSettings());
          if (!current) throw new Error("invalid_preferences_state");
          const merged = { ...current, ...decoded.value };
          const version = current.version || decoded.value.version;
          if (version === undefined) delete merged.version;
          else merged.version = version;
          if (current.firstRun === undefined) delete merged.firstRun;
          else merged.firstRun = current.firstRun;
          const candidate = materializeCanonicalPreferences(merged);
          if (!candidate) {
            return /** @type {import('../../types/storage-contracts.js').SettingsWriteResult} */ ({
              status: "rejected",
              error: "invalid_data",
              write: { status: "not_attempted" },
              verification: { status: "not_attempted" },
            });
          }
          // Plan before persistence so malformed snapshots cannot fail only
          // after a durable write. The staged value is deliberately not adopted.
          owner._prepareSettingsTransition(candidate);
          assertTransitionActive();
          let persisted;
          try {
            persisted = owner.persistSettings(candidate);
          } catch {
            // A throwing storage capability may already have written. Return
            // that uncertainty as a receipt so the workflow can retain its
            // earlier acknowledged profile stages instead of losing them when
            // the lease drains this promise.
            persisted = null;
          }
          assertTransitionActive();
          stagedReceipt = persisted ?? {
            status: "write_failed",
            error: "storage_write_failed",
            write: {
              status: "indeterminate",
              error: "storage_write_failed",
              category: "unknown",
            },
            verification: { status: "not_attempted" },
          };
          return structuredClone(stagedReceipt);
        });
        void persistencePromise.catch(() => undefined);
        return persistencePromise;
      } catch (error) {
        return Promise.reject(error);
      }
    };
    const settleInFlight = async () => {
      const settlements = await Promise.allSettled([
        persistencePromise,
        activationPromise,
      ]);
      for (const settlement of settlements) {
        if (settlement.status === "rejected") throw settlement.reason;
      }
    };
    try {
      const result = await operation(
        activatePersistedSettings,
        assertCapabilityAvailable,
        persistImportedSettings,
      );
      acceptingCapabilities = false;
      await settleInFlight();
      assertTransitionActive();
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
  return committed.then(
    async (result) => {
      await settleOwnerPublications(publications);
      return result;
    },
    async (error) => {
      await settleOwnerPublications(publications);
      throw error;
    },
  );
}
