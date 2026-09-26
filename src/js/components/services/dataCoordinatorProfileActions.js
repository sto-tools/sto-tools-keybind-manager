import persist from "./storageWrites.js";
import { createVirtualProfile } from "./dataState.js";
import {
  createClonedProfileDraft,
  createEmptyProfileDraft,
  generateProfileId,
} from "./profileConstruction.js";
import { recordDataCoordinatorPublication } from "./dataCoordinatorMutationQueue.js";
import {
  validatePlannedProfileRoot,
  validatePlannedProjectRoot,
} from "./dataCoordinatorMutationBoundary.js";

/** @param {unknown} error */
const errMsg = (error) =>
  error instanceof Error ? error.message : String(error);
/** @param {object} value @param {PropertyKey} key */
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

/** @param {import("./DataCoordinator.js").default} owner @param {string} profileId @returns {Promise<import('../../types/rpc/data.js').ProfileSwitchResult>} */
export async function executeProfileSwitch(owner, profileId) {
  if (profileId === owner.state.currentProfile) {
    // Build current profile data manually since getCurrentProfile() was removed
    let currentProfile = null;
    if (
      owner.state.currentProfile &&
      hasOwn(owner.state.profiles, owner.state.currentProfile)
    ) {
      const profile = owner.state.profiles[owner.state.currentProfile];
      currentProfile = createVirtualProfile(
        owner.state.currentProfile,
        profile,
        owner.state.currentEnvironment,
      );
    }

    return {
      success: true,
      switched: false,
      message: owner.i18n.t("already_on_profile"),
      profile: currentProfile,
    };
  }

  const profile = hasOwn(owner.state.profiles, profileId)
    ? owner.state.profiles[profileId]
    : null;
  if (!profile) {
    throw new Error(`Profile ${profileId} not found`);
  }

  const oldProfileId = owner.state.currentProfile;
  const operation = owner._captureOperationGeneration();

  // Persist current profile change
  validatePlannedProjectRoot(
    { ...owner.storage.getAllData(), currentProfile: profileId },
    { version: owner.storage.version },
  );
  await persist.currentProfile(owner.storage, profileId, owner.i18n);
  owner._assertCurrentOperation(operation);

  owner.state.currentProfile = profileId;
  owner.state.currentEnvironment = profile.currentEnvironment || "space";

  // Update metadata
  owner.state.metadata.lastModified = new Date().toISOString();

  // Build virtual profile for response
  const virtualProfile = createVirtualProfile(
    profileId,
    profile,
    owner.state.currentEnvironment,
  );

  owner._publishState("profile-switched");

  // Broadcast profile switch synchronously
  if (owner._isCurrentOperation(operation)) {
    recordDataCoordinatorPublication(
      owner,
      owner.emit(
        "profile:switched",
        {
          fromProfile: oldProfileId,
          toProfile: profileId,
          profileId: profileId,
          profile: structuredClone(virtualProfile),
          environment: owner.state.currentEnvironment,
          timestamp: Date.now(),
        },
        { synchronous: true },
      ),
    );
  }

  return {
    success: true,
    switched: true,
    profile: virtualProfile,
    message: owner.i18n.t("switched_to_profile", {
      name: profile.name,
      environment: owner.state.currentEnvironment,
    }),
  };
}

/** @param {import("./DataCoordinator.js").default} owner @param {string} name @param {string} description @param {string} mode @returns {Promise<import('../../types/rpc/data.js').ProfileCreatedResult>} */
export async function executeProfileCreate(owner, name, description, mode) {
  if (!name || !name.trim()) {
    const message = owner.i18n.t("profile_name_is_required");
    throw new Error(message);
  }

  const profileId = generateProfileId(name);

  // Check if profile already exists
  if (hasOwn(owner.state.profiles, profileId)) {
    const message = owner.i18n.t("profile_already_exists");
    throw new Error(message);
  }

  const profile = createEmptyProfileDraft(name, description, mode, {
    created: new Date().toISOString(),
    lastModified: new Date().toISOString(),
  });
  const operation = owner._captureOperationGeneration();

  try {
    // Save to storage
    validatePlannedProfileRoot(profileId, profile, owner.storage.getAllData(), {
      version: owner.storage.version,
    });
    const persistedProfile = await persist.profile(
      owner.storage,
      profileId,
      profile,
      owner.i18n,
    );
    owner._assertCurrentOperation(operation);

    // Update cache
    owner.state.profiles[profileId] = persistedProfile;
    owner.state.metadata.lastModified = new Date().toISOString();

    owner._publishState("profile-created");

    return {
      success: true,
      profileId,
      profile: structuredClone(persistedProfile),
      message: owner.i18n.t("profile_created", { name }),
    };
  } catch (error) {
    const message = owner.i18n.t("failed_to_create_profile", {
      error: errMsg(error),
    });
    throw new Error(message);
  }
}

