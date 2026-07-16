import type { Environment } from "./base.js";

export interface BindsetSelectionPayload {
  key: string;
  bindset: string;
  environment: Environment;
}

export interface BindsetOperationPayload {
  type: "add-key";
  bindset: string;
  key: string;
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
    key: string;
    membership: Map<string, boolean>;
  };
  "bindset-selector:visibility-changed": { visible: boolean };
  "bindsets:changed": { names: string[] };
  "bindset-operation:completed": BindsetOperationPayload;
  "bindset-operation:started": BindsetOperationPayload;
  "bindset-section:refresh-needed": { bindsetName: string };
  "bindset-selector:set-selected-key": { key: string | null };

  /** Producer authority is absent for the following compatibility topics. */
  "bindset-manager:open": unknown;
  "bindset:active-changed": unknown;
  "bindset:created": unknown;
  "bindset:deleted": unknown;
  "bindset:modified": unknown;
}
