// Closed representation metadata, not repositories or runtime capabilities.
// Generic FileSystemService key methods remain supported; this matrix does not
// claim that those methods restrict all callers to the two sync journal keys.
const rows = [
  [
    "sto_keybind_manager",
    "project",
    "DataCoordinator",
    "ProjectRepositoryPort",
    "LocalStorageProjectRepository",
  ],
  [
    "sto_keybind_manager_backup",
    "project",
    "DataCoordinator",
    "ProjectRepositoryPort",
    "LocalStorageProjectRepository",
  ],
  [
    "sto_app_reset",
    "project",
    "DataCoordinator",
    "ProjectRepositoryPort",
    "LocalStorageProjectRepository",
  ],
  [
    "sto_keybind_settings",
    "settings",
    "PreferencesService",
    "SettingsRepositoryPort",
    "LocalStorageSettingsRepository",
  ],
  [
    "commandCategory_*_collapsed",
    "presentation",
    "CommandPresentationService",
    "CommandPresentationPersistencePort",
    "LocalStorageCommandPresentationPersistence",
  ],
  [
    "commandGroup_*_collapsed",
    "presentation",
    "CommandPresentationService",
    "CommandPresentationPersistencePort",
    "LocalStorageCommandPresentationPersistence",
  ],
  [
    "keyViewMode",
    "key-browser",
    "KeyBrowserService",
    "KeyBrowserPersistencePort",
    "LocalStorageKeyBrowserPersistence",
  ],
  [
    "keyCategory_*_collapsed",
    "key-browser",
    "KeyBrowserService",
    "KeyBrowserPersistencePort",
    "LocalStorageKeyBrowserPersistence",
  ],
  [
    "keyTypeCategory_*_collapsed",
    "key-browser",
    "KeyBrowserService",
    "KeyBrowserPersistencePort",
    "LocalStorageKeyBrowserPersistence",
  ],
  [
    "bindsetSection_*_collapsed",
    "key-browser",
    "KeyBrowserService",
    "KeyBrowserPersistencePort",
    "LocalStorageKeyBrowserPersistence",
  ],
  [
    "sto_keybind_manager_visited",
    "welcome",
    "StartupWelcomeTransaction",
    "VisitedStatePort",
    "LocalStorageVisitedStatePersistence",
  ],
  [
    "dev-mode",
    "diagnostic",
    "DevMonitor",
    "DevelopmentFlagPort",
    "LocalStorageDevelopmentFlagPersistence",
  ],
  [
    "sto-sync-handles/directories/sync-folder",
    "sync-capability",
    "FileSystemService",
    "SyncDirectoryPersistencePort",
    "FileSystemService",
  ],
  [
    "sto-sync-handles/directories/sync-folder-transition-pending",
    "sync-capability",
    "FileSystemService",
    "SyncDirectoryPersistencePort",
    "FileSystemService",
  ],
];

export const storageRepresentations = Object.freeze(
  rows.map(([representation, domain, owner, port, adapter]) =>
    Object.freeze({
      representation,
      domain,
      owner,
      port,
      adapter,
      access: representation === "dev-mode" ? "read-only" : "read-write",
    }),
  ),
);

export const concreteAdapters = Object.freeze([
  "LocalStorageProjectRepository",
  "LocalStorageSettingsRepository",
  "LocalStorageCommandPresentationPersistence",
  "LocalStorageKeyBrowserPersistence",
  "LocalStorageVisitedStatePersistence",
  "LocalStorageDevelopmentFlagPersistence",
]);

export const scalarBoundaryFiles = Object.freeze([
  ...concreteAdapters.map((name) => `components/storage/${name}.js`),
  "components/storage/projectSchemaMigrationPersistence.js",
  "components/storage/projectRepositoryReset.js",
  "components/storage/scopedLocalStorage.js",
]);

// These key expressions are deliberately independent of the existing exact
// physical callsite inventory. It still freezes arguments and counts separately.
export const scalarWriterRoutes = Object.freeze({
  LocalStorageProjectRepository: Object.freeze({
    ROOT_KEY: ["sto_keybind_manager"],
    BACKUP_KEY: ["sto_keybind_manager_backup"],
    RESET_KEY: ["sto_app_reset"],
  }),
  projectSchemaMigrationPersistence: Object.freeze({
    ROOT_KEY: ["sto_keybind_manager"],
    BACKUP_KEY: ["sto_keybind_manager_backup"],
  }),
  projectRepositoryReset: Object.freeze({
    '"sto_keybind_manager"': ["sto_keybind_manager"],
    '"sto_keybind_manager_backup"': ["sto_keybind_manager_backup"],
    '"sto_app_reset"': ["sto_app_reset"],
  }),
  LocalStorageSettingsRepository: Object.freeze({
    SETTINGS_KEY: ["sto_keybind_settings"],
  }),
  LocalStorageCommandPresentationPersistence: Object.freeze({
    "`${CATEGORY_PREFIX}${categoryId}${SUFFIX}`": [
      "commandCategory_*_collapsed",
    ],
    key: ["commandGroup_*_collapsed"],
  }),
  LocalStorageKeyBrowserPersistence: Object.freeze({
    MODE_KEY: ["keyViewMode"],
    "this.#categoryKey(categoryId, mode)": [
      "keyCategory_*_collapsed",
      "keyTypeCategory_*_collapsed",
    ],
    "`bindsetSection_${bindsetName}${SUFFIX}`": ["bindsetSection_*_collapsed"],
  }),
  LocalStorageVisitedStatePersistence: Object.freeze({
    VISITED_KEY: ["sto_keybind_manager_visited"],
  }),
});
