export const storageServiceMethodNames = Object.freeze([
  "getAllData",
  "saveAllData",
  "getProfile",
  "saveProfile",
  "deleteProfile",
  "getSettings",
  "saveSettings",
  "clearSettings",
  "createBackup",
  "invalidateCache",
]);

export const expectedCallsByFile = Object.freeze({
  "components/storage/LocalStorageProjectRepository.js": 12,
  "components/storage/LocalStorageSettingsRepository.js": 5,
  "components/services/commandPresentationState.js": 6,
  "components/services/dataCoordinatorInitialState.js": 1,
  "components/services/keyBrowserViewState.js": 8,
  "core/welcomeMessage.js": 5,
  "dev/DevMonitor.js": 1,
});

export const expectedScalarWrites = Object.freeze({
  "components/storage/LocalStorageProjectRepository.js|removeItem": 3,
  "components/storage/LocalStorageProjectRepository.js|setItem": 3,
  "components/storage/LocalStorageSettingsRepository.js|removeItem": 1,
  "components/storage/LocalStorageSettingsRepository.js|setItem": 1,
  "components/services/commandPresentationState.js|removeItem": 1,
  "components/services/commandPresentationState.js|setItem": 2,
  "components/services/keyBrowserViewState.js|setItem": 3,
  "core/welcomeMessage.js|removeItem": 1,
  "core/welcomeMessage.js|setItem": 2,
});

export const unusedRepositoryScalarCallsites = Object.freeze({});

export const unusedRepositoryScalarWrites = Object.freeze({});

// This is the complete production syntactic surface for the ten legacy
// StorageService method names. Entries that are owner/domain calls rather than
// StorageService calls stay in this manifest so a newly named receiver cannot
// hide an unregistered persistence access.
export const expectedNamedMethodCalls = Object.freeze({
  "components/services/BindsetService.js|this|getProfile": 4,
  "components/services/PreferencesService.js|this|getSettings": 1,
  "components/services/PreferencesService.js|this|saveSettings": 1,
  "components/services/dataCoordinatorResponders.js|coordinator|deleteProfile": 1,
  "components/services/preferencesApplicationReset.js|owner|getSettings": 2,
  "components/services/preferencesOwnerMutationOperations.js|owner|getSettings": 11,
  "components/ui/PreferencesUI.js|this|saveSettings": 1,
});

export const storageServiceCallClass = Object.freeze({});

export const expectedStorageServiceCallsByMethod = Object.freeze({
  getAllData: 0,
  saveAllData: 0,
  getProfile: 0,
  saveProfile: 0,
  deleteProfile: 0,
  getSettings: 0,
  saveSettings: 0,
  clearSettings: 0,
  createBackup: 0,
  invalidateCache: 0,
});

// These production workflow cohorts have no storage or repository capability.
export const closedReadCohortRules = Object.freeze({
  "components/ui/FileExplorerUI.js": Object.freeze({
    forbidStorageDependency: true,
    forbidRepositoryDependency: true,
  }),
  "components/services/ExportService.js": Object.freeze({
    forbidStorageDependency: true,
    forbidRepositoryDependency: true,
  }),
  "components/services/ImportService.js": Object.freeze({
    forbidStorageDependency: true,
    forbidRepositoryDependency: true,
  }),
  "components/services/projectImportOrchestrator.js": Object.freeze({
    forbidStorageDependency: true,
    forbidRepositoryDependency: true,
  }),
  "components/services/ProjectManagementService.js": Object.freeze({
    forbidStorageDependency: true,
    forbidRepositoryDependency: true,
  }),
  "components/services/SyncService.js": Object.freeze({
    forbidStorageDependency: true,
    forbidRepositoryDependency: true,
  }),
  "components/services/syncDecisionOrchestrator.js": Object.freeze({
    forbidStorageDependency: true,
    forbidRepositoryDependency: true,
  }),
  "components/services/syncFolderSelectionOrchestrator.js": Object.freeze({
    forbidStorageDependency: true,
    forbidRepositoryDependency: true,
  }),
  "components/services/syncProjectMaterializer.js": Object.freeze({
    forbidStorageDependency: true,
    forbidRepositoryDependency: true,
  }),
  "components/services/AutoSync.js": Object.freeze({
    forbidStorageDependency: true,
    forbidRepositoryDependency: true,
  }),
});

export const routineStateQueryTopics = Object.freeze([
  "data:get-current-state",
  "data:get-all-profiles",
  "data:get-settings",
  "data:get-keys",
  "data:get-key-commands",
  "data:get-aliases",
  "preferences:get-setting",
  "preferences:get-settings",
  "command-presentation:get-state",
  "key-browser:get-state",
  "bindset:get-collapsed-state",
  "key:get-category-state",
  "selection:get-state",
  "selection:get-selected",
  "selection:get-cached",
  "key:get-selected",
]);

export const repositoryCandidateNames = Object.freeze([
  "ProjectRepository",
  "SettingsRepository",
  "LocalStorageProjectRepository",
  "LocalStorageSettingsRepository",
]);

