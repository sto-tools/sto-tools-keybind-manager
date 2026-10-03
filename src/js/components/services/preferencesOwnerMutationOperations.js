import { needsLanguageActivation } from "./preferencesApplicationEffects.js";
import { settleOwnerPublications } from "./ownerPublicationSettlement.js";
import { activatePersistedPreferencesWithinMutation } from "./preferencesExternalActivation.js";
export {
  activatePersistedPreferencesWithinMutation,
  runExternalPreferencesActivation,
} from "./preferencesExternalActivation.js";
import {
  collectPreferenceChanges,
  invalidMutationError,
  isPreferencesActivationSource,
  materializePreferenceSettingsMutation,
  materializeSyncFolderSettingsMutation,
  preferencesActivationFailure,
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
 * Re-read and activate the standalone persisted settings on the owner's
 * serialized mutation boundary.
 *
 * Project restore is read-only because the import stage already wrote the
 * acknowledged record.
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

  /** @type {PromiseLike<unknown>[]} */
  const publications = [];
  try {
    const result = await owner._enqueueMutation(() =>
      activatePersistedPreferencesWithinMutation(
        owner,
        source,
        generation,
        undefined,
        publications,
      ),
    );
    await settleOwnerPublications(publications);
    return result;
  } catch (error) {
    await settleOwnerPublications(publications);
    return preferencesActivationFailure(error);
  }
}
