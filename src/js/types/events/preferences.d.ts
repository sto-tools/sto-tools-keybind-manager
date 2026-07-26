import type { PreferencesSettings, SettingsRecord } from "./base.js";
import type { PreferencesStateSnapshot } from "./component-state.js";

export type PreferencesStateChangeReason =
  | "startup-loaded"
  | "setting-committed"
  | "settings-replaced"
  | "sync-folder-staged"
  | "project-settings-activated"
  | "settings-reset";

export interface PreferencesStateChangedEvent {
  reason: PreferencesStateChangeReason;
  state: PreferencesStateSnapshot;
}

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
  "preferences:state-changed": PreferencesStateChangedEvent;
  "language:change": { language: string };
  "preferences:autosync-settings-changed": null;
  "preferences:show": null;
  "theme:toggle": null;
}
