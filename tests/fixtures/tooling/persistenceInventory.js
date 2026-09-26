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
  "clearAllData",
]);

export const expectedCallsByFile = Object.freeze({
  "components/services/StorageService.js": 13,
  "components/services/commandPresentationState.js": 6,
  "components/services/dataCoordinatorInitialState.js": 1,
  "components/services/keyBrowserViewState.js": 8,
  "core/welcomeMessage.js": 5,
  "dev/DevMonitor.js": 1,
});

export const expectedScalarWrites = Object.freeze({
  "components/services/StorageService.js|removeItem": 5,
  "components/services/StorageService.js|setItem": 4,
  "components/services/commandPresentationState.js|removeItem": 1,
  "components/services/commandPresentationState.js|setItem": 2,
  "components/services/keyBrowserViewState.js|setItem": 3,
  "core/welcomeMessage.js|removeItem": 1,
  "core/welcomeMessage.js|setItem": 2,
});

// Tranche 1 adds test-only adapters. Keep their exact physical surface separate
// from the frozen active-writer inventory until an approved owner cutover.
export const unusedRepositoryScalarCallsites = Object.freeze({
  "components/storage/LocalStorageProjectRepository.js|this.#storage|getItem|RESET_KEY": 2,
  "components/storage/LocalStorageProjectRepository.js|this.#storage|getItem|ROOT_KEY": 3,
  "components/storage/LocalStorageProjectRepository.js|this.#storage|removeItem|BACKUP_KEY": 1,
  "components/storage/LocalStorageProjectRepository.js|this.#storage|removeItem|RESET_KEY": 1,
  "components/storage/LocalStorageProjectRepository.js|this.#storage|removeItem|ROOT_KEY": 1,
  "components/storage/LocalStorageProjectRepository.js|this.#storage|setItem|BACKUP_KEY|backup": 1,
  'components/storage/LocalStorageProjectRepository.js|this.#storage|setItem|RESET_KEY|"true"': 1,
  "components/storage/LocalStorageProjectRepository.js|this.#storage|setItem|ROOT_KEY|prepared.json": 1,
  "components/storage/LocalStorageSettingsRepository.js|this.#storage|getItem|SETTINGS_KEY": 2,
  "components/storage/LocalStorageSettingsRepository.js|this.#storage|removeItem|SETTINGS_KEY": 1,
  "components/storage/LocalStorageSettingsRepository.js|this.#storage|setItem|SETTINGS_KEY|prepared.json": 1,
});

export const unusedRepositoryScalarWrites = Object.freeze({
  "components/storage/LocalStorageProjectRepository.js|removeItem": 3,
  "components/storage/LocalStorageProjectRepository.js|setItem": 3,
  "components/storage/LocalStorageSettingsRepository.js|removeItem": 1,
  "components/storage/LocalStorageSettingsRepository.js|setItem": 1,
});

// This is the complete production syntactic surface for the ten legacy
// StorageService method names. Entries that are owner/domain calls rather than
// StorageService calls stay in this manifest so a newly named receiver cannot
// hide an unregistered persistence access.
export const expectedNamedMethodCalls = Object.freeze({
  "components/services/BindsetService.js|this|getProfile": 4,
  "components/services/DataCoordinator.js|this.storage|getAllData": 9,
  "components/services/ExportService.js|this.storage|getProfile": 1,
  "components/services/ImportService.js|this.storage|getProfile": 3,
  "components/services/PreferencesService.js|this|getSettings": 2,
  "components/services/PreferencesService.js|this|saveSettings": 1,
  "components/services/PreferencesService.js|this.storage|getSettings": 1,
  "components/services/PreferencesService.js|this.storage|saveSettings": 1,
  "components/services/ProjectManagementService.js|this.storage|getAllData": 1,
  "components/services/ProjectManagementService.js|this.storage|getSettings": 1,
  "components/services/StorageService.js|this|clearAllData": 1,
  "components/services/StorageService.js|this|createBackup": 1,
  "components/services/StorageService.js|this|getAllData": 4,
  "components/services/StorageService.js|this|getSettings": 1,
  "components/services/StorageService.js|this|saveAllData": 3,
  "components/services/dataCoordinatorInitialState.js|coordinator.storage|getAllData": 2,
  "components/services/dataCoordinatorResponders.js|coordinator|deleteProfile": 1,
  "components/services/preferencesOwnerMutationOperations.js|owner|getSettings": 8,
  "components/services/preferencesOwnerMutationOperations.js|owner.storage|clearSettings": 1,
  "components/services/preferencesOwnerMutationOperations.js|owner.storage|getSettings": 1,
  "components/services/projectImportOrchestrator.js|storage|getAllData": 2,
  "components/services/projectImportOrchestrator.js|storage|getSettings": 1,
  "components/services/projectImportOrchestrator.js|storage|saveAllData": 1,
  "components/services/projectImportOrchestrator.js|storage|saveProfile": 1,
  "components/services/projectImportOrchestrator.js|storage|saveSettings": 1,
  "components/services/storageWrites.js|storage|deleteProfile": 1,
  "components/services/storageWrites.js|storage|getAllData": 1,
  "components/services/storageWrites.js|storage|getProfile": 1,
  "components/services/storageWrites.js|storage|saveAllData": 2,
  "components/services/storageWrites.js|storage|saveProfile": 1,
  "components/services/syncProjectMaterializer.js|service.storage|getAllData": 1,
  "components/services/syncProjectMaterializer.js|service.storage|getSettings": 1,
  "components/ui/FileExplorerUI.js|this.storage|getAllData": 1,
  "components/ui/FileExplorerUI.js|this.storage|getProfile": 3,
  "components/ui/PreferencesUI.js|this|saveSettings": 1,
});

