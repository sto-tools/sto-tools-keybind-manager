import { preferencesActivationFailure } from "./preferencesMutationBoundary.js";
import { activatePersistedPreferencesWithinMutation } from "./preferencesOwnerMutationOperations.js";
import {
  materializeCanonicalPreferences,
  materializeSettingsLoadResult,
} from "./preferencesRepositoryBoundary.js";
import { fingerprintWorkflowValue } from "./storageWorkflowReceipt.js";
import { settleOwnerPublications } from "./ownerPublicationSettlement.js";

/**
 * Adopt retained settings after an acknowledged import write without reading
 * or writing the repository again.
 * @param {import('./PreferencesService.js').default} owner
 * @param {unknown} settings
 * @param {string} fingerprint
 * @returns {Promise<import('../../types/rpc/parameters-preferences.js').PreferencesActivationResult>}
 */
export async function activateImportedPreferences(
  owner,
  settings,
  fingerprint,
) {
  const candidate = materializeCanonicalPreferences(settings);
  if (
    !candidate ||
    typeof fingerprint !== "string" ||
    fingerprintWorkflowValue(candidate) !== fingerprint
  ) {
    return preferencesActivationFailure(new TypeError("invalid_data"));
  }
  let generation;
  try {
    generation = owner._readyMutationGeneration();
  } catch (error) {
    return preferencesActivationFailure(error);
  }
  /** @type {PromiseLike<unknown>[]} */
  const publications = [];
  try {
    const result = await owner._enqueueMutation(() => {
      const loaded = materializeSettingsLoadResult(
        owner.settingsRepository?.load(),
      );
      const durable =
        loaded?.status === "current"
          ? materializeCanonicalPreferences(loaded.value)
          : null;
      if (
        !durable ||
        fingerprintWorkflowValue(durable) !== fingerprint ||
        JSON.stringify(durable) !== JSON.stringify(candidate)
      ) {
        throw new Error("preferences_settings_fingerprint_mismatch");
      }
      return activatePersistedPreferencesWithinMutation(
        owner,
        "project-restore",
        generation,
        durable,
        publications,
      );
    });
    await settleOwnerPublications(publications);
    return result;
  } catch (error) {
    await settleOwnerPublications(publications);
    return preferencesActivationFailure(error);
  }
}
