/**
 * Shared structural types for service dependencies and browser-owned globals.
 * This module intentionally has no runtime exports.
 *
 * @typedef {typeof import('../../core/eventBus.js').default} EventBus
 * @typedef {typeof import('i18next').default} I18n
 * @typedef {import('./StorageService.js').default} Storage
 * @typedef {import('./FileSystemService.js').default} FileSystem
 *
 * @typedef {Object} RichCommand
 * @property {string} [command]
 * @property {string} [text]
 * @property {string} [id]
 * @property {string} [type]
 * @property {string} [category]
 * @property {boolean} [custom]
 * @property {boolean} [palindromicGeneration]
 * @property {string} [placement]
 * @property {Record<string, unknown>} [parameters]
 *
 * @typedef {string | RichCommand} StoredCommand
 *
 * @typedef {Object} AliasDefinition
 * @property {string} [description]
 * @property {StoredCommand[] | string} [commands]
 * @property {string} [type]
 * @property {string} [name]
 * @property {boolean} [isGenerated]
 * @property {boolean} [isLoader]
 * @property {string} [category]
 * @property {Record<string, unknown>} [metadata]
 *
 * @typedef {Object} EnvironmentBindingData
 * @property {Record<string, StoredCommand[]>} [keys]
 * @property {Record<string, AliasDefinition>} [aliases]
 *
 * @typedef {Object} ProfileOperationPatch
 * @property {Record<string, AliasDefinition>} [aliases]
 * @property {Record<string, EnvironmentBindingData>} [builds]
 * @property {Record<string, BindsetData>} [bindsets]
 * @property {Record<string, BindsetKeyMetadata>} [aliasMetadata]
 * @property {Record<string, Record<string, BindsetKeyMetadata>>} [keybindMetadata]
 * @property {Record<string, Record<string, Record<string, BindsetKeyMetadata>>>} [bindsetMetadata]
 *
 * @typedef {Object} BindsetModifyEnvironmentData
 * @property {Record<string, StoredCommand[] | null>} [keys]
 *
 * @typedef {Record<string, BindsetModifyEnvironmentData>} BindsetModifyData
 *
 * @typedef {Omit<ProfileOperationPatch, 'bindsets'> & {
 *   bindsets?: Record<string, BindsetModifyData>
 * }} ProfileModifyPatch
 *
 * @typedef {Object} ProfileDeletePatch
 * @property {string[]} [aliases]
 * @property {Record<string, { keys?: string[] }>} [builds]
 * @property {string[]} [bindsets]
 * @property {string[]} [bindsetMetadata]
 *
 * @typedef {Object} ProfileProperties
 * @property {string} [name]
 * @property {string} [description]
 * @property {string} [currentEnvironment]
 * @property {string} [lastModified]
 * @property {Record<string, string | null>} [selections]
 *
 * @typedef {Object} ProfileOperations
 * @property {ProfileOperationPatch} [add]
 * @property {ProfileModifyPatch} [modify]
 * @property {ProfileDeletePatch} [delete]
 * @property {ProfileProperties} [properties]
 * @property {ProfileData} [replacement]
 * @property {string} [updateSource]
 *
 * @typedef {Object} CoordinatorMetadata
 * @property {string | null | undefined} lastModified
 * @property {string} version
 *
 * @typedef {Object} CoordinatorState
 * @property {string | null} currentProfile
 * @property {string} currentEnvironment
 * @property {string} [currentBindset]
 * @property {Record<string, ProfileData>} profiles
 * @property {Record<string, unknown>} settings
 * @property {CoordinatorMetadata} metadata
 *
 * @typedef {Object} CommandImportSource
 * @property {string} value
 * @property {string} label
 * @property {'key' | 'alias'} type
 *
 * @typedef {Object} ParsedKeybind
 * @property {string} raw
 * @property {StoredCommand[]} commands
 *
 * @typedef {Object} ParsedKeybindFile
 * @property {Record<string, ParsedKeybind>} keybinds
 * @property {Record<string, AliasDefinition>} aliases
 * @property {string[]} errors
 * @property {import('../../types/text-import-boundary.js').KeybindTextFailure} [failure]
 *
 * @typedef {Object} ParsedAliasFile
 * @property {Record<string, { commands: string, description?: string }>} aliases
 * @property {string[]} errors
 * @property {import('../../types/text-import-boundary.js').AliasTextFailure} [failure]
 *
 * @typedef {import('../../types/kbf-boundary.js').KBFDiagnostic} KBFIssue
 * @typedef {import('../../types/kbf-boundary.js').KBFKeyData} KBFKeyData
 * @typedef {import('../../types/kbf-boundary.js').KBFBindset} KBFBindset
 * @typedef {import('../../types/kbf-boundary.js').KBFParseStats} KBFParseStats
 * @typedef {import('../../types/kbf-boundary.js').KBFParseResult} KBFParseResult
 *
 * @typedef {Object} KBFImportConfiguration
 * @property {string[]} [selectedBindsets]
 * @property {Record<string, string>} [bindsetRenames]
 * @property {Record<string, 'primary' | 'custom'>} [bindsetMappings]
 * @property {boolean} [singleBindsetMode]
 *
 * @typedef {Record<string, EnvironmentBindingData>} BindsetData
 *
 * @typedef {Object} BindsetKeyMetadata
 * @property {boolean} [stabilizeExecutionOrder]
 *
 * @typedef {Object} VertigoSettings
 * @property {{ space?: string[], ground?: string[] }} [selectedEffects]
 * @property {boolean} [showPlayerSay]
 *
 * @typedef {Object} ProfileData
 * @property {string} [id]
 * @property {string} [name]
 * @property {string} [description]
 * @property {string} [currentEnvironment]
 * @property {string} [environment]
 * @property {Record<string, EnvironmentBindingData>} [builds]
 * @property {Record<string, AliasDefinition>} [aliases]
 * @property {Record<string, BindsetData>} [bindsets]
 * @property {Record<string, Record<string, Record<string, BindsetKeyMetadata>>>} [bindsetMetadata]
 * @property {Record<string, BindsetKeyMetadata>} [aliasMetadata]
 * @property {Record<string, Record<string, BindsetKeyMetadata>>} [keybindMetadata]
 * @property {Record<string, StoredCommand[]>} [keys]
 * @property {Record<string, Record<string, StoredCommand[]>>} [keybinds]
 * @property {Record<string, string | null>} [selections]
 * @property {string} [created]
 * @property {string} [lastModified]
 * @property {string} [migrationVersion]
 * @property {VertigoSettings} [vertigoSettings]
 *
 * @typedef {Object} ServicePreferences
 * @property {boolean} [bindsetsEnabled]
 * @property {boolean} [bindToAliasMode]
 * @property {boolean} [autoSync]
 * @property {string} [autoSyncInterval]
 *
 * @typedef {Object} ServiceCache
 * @property {string | null} selectedKey
 * @property {string | null} selectedAlias
 * @property {string} currentEnvironment
 * @property {string | null} currentProfile
 * @property {ProfileData | null} profile
 * @property {Record<string, StoredCommand[]>} keys
 * @property {Record<string, AliasDefinition>} aliases
 * @property {Record<string, EnvironmentBindingData> | null} builds
 * @property {ServicePreferences} preferences
 * @property {string} activeBindset
 * @property {string[]} bindsetNames
 *
 * @typedef {ServiceCache & { profiles: Record<string, ProfileData> }} ExportCache
 *
 * @typedef {Object} ToastUI
 * @property {(message: string, type?: string, duration?: number) => unknown} showToast
 *
 * @typedef {Object} ConfirmDialog
 * @property {(message: string, title?: string, kind?: string, id?: string) => Promise<boolean>} confirm
 * @property {(message: string, title?: string, kind?: string, id?: string) => Promise<void>} inform
 *
 * @typedef {Object} CommandDefinition
 * @property {string} [command]
 * @property {string} [environment]
 * @property {string} [warning]
 * @property {string} [name]
 * @property {string} [description]
 * @property {string} [text]
 * @property {string} [baseCommand]
 * @property {string} [icon]
 * @property {boolean} [customizable]
 * @property {Record<string, unknown>} [parameters]
 * @property {string} [syntax]
 *
 * @typedef {Object} CommandCategory
 * @property {Record<string, CommandDefinition>} commands
 * @property {string} [description]
 * @property {string} [icon]
 * @property {string} [name]
 *
 * @typedef {Object} STOData
 * @property {Record<string, CommandCategory>} [commands]
 * @property {{ maxCommandsPerKey?: number, maxKeysPerProfile?: number }} [validation]
 * @property {Record<string, unknown>} [defaultProfiles]
 *
 * @typedef {Window & typeof globalThis & {
 *   STO_DATA?: { settings?: { version?: string } },
 *   applyTranslations?: (root?: Document | Element | null) => void,
 *   confirmDialog?: ConfirmDialog,
 *   i18next?: I18n,
 *   localizeCommandData?: () => void,
 *   showDirectoryPicker?: () => Promise<unknown>,
 *   stoUI?: ToastUI,
 *   COMMANDS?: Record<string, CommandDefinition>
 * }} AppWindow
 */

export {};
