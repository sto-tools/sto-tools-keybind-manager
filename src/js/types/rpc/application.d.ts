import type { OptionalRpc, RequiredRpc } from "./base.js";

export type { EditingContext } from "../events/base.js";

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
  "sync:sync-project": OptionalRpc<{ source?: string }, undefined>;
  "utility:copy-to-clipboard": OptionalRpc<{ text?: string }, ClipboardResult>;
}