/** @param {import("./DataCoordinator.js").default} owner @param {string} sourceId @param {string} newName @returns {Promise<import('../../types/rpc/data.js').ProfileCreatedResult>} */
export async function executeProfileClone(owner, sourceId, newName) {
  if (!sourceId || !newName || !newName.trim()) {
    const message = owner.i18n.t("source_profile_and_new_name_required");
    throw new Error(message);
  }

  const sourceProfile = hasOwn(owner.state.profiles, sourceId)
    ? owner.state.profiles[sourceId]
    : null;
  if (!sourceProfile) {
    const message = owner.i18n.t("source_profile_not_found");
    throw new Error(message);
  }

  const profileId = generateProfileId(newName);

  // Check if profile already exists
  if (hasOwn(owner.state.profiles, profileId)) {
    const message = owner.i18n.t("profile_already_exists");
    throw new Error(message);
  }

  const clonedProfile = createClonedProfileDraft(sourceProfile, newName, {
    created: new Date().toISOString(),
    lastModified: new Date().toISOString(),
  });
  const operation = owner._captureOperationGeneration();

  try {
    // Save to storage
    validatePlannedProfileRoot(
      profileId,
      clonedProfile,
      owner.storage.getAllData(),
      { version: owner.storage.version },
    );
    const persistedProfile = await persist.profile(
      owner.storage,
      profileId,
      clonedProfile,
      owner.i18n,
    );
    owner._assertCurrentOperation(operation);

    // Update cache
    owner.state.profiles[profileId] = persistedProfile;
    owner.state.metadata.lastModified = new Date().toISOString();

    owner._publishState("profile-cloned");

    return {
      success: true,
      profileId,
      profile: structuredClone(persistedProfile),
      message: owner.i18n.t("profile_created_from", {
        newName,
        sourceProfile: sourceProfile.name,
      }),
    };
  } catch (error) {
    const message = owner.i18n.t("failed_to_clone_profile", {
      error: errMsg(error),
    });
    throw new Error(message);
  }
}

/** @param {import("./DataCoordinator.js").default} owner @param {string} profileId @param {string} newName @param {string} description @returns {Promise<import('../../types/rpc/index.js').RpcResult<'data:rename-profile'>>} */
export async function executeProfileRename(
  owner,
  profileId,
  newName,
  description,
) {
  if (!profileId || !newName || !newName.trim()) {
    const message = owner.i18n.t("profile_name_is_required");
    throw new Error(message);
  }

  const profile = hasOwn(owner.state.profiles, profileId)
    ? owner.state.profiles[profileId]
    : null;
  if (!profile) {
    const message = owner.i18n.t("profile_not_found");
    throw new Error(message);
  }

  const updatedProfile = {
    ...profile,
    name: newName.trim(),
    description: description.trim(),
    lastModified: new Date().toISOString(),
  };
  const operation = owner._captureOperationGeneration();

  try {
    // Save to storage
    validatePlannedProfileRoot(
      profileId,
      updatedProfile,
      owner.storage.getAllData(),
      { version: owner.storage.version },
    );
    const persistedProfile = await persist.profile(
      owner.storage,
      profileId,
      updatedProfile,
      owner.i18n,
    );
    owner._assertCurrentOperation(operation);

    // Update cache
    owner.state.profiles[profileId] = persistedProfile;
    owner.state.metadata.lastModified = new Date().toISOString();

    owner._publishState("profile-renamed");

    // Broadcast profile update
    if (owner._isCurrentOperation(operation)) {
      recordDataCoordinatorPublication(
        owner,
        owner.emit("profile:updated", {
          profileId,
          profile: structuredClone(persistedProfile),
          changes: { name: newName, description },
          timestamp: Date.now(),
        }),
      );
    }

    return {
      success: true,
      profile: structuredClone(persistedProfile),
      message: `Profile renamed to "${newName}"`,
    };
  } catch (error) {
    const message = owner.i18n.t("failed_to_rename_profile", {
      error: errMsg(error),
    });
    throw new Error(message);
  }
}

