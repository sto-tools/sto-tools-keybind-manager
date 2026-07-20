import type { CommandGroupType } from "../events/base.js";
import type { NoPayloadRpc, RequiredRpc, StoredCommand } from "./base.js";

export type CommandImportResult = {
  success: true;
  importedCount: number;
  droppedCount: number;
  sourceType: string;
  sourceName: string;
};

export type StabilizeResult =
  | { success: true }
  | { success: false; error?: string };

export interface CommandRpcProtocol {
  "command-presentation:toggle-category": RequiredRpc<
    { categoryId: string },
    boolean
  >;
  "command-presentation:toggle-group": RequiredRpc<
    { groupType: CommandGroupType },
    boolean
  >;
  "command:delete": RequiredRpc<
    { key: string; index: number; bindset?: string | null },
    boolean
  >;
  "command:filter-library": NoPayloadRpc<boolean>;
  "command:generate-mirrored-commands": RequiredRpc<
    { commands?: StoredCommand[] },
    string
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
}
