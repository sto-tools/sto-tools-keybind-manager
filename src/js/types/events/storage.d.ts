import type StorageService from "../../components/services/StorageService.js";
import type {
  EmptyObjectPayload,
  ProjectBackupData,
  ProjectImportCounts,
  SettingsRecord,
  StorageBackup,
  StoredApplicationData,
} from "./base.js";

export interface SavedStorageData extends Record<string, unknown> {
  version: string;
  lastModified: string;
  lastBackup: string;
}

export interface StorageEventProtocol {
  "storage:data-changed": { data: SavedStorageData };
  "storage:data-reset": { data: StoredApplicationData };
  "sync:folder-set": { handle: FileSystemDirectoryHandle };
  "app:reset-confirmed": null;
  "data:load-default": null;
  "keybinds:import": null;
  "keybinds:kbf-import": null;
  "project:open": null;
  "project:save": null;
  "sync:sync-now": null;
  "app:reset-complete": EmptyObjectPayload;
  "app:reset-failed": null | { error: unknown };
  "import-service-ready": null;
  "keybinds:export": null;
  "project-backup-created": { filename: string; data: ProjectBackupData };
  "project-backup-failed": { error: unknown };
  "project-backup-restored": {
    filename: string;
    currentProfile: string | null;
    imported: ProjectImportCounts;
  };
  "project-synced": null;
  "storage:backup-created": { backup: StorageBackup };
  "storage:data-cleared": null;
  "storage:ready": { service: StorageService };
  "storage:settings-changed": { settings: SettingsRecord };
}
