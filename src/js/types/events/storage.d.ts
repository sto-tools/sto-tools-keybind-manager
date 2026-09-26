import type { SyncDirectoryHandle } from "../sync-boundary.js";

export interface SavedStorageData extends Record<string, unknown> {
  version: string;
  lastModified: string;
  lastBackup: string;
}

export interface StorageEventProtocol {
  "storage:data-changed": { data: SavedStorageData };
  "sync:folder-set": { handle: SyncDirectoryHandle };
  "data:load-default": null;
  "keybinds:import": null;
  "keybinds:kbf-import": null;
  "project:open": null;
  "project:save": null;
  "sync:sync-now": null;
}
