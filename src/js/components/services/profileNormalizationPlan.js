import { needsNormalization } from "../../lib/profileNormalizer.js";

const noop = () => {};

/**
 * Plan detached replacements for every profile whose migration version is not
 * current. Mutable normalization and diagnostics are explicit capabilities so
 * the caller retains their established clock and logging order.
 *
 * @param {Record<string, import('./serviceTypes.js').ProfileData>} profiles
 * @param {{
 *   normalizeProfile: (profile: import('./serviceTypes.js').ProfileData) => unknown,
 *   onProfileStart?: (profileId: string) => void,
 *   onProfileComplete?: (report: {
 *     profileId: string,
 *     originalVersion: string,
 *     normalizedVersion: string | undefined
 *   }) => void
 * }} capabilities
 * @returns {{
 *   profilesNormalized: number,
 *   normalizedProfiles: Record<string, import('./serviceTypes.js').ProfileData>
 * }}
 */
export function planProfileNormalizations(
  profiles,
  { normalizeProfile, onProfileStart = noop, onProfileComplete = noop },
) {
  /** @type {Record<string, import('./serviceTypes.js').ProfileData>} */
  const normalizedProfiles = {};

  for (const [profileId, profile] of Object.entries(profiles)) {
    if (!needsNormalization(profile)) continue;

    onProfileStart(profileId);
    const originalVersion = profile.migrationVersion || "2.0.0";
    const normalizedProfile = structuredClone(profile);
    normalizeProfile(normalizedProfile);
    normalizedProfiles[profileId] = normalizedProfile;
    onProfileComplete({
      profileId,
      originalVersion,
      normalizedVersion: normalizedProfile.migrationVersion,
    });
  }

  return {
    profilesNormalized: Object.keys(normalizedProfiles).length,
    normalizedProfiles,
  };
}
