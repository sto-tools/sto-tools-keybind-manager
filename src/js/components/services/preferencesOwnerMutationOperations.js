import { needsLanguageActivation } from "./preferencesApplicationEffects.js";
import {
  collectPreferenceChanges,
  invalidMutationError,
  isPreferencesActivationSource,
  materializePreferenceSettingsMutation,
  materializeSyncFolderSettingsMutation,
} from "./preferencesMutationBoundary.js";
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

/** @param {unknown} error */
function getPreferencesActivationFailureReason(error) {
  try {
    const reason = error instanceof Error ? error.message : String(error);
    return reason || "unknown_error";
  } catch {
    return "unknown_error";
  }
}

/** @param {unknown} error @returns {import('../../types/rpc/parameters-preferences.js').PreferencesActivationFailure} */
export function preferencesActivationFailure(error) {
  const reason = getPreferencesActivationFailureReason(error);
  return Object.freeze({
    success: false,
    error:
      reason === "operation_cancelled"
        ? "operation_cancelled"
        : "preferences_activation_failed",
    params: Object.freeze({ reason }),
    retryable: true,
  });
}

/**
 * @param {import('./PreferencesService.js').default} owner
 * @param {string} key
 * @param {unknown} value
 */
export function commitPreferenceSetting(owner, key, value) {
  const generation = owner._readyMutationGeneration();
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
  const detachedValue = Reflect.get(detachedIntent, key);
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
    const nextSettings = /** @type {PreferencesSettings} */ (decoded.value);
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
    const prepared = owner._prepareSettingsTransition(nextSettings);
    owner._assertCurrentLifecycle(generation);
    if (!owner.persistSettings(prepared.settings)) {
      return { ok: false, settlement: null };
    }

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
  const generation = owner._readyMutationGeneration();
  const materialized = materializePreferenceSettingsMutation(newSettings);
  if (!materialized) {
    throw new TypeError("Invalid preferences settings payload");
  }
  const decoded = sanitizeStoredSettingsPatch(materialized);
  if (decoded.repaired || !isSettingsRecord(decoded.value)) {
    throw new TypeError("Invalid preferences settings payload");
  }
  const detachedSettings = decoded.value;
  const publication = owner._enqueueMutation(async () => {
    owner._assertCurrentLifecycle(generation);
    const oldSettings = owner.getSettings();
    const nextSettings = sanitizeStoredSettings(
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
    const prepared = owner._prepareSettingsTransition(nextSettings);
    owner._assertCurrentLifecycle(generation);
    if (!owner.persistSettings(prepared.settings)) {
      return { ok: false, settlement: null };
    }

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
    if (!owner.persistSettings(prepared.settings)) return false;

    owner._assertCurrentLifecycle(generation);
    const nextState = owner._adoptPreparedTransition(prepared);
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
 * @returns {Promise<import('../../types/rpc/parameters-preferences.js').PreferencesActivationResult>}
 */
async function activatePersistedPreferencesWithinMutation(
  owner,
  source,
  generation,
) {
  owner._assertCurrentLifecycle(generation);
  if (!owner.storage) throw new Error("preferences_storage_unavailable");

  if (source === "application-reset") {
    if (
      typeof owner.storage.clearSettings !== "function" ||
      owner.storage.clearSettings() !== true
    ) {
      throw new Error("preferences_settings_clear_failed");
    }
    owner._assertCurrentLifecycle(generation);
  }

  const stored = owner.storage.getSettings();
  const nextSettings = sanitizeStoredSettings(stored, owner.defaultSettings);
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
 *   assertTransitionActive: () => void
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
    const assertTransitionActive = () => {
      if (!transactionActive) throw new Error("operation_cancelled");
      owner._assertCurrentLifecycle(generation);
    };
    assertTransitionActive();
    let activationUsed = false;
    /** @type {Promise<import('../../types/rpc/parameters-preferences.js').PreferencesActivationResult> | null} */
    let activationPromise = null;
    const activatePersistedSettings = () => {
      try {
        assertTransitionActive();
        if (activationUsed) {
          throw new Error("preferences_activation_already_used");
        }
        activationUsed = true;
        activationPromise = activatePersistedPreferencesWithinMutation(
          owner,
          source,
          generation,
        ).catch((error) => preferencesActivationFailure(error));
        return activationPromise;
      } catch (error) {
        return Promise.resolve(preferencesActivationFailure(error));
      }
    };
    try {
      const result = await operation(
        activatePersistedSettings,
        assertTransitionActive,
      );
      if (activationPromise) await activationPromise;
      assertTransitionActive();
      return result;
    } finally {
      if (activationPromise) await activationPromise;
      transactionActive = false;
    }
  });
}