export const rpcComputationTopics = Object.freeze([
  "alias:validate-name",
  "command:filter-library",
  "command:generate-mirrored-commands",
  "export:generate-alias-file",
  "export:generate-alias-filename",
  "export:generate-filename",
  "export:generate-keybind-file",
  "key:categorize-by-command",
  "key:categorize-by-type",
  "key:sort",
  "parameter-command:build",
  "parse-kbf-file",
  "parser:clear-cache",
  "parser:parse-command-string",
  "utility:copy-to-clipboard",
]);

export const rpcActionTopics = Object.freeze([
  "alias-browser:create",
  "alias:add",
  "alias:delete",
  "alias:duplicate-with-name",
  "alias:select",
  "application:reset",
  "bindset-selector:add-key-to-bindset",
  "bindset-selector:remove-key-from-bindset",
  "bindset-selector:set-active-bindset",
  "bindset:clone",
  "bindset:create",
  "bindset:delete",
  "bindset:delete-with-keys",
  "bindset:rename",
  "bindset:toggle-collapse",
  "command-presentation:toggle-category",
  "command-presentation:toggle-group",
  "command:delete",
  "command:import-from-source",
  "command:move",
  "command:set-stabilize",
  "data:clone-profile",
  "data:create-profile",
  "data:delete-profile",
  "data:reload-state",
  "data:rename-profile",
  "data:switch-profile",
  "data:update-profile",
  "environment:switch",
  "export:sync-to-folder",
  "import:alias-file",
  "import:kbf-file",
  "import:keybind-file",
  "import:project-file",
  "key:add",
  "key:cycle-view-mode",
  "key:delete",
  "key:duplicate-with-name",
  "key:select",
  "key:toggle-category",
  "preferences:activate-persisted-settings",
  "preferences:persist-sync-folder-settings",
  "preferences:save-settings",
  "preferences:set-setting",
  "preferences:set-settings",
  "project:restore-from-content",
  "project:retry-restore-activation",
  "selection:select-alias",
  "selection:select-key",
  "sync:select-folder",
  "sync:sync-project",
  "ui:confirm",
  "ui:inform",
]);

export const expectedScalarCallsites = Object.freeze({
  "components/storage/LocalStorageProjectRepository.js|this.#storage|getItem|ROOT_KEY": 4,
  "components/storage/LocalStorageProjectRepository.js|this.#storage|getItem|RESET_KEY": 2,
  "components/storage/LocalStorageProjectRepository.js|this.#storage|setItem|BACKUP_KEY|backup": 1,
  "components/storage/LocalStorageProjectRepository.js|this.#storage|setItem|ROOT_KEY|prepared.json": 1,
  "components/storage/LocalStorageProjectRepository.js|this.#storage|removeItem|RESET_KEY": 1,
  "components/storage/LocalStorageProjectRepository.js|this.#storage|removeItem|ROOT_KEY": 1,
  "components/storage/LocalStorageProjectRepository.js|this.#storage|removeItem|BACKUP_KEY": 1,
  'components/storage/LocalStorageProjectRepository.js|this.#storage|setItem|RESET_KEY|"true"': 1,
  "components/storage/LocalStorageSettingsRepository.js|this.#storage|getItem|SETTINGS_KEY": 3,
  "components/storage/LocalStorageSettingsRepository.js|this.#storage|removeItem|SETTINGS_KEY": 1,
  "components/storage/LocalStorageSettingsRepository.js|this.#storage|setItem|SETTINGS_KEY|prepared.json": 1,
  "components/services/commandPresentationState.js|storage|key|index": 1,
  "components/services/commandPresentationState.js|storage|getItem|key": 2,
  "components/services/commandPresentationState.js|storage|setItem|`${commandCategoryPrefix}${categoryId}${collapsedSuffix}`|String(isCollapsed)": 1,
  'components/services/commandPresentationState.js|storage|setItem|key|"true"': 1,
  "components/services/commandPresentationState.js|storage|removeItem|key": 1,
  'components/services/dataCoordinatorInitialState.js|localStorage|getItem|"sto_keybind_manager_visited"': 1,
  "components/services/keyBrowserViewState.js|storage|key|index": 1,
  "components/services/keyBrowserViewState.js|storage|getItem|key": 1,
  "components/services/keyBrowserViewState.js|storage|getItem|keyViewModeStorageKey": 1,
  "components/services/keyBrowserViewState.js|storage|setItem|keyViewModeStorageKey|mode": 1,
  "components/services/keyBrowserViewState.js|storage|getItem|categoryStorageKey(categoryId, mode)": 1,
  "components/services/keyBrowserViewState.js|storage|setItem|categoryStorageKey(categoryId, mode)|String(isCollapsed)": 1,
  "components/services/keyBrowserViewState.js|storage|getItem|`${bindsetPrefix}${bindsetName}${collapsedSuffix}`": 1,
  "components/services/keyBrowserViewState.js|storage|setItem|`${bindsetPrefix}${bindsetName}${collapsedSuffix}`|String(isCollapsed)": 1,
  "core/welcomeMessage.js|storage|getItem|VISITED_KEY": 2,
  'core/welcomeMessage.js|storage|setItem|VISITED_KEY|"true"': 1,
  "core/welcomeMessage.js|storage|removeItem|VISITED_KEY": 1,
  "core/welcomeMessage.js|storage|setItem|VISITED_KEY|previousValue": 1,
  'dev/DevMonitor.js|localStorage|getItem|"dev-mode"': 1,
});

