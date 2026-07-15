import type {
  NoPayloadRpc,
  RequiredRpc,
  ResponderOnlyNoPayloadRpc,
  ResponderOnlyRequiredRpc,
} from "./base.js";
import type {
  PreferenceMutation,
  PreferencesSettings,
  SettingsRecord,
} from "../events/base.js";

export type ParameterCommandDefinition = Record<string, unknown> & {
  baseCommand?: string;
  command?: string;
  icon?: string;
  name?: string;
};

export type ParameterBuildParameters = Record<string, unknown> & {
  active?: number;
  alias_name?: string;
  aliasName?: string;
  alpha?: number;
  amount?: number;
  backup_end_slot?: number;
  backup_end_tray?: number;
  backup_slot?: number;
  backup_start_slot?: number;
  backup_start_tray?: number;
  backup_tray?: number;
  baseCommand?: string;
  command_type?: string;
  commandName?: string;
  degrees?: number;
  distance?: number;
  effects?: string;
  end_slot?: number;
  end_tray?: number;
  entityName?: string;
  filename?: string;
  message?: string;
  modifier1?: string;
  modifier2?: string;
  name?: string;
  position?: number;
  powerName?: string;
  rawCommand?: string;
  seconds?: number;
  slot?: number;
  start_slot?: number;
  start_tray?: number;
  state?: number;
  tray?: number;
  verb?: string;
};

export type ParameterizedCommand = {
  command: string | undefined;
  type: string;
  icon: string | undefined;
  displayText: unknown;
  id: string;
  parameters: Record<string, unknown>;
};

export type ParsedCommand = {
  command: string;
  signature: string;
  category: string;
  baseCommand: string;
  icon: string;
  parameters: Record<string, unknown>;
  displayText: unknown;
  matchPattern?: unknown;
  id: string;
  parseMetadata: {
    signatureName: string;
    patternWeight: number;
    matchTime: number;
  };
};

export type UnparsedRangeCommand = {
  command: string;
  category: string;
  displayText: string;
  id: string;
  parameters: Record<string, unknown>;
};

export type ParameterBuildRangeCommand = ParsedCommand | UnparsedRangeCommand;

export type ParameterBuildResult =
  | ParameterizedCommand
  | ParameterBuildRangeCommand[]
  | null;

export type CommandParseResult = {
  originalString: string;
  commands: ParsedCommand[];
  isMirrored: boolean;
  parseTime: number;
  metadata: {
    totalCommands: number;
    cacheStatus: string;
    parseMethod: string;
  };
};

export type EditableParameterDefinition = {
  commandId: string;
  categoryId: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  parameters: unknown;
  signature: string;
  baseCommand: string;
  extractedParameters: Record<string, unknown>;
  [parameter: string]: unknown;
};

export type ParserPerformanceMetric = {
  count: number;
  totalTime: number;
  avgTime: number;
};

export interface ParameterPreferenceRpcProtocol {
  "parameter-command:build": RequiredRpc<
    {
      categoryId: string;
      commandId: string;
      commandDef: ParameterCommandDefinition;
      params?: ParameterBuildParameters;
    },
    ParameterBuildResult
  >;
  "parameter-command:find-definition": ResponderOnlyRequiredRpc<
    { commandString: unknown },
    EditableParameterDefinition | null
  >;
  "parameter-command:generate-id": ResponderOnlyNoPayloadRpc<string>;
  "parser:clear-cache": NoPayloadRpc<{ success: true }>;
  "parser:get-performance-metrics": ResponderOnlyNoPayloadRpc<
    Array<[string, ParserPerformanceMetric]>
  >;
  "parser:parse-command-string": RequiredRpc<
    {
      commandString: string;
      options?: {
        generateDisplayText?: boolean;
        [option: string]: unknown;
      };
    },
    CommandParseResult
  >;
  "preferences:get-setting": ResponderOnlyRequiredRpc<{ key: string }, unknown>;
  "preferences:get-settings": NoPayloadRpc<PreferencesSettings>;
  "preferences:init": NoPayloadRpc<undefined>;
  "preferences:load-settings": NoPayloadRpc<undefined>;
  "preferences:save-settings": NoPayloadRpc<boolean>;
  "preferences:set-setting": RequiredRpc<PreferenceMutation, undefined>;
  "preferences:set-settings": RequiredRpc<SettingsRecord, undefined>;
}
