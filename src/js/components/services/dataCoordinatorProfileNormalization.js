import { normalizeProfile } from "../../lib/profileNormalizer.js";
import { validatePlannedProjectRoot } from "./dataCoordinatorMutationBoundary.js";
import { planProfileNormalizations } from "./profileNormalizationPlan.js";
import persist from "./storageWrites.js";

/** @param {unknown} error */
const errorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

/**
 * @param {import('./DataCoordinator.js').default} owner
 * @param {Record<string, import('./serviceTypes.js').ProfileData>} profiles
 * @param {{rootData?: any}} [options]
 */
export async function normalizeCoordinatorProfiles(
  owner,
  profiles,
  { rootData } = {},
) {
  const operation = owner._captureOperationGeneration();
  const label = `[${owner.componentName}]`;
  const { profilesNormalized, normalizedProfiles } = planProfileNormalizations(
    profiles,
    {
      normalizeProfile,
      onProfileStart: (profileId) =>
        console.log(`${label} Migrating profile: ${profileId}`),
      onProfileComplete: (report) =>
        console.log(
          `${label} Profile ${report.profileId} migrated from ${report.originalVersion} to ${report.normalizedVersion}`,
        ),
    },
  );
  if (profilesNormalized === 0) return 0;

  const nextRoot = structuredClone(rootData ?? owner.storage.getAllData());
  nextRoot.profiles = structuredClone({
    ...profiles,
    ...normalizedProfiles,
  });
  try {
    validatePlannedProjectRoot(nextRoot, { version: owner.storage.version });
    await persist.all(owner.storage, nextRoot, owner.i18n, {
      preserveBackup: true,
    });
  } catch (error) {
    throw new Error(
      owner.i18n.t("failed_to_save_profile", {
        error: errorMessage(error),
      }),
    );
  }
  owner._assertCurrentOperation(operation);
  Object.assign(profiles, normalizedProfiles);
  console.log(
    `[${owner.componentName}] Migrated ${profilesNormalized} profiles`,
  );
  return profilesNormalized;
}
