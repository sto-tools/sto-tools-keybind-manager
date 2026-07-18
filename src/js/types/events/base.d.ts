/** Shared structural vocabulary for the application event protocol. */

export type AliasDefinition =
  import("../../components/services/serviceTypes.js").AliasDefinition;
export type ProfileData =
  import("../../components/services/serviceTypes.js").ProfileData;
export type ProfileOperations =
  import("../../components/services/serviceTypes.js").ProfileOperations;

/**
 * Services validate the three known environments at some boundaries, while a
 * few legacy producers still carry an unchecked string. The open string arm
 * records that compatibility fact without losing autocomplete for known names.
 */
export type Environment =
  | "space"
  | "ground"
  | "alias"
  | (string & { readonly __environmentCompatibility?: never });

export type SelectionSource = "SelectionService";
export type KeyViewMode =
  | "grid"
  | "categorized"
  | "key-types"
  | (string & { readonly __keyViewModeCompatibility?: never });
export type ToastKind =
  | "info"
  | "success"
  | "warning"
  | "error"
  | (string & { readonly __toastKindCompatibility?: never });

export interface CommandRecord {
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
  parameters?: Record<string, unknown>;
  [field: string]: unknown;
}

export type StoredCommand = string | CommandRecord;
export type CommandList = StoredCommand[];
export type AliasMap = Record<string, AliasDefinition>;
export type KeyCommandMap = Record<string, CommandList>;
export type ProfileMap = Record<string, ProfileData>;

/** Known application settings and the value type accepted for each key. */
export type KnownPreferencesSettings =
  import("../data-contracts.js").KnownPreferencesSettings;

/** Complete known settings plus application-defined extension settings. */
export type PreferencesSettings = KnownPreferencesSettings &
  Record<string, unknown>;

export type KnownPreferenceKey =
  import("../data-contracts.js").KnownPreferenceKey;

declare const extensionPreferenceKeyBrand: unique symbol;

/**
 * An application-defined preference key that passed the runtime guard against
 * accidentally reclassifying a known setting as an extension.
 */
export type ExtensionPreferenceKey = string & {
  readonly [extensionPreferenceKeyBrand]: true;
};

/**
 * A settings patch. Known keys retain their declared value types; other keys
 * are extension settings whose values remain application-defined.
 */
export type SettingsRecord = Partial<KnownPreferencesSettings> &
  Record<string, unknown>;

/** A single known-setting mutation whose key determines its value type. */
export type KnownPreferenceMutation = {
  [Key in KnownPreferenceKey]: {
    key: Key;
    value: KnownPreferencesSettings[Key];
    extension?: false;
  };
}[KnownPreferenceKey];

/**
 * Explicit opt-in path for setting an application-defined extension key.
 * Runtime responders reject known keys sent through this path.
 */
export type ExtensionPreferenceMutation = {
  key: ExtensionPreferenceKey;
  value: unknown;
  extension: true;
};

export type PreferenceMutation =
  | KnownPreferenceMutation
  | ExtensionPreferenceMutation;

export interface ValidationIssue {
  id: string;
  severity: "warning" | "error";
  key?: string;
  params?: Record<string, unknown>;
  defaultMessage?: string;
}

export interface DragState {
  isDragging: boolean;
  dragElement: HTMLElement | null;
  dragData: DOMStringMap | null;
}

export interface DragDropOptions {
  draggableSelector?: string;
  dropZoneSelector?: string;
  onDragStart?: ((event: DragEvent, state: DragState) => void) | null;
  onDragEnd?: ((event: DragEvent, state: DragState) => void) | null;
  onDrop?:
    | ((event: DragEvent, state: DragState, dropZone: Element) => void)
    | null;
}

export interface ClipboardOperationResult {
  success: boolean;
  message: "content_copied_to_clipboard" | "failed_to_copy_to_clipboard";
}

export type StorageBackup =
  import("../data-contracts.js").LocalStorageBackupEnvelope;

export type StoredApplicationData =
  import("../data-contracts.js").StoredApplicationData;

export type ProjectBackupData =
  import("../data-contracts.js").CurrentProjectArtifactEnvelope;

export interface ProjectImportCounts {
  profiles: number;
  settings: boolean;
}

export interface EditingContext {
  isEditing?: boolean;
  editIndex?: number;
  /** The legacy responder has no canonical command model at this boundary. */
  existingCommand?: unknown;
}

export type SelectionCache = {
  space: string | null;
  ground: string | null;
  alias: string | null;
} & Record<string, string | null>;

export interface SelectionStateSnapshot {
  selectedKey: string | null;
  selectedAlias: string | null;
  editingContext: EditingContext | null;
  cachedSelections: SelectionCache;
  currentEnvironment: Environment;
}

export interface VfxSettingsSnapshot {
  selectedEffects: {
    space: string[];
    ground: string[];
  };
  showPlayerSay: boolean;
}

export interface VfxManagerCapability {
  selectedEffects: {
    space: Set<string>;
    ground: Set<string>;
  };
  showPlayerSay: boolean;
  isEffectSelected(environment: "space" | "ground", effect: string): boolean;
  toggleEffect(environment: "space" | "ground", effect: string): void;
  selectAllEffects(environment: "space" | "ground"): void;
  getEffectCount(environment: "space" | "ground"): number;
  generateAlias(environment: "space" | "ground"): string | null;
}

/** An actually empty object payload, not TypeScript's broad `{}` type. */
export type EmptyObjectPayload = Readonly<Record<PropertyKey, never>>;