/** @param {import("./DataCoordinator.js").default} owner @param {string} profileId @returns {Promise<import('../../types/rpc/index.js').RpcResult<'data:delete-profile'>>} */
export async function executeProfileDelete(owner, profileId) {
  if (!profileId) {
    const message = owner.i18n.t("profile_id_required");
    throw new Error(message);
  }

  const profile = hasOwn(owner.state.profiles, profileId)
    ? owner.state.profiles[profileId]
    : null;
  if (!profile) {
    const message = owner.i18n.t("profile_not_found");
    throw new Error(message);
  }

  const profileCount = Object.keys(owner.state.profiles).length;
  if (profileCount <= 1) {
    const message = owner.i18n.t("cannot_delete_the_last_profile");
    throw new Error(message);
  }

  try {
    const nextProfiles = structuredClone(owner.state.profiles);
    delete nextProfiles[profileId];

    let nextCurrentProfile = owner.state.currentProfile;
    let nextCurrentEnvironment = owner.state.currentEnvironment;
    let switchedProfile = null;

    // If this was the current profile, switch to another
    if (owner.state.currentProfile === profileId) {
      const remaining = Object.keys(nextProfiles);
      nextCurrentProfile = remaining[0];

      const newProfile = nextProfiles[nextCurrentProfile];
      nextCurrentEnvironment = newProfile.currentEnvironment || "space";

      switchedProfile = createVirtualProfile(
        nextCurrentProfile,
        newProfile,
        nextCurrentEnvironment,
      );
    }

    // Deletion and replacement-profile selection are one logical durable
    // commit. A single root write prevents either half from becoming visible
    // on its own.
    const nextRoot = structuredClone(owner.storage.getAllData());
    nextRoot.profiles = structuredClone(nextProfiles);
    nextRoot.currentProfile = nextCurrentProfile;
    const operation = owner._captureOperationGeneration();
    validatePlannedProjectRoot(nextRoot, { version: owner.storage.version });
    await persist.all(owner.storage, nextRoot, owner.i18n);
    owner._assertCurrentOperation(operation);

    const durableRoot = owner.storage.getAllData();
    owner.state.profiles = nextProfiles;
    owner.state.currentProfile = nextCurrentProfile;
    owner.state.currentEnvironment = nextCurrentEnvironment;
    owner.state.metadata = {
      lastModified:
        durableRoot.lastModified ??
        nextRoot.lastModified ??
        new Date().toISOString(),
      version:
        durableRoot.version || nextRoot.version || owner.state.metadata.version,
    };

    owner._publishState("profile-deleted");

    if (
      switchedProfile &&
      nextCurrentProfile &&
      owner._isCurrentOperation(operation)
    ) {
      // Broadcast profile switch synchronously
      recordDataCoordinatorPublication(
        owner,
        owner.emit(
          "profile:switched",
          {
            fromProfile: profileId,
            toProfile: nextCurrentProfile,
            profileId: nextCurrentProfile,
            profile: structuredClone(switchedProfile),
            environment: nextCurrentEnvironment,
            timestamp: Date.now(),
          },
          { synchronous: true },
        ),
      );
    }

    return {
      success: true,
      deletedProfile: structuredClone(profile),
      switchedProfile: structuredClone(switchedProfile),
      message: owner.i18n.t("profile_deleted", { profileName: profile.name }),
    };
  } catch (error) {
    const message = owner.i18n.t("failed_to_delete_profile", {
      error: errMsg(error),
    });
    throw new Error(message);
  }
}
