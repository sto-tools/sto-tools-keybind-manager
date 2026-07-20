import type { Environment } from "./base.js";

export interface BindsetSelectionPayload {
  key: string;
  bindset: string;
  environment: Environment;
}

export type ActiveBindsetChangedPayload =
  | { bindset: string | undefined; name?: undefined }
  | { bindset?: undefined; name: string | undefined };

export interface BindsetEventProtocol {
  /** The `name` arm preserves the legacy consumer compatibility fallback. */
  "bindset-selector:active-changed": ActiveBindsetChangedPayload;
  "bindset-selector:key-added": BindsetSelectionPayload;
  "bindset-selector:key-removed": BindsetSelectionPayload;
  "bindset-selector:membership-updated": {
    key: string | null;
    membership: Map<string, boolean>;
  };
  "bindset-selector:visibility-changed": { visible: boolean };
  "bindsets:changed": { names: string[] };
}
