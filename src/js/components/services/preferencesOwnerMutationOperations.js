import { needsLanguageActivation } from "./preferencesApplicationEffects.js";
import {
  collectPreferenceChanges,
  invalidMutationError,
  isPreferencesActivationSource,
  materializePreferenceSettingsMutation,
  materializeSyncFolderSettingsMutation,
  preferencesActivationFailure,
} from "./preferencesMutationBoundary.js";
import {
  materializeCanonicalPreferences,
  materializeSettingsLoadResult,
  materializeSettingsClearResult,
} from "./preferencesRepositoryBoundary.js";
import {
  isSettingsRecord,
  sanitizeStoredSettings,
  sanitizeStoredSettingsPatch,
} from "./settingsDataBoundary.js";
import {
  publishPreferencesTransitionReceipts,
  settlePreferencesMutation,
} from "./preferencesTransitionState.js";

/** @typedef {import('../../types/events/base.js').PreferencesSettings} PreferencesSettings */
/** @typedef {import('../../types/events/base.js').SettingsRecord} SettingsRecord */
/** @typedef {import('../../types/rpc/parameters-preferences.js').PreferencesActivationSource} PreferencesActivationSource */
/** @typedef {import('../../types/rpc/parameters-preferences.js').SyncFolderSettingsMutation} SyncFolderSettingsMutation */
/** @typedef {(patch: unknown) => Promise<import('../../types/storage-contracts.js').SettingsWriteResult>} PersistImportedPreferences */

/** @param {import('./PreferencesService.js').default} owner */
export function savePreferenceSettings(owner) {
  const generation = owner._readyMutationGeneration();
  const publication = owner._enqueueMutation(async () => {
    owner._assertCurrentLifecycle(generation);
    if (!owner.settingsRepository) return { ok: false, settlement: null };
    const settings = owner.getSettings();
    const persisted = owner.persistSettings(settings);
    if (persisted?.status !== "committed")
      return { ok: false, settlement: null };
    owner._assertCurrentLifecycle(generation);
    const changes = collectPreferenceChanges(settings, persisted.value);
    let language = null;
    if (Object.keys(changes).length > 0) {
      const activateLanguage = needsLanguageActivation(
        !Object.is(settings.language, persisted.value.language),
        owner._languageActivationDirty,
        owner.i18n?.language,
        persisted.value.language,
      );
      const prepared = owner._prepareSettingsTransition(persisted.value);
      owner._assertCurrentLifecycle(generation);
      const state = owner._adoptPreparedTransition(prepared);
      const activation = await owner._applyAndPublishTransition(
        state,
        "settings-replaced",
        { generation, localizeCommands: activateLanguage },
      );
      owner._languageActivationDirty = activation.languageActivationFailed;
      if (activateLanguage && !activation.languageActivationFailed)
        language = persisted.value.language;
    }
    return publishPreferencesTransitionReceipts(
      owner,
      generation,
      persisted.value,
      Object.keys(changes).length > 0
        ? { changes, settings: owner.getSettings() }
        : null,
      language,
    );
  });
  return settlePreferencesMutation(publication, () =>
    owner._assertCurrentLifecycle(generation),
  );
}

/**
 * @param {import('./PreferencesService.js').default} owner
 * @param {string} key
 * @param {unknown} value
 */
