import type { SettingsRecord } from "./base.js";

export type PreferencesChangedPayload =
  | { key: string; value: unknown; changes?: never }
  | { changes: SettingsRecord; key?: never; value?: never };

export interface PreferencesEventProtocol {
  "language:changed": { language: string };
  "preferences:changed": PreferencesChangedPayload;
  "preferences:loaded": { settings: SettingsRecord };
  "preferences:saved": { settings: SettingsRecord };
  "language:change": { language: string };
  "preferences:autosync-settings-changed": null;
  "preferences:show": null;
  "theme:toggle": null;
  "settings:changed": {
    settings: SettingsRecord;
    updates: SettingsRecord;
    timestamp: number;
  };
}
