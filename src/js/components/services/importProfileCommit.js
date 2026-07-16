/** @typedef {import('./serviceTypes.js').ProfileData} ProfileData */
/** @typedef {import('./serviceTypes.js').ProfileOperations} ProfileOperations */

/**
 * Commit an imported profile through DataCoordinator, then publish the one
 * legacy notification that import consumers still require. A typed complete
 * replacement deliberately avoids DataCoordinator's structural compatibility
 * notification, so this helper remains the sole legacy producer for imports.
 *
 * @param {import('./ImportService.js').default} service
 * @param {string} profileId
 * @param {ProfileData} profile
 * @param {string | undefined} [environment]
 * @returns {Promise<ProfileData>}
 */
export async function commitImportedProfile(
  service,
  profileId,
  profile,
  environment,
) {
  /** @type {ProfileOperations & { replacement: ProfileData }} */
  const updates = {
    replacement: structuredClone(profile),
    updateSource: "ImportService",
  };

  let result;
  try {
    result = await service.request("data:update-profile", {
      profileId,
      updates,
      createIfMissing: true,
    });
  } catch {
    throw new Error(service.translate("storage_write_failed"));
  }

  if (!result?.success || !result.profile) {
    throw new Error(service.translate("storage_write_failed"));
  }

  const committedProfile = structuredClone(result.profile);
  const payload = { profileId, profile: committedProfile };
  service.emit(
    "profile:updated",
    environment === undefined ? payload : { ...payload, environment },
  );

  return committedProfile;
}
