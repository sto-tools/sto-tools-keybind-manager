import type { PreferencesSettings, SettingsRecord } from "./base.js";

export type PreferencesChangedPayload =
  | {
      key: string;
      value: unknown;
      changes?: never;
      settings: PreferencesSettings;
    }
  | {
      changes: SettingsRecord;
      key?: never;
      value?: never;
      settings: PreferencesSettings;
    };

export interface PreferencesEventProtocol {
  "language:changed": { language: string };
  "preferences:changed": PreferencesChangedPayload;
  "preferences:loaded": { settings: PreferencesSettings };
  "preferences:saved": { settings: PreferencesSettings };
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
