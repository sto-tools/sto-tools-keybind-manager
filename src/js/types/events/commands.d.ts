import type {
  CommandList,
  CommandRecord,
  EditingContext,
  Environment,
  StoredCommand,
  ValidationIssue,
} from "./base.js";
import type { CommandPresentationStateSnapshot } from "./component-state.js";

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

export type CommandEditTarget = Readonly<{
  authorityEpoch: number;
  revision: number;
  profileId: string;
  environment: Environment;
  name: string;
  bindset: string | null;
  index: number;
  originalEntry: StoredCommand;
}>;

export interface ParameterCommandEditPayload {
  target: CommandEditTarget;
  index: number;
  command: CommandRecord;
  commandDef: CommandRecord;
  categoryId: string | undefined;
  commandId: string | undefined;
}

export interface CommandEventProtocol {
  "chain-data-changed": { commands: CommandList };
  "command-presentation:state-changed": CommandPresentationStateSnapshot;
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
    target?: CommandEditTarget;
  };
  "command:filter": { filter: string };
  "commandchain:delete": { index: number };
  "commandchain:edit": { index: number };
  "commandchain:move": { fromIndex: number; toIndex: number };
  "parameter-command:edit": ParameterCommandEditPayload;
  "command-chain:validation-result": {
    key: string;
    length: number;
    severity: "error" | "warning" | "success";
    warnings: ValidationIssue[];
    errors: ValidationIssue[];
  };
  "editing-context-changed": { context: EditingContext | null };
}
