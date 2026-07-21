import type { DataCoordinatorStateSnapshot } from "./component-state.js";

/** Every logical DataCoordinator commit that publishes a complete snapshot. */
export type DataStateChangeReason =
  | "initial-load"
  | "storage-reset"
  | "profile-switched"
  | "profile-created"
  | "profile-cloned"
  | "profile-renamed"
  | "profile-deleted"
  | "profile-updated"
  | "profile-replaced"
  | "environment-changed"
  | "settings-updated"
  | "default-profiles-created"
  | "fallback-profiles-created"
  | "state-reloaded";

export type DataStateChangedPayload =
  | {
      reason: "profile-replaced";
      profileId: string;
      state: DataCoordinatorStateSnapshot;
    }
  | {
      reason: Exclude<DataStateChangeReason, "profile-replaced">;
      profileId?: never;
      state: DataCoordinatorStateSnapshot;
    };

export interface DataEventProtocol {
  "data:state-changed": DataStateChangedPayload;
}
