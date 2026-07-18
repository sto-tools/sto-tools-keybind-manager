import type { StoredApplicationData } from "./base.js";
import type { SyncDirectoryHandle } from "../sync-boundary.js";

export interface SavedStorageData extends Record<string, unknown> {
  version: string;
  lastModified: string;
  lastBackup: string;
}

export interface StorageEventProtocol {
  "storage:data-changed": { data: SavedStorageData };
  "storage:data-reset": { data: StoredApplicationData };
  "sync:folder-set": { handle: SyncDirectoryHandle };
  "app:reset-confirmed": null;
  "data:load-default": null;
  "keybinds:import": null;
  "keybinds:kbf-import": null;
  "project:open": null;
  "project:save": null;
  "sync:sync-now": null;
}
