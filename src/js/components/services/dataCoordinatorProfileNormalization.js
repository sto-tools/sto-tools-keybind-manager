import { normalizeProfile } from "../../lib/profileNormalizer.js";
import { validatePlannedProjectRoot } from "./dataCoordinatorMutationBoundary.js";
import { planProfileNormalizations } from "./profileNormalizationPlan.js";
import {
  adoptCoordinatorProjectRoot,
  cloneCoordinatorProjectRoot,
  commitCoordinatorProjectRoot,
  coordinatorProjectVersion,
} from "./dataCoordinatorProjectPersistence.js";

/** @param {unknown} error */
const errorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

/**
 * @param {import('./DataCoordinator.js').default} owner
 * @param {Record<string, import('./serviceTypes.js').ProfileData>} profiles
 * @param {{rootData?: any, persist?: boolean}} [options]
 */
export async function normalizeCoordinatorProfiles(
  owner,
  profiles,
  { rootData, persist = true } = {},
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

  const nextRoot = structuredClone(
    rootData ?? cloneCoordinatorProjectRoot(owner),
  );
  nextRoot.profiles = structuredClone({
    ...profiles,
    ...normalizedProfiles,
  });
  try {
    validatePlannedProjectRoot(nextRoot, {
      version: coordinatorProjectVersion(owner),
    });
    if (persist) {
      owner._assertCurrentOperation(operation);
      const accepted = commitCoordinatorProjectRoot(owner, nextRoot);
      adoptCoordinatorProjectRoot(owner, accepted, operation);
    }
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
