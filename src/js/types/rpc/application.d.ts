import type { OptionalRpc, RequiredRpc } from "./base.js";

export type { EditingContext } from "../events/base.js";

export type ClipboardResult =
  | { success: true; message: "content_copied_to_clipboard" }
  | { success: false; message: "failed_to_copy_to_clipboard" };

export type SyncProjectResult =
  | { success: true }
  | {
      success: false;
      error:
        | "sync_not_supported_firefox"
        | "sync_not_supported_secure_context"
        | "no_sync_folder_selected"
        | "permission_denied_to_folder"
        | "sync_folder_capability_invalid"
        | "sync_folder_load_failed"
        | "sync_folder_transition_incomplete"
        | "sync_folder_permission_check_failed";
      params?: never;
    }
  | {
      success: false;
      error: "failed_to_sync_project";
      params: { error: string };
    };

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
      bindset?: string | null;
      skipPersistence?: boolean;
      isAuto?: boolean;
      forceEmit?: boolean;
    },
    string | null
  >;
  "sync:sync-project": OptionalRpc<{ source?: string }, SyncProjectResult>;
  "utility:copy-to-clipboard": OptionalRpc<{ text?: string }, ClipboardResult>;
}
