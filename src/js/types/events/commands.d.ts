import type {
  CommandList,
  CommandRecord,
  EditingContext,
  StoredCommand,
  ValidationIssue,
} from "./base.js";

export type CommandLibraryAddPayload =
  | {
      categoryId: string;
      commandId: string;
      commandDef: CommandRecord;
    }
  | {
      categoryId?: undefined;
      commandId?: undefined;
      commandDef: CommandRecord;
    };

export interface ParameterCommandEditPayload {
  index: number;
  command: CommandRecord;
  commandDef: CommandRecord;
  categoryId: string | undefined;
  commandId: string | undefined;
}

export interface CommandEventProtocol {
  "chain-data-changed": { commands: CommandList };
  "command-added": { key: string; command: StoredCommand | CommandList };
  "command-deleted": { key: string; index: number; commands: CommandList };
  "command-edited": {
    key: string;
    index: number;
    updatedCommand: StoredCommand;
    commands: CommandList;
  };
  "command-moved": {
    key: string;
    fromIndex: number;
    toIndex: number;
    commands: CommandList;
  };
  "command-add": CommandLibraryAddPayload;
  "command-chain:clear": { key: string };
  "command-chain:validate": {
    key: string | null;
    stabilized: boolean;
    isAlias: boolean;
  };
  "command:add": {
    command: StoredCommand | CommandList;
    key: string;
    bindset?: string | null;
  };
  "command:edit": {
    key: string;
    index: number;
    updatedCommand: StoredCommand;
    bindset?: string | null;
  };
  "command:filter": { filter: string };
  "commandchain:delete": { index: number };
  "commandchain:edit": { index: number };
  "commandchain:move": { fromIndex: number; toIndex: number };
  "parameter-command:edit": ParameterCommandEditPayload;
  "parameter-edit:end": null;
  "command-chain:validation-result": {
    key: string;
    length: number;
    severity: "error" | "warning" | "success";
    warnings: ValidationIssue[];
    errors: ValidationIssue[];
  };
  "command-chain-cleared": { key: string };
  "editing-context-changed": { context: EditingContext | null };
  "stabilize-changed": {
    name: string;
    stabilize: boolean;
    isAlias: boolean;
    bindset: string | null;
  };

  /** Producer authority is absent for this compatibility topic. */
  "parameter-edit:start": unknown;
}