export const storageServiceCallClass = Object.freeze({
  "components/services/DataCoordinator.js|this.storage|getAllData": "external",
  "components/services/ExportService.js|this.storage|getProfile": "external",
  "components/services/ImportService.js|this.storage|getProfile": "external",
  "components/services/PreferencesService.js|this.storage|getSettings":
    "external",
  "components/services/PreferencesService.js|this.storage|saveSettings":
    "external",
  "components/services/ProjectManagementService.js|this.storage|getAllData":
    "external",
  "components/services/ProjectManagementService.js|this.storage|getSettings":
    "external",
  "components/services/StorageService.js|this|clearAllData": "internal",
  "components/services/StorageService.js|this|createBackup": "internal",
  "components/services/StorageService.js|this|getAllData": "internal",
  "components/services/StorageService.js|this|getSettings": "internal",
  "components/services/StorageService.js|this|saveAllData": "internal",
  "components/services/dataCoordinatorInitialState.js|coordinator.storage|getAllData":
    "external",
  "components/services/preferencesOwnerMutationOperations.js|owner.storage|clearSettings":
    "external",
  "components/services/preferencesOwnerMutationOperations.js|owner.storage|getSettings":
    "external",
  "components/services/projectImportOrchestrator.js|storage|getAllData":
    "external",
  "components/services/projectImportOrchestrator.js|storage|getSettings":
    "external",
  "components/services/projectImportOrchestrator.js|storage|saveAllData":
    "external",
  "components/services/projectImportOrchestrator.js|storage|saveProfile":
    "external",
  "components/services/projectImportOrchestrator.js|storage|saveSettings":
    "external",
  "components/services/storageWrites.js|storage|deleteProfile": "helper",
  "components/services/storageWrites.js|storage|getAllData": "helper",
  "components/services/storageWrites.js|storage|getProfile": "helper",
  "components/services/storageWrites.js|storage|saveAllData": "helper",
  "components/services/storageWrites.js|storage|saveProfile": "helper",
  "components/services/syncProjectMaterializer.js|service.storage|getAllData":
    "external",
  "components/services/syncProjectMaterializer.js|service.storage|getSettings":
    "external",
  "components/ui/FileExplorerUI.js|this.storage|getAllData": "external",
  "components/ui/FileExplorerUI.js|this.storage|getProfile": "external",
});

export const expectedStorageServiceCallsByMethod = Object.freeze({
  getAllData: 21,
  saveAllData: 6,
  getProfile: 8,
  saveProfile: 2,
  deleteProfile: 1,
  getSettings: 6,
  saveSettings: 2,
  clearSettings: 1,
  createBackup: 1,
  clearAllData: 1,
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
  "selection:select-alias",
  "selection:select-key",
  "sync:select-folder",
  "sync:sync-project",
  "ui:confirm",
  "ui:inform",
]);

