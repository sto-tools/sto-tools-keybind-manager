import type {
  AliasMap,
  CommandGroupType,
  KeyViewMode,
  PreferencesSettings,
  ProfileData,
  ProfileMap,
  SelectionStateSnapshot,
  VfxSettingsSnapshot,
} from "./base.js";

/** Complete late-join snapshot published by DataCoordinator. */
export interface DataCoordinatorStateSnapshot {
  /** Monotonic identity of the DataCoordinator instance that owns this state. */
  authorityEpoch: number;
  ready: boolean;
  revision: number;
  currentProfile: string | null;
  currentEnvironment: string;
  currentProfileData: ProfileData | null;
  profiles: ProfileMap;
  metadata: {
    lastModified: string | null | undefined;
    version: string;
  };
}

export interface DataServiceStateSnapshot {
  defaultProfiles: ProfileMap;
  hasCommands: boolean;
  dataAvailable: boolean;
}

export interface BindsetSelectorPreferencesSnapshot
  extends Record<string, unknown> {
  bindsetsEnabled?: boolean;
  bindToAliasMode?: boolean;
  autoSync?: boolean;
  autoSyncInterval?: string;
  translateGeneratedMessages?: boolean;
}

export interface BindsetSelectorStateSnapshot {
  selectedKey: string | null;
  activeBindset: string | undefined;
  bindsetNames: string[];
  keyBindsetMembership: Map<string, boolean>;
  shouldDisplay: boolean;
  preferences: BindsetSelectorPreferencesSnapshot;
}

export interface BindsetStateSnapshot {
  bindsets: string[];
}

export interface KeyBrowserViewStateSnapshot {
  authorityEpoch: number;
  revision: number;
  mode: KeyViewMode;
  collapsedCategories: {
    command: readonly string[];
    keyType: readonly string[];
  };
  collapsedBindsets: readonly string[];
}

export interface CommandPresentationStateSnapshot {
  authorityEpoch: number;
  revision: number;
  collapsedCategories: readonly string[];
  collapsedGroups: readonly CommandGroupType[];
}

/** Complete late-join snapshot owned by KeyCaptureService. */
export interface KeyCaptureStateSnapshot {
  authorityEpoch: number;
  revision: number;
  isCapturing: boolean;
  context: string;
  locationSpecific: boolean;
  pressedCodes: readonly string[];
  currentChord: string;
  capturedChord: string | null;
}

export interface ExportStateSnapshot {
  currentProfile: string | null;
  currentEnvironment: string;
  profiles: ProfileMap;
}

export interface InterfaceModeStateSnapshot {
  currentMode: string;
  environment: string;
  currentEnvironment: string;
}

export interface PreferencesStateSnapshot {
  settings: PreferencesSettings;
}

/**
 * Structural storage capability retained by the legacy late-join snapshot.
 * Naming the concrete StorageService here would recursively couple the event
 * registry back through ComponentBase.
 */
export interface StorageServiceCapability {
  isInitialized(): boolean;
  getAllData(forceFresh?: boolean): unknown;
  saveAllData(data: unknown, options?: { preserveBackup?: boolean }): boolean;
  getProfile(profileId: string): unknown;
  saveProfile(profileId: string, profile: unknown): boolean;
  deleteProfile(profileId: string): boolean;
  getSettings(): unknown;
  saveSettings(
    settings: Record<string, unknown>,
    options?: { replace?: boolean },
  ): boolean;
  createBackup(): void;
  clearAllData(): boolean;
}

export interface StorageStateSnapshot {
  service: StorageServiceCapability;
  isReady: boolean;
}

export interface CommandLibraryUiStateSnapshot {
  aliases: AliasMap;
  currentProfile: string | null;
  currentEnvironment: string;
  selectedKey: string | null;
  selectedAlias: string | null;
}

export interface ProfileUiStateSnapshot {
  currentProfile: string | null;
  currentEnvironment: string;
}

/** Every component that currently overrides ComponentBase.getCurrentState. */
export interface ComponentStateProtocol {
  BindsetSelectorService: BindsetSelectorStateSnapshot;
  BindsetService: BindsetStateSnapshot;
  CommandPresentationService: CommandPresentationStateSnapshot;
  DataCoordinator: DataCoordinatorStateSnapshot;
  DataService: DataServiceStateSnapshot;
  ExportService: ExportStateSnapshot;
  InterfaceModeService: InterfaceModeStateSnapshot;
  KeyBrowserService: KeyBrowserViewStateSnapshot;
  KeyCaptureService: KeyCaptureStateSnapshot;
  PreferencesService: PreferencesStateSnapshot;
  SelectionService: SelectionStateSnapshot;
  StorageService: StorageStateSnapshot;
  VFXManagerService: VfxSettingsSnapshot;
  CommandLibraryUI: CommandLibraryUiStateSnapshot;
  ProfileUI: ProfileUiStateSnapshot;
}

export type ComponentStateSender = Extract<
  keyof ComponentStateProtocol,
  string
>;

export type ComponentState<Sender extends ComponentStateSender> =
  ComponentStateProtocol[Sender];

/**
 * A mapped union keeps sender and state correlated when Sender is a union.
 * A plain `{ sender: Sender; state: ComponentState<Sender> }` would not narrow.
 */
export type ComponentStateReply<
  Sender extends ComponentStateSender = ComponentStateSender,
> = {
  [CurrentSender in Sender]: {
    sender: CurrentSender;
    state: ComponentStateProtocol[CurrentSender];
  };
}[Sender];
