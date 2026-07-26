import { expect, vi } from "vitest";

import PreferencesService from "../../../src/js/components/services/PreferencesService.js";

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
    operation(() =>
      getService().request(
        "preferences:activate-persisted-settings",
        { source },
        0,
      ),
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

export async function assertMundaneSettingsFinalRootFailure({
  storage,
  coordinator,
  eventBus,
  projectManager,
  importedProject,
  preferences,
}) {
  expect(
    storage.saveSettings({ theme: "dark", language: "en" }, { replace: true }),
  ).toBe(true);
  const beforeRoot = JSON.parse(localStorage.getItem(storage.storageKey));
  const beforeState = coordinator.getCurrentState();
  const beforePreferencesState = preferences?.getCurrentState();
  const stateChanged = vi.fn();
  const profileSwitched = vi.fn();
  const environmentChanged = vi.fn();
  eventBus.on("data:state-changed", stateChanged);
  eventBus.on("profile:switched", profileSwitched);
  eventBus.on("environment:changed", environmentChanged);
  rejectFinalProjectRootWrite(storage);

  const result = await projectManager.restoreFromProjectContent(
    JSON.stringify(importedProject),
  );

  expect(result).toEqual({
    success: false,
    error: "storage_write_failed",
    params: { operation: "project" },
    partial: true,
    committed: {
      profiles: ["imported"],
      settings: true,
      project: false,
    },
  });
  const durableRootText = localStorage.getItem(storage.storageKey);
  const durableRoot = JSON.parse(durableRootText);
  expect(durableRoot).toMatchObject({
    currentProfile: "existing",
    profiles: {
      existing: { name: "Existing" },
      imported: { name: "Imported" },
    },
  });
  expect(durableRoot.currentProfile).toBe(beforeRoot.currentProfile);
  expect(durableRoot.settings).toEqual(beforeRoot.settings);
  const durableBackup = JSON.parse(localStorage.getItem(storage.backupKey));
  expect(durableBackup.version).toBe("1.0.0");
  expect(durableBackup.data).toBe(durableRootText);

  const durableSettings = JSON.parse(localStorage.getItem(storage.settingsKey));
  expect(durableSettings).toMatchObject({ theme: "light", language: "de" });
  expect(Object.hasOwn(durableSettings, "version")).toBe(false);
  expect(Object.hasOwn(durableSettings, "firstRun")).toBe(false);
  expect(storage.getAllData()).toEqual(durableRoot);
  expect(coordinator.getCurrentState()).toBe(beforeState);
  expect(preferences?.getCurrentState()).toBe(beforePreferencesState);
  expect(stateChanged).not.toHaveBeenCalled();
  expect(profileSwitched).not.toHaveBeenCalled();
  expect(environmentChanged).not.toHaveBeenCalled();
  expect(projectManager.ui.showToast).not.toHaveBeenCalled();

  const preferenceStates = [];
  const detachPreferenceState = eventBus.on(
    "preferences:state-changed",
    (state) => preferenceStates.push(state),
  );
  preferences.destroy();
  const successorI18n = {
    language: "en",
    t: (key) => key,
    changeLanguage: vi.fn(async (language) => {
      successorI18n.language = language;
    }),
  };
  const successor = new PreferencesService({
    eventBus,
    storage,
    i18n: successorI18n,
    localizeCommands: vi.fn(),
    applyTranslations: vi.fn(),
  });
  successor.init();
  await successor.initialStateReady;
  detachPreferenceState();

  expect(successor.getCurrentState()).toMatchObject({
    authorityEpoch: beforePreferencesState.authorityEpoch + 1,
    ready: true,
    revision: 1,
    settings: storage.getSettings(),
  });
  expect(successor.getCurrentState().settings).toMatchObject({
    theme: durableSettings.theme,
    language: durableSettings.language,
  });
  expect(storage.getAllData().settings).toEqual(durableRoot.settings);
  expect(localStorage.getItem(storage.storageKey)).toBe(durableRootText);
  expect(JSON.parse(localStorage.getItem(storage.settingsKey))).toEqual(
    durableSettings,
  );
  expect(preferenceStates).toEqual([
    expect.objectContaining({ reason: "startup-loaded" }),
  ]);

  return successor;
}