export const expectedScalarCallsites = Object.freeze({
  "components/services/StorageService.js|localStorage|getItem|this.storageKey": 2,
  'components/services/StorageService.js|localStorage|getItem|"sto_app_reset"': 1,
  'components/services/StorageService.js|localStorage|removeItem|"sto_app_reset"': 1,
  "components/services/StorageService.js|localStorage|setItem|this.storageKey|JSON.stringify(dataWithMeta)": 1,
  "components/services/StorageService.js|localStorage|getItem|this.settingsKey": 1,
  "components/services/StorageService.js|localStorage|setItem|this.settingsKey|JSON.stringify(persistedSettings)": 1,
  "components/services/StorageService.js|localStorage|removeItem|this.settingsKey": 2,
  "components/services/StorageService.js|localStorage|setItem|this.backupKey|JSON.stringify(backup)": 1,
  "components/services/StorageService.js|localStorage|removeItem|this.storageKey": 1,
  "components/services/StorageService.js|localStorage|removeItem|this.backupKey": 1,
  'components/services/StorageService.js|localStorage|setItem|"sto_app_reset"|"true"': 1,
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

export const storageCallsiteDispositions = Object.freeze({
  "components/services/DataCoordinator.js|deleteProfile|this.storage|getAllData":
    [2, "owner", "4"],
  "components/services/DataCoordinator.js|createDefaultProfilesFromData|this.storage|getAllData":
    [2, "owner", "4"],
  "components/services/DataCoordinator.js|createFallbackProfiles|this.storage|getAllData":
    [2, "owner", "4"],
  "components/services/DataCoordinator.js|normalizeAllProfiles|this.storage|getAllData":
    [1, "owner", "4"],
  "components/services/DataCoordinator.js|reloadState|this.storage|getAllData":
    [2, "owner", "4"],
  "components/services/dataCoordinatorInitialState.js|loadInitialCoordinatorState|coordinator.storage|getAllData":
    [2, "owner", "4"],
  "components/services/PreferencesService.js|_loadInitialState|this.storage|getSettings":
    [1, "owner", "2"],
  "components/services/PreferencesService.js|persistSettings|this.storage|saveSettings|structuredClone(settings)|{ replace: true, }":
    [1, "owner", "2"],
  "components/services/preferencesOwnerMutationOperations.js|activatePersistedPreferencesWithinMutation|owner.storage|clearSettings":
    [1, "owner", "2"],
  "components/services/preferencesOwnerMutationOperations.js|activatePersistedPreferencesWithinMutation|owner.storage|getSettings":
    [1, "owner", "2"],
  "components/services/projectImportOrchestrator.js|importProjectToStorage|storage|getAllData":
    [2, "workflow", "7"],
  "components/services/projectImportOrchestrator.js|importProjectToStorage|storage|saveProfile|profileId|profile":
    [1, "workflow", "7"],
  "components/services/projectImportOrchestrator.js|importProjectToStorage|storage|getSettings":
    [1, "workflow", "7"],
  "components/services/projectImportOrchestrator.js|importProjectToStorage|storage|saveSettings|mergedSettings":
    [1, "workflow", "7"],
  "components/services/projectImportOrchestrator.js|importProjectToStorage|storage|saveAllData|restoredData":
    [1, "workflow", "7"],
  "components/services/ProjectManagementService.js|backupApplicationState|this.storage|getAllData":
    [1, "workflow", "6-7"],
  "components/services/ProjectManagementService.js|backupApplicationState|this.storage|getSettings":
    [1, "workflow", "6-7"],
  "components/services/syncProjectMaterializer.js|materializeSyncProject|service.storage|getAllData":
    [1, "workflow", "6"],
  "components/services/syncProjectMaterializer.js|materializeSyncProject|service.storage|getSettings":
    [1, "workflow", "6"],
  "components/services/StorageService.js|onInit|this|getAllData|true": [
    1,
    "workflow",
    "4",
  ],
  "components/services/StorageService.js|onInit|this|saveAllData|data": [
    1,
    "workflow",
    "4",
  ],
  "components/services/StorageService.js|handleAppReset|this|clearAllData|{ preserveSettings: true }":
    [1, "workflow", "8"],
  "components/ui/FileExplorerUI.js|setupEventListeners|this.storage|getProfile|profileId":
    [1, "projection", "6"],
  "components/ui/FileExplorerUI.js|buildTree|this.storage|getAllData": [
    1,
    "projection",
    "6",
  ],
  "components/ui/FileExplorerUI.js|generateBuildExport|this.storage|getProfile|profileId":
    [1, "projection", "6"],
  "components/ui/FileExplorerUI.js|generateAliasExport|this.storage|getProfile|profileId":
    [1, "projection", "6"],
  "components/services/ImportService.js|importKeybindFile|this.storage|getProfile|profileId":
    [1, "projection", "6"],
  "components/services/ImportService.js|importAliasFile|this.storage|getProfile|profileId":
    [1, "projection", "6"],
  "components/services/ImportService.js|importKBFFile|this.storage|getProfile|profileId":
    [1, "projection", "6"],
  "components/services/ExportService.js|getProfileFromCache|this.storage|getProfile|profileId":
    [1, "compatibility", "6"],
  "components/services/StorageService.js|saveAllData|this|createBackup|savedAt":
    [1, "compatibility", "4"],
  "components/services/StorageService.js|getProfile|this|getAllData": [
    1,
    "compatibility",
    "4",
  ],
  "components/services/StorageService.js|saveProfile|this|getAllData|true": [
    1,
    "compatibility",
    "4",
  ],
  "components/services/StorageService.js|saveProfile|this|saveAllData|data": [
    1,
    "compatibility",
    "4",
  ],
  "components/services/StorageService.js|deleteProfile|this|getAllData": [
    1,
    "compatibility",
    "4",
  ],
  "components/services/StorageService.js|deleteProfile|this|saveAllData|data": [
    1,
    "compatibility",
    "4",
  ],
  "components/services/StorageService.js|saveSettings|this|getSettings": [
    1,
    "compatibility",
    "2",
  ],
  "components/services/storageWrites.js|all|storage|saveAllData|data": [
    1,
    "compatibility",
    "4",
  ],
  "components/services/storageWrites.js|all|storage|saveAllData|data|options": [
    1,
    "compatibility",
    "4",
  ],
  "components/services/storageWrites.js|profile|storage|saveProfile|profileId|profile":
    [1, "compatibility", "4"],
  "components/services/storageWrites.js|profile|storage|getProfile|profileId": [
    1,
    "compatibility",
    "4",
  ],
  "components/services/storageWrites.js|currentProfile|storage|getAllData": [
    1,
    "compatibility",
    "4",
  ],
  "components/services/storageWrites.js|deleteProfile|storage|deleteProfile|profileId":
    [1, "dead", "4"],
});
