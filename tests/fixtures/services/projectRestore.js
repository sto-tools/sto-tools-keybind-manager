import PreferencesService from "../../../src/js/components/services/PreferencesService.js";
import LocalStorageSettingsRepository from "../../../src/js/components/storage/LocalStorageSettingsRepository.js";
import { createPreferencesState } from "../core/componentState.js";

export function createProjectSettingsRepository(storage = localStorage) {
  return new LocalStorageSettingsRepository({
    storage,
    defaults: createPreferencesState().settings,
  });
}

/** Real owner harness for focused import tests; no duplicate settings writer. */
export async function createImportPreferencesOwner(fixture) {
  const preferences = new PreferencesService({
    eventBus: fixture.eventBus,
    settingsRepository: fixture.settingsRepository,
    i18n: { language: "en", t: (key) => key, changeLanguage: async () => {} },
    localizeCommands: () => {},
    applyTranslations: () => {},
  });
  preferences.init();
  await preferences.initialStateReady;
  fixture.settingsRepository.replace.mockClear?.();
  return preferences;
}

/**
 * Unit-test adapter that preserves the public activation request while the
 * ProjectManagementService workflow itself uses the same transaction callback
 * shape as production composition.
 *
 * @param {() => ProjectManagementServiceLike} getService
 */
export function createRequestBackedPreferencesTransition(getService) {
  /** @type {import('../../../src/js/components/services/PreferencesService.js').default['runExternalActivationTransition']} */
  const run = (source, operation) =>
    operation(
      () =>
        getService().request(
          "preferences:activate-persisted-settings",
          { source },
          0,
        ),
      () => {},
      async () => {
        throw new Error("unexpected_settings_stage_in_workflow_unit_test");
      },
    );
  return run;
}

/**
 * @typedef {{
 *   request(
 *     topic: 'preferences:activate-persisted-settings',
 *     payload: { source: import('../../../src/js/types/rpc/parameters-preferences.js').PreferencesActivationSource },
 *     timeout: 0
 *   ): Promise<import('../../../src/js/types/rpc/parameters-preferences.js').PreferencesActivationResult>
 * }} ProjectManagementServiceLike
 */

export function createProjectRestoreSuccess() {
  return {
    success: true,
    currentProfile: null,
    imported: { profiles: 0, settings: false },
  };
}

export function rejectFinalProjectRootWrite(storage, profileId = "imported") {
  const setItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, value) => {
    if (key === storage.storageKey) {
      const candidate = JSON.parse(value);
      if (candidate.currentProfile === profileId) {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      }
    }
    setItem(key, value);
  };
}
