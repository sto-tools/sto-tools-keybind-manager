import type { Environment, KeyCommandMap, SelectionSource } from "./base.js";
import type { KeyBrowserViewStateSnapshot } from "./component-state.js";

export type KeySelectionPayload =
  | {
      key: string;
      name?: undefined;
      environment: Environment;
      source: SelectionSource;
    }
  | {
      key: string | null;
      name?: undefined;
      environment: Environment;
      bindset: string | null;
      source: SelectionSource;
    }
  | {
      key: null;
      name?: undefined;
      source: SelectionSource;
    }
  | {
      /** Legacy consumer compatibility; canonical SelectionService uses `key`. */
      key?: undefined;
      name: string;
      environment?: Environment;
      source?: SelectionSource;
    };

export interface KeyEventProtocol {
  "key-browser:state-changed": KeyBrowserViewStateSnapshot;
  "key-deleted": { keyName: string };
  "key-selected": KeySelectionPayload;
  "key:list-changed": { keys: KeyCommandMap } | null;
  "key:duplicate": { key: string };
  "keycapture:set-location-specific": { value: boolean };
  "keycapture:start": { context: "keySelectionModal" };
  "keycapture:stop": null;
  "capture-start": { context: string };
  "capture-stop": { context: string };
  "chord-captured": { chord: string; context: string };
  update: { chord: string; codes: string[]; context: string };
}
