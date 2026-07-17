import type {
  Environment,
  ProfileData,
  ProfileMap,
  ProfileOperations,
} from "./base.js";

export type EnvironmentChangedPayload =
  | {
      fromEnvironment: Environment | null;
      toEnvironment: Environment;
      environment: Environment;
      timestamp: number;
    }
  | {
      fromEnvironment: Environment;
      toEnvironment: Environment;
      environment: Environment;
    }
  | {
      environment: Environment;
      isInitialization: true;
    };

export type ProfileSwitchedPayload =
  | {
      profileId: null;
      profile: null;
      environment: "space";
      updateSource: "DataCoordinator-Reset";
    }
  | {
      fromProfile: string | null;
      toProfile: string;
      profileId: string;
      profile: ProfileData | null;
      environment: Environment;
      timestamp: number;
      updateSource?: string;
    };

export type ProfileUpdatedPayload =
  | {
      profileId: null;
      profile: null;
      updateSource: "DataCoordinator-Reset";
    }
  | {
      profileId: string;
      profile: ProfileData;
      changes: { name: string; description: string };
      timestamp: number;
      updateSource?: string;
    }
  | {
      profileId: string;
      profile: ProfileData;
      updates: Omit<ProfileOperations, "updateSource">;
      updateSource: string | undefined;
      timestamp: number;
    }
  | {
      profileId: string;
      profile: ProfileData;
      environment: Environment;
      updateSource?: string;
    }
  | {
      profileId: string;
      profile: ProfileData;
      updateSource?: string;
    };

export type ProfileCreatedPayload =
  | {
      profileId: string;
      profile: ProfileData;
      timestamp: number;
    }
  | {
      profileId: string;
      profile: ProfileData;
      clonedFrom: string;
      timestamp: number;
    };

export interface ProfileEventProtocol {
  "environment:changed": EnvironmentChangedPayload;
  "profile:switched": ProfileSwitchedPayload;
  "profile:updated": ProfileUpdatedPayload;
  "environment:switched": {
    from: Environment;
    to: Environment;
    source: "SelectionService";
  };
  "profile:created": ProfileCreatedPayload;
  "profile:deleted": {
    profileId: string;
    profile: ProfileData;
    switchedProfile: ProfileData | null;
    timestamp: number;
  };
  "profiles:creation-failed": { error: string };
  "profiles:initialized": {
    profiles: ProfileMap;
    currentProfile: string | null;
    timestamp: number;
  };
}