export function commitPreferenceSetting(owner, key, value) {
  /** @type {Record<string, unknown>} */
  const intent = {};
  Object.defineProperty(intent, key, {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
  const detachedIntent = materializePreferenceSettingsMutation(intent);
  if (!detachedIntent) throw invalidMutationError({ key, value });
  if (sanitizeStoredSettingsPatch(detachedIntent).repaired)
    throw invalidMutationError({ key, value });
  const detachedValue = Reflect.get(detachedIntent, key);
  const generation = owner._readyMutationGeneration();
  const publication = owner._enqueueMutation(async () => {
    owner._assertCurrentLifecycle(generation);
    const languageChanged =
      key === "language" && !Object.is(owner.settings.language, detachedValue);
    const candidate = owner.getSettings();
    Object.defineProperty(candidate, key, {
      value: detachedValue,
      configurable: true,
      enumerable: true,
      writable: true,
    });
    const decoded = sanitizeStoredSettingsPatch(candidate);
    if (decoded.repaired) throw invalidMutationError({ key, value });
    let nextSettings = /** @type {PreferencesSettings} */ (decoded.value);
    const activateLanguage = needsLanguageActivation(
      languageChanged,
      owner._languageActivationDirty,
      owner.i18n?.language,
      nextSettings.language,
    );
    console.log("[PreferencesService] setSetting", {
      key,
      value: detachedValue,
    });
    let prepared = owner._prepareSettingsTransition(nextSettings);
    owner._assertCurrentLifecycle(generation);
    const persisted = owner.persistSettings(prepared.settings);
    if (persisted?.status !== "committed") {
      return { ok: false, settlement: null };
    }

    owner._assertCurrentLifecycle(generation);
    nextSettings = persisted.value;
    prepared = owner._prepareSettingsTransition(nextSettings);
    owner._assertCurrentLifecycle(generation);
    const nextState = owner._adoptPreparedTransition(prepared);
    const activation = await owner._applyAndPublishTransition(
      nextState,
      "setting-committed",
      { generation, localizeCommands: activateLanguage },
    );
    owner._languageActivationDirty = activation.languageActivationFailed;
    return publishPreferencesTransitionReceipts(
      owner,
      generation,
      nextSettings,
      {
        key,
        value: structuredClone(nextSettings[key]),
        settings: owner.getSettings(),
      },
      activateLanguage && !activation.languageActivationFailed
        ? nextSettings.language
        : null,
    );
  });
  return settlePreferencesMutation(publication, () =>
    owner._assertCurrentLifecycle(generation),
  );
}

/**
 * @param {import('./PreferencesService.js').default} owner
 * @param {SettingsRecord} newSettings
 */
export function replacePreferenceSettings(owner, newSettings) {
  const materialized = materializePreferenceSettingsMutation(newSettings);
  if (!materialized) {
    throw new TypeError("Invalid preferences settings payload");
  }
  const decoded = sanitizeStoredSettingsPatch(materialized);
  if (decoded.repaired || !isSettingsRecord(decoded.value)) {
    throw new TypeError("Invalid preferences settings payload");
  }
  const detachedSettings = decoded.value;
  const generation = owner._readyMutationGeneration();
  const publication = owner._enqueueMutation(async () => {
    owner._assertCurrentLifecycle(generation);
    const oldSettings = owner.getSettings();
    let nextSettings = sanitizeStoredSettings(
      detachedSettings,
      owner.defaultSettings,
    );
    const languageChanged = !Object.is(
      oldSettings.language,
      nextSettings.language,
    );
    const activateLanguage = needsLanguageActivation(
      languageChanged,
      owner._languageActivationDirty,
      owner.i18n?.language,
      nextSettings.language,
    );
    console.log("[PreferencesService] setSettings", {
      changed: Object.keys(detachedSettings),
    });
    let prepared = owner._prepareSettingsTransition(nextSettings);
    owner._assertCurrentLifecycle(generation);
    const persisted = owner.persistSettings(prepared.settings);
    if (persisted?.status !== "committed") {
      return { ok: false, settlement: null };
    }

    owner._assertCurrentLifecycle(generation);
    nextSettings = persisted.value;
    prepared = owner._prepareSettingsTransition(nextSettings);
    owner._assertCurrentLifecycle(generation);
    const nextState = owner._adoptPreparedTransition(prepared);
    const activation = await owner._applyAndPublishTransition(
      nextState,
      "settings-replaced",
      { generation, localizeCommands: activateLanguage },
    );
    owner._languageActivationDirty = activation.languageActivationFailed;
    const changes = collectPreferenceChanges(oldSettings, nextSettings);
    return publishPreferencesTransitionReceipts(
      owner,
      generation,
      nextSettings,
      Object.keys(changes).length > 0
        ? {
            changes: structuredClone(changes),
            settings: owner.getSettings(),
          }
        : null,
      activateLanguage && !activation.languageActivationFailed
        ? nextSettings.language
        : null,
    );
  });
  return settlePreferencesMutation(publication, () =>
    owner._assertCurrentLifecycle(generation),
  );
}

/**
 * @param {import('./PreferencesService.js').default} owner
 * @param {SyncFolderSettingsMutation} mutation
 */
export function persistSyncFolderPreferenceSettings(owner, mutation) {
  const detachedMutation = materializeSyncFolderSettingsMutation(mutation);
  if (!detachedMutation) {
    throw new TypeError("Invalid sync folder settings mutation");
  }
  const generation = owner._readyMutationGeneration();
  return owner._enqueueMutation(() => {
    owner._assertCurrentLifecycle(generation);
    const candidate = { ...owner.getSettings(), ...detachedMutation };
    const decoded = sanitizeStoredSettingsPatch(candidate);
    if (decoded.repaired) {
      throw new TypeError("Invalid sync folder settings mutation");
    }
    const nextSettings = sanitizeStoredSettings(
      decoded.value,
      owner.defaultSettings,
    );
    const prepared = owner._prepareSettingsTransition(nextSettings);
    const persisted = owner.persistSettings(prepared.settings);
    if (persisted?.status !== "committed") return false;

    owner._assertCurrentLifecycle(generation);
    const accepted = owner._prepareSettingsTransition(persisted.value);
    owner._assertCurrentLifecycle(generation);
    const nextState = owner._adoptPreparedTransition(accepted);
    owner._currentStateSnapshot = nextState;
    owner._publishState("sync-folder-staged", nextState);
    owner._assertCurrentLifecycle(generation);
    // Retain the historical lifecycle notification without using it as state.
    // This path deliberately does not apply settings or publish saved/changed.
    owner.emit("preferences:loaded", { settings: owner.getSettings() });
    owner._assertCurrentLifecycle(generation);
    return true;
  });
}

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
 * @returns {Promise<import('../../types/rpc/parameters-preferences.js').PreferencesActivationResult>}
 */
export async function activatePersistedPreferencesWithinMutation(
  owner,
  source,
  generation,
  stagedSettings,
) {
  owner._assertCurrentLifecycle(generation);
  if (!owner.settingsRepository)
    throw new Error("preferences_storage_unavailable");

  /** @type {PreferencesSettings | null} */
  let nextSettings = null;
  if (source === "application-reset") {
    const removal = materializeSettingsClearResult(
      owner.settingsRepository.clear(),
    );
    if (
      removal?.status !== "cleared" ||
      removal.removal?.status !== "acknowledged"
    ) {
      throw new Error("preferences_settings_clear_failed");
    }
    owner._assertCurrentLifecycle(generation);
    const defaults = materializeCanonicalPreferences(owner.defaultSettings);
    if (!defaults) throw new Error("invalid_preferences_defaults");
    const persisted = owner.persistSettings(defaults);
    owner._assertCurrentLifecycle(generation);
    if (persisted?.status !== "committed")
      throw new Error("preferences_settings_verification_failed");
    nextSettings = persisted.value;
  } else if (stagedSettings !== undefined) {
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
    source === "project-restore"
      ? "project-settings-activated"
      : "settings-reset",
    { generation, localizeCommands: activateLanguage },
  );
  owner._languageActivationDirty = activation.languageActivationFailed;

  if (changed) {
    owner.emit("preferences:changed", {
      changes: structuredClone(changes),
      settings: owner.getSettings(),
    });
    owner._assertCurrentLifecycle(generation);
  }
  if (activateLanguage && !activation.languageActivationFailed) {
    owner.emit("language:changed", { language: nextSettings.language });
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
 * Re-read and activate the standalone persisted settings on the owner's
 * serialized mutation boundary.
 *
 * Project restore is read-only because the import stage already wrote the
 * acknowledged record. Application reset clears the record inside this same
 * queue operation before adopting defaults.
 *
 * @param {import('./PreferencesService.js').default} owner
 * @param {PreferencesActivationSource} source
 * @returns {Promise<import('../../types/rpc/parameters-preferences.js').PreferencesActivationResult>}
 */
export async function activatePersistedPreferences(owner, source) {
  if (!isPreferencesActivationSource(source)) {
    return preferencesActivationFailure(
      new TypeError("invalid_preferences_activation_request"),
    );
  }

  /** @type {number} */
  let generation;
  try {
    generation = owner._readyMutationGeneration();
  } catch (error) {
    return preferencesActivationFailure(error);
  }

  try {
    return await owner._enqueueMutation(() =>
      activatePersistedPreferencesWithinMutation(owner, source, generation),
    );
  } catch (error) {
    return preferencesActivationFailure(error);
  }
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
  return owner._enqueueMutation(async () => {
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
}
