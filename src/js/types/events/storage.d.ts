import type { SyncDirectoryHandle } from "../sync-boundary.js";

export interface StorageEventProtocol {
  "sync:folder-set": { handle: SyncDirectoryHandle };
  "data:load-default": null;
  "keybinds:import": null;
  "keybinds:kbf-import": null;
  "project:open": null;
  "project:save": null;
  "sync:sync-now": null;
}