export const expectedIndexedDbCallsites = Object.freeze({
  "components/services/FileSystemService.js|openDB|indexedDB|open|this.dbName|1": 1,
  "components/services/FileSystemService.js|openDB|request.result|createObjectStore|this.storeName": 1,
  'components/services/FileSystemService.js|saveDirectoryHandle|db|transaction|this.storeName|"readwrite"': 1,
  "components/services/FileSystemService.js|saveDirectoryHandle|tx.objectStore(this.storeName)|put|handle|key": 1,
  "components/services/FileSystemService.js|saveDirectoryHandle|tx|objectStore|this.storeName": 1,
  "components/services/FileSystemService.js|saveDirectoryHandle|db|close": 1,
  'components/services/FileSystemService.js|getDirectoryHandle|db|transaction|this.storeName|"readonly"': 1,
  "components/services/FileSystemService.js|getDirectoryHandle|tx.objectStore(this.storeName)|get|key": 1,
  "components/services/FileSystemService.js|getDirectoryHandle|tx|objectStore|this.storeName": 1,
  "components/services/FileSystemService.js|getDirectoryHandle|db|close": 1,
  'components/services/FileSystemService.js|deleteDirectoryHandle|db|transaction|this.storeName|"readwrite"': 1,
  "components/services/FileSystemService.js|deleteDirectoryHandle|tx.objectStore(this.storeName)|delete|key": 1,
  "components/services/FileSystemService.js|deleteDirectoryHandle|tx|objectStore|this.storeName": 1,
  "components/services/FileSystemService.js|deleteDirectoryHandle|db|close": 1,
  'components/services/FileSystemService.js|getSyncDirectoryState|db|transaction|this.storeName|"readonly"': 1,
  "components/services/FileSystemService.js|getSyncDirectoryState|tx|objectStore|this.storeName": 1,
  "components/services/FileSystemService.js|getSyncDirectoryState|store|getKey|KEY_SYNC_FOLDER_TRANSITION": 1,
  "components/services/FileSystemService.js|getSyncDirectoryState|store|get|KEY_SYNC_FOLDER_TRANSITION": 1,
  "components/services/FileSystemService.js|getSyncDirectoryState|store|get|KEY_SYNC_FOLDER": 1,
  "components/services/FileSystemService.js|getSyncDirectoryState|db|close": 1,
  'components/services/FileSystemService.js|beginSyncDirectoryTransition|db|transaction|this.storeName|"readwrite"': 1,
  "components/services/FileSystemService.js|beginSyncDirectoryTransition|tx|objectStore|this.storeName": 1,
  "components/services/FileSystemService.js|beginSyncDirectoryTransition|store|put|handle|KEY_SYNC_FOLDER": 1,
  "components/services/FileSystemService.js|beginSyncDirectoryTransition|store|put|SYNC_FOLDER_TRANSITION_MARKER|KEY_SYNC_FOLDER_TRANSITION": 1,
  "components/services/FileSystemService.js|beginSyncDirectoryTransition|db|close": 1,
  'components/services/FileSystemService.js|completeSyncDirectoryTransition|db|transaction|this.storeName|"readwrite"': 1,
  "components/services/FileSystemService.js|completeSyncDirectoryTransition|tx.objectStore(this.storeName)|delete|KEY_SYNC_FOLDER_TRANSITION": 1,
  "components/services/FileSystemService.js|completeSyncDirectoryTransition|tx|objectStore|this.storeName": 1,
  "components/services/FileSystemService.js|completeSyncDirectoryTransition|db|close": 1,
  'components/services/FileSystemService.js|restoreSyncDirectoryState|db|transaction|this.storeName|"readwrite"': 1,
  "components/services/FileSystemService.js|restoreSyncDirectoryState|tx|objectStore|this.storeName": 1,
  "components/services/FileSystemService.js|restoreSyncDirectoryState|store|delete|KEY_SYNC_FOLDER": 1,
  "components/services/FileSystemService.js|restoreSyncDirectoryState|store|put|previousState.handle|KEY_SYNC_FOLDER": 1,
  "components/services/FileSystemService.js|restoreSyncDirectoryState|store|put|SYNC_FOLDER_TRANSITION_MARKER|KEY_SYNC_FOLDER_TRANSITION": 1,
  "components/services/FileSystemService.js|restoreSyncDirectoryState|store|delete|KEY_SYNC_FOLDER_TRANSITION": 1,
  "components/services/FileSystemService.js|restoreSyncDirectoryState|db|close": 1,
});

export const storageCallsiteDispositions = Object.freeze({});
