/** @typedef {import('../../types/data-contracts.js').CurrentProjectArtifactEnvelope} CurrentProjectArtifactEnvelope */
/** @typedef {import('../../types/data-contracts.js').ArtifactProjectProjection} ArtifactProjectProjection */
/** @typedef {import('../../types/data-contracts.js').CanonicalSettings} CanonicalSettings */

import {
  materializeProfileMap,
  requireProfileIdentifier,
} from "./dataCoordinatorMutationBoundary.js";
import { materializeCanonicalPreferences } from "./preferencesRepositoryBoundary.js";

/**
 * Serialize the one current project artifact shared by downloaded backups and
 * sync-folder project.json writes.
 *
 * @param {ArtifactProjectProjection} project
 * @param {CanonicalSettings} settings
 * @param {{ version?: string | null, exported: string }} options
 * @returns {string}
 */
export function serializeProjectArtifact(project, settings, options) {
  const canonicalSettings = materializeCanonicalPreferences(settings);
  if (!canonicalSettings) throw new TypeError("canonical_settings_required");
  const profiles = /** @type {ArtifactProjectProjection['profiles']} */ (
    materializeProfileMap(project?.profiles)
  );
  const currentProfile = project?.currentProfile;
  if (currentProfile !== null) requireProfileIdentifier(currentProfile);
  if (!options || typeof options.exported !== "string") {
    throw new TypeError("artifact_export_timestamp_required");
  }
  /** @type {CurrentProjectArtifactEnvelope} */
  const data = {
    version: options.version || "1.0.0",
    exported: options.exported,
    type: "project",
    data: {
      profiles,
      settings: canonicalSettings,
      currentProfile,
    },
  };

  return JSON.stringify(data, null, 2);
}
