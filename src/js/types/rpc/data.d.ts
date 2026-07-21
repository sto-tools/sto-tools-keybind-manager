import type {
  NoPayloadRpc,
  Profile,
  ProfileOperations,
  ProfileUpdateResult,
  RequiredRpc,
} from "./base.js";

export type ProfileCreatedResult = {
  success: true;
  profileId: string;
  profile: Profile;
  message: string;
};

export type ProfileSwitchResult = {
  success: true;
  switched: boolean;
  message: string;
  profile: Profile | null;
};

export type EnvironmentUpdateResult = {
  success: true;
  environment: string;
};

export type DefaultDataLoadResult =
  | {
      success: true;
      profilesCreated: number;
      currentProfile: string | null;
    }
  | { success: false; error: string };

type ExistingProfileUpdateRequest = {
  profileId: string;
  createIfMissing?: never;
  updates?: ProfileOperations;
  add?: ProfileOperations["add"];
  delete?: ProfileOperations["delete"];
  modify?: ProfileOperations["modify"];
  properties?: NonNullable<ProfileOperations["properties"]> &
    Partial<Pick<Profile, "selections" | "vertigoSettings">>;
  replacement?: ProfileOperations["replacement"];
  updateSource?: string;
};

type CreateMissingProfileFromReplacementRequest = {
  profileId: string;
  /**
   * Explicitly permits creation only from a complete replacement operation.
   * Ordinary update requests remain update-only and reject a missing profile.
   */
  createIfMissing: true;
  updates: {
    replacement: NonNullable<ProfileOperations["replacement"]>;
    updateSource?: string;
  };
  add?: never;
  delete?: never;
  modify?: never;
  properties?: never;
  replacement?: never;
  updateSource?: string;
};

export type ProfileUpdateRequest =
  | ExistingProfileUpdateRequest
  | CreateMissingProfileFromReplacementRequest;

export interface DataRpcProtocol {
  "data:clone-profile": RequiredRpc<
    { sourceId: string; newName: string },
    ProfileCreatedResult
  >;
  "data:create-profile": RequiredRpc<
    { name: string; description?: string; mode?: string },
    ProfileCreatedResult
  >;
  "data:delete-profile": RequiredRpc<
    { profileId: string },
    {
      success: true;
      deletedProfile: Profile;
      switchedProfile: Profile | null;
      message: string;
    }
  >;
  "data:reload-state": NoPayloadRpc<
    | {
        success: true;
        profiles: number;
        currentProfile: string | null;
        environment: string;
      }
    | { success: false; error: string }
  >;
  "data:rename-profile": RequiredRpc<
    { profileId: string; newName: string; description?: string },
    { success: true; profile: Profile; message: string }
  >;
  "data:switch-profile": RequiredRpc<
    { profileId: string },
    ProfileSwitchResult
  >;
  "data:update-profile": RequiredRpc<ProfileUpdateRequest, ProfileUpdateResult>;
}
