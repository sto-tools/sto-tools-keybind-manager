import type {
  AliasDefinition,
  CodedFailure,
  KBFImportConfiguration,
  KBFParseResult,
  Profile,
  RequiredRpc,
  UnknownRecord,
} from "./base.js";
import type { AliasImportResult } from "./aliases.js";
import type { SyncDirectoryHandle } from "../sync-boundary.js";

export type ImportStrategy =
  | "merge_keep"
  | "merge_overwrite"
  | "overwrite_all"
  | (string & {});

export type NamedProfile = Profile & { name: string };

export type KeybindImportResult =
  | {
      success: true;
      imported: { keys: number };
      skipped: number;
      overwritten: number;
      cleared: number;
      errors: string[];
      message: string;
    }
  | CodedFailure<
      | "no_keybinds_found_in_file"
      | "invalid_keybind_file_content"
      | "keybind_file_too_large"
      | "storage_not_available"
      | "no_active_profile"
      | "invalid_environment"
      | "import_failed"
    >;

export type ProjectImportResult =
  | {
      success: true;
      message: string;
      imported: { profiles: number; settings: boolean };
      currentProfile: string | null;
    }
  | { success: false; error: "storage_not_available" }
  | { success: false; error: "import_failed_invalid_json" }
  | {
      success: false;
      error: "invalid_project_file";
      params: { path: string };
    }
  | {
      success: false;
      error: "invalid_project_options";
      params: { path: "$.options" | "$.options.importSettings" };
    }
  | {
      success: false;
      error: "storage_write_failed";
      params:
        | { operation: "profile"; profileId: string }
        | { operation: "settings" | "project" };
      partial: boolean;
      committed: {
        profiles: string[];
        settings: boolean;
        project: boolean;
      };
    };

export type KBFImportError =
  | "invalid_kbf_file_content"
  | "storage_not_available"
  | "no_active_profile"
  | "invalid_environment"
  | "invalid_kbf_file_format"
  | "no_valid_bindsets_found"
  | "profile_not_found"
  | "multiple_bindsets_not_allowed"
  | "non_primary_mapping_not_allowed"
  | "kbf_import_critical_error";

export type KBFImportResult =
  | {
      success: true;
      message: string;
      imported: { bindsets: number; keys: number; aliases: number };
      skipped: number;
      overwritten: number;
      cleared: number;
      stats: {
        processedLayers?: number;
        skippedActivities?: number;
        totalActivities: number;
        totalErrors: number;
        totalWarnings: number;
      };
      errors: string[];
      warnings: string[];
      bindsetNames: string[];
      masterBindset: {
        hasMasterBindset: boolean;
        masterBindsetName?: string;
        mappedToPrimary: boolean;
        displayName: string | null;
      };
      singleBindsetFile: {
        isSingleBindset: boolean;
        onlyBindsetIsMaster: boolean;
        requiresBindsetSelection: boolean;
        totalBindsetsAvailable: number;
        selectedBindsetsCount: number;
      };
    }
  | {
      success: false;
      error: KBFImportError;
      message?: string;
      errors?: string[];
      warnings?: string[];
      params?: Record<string, unknown>;
    };

export type KBFParseForUiResult =
  | {
      valid: true;
      bindsets: KBFParseResult["bindsets"];
      bindsetNames: string[];
      bindsetKeyCounts: Record<string, number>;
      hasMasterBindset: boolean;
      masterDisplayName: string;
      metadata: {
        totalBindsets: number;
        estimatedSize: number;
        hasAliases: boolean | undefined;
      };
      validation: { valid: true; errors: string[]; warnings: string[] };
      singleBindsetFile: {
        isSingleBindset: boolean;
        onlyBindsetIsMaster: boolean;
        requiresBindsetSelection: boolean;
      };
      requiresBindsetSelection: boolean;
    }
  | {
      valid: false;
      error:
        | "invalid_kbf_file_content"
        | "invalid_environment"
        | "invalid_kbf_file_format"
        | "no_valid_bindsets_found"
        | "kbf_parse_critical_error";
      message: string;
      errors?: string[];
      warnings?: string[];
      params?: Record<string, unknown>;
    };

export interface ImportExportRpcProtocol {
  "environment:switch": RequiredRpc<
    { mode?: string },
    | { success: true; mode: string }
    | { success: false; error: "No mode provided" }
  >;
  "export:generate-alias-file": RequiredRpc<{ profileId: string }, string>;
  "export:generate-alias-filename": RequiredRpc<
    { profile: NamedProfile; extension: string },
    string
  >;
  "export:generate-filename": RequiredRpc<
    { profile: NamedProfile; extension: string; environment?: string },
    string
  >;
  "export:generate-keybind-file": RequiredRpc<
    { profileId: string; environment?: string; syncMode?: boolean },
    string
  >;
  "export:sync-to-folder": RequiredRpc<
    { dirHandle: SyncDirectoryHandle },
    undefined
  >;
  "import:alias-file": RequiredRpc<
    {
      content: string;
      profileId: string | null;
      options?: { strategy?: string };
      strategy?: ImportStrategy;
    },
    AliasImportResult
  >;
  "import:kbf-file": RequiredRpc<
    {
      content: string;
      profileId: string | null;
      environment?: "space" | "ground";
      options?: UnknownRecord;
      strategy?: string;
      configuration?: KBFImportConfiguration;
    },
    KBFImportResult
  >;
  "import:keybind-file": RequiredRpc<
    {
      content: string;
      profileId: string | null;
      environment?: "space" | "ground";
      options?: { strategy?: string };
      strategy?: string;
    },
    KeybindImportResult
  >;
  "import:project-file": RequiredRpc<
    { content: string; options?: { importSettings?: boolean } },
    ProjectImportResult
  >;
  "parse-kbf-file": RequiredRpc<
    { content: string; environment?: "space" | "ground" },
    KBFParseForUiResult
  >;
}
