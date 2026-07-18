import type { ProjectDecodeResult, ProjectEnvelope } from "./data-contracts.js";

/**
 * Structural subset of a browser-owned directory handle proven by runtime
 * decoding. Permission and writable effects are validated separately.
 */
export interface SyncDirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  getFileHandle(
    name: string,
    options?: FileSystemGetFileOptions,
  ): Promise<unknown>;
  getDirectoryHandle(
    name: string,
    options?: FileSystemGetDirectoryOptions,
  ): Promise<unknown>;
}

export interface SyncDirectoryCapability {
  readonly kind: "directory";
  readonly name: string;
  /** Browser-owned handle retained for IndexedDB persistence and RPC egress. */
  readonly raw: SyncDirectoryHandle;
  getFileHandle(
    name: string,
    options?: FileSystemGetFileOptions,
  ): Promise<unknown>;
  getDirectoryHandle(
    name: string,
    options?: FileSystemGetDirectoryOptions,
  ): Promise<unknown>;
}

export type SyncDirectoryCapabilityDecodeResult =
  | { success: true; value: SyncDirectoryCapability }
  | { success: false; error: "invalid_directory_capability" };

export type SyncDirectoryLoadResult =
  | { success: true; state: "missing" }
  | {
      success: true;
      state: "available";
      value: SyncDirectoryCapability;
    }
  | {
      success: false;
      error:
        | "sync_folder_capability_invalid"
        | "sync_folder_load_failed"
        | "sync_folder_transition_incomplete";
      cause?: unknown;
    };

export type SyncPermissionMode = "read" | "readwrite";
export type SyncPermissionState = "granted" | "denied" | "prompt";

/**
 * Permission methods are deliberately separate from the structural directory
 * capability. They are browser effects whose availability and results need
 * their own validation.
 */
export interface SyncDirectoryPermissionEffects {
  queryPermission(options: { mode: SyncPermissionMode }): Promise<unknown>;
  requestPermission(options: { mode: SyncPermissionMode }): Promise<unknown>;
}

export type SyncDirectoryPermissionEffectsDecodeResult =
  | { success: true; value: SyncDirectoryPermissionEffects }
  | { success: false; error: "permission_api_unavailable" };

export type SyncDirectoryPermissionResult =
  | { success: true; state: "granted" }
  | {
      success: false;
      error: "permission_denied";
      state: "denied" | "prompt";
    }
  | {
      success: false;
      error: "invalid_permission_result";
      operation: "query" | "request";
      value: unknown;
    }
  | {
      success: false;
      error: "permission_api_failed";
      operation: "query" | "request";
      cause: unknown;
    };

export type SyncProjectProbeOperation =
  | "get_file_handle"
  | "get_file"
  | "read_text";

export type SyncProjectProbeResult =
  | { success: true; state: "absent" }
  | {
      success: true;
      state: "present";
      value: ProjectEnvelope;
      content: string;
      fileName: "project.json";
    }
  | {
      success: false;
      error: "project_file_access_denied";
      operation: SyncProjectProbeOperation;
      cause: unknown;
    }
  | {
      success: false;
      error: "project_file_read_failed";
      operation: SyncProjectProbeOperation;
      cause: unknown;
    }
  | {
      success: false;
      error: "invalid_project_file_capability";
      path: "handle" | "file" | "file.text()";
    }
  | {
      success: false;
      error: "project_file_too_large";
      source: "file.size" | "file.text()";
      size: number;
      limit: number;
    }
  | {
      success: false;
      error: "invalid_project";
      decode: Exclude<ProjectDecodeResult, { success: true }>;
    };
