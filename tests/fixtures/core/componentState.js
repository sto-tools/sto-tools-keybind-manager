// @ts-check

const defaultPreferencesSettings = Object.freeze({
  theme: "default",
  autoSave: true,
  showTooltips: true,
  confirmDeletes: true,
  maxUndoSteps: 50,
  defaultMode: "space",
  compactView: false,
  language: "en",
  syncFolderName: null,
  syncFolderPath: null,
  autoSync: false,
  autoSyncInterval: "change",
  bindToAliasMode: false,
  bindsetsEnabled: false,
  translateGeneratedMessages: false,
});

/**
 * Build a complete DataCoordinator late-join snapshot while keeping focused
 * tests concise.
 *
 * @param {Partial<import('../../../src/js/types/events/component-state.js').ComponentState<'DataCoordinator'>>} [overrides]
 * @returns {import('../../../src/js/types/events/component-state.js').ComponentState<'DataCoordinator'>}
 */
export function createDataCoordinatorState(overrides = {}) {
  const currentProfileData = overrides.currentProfileData ?? null;
  const currentProfile =
    overrides.currentProfile ?? currentProfileData?.id ?? null;
  const currentEnvironment =
    overrides.currentEnvironment ??
    currentProfileData?.environment ??
    currentProfileData?.currentEnvironment ??
    "space";

  return {
    authorityEpoch: overrides.authorityEpoch ?? 1,
    ready: overrides.ready ?? true,
    revision: overrides.revision ?? 1,
    currentProfile,
    currentEnvironment,
    currentProfileData,
    profiles:
      overrides.profiles ??
      (currentProfile && currentProfileData
        ? { [currentProfile]: currentProfileData }
        : {}),
    metadata: {
      lastModified: null,
      version: "1.0.0",
      ...overrides.metadata,
    },
  };
}

/**
 * @param {Partial<import('../../../src/js/types/events/base.js').SelectionStateSnapshot>} [overrides]
 * @returns {import('../../../src/js/types/events/component-state.js').ComponentState<'SelectionService'>}
 */
export function createSelectionState(overrides = {}) {
  return {
    selectedKey: null,
    selectedAlias: null,
    editingContext: null,
    cachedSelections: { space: null, ground: null, alias: null },
    currentEnvironment: "space",
    ...overrides,
  };
}

/**
 * @param {Partial<import('../../../src/js/types/events/base.js').KnownPreferencesSettings> & Record<string, unknown>} [settings]
 * @returns {import('../../../src/js/types/events/component-state.js').ComponentState<'PreferencesService'>}
 */
export function createPreferencesState(settings = {}) {
  return {
    settings: {
      ...defaultPreferencesSettings,
      ...settings,
    },
  };
}
