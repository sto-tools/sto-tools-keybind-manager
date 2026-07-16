import type {
  CombinedAlias,
  CommandCategory,
  CommandDefinition,
  NoPayloadRpc,
  OptionalRpc,
  RequiredRpc,
  ResponderOnlyNoPayloadRpc,
  ResponderOnlyRequiredRpc,
  StoredCommand,
} from "./base.js";

type CommandReference = string | { command?: string; text?: string };
export type CommandDefinitionMatch = CommandDefinition & {
  categoryId: string;
  commandId: string;
  customizable?: boolean;
  icon?: string;
  parameters?: Record<string, unknown>;
};

export type EmptyStateInfo = {
  title: string;
  preview: string;
  commandCount: string | number;
  icon?: string;
  emptyTitle?: string;
  emptyDesc?: string;
};

export type CommandImportResult = {
  success: true;
  importedCount: number;
  droppedCount: number;
  sourceType: string;
  sourceName: string;
};

export type CommandValidationResult =
  | { valid: true }
  | { valid: false; reason: "empty" };

export type StabilizeResult =
  | { success: true }
  | { success: false; error?: string };

export interface CommandRpcProtocol {
  "command-chain:clear": ResponderOnlyRequiredRpc<
    { key: string; bindset?: string | null },
    boolean
  >;
  "command-chain:generate-alias-name": RequiredRpc<
    { environment: string; keyName: string; bindsetName?: string | null },
    string | null
  >;
  "command-chain:generate-alias-preview": RequiredRpc<
    { aliasName: string; commands?: StoredCommand[] },
    string
  >;
  "command:add": ResponderOnlyRequiredRpc<
    {
      command: StoredCommand | StoredCommand[];
      key: string;
      position?: string;
      bindset?: string | null;
    },
    boolean
  >;
  "command:check-environment-compatibility": ResponderOnlyRequiredRpc<
    { command: StoredCommand; environment: string },
    boolean
  >;
  "command:delete": RequiredRpc<
    { key: string; index: number; bindset?: string | null },
    boolean
  >;
  "command:edit": ResponderOnlyRequiredRpc<
    {
      key: string;
      index: number;
      updatedCommand: StoredCommand;
      bindset?: string | null;
    },
    boolean
  >;
  "command:filter-library": NoPayloadRpc<boolean>;
  "command:find-definition": OptionalRpc<
    { command?: CommandReference },
    CommandDefinitionMatch | null
  >;
  "command:generate-command-preview": RequiredRpc<
    { key: string; commands: StoredCommand[]; stabilize?: boolean },
    string
  >;
  "command:generate-id": ResponderOnlyNoPayloadRpc<string>;
  "command:generate-mirrored-commands": RequiredRpc<
    { commands?: StoredCommand[] },
    string
  >;
  "command:get-categories": NoPayloadRpc<Record<string, CommandCategory>>;
  "command:get-combined-aliases": NoPayloadRpc<Record<string, CombinedAlias>>;
  "command:get-empty-state-info": NoPayloadRpc<EmptyStateInfo>;
  "command:get-warning": OptionalRpc<
    { command?: CommandReference },
    string | null
  >;
  "command:import-from-source": RequiredRpc<
    {
      sourceValue: string;
      targetKey: string;
      clearDestination: boolean;
      currentEnvironment: string;
    },
    CommandImportResult
  >;
  "command:move": RequiredRpc<
    {
      key: string;
      fromIndex: number;
      toIndex: number;
      bindset?: string | null;
    },
    boolean
  >;
  "command:set-stabilize": RequiredRpc<
    { name: string; stabilize: boolean; bindset?: string | null },
    StabilizeResult
  >;
  "command:validate": ResponderOnlyRequiredRpc<
    { command?: unknown },
    CommandValidationResult
  >;
}
