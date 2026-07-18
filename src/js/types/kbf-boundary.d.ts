import type { JsonValue } from "./data-contracts.js";

export type KBFMetadata = Record<string, JsonValue>;

export interface KBFKeyMetadata {
  stabilizeExecutionOrder?: boolean;
}

export interface KBFBindsetMetadata {
  displayName?: string;
}

export interface KBFKeyData {
  commands: string[];
  metadata: KBFKeyMetadata;
}

export interface KBFAliasDefinition {
  commands?: string[];
  description?: string;
  type?: string;
  name?: string;
  isGenerated?: boolean;
  isLoader?: boolean;
  category?: string;
  metadata?: KBFMetadata;
  steps?: string[];
  currentIndex?: number;
  next?: string;
}

export interface KBFBindset {
  keys: Record<string, KBFKeyData>;
  aliases: Record<string, KBFAliasDefinition>;
  metadata: KBFBindsetMetadata;
}

export type KBFDiagnostic =
  | string
  | ({
      message: string;
      fatal?: false;
    } & Record<string, JsonValue>);

export interface KBFParseStats {
  totalBindsets: number;
  totalKeys: number;
  totalAliases: number;
  processedLayers: number[];
  skippedActivities: number;
  totalActivities?: number;
}

export interface KBFParseResult {
  bindsets: Record<string, KBFBindset>;
  aliases: Record<string, KBFAliasDefinition>;
  errors: KBFDiagnostic[];
  warnings: KBFDiagnostic[];
  stats: KBFParseStats;
}

export interface KBFImportConfiguration {
  selectedBindsets: string[];
  bindsetMappings: Record<string, "primary" | "custom">;
  bindsetRenames: Record<string, string>;
  singleBindsetMode?: boolean;
}

export type KBFParseResultDecodeResult =
  | { success: true; value: KBFParseResult }
  | {
      success: false;
      error: "invalid_kbf_parse_result";
      params: { path: string };
    };

export type KBFConfigurationDecodeResult =
  | { success: true; value: KBFImportConfiguration | null }
  | {
      success: false;
      error: "invalid_kbf_configuration";
      params: { path: string };
    };

export interface KBFActivity95Range {
  tray: number;
  fromSlot: number;
  toSlot: number;
  outputCount: number;
}

export interface KBFActivityData {
  activity: number;
  text?: string | null;
  text2?: string | null;
  n1?: number | null;
  n2?: number | null;
  n3?: number | null;
  order: number;
  fieldIndex?: number;
  recordIndex?: number;
  keysetRecordIndex?: number;
  success?: boolean;
}

export type KBFActivityFailure = {
  success: false;
  error: "invalid_kbf_activity";
  params: { path: string };
};

export type KBFActivityIntegerResult =
  | { success: true; value: number }
  | KBFActivityFailure;

export type KBFActivity95RangeResult =
  | { success: true; value: KBFActivity95Range }
  | KBFActivityFailure;

export type KBFActivitySemanticResult =
  | { success: true; value: KBFActivityData }
  | KBFActivityFailure;
