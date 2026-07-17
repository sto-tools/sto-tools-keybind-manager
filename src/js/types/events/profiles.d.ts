import type { Environment, ProfileData, ProfileOperations } from "./base.js";

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

export interface ProfileEventProtocol {
  "environment:changed": EnvironmentChangedPayload;
  "profile:switched": ProfileSwitchedPayload;
  "profile:updated": ProfileUpdatedPayload;
}
