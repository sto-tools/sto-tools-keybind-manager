/** JSON-safe values accepted at persistence and import boundaries. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject {
  [field: string]: JsonValue;
}

export interface RichCommand {
  command?: string;
  text?: string;
  id?: string;
  type?: string;
  category?: string;
  categoryId?: string;
  commandId?: string;
  name?: string;
  description?: string;
  icon?: string;
  environment?: string;
  warning?: string;
  customizable?: boolean;
  custom?: boolean;
  palindromicGeneration?: boolean;
  placement?: string;
  parameters?: JsonObject;
  [field: string]: unknown;
}

export type StoredCommand = string | RichCommand;

export interface AliasDefinition {
  description?: string;
  commands?: StoredCommand[] | StoredCommand;
  type?: string;
  name?: string;
  isGenerated?: boolean;
  isLoader?: boolean;
  category?: string;
  metadata?: JsonObject;
  [field: string]: unknown;
}

export interface CanonicalAliasDefinition extends AliasDefinition {
  commands?: StoredCommand[];
}

export interface EnvironmentBindingData {
  keys?: Record<string, StoredCommand[]>;
  aliases?: Record<string, AliasDefinition>;
  [field: string]: unknown;
}

export interface CanonicalEnvironmentBindingData
  extends EnvironmentBindingData {
  keys: Record<string, StoredCommand[]>;
  aliases?: Record<string, CanonicalAliasDefinition>;
}

export type BindsetData = Record<string, EnvironmentBindingData>;
export type CanonicalBindsetData = Record<
  string,
  CanonicalEnvironmentBindingData
>;

export interface BindsetKeyMetadata {
  stabilizeExecutionOrder?: boolean;
  [field: string]: unknown;
}

export interface VertigoSettings {
  selectedEffects?: {
    space?: string[];
    ground?: string[];
    [environment: string]: string[] | undefined;
  };
  showPlayerSay?: boolean;
  [field: string]: unknown;
}

export interface LegacyProfileData {
  id?: string;
  name?: string;
  description?: string;
  mode?: string | number | boolean;
  currentEnvironment?: string;
  environment?: string;
  keys?: Record<string, StoredCommand[] | StoredCommand>;
  keybinds?: Record<string, Record<string, StoredCommand[] | StoredCommand>>;
  aliases?: Record<string, AliasDefinition | StoredCommand[] | string>;
  bindsets?: Record<string, BindsetData>;
  keybindMetadata?: Record<
    string,
    BindsetKeyMetadata | Record<string, BindsetKeyMetadata>
  >;
  aliasMetadata?: Record<string, BindsetKeyMetadata>;
  bindsetMetadata?: Record<
    string,
    Record<string, Record<string, BindsetKeyMetadata>>
  >;
  selections?: Record<string, string | null>;
  created?: string;
  lastModified?: string;
  migrationVersion?: string;
  vertigoSettings?: VertigoSettings;
  [field: string]: unknown;
}

export interface ProfileData extends LegacyProfileData {
  builds?: Record<string, EnvironmentBindingData>;
}

export interface CanonicalProfileData
  extends Omit<ProfileData, "mode" | "keys" | "keybinds" | "builds"> {
  name: string;
  description: string;
  currentEnvironment: string;
  builds: {
    space: CanonicalEnvironmentBindingData;
    ground: CanonicalEnvironmentBindingData;
    [environment: string]: CanonicalEnvironmentBindingData;
  };
  aliases: Record<string, CanonicalAliasDefinition>;
  bindsets: Record<string, CanonicalBindsetData>;
  keybindMetadata: Record<string, Record<string, BindsetKeyMetadata>>;
  aliasMetadata: Record<string, BindsetKeyMetadata>;
  bindsetMetadata: Record<
    string,
    Record<string, Record<string, BindsetKeyMetadata>>
  >;
  selections: Record<string, string | null>;
}

export interface KnownPreferencesSettings {
  theme: string;
  autoSave: boolean;
  showTooltips: boolean;
  confirmDeletes: boolean;
  maxUndoSteps: number;
  defaultMode: string;
  compactView: boolean;
  language: string;
  syncFolderName: string | null;
  syncFolderPath: string | null;
  autoSync: boolean;
  autoSyncInterval: string;
  bindToAliasMode: boolean;
  bindsetsEnabled: boolean;
  translateGeneratedMessages: boolean;
}

export type KnownPreferenceKey = keyof KnownPreferencesSettings;

/**
 * The settings record also carries compatibility fields used outside the
 * PreferencesService-owned UI settings.
 */
export type SettingsData = Partial<KnownPreferencesSettings> & {
  syncFolderFallback?: boolean;
  currentProfile?: string | null;
  version?: string;
  firstRun?: boolean;
  [field: string]: unknown;
};

export interface StoredApplicationData {
  version: string;
  created?: string;
  lastModified: string;
  lastBackup?: string;
  currentProfile: string | null;
  profiles: Record<string, ProfileData>;
  globalAliases?: Record<string, AliasDefinition>;
  settings: SettingsData;
  [field: string]: unknown;
}

export interface CanonicalProjectData {
  profiles?: Record<string, CanonicalProfileData>;
  settings?: SettingsData;
  currentProfile?: string | null;
}

/** Accepted project envelope. Older supported exports omit metadata fields. */
export interface ProjectEnvelope {
  version?: string;
  exported?: string;
  type: "project";
  data: CanonicalProjectData;
}

/** Shape emitted by current backup and sync producers. */
export interface CurrentProjectBackupEnvelope extends ProjectEnvelope {
  version: string;
  exported: string;
  data: Required<CanonicalProjectData>;
}

export type ProjectDecodeResult =
  | { success: true; value: ProjectEnvelope }
  | { success: false; error: "import_failed_invalid_json" }
  | {
      success: false;
      error: "invalid_project_file";
      params: { path: string };
    };
