import type {
  NoPayloadRpc,
  OptionalRpc,
  RequiredRpc,
  ResponderOnlyNoPayloadRpc,
  ResponderOnlyOptionalRpc,
  ResponderOnlyRequiredRpc,
  VirtualAlias,
} from "./base.js";

export type EditingContext = {
  isEditing?: boolean;
  editIndex?: number;
  existingCommand?: unknown;
};

export type SelectionState = {
  selectedKey: string | null;
  selectedAlias: string | null;
  editingContext: EditingContext | null;
  cachedSelections: Record<string, string | null>;
  currentEnvironment: string;
};

export type ClipboardResult =
  | { success: true; message: "content_copied_to_clipboard" }
  | { success: false; message: "failed_to_copy_to_clipboard" };

export interface ApplicationRpcProtocol {
  "project:restore-from-content": OptionalRpc<
    { content?: string; fileName?: string },
    | {
        success: true;
        currentProfile: string | null;
        imported: { profiles: number; settings: boolean };
      }
    | { success: false; error: string }
  >;
  "selection:auto-select-first": ResponderOnlyRequiredRpc<
    { environment?: string },
    string | null
  >;
  "selection:clear": ResponderOnlyRequiredRpc<
    { type?: "key" | "alias" | "editing" | "all" },
    undefined
  >;
  "selection:get-cached": ResponderOnlyRequiredRpc<
    { environment: string },
    string | null | undefined
  >;
  "selection:get-editing-context": ResponderOnlyNoPayloadRpc<EditingContext | null>;
  "selection:get-selected": ResponderOnlyRequiredRpc<
    { environment?: string },
    string | null
  >;
  "selection:get-state": ResponderOnlyNoPayloadRpc<SelectionState>;
  "selection:select-alias": RequiredRpc<
    {
      aliasName: string | null;
      skipPersistence?: boolean;
      isAuto?: boolean;
      forceEmit?: boolean;
    },
    string | null
  >;
  "selection:select-key": RequiredRpc<
    {
      keyName: string | null;
      environment?: string;
      bindset?: string;
      skipPersistence?: boolean;
      isAuto?: boolean;
      forceEmit?: boolean;
    },
    string | null
  >;
  "selection:set-editing-context": ResponderOnlyRequiredRpc<
    { context: EditingContext | null },
    EditingContext | null
  >;
  "sync:sync-project": OptionalRpc<{ source?: string }, undefined>;
  "ui:copy-to-clipboard": ResponderOnlyOptionalRpc<
    { text?: string },
    ClipboardResult
  >;
  "ui:show-toast": ResponderOnlyRequiredRpc<
    { message: string; type?: string; duration?: number },
    boolean
  >;
  "utility:copy-to-clipboard": OptionalRpc<{ text?: string }, ClipboardResult>;
  "vfx:get-virtual-aliases": NoPayloadRpc<Record<string, VirtualAlias>>;
}
