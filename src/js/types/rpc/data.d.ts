import type {
  CommandCategory,
  CommandDefinition,
  NoPayloadRpc,
  OptionalRpc,
  Profile,
  ProfileOperations,
  ProfileUpdateResult,
  RequiredRpc,
  ResponderOnlyNoPayloadRpc,
  ResponderOnlyOptionalRpc,
  ResponderOnlyRequiredRpc,
  Settings,
  StoredCommand,
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

export type CurrentDataState = {
  currentProfile: string | null;
  currentEnvironment: string;
  currentProfileData: Profile | null;
  profiles: Record<string, Profile>;
  settings: Settings;
  metadata: {
    lastModified: string | null | undefined;
    version: string;
  };
};

export type ProfileUpdateRequest = {
  profileId: string;
  updates?: ProfileOperations;
  add?: ProfileOperations["add"];
  delete?: ProfileOperations["delete"];
  modify?: ProfileOperations["modify"];
  properties?: NonNullable<ProfileOperations["properties"]> &
    Partial<Pick<Profile, "selections" | "vertigoSettings">>;
  updateSource?: string;
};

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
  "data:find-command-by-name": OptionalRpc<
    { command?: string },
    (CommandDefinition & { categoryId: string; commandId: string }) | null
  >;
  "data:get-alias-name-pattern": ResponderOnlyNoPayloadRpc<RegExp>;
  "data:get-all-profiles": NoPayloadRpc<Record<string, Profile>>;
  "data:get-combat-category": ResponderOnlyNoPayloadRpc<CommandCategory | null>;
  "data:get-command-category": ResponderOnlyOptionalRpc<
    { categoryId?: string },
    CommandCategory | null
  >;
  "data:get-command-definition": ResponderOnlyOptionalRpc<
    { categoryId?: string; commandId?: string },
    CommandDefinition | null
  >;
  "data:get-commands": NoPayloadRpc<Record<string, CommandCategory>>;
  "data:get-communication-category": ResponderOnlyNoPayloadRpc<CommandCategory | null>;
  "data:get-current-state": NoPayloadRpc<CurrentDataState>;
  "data:get-default-profile": ResponderOnlyOptionalRpc<
    { profileId?: string },
    Profile | null
  >;
  "data:get-default-profiles": NoPayloadRpc<Record<string, Profile>>;
  "data:get-key-commands": OptionalRpc<
    { environment?: string; key?: string },
    StoredCommand[]
  >;
  "data:get-key-name-pattern": NoPayloadRpc<string>;
  "data:get-keys": OptionalRpc<
    { environment?: string },
    Record<string, StoredCommand[]>
  >;
  "data:get-settings": ResponderOnlyNoPayloadRpc<Settings>;
  "data:get-tray-category": ResponderOnlyNoPayloadRpc<CommandCategory | null>;
  "data:get-validation-patterns": ResponderOnlyNoPayloadRpc<{
    keyNamePattern?: string;
    aliasNamePattern?: RegExp;
  }>;
  "data:has-commands": NoPayloadRpc<boolean>;
  "data:load-default-data": ResponderOnlyNoPayloadRpc<
    | {
        success: true;
        profilesCreated: number;
        currentProfile: string | null;
      }
    | { success: false; error: string }
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
  "data:set-environment": ResponderOnlyRequiredRpc<
    { environment: string },
    { success: true; environment: string }
  >;
  "data:switch-profile": RequiredRpc<
    { profileId: string },
    ProfileSwitchResult
  >;
  "data:update-profile": RequiredRpc<ProfileUpdateRequest, ProfileUpdateResult>;
  "data:update-settings": ResponderOnlyRequiredRpc<
    { settings: Settings },
    { success: true; settings: Settings }
  >;
}
