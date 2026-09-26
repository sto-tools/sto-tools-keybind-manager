import {
  acquireDataCoordinatorReadLease,
  assertDataCoordinatorReadLeaseCurrent,
} from "./dataCoordinatorMutationQueue.js";
import {
  acquirePreferencesReadLease,
  assertPreferencesReadLeaseCurrent,
} from "./preferencesReadLease.js";
import { serializeProjectArtifact } from "./projectArtifact.js";
import {
  materializeProfileMap,
  requireProfileIdentifier,
} from "./dataCoordinatorMutationBoundary.js";
import { materializeCanonicalPreferences } from "./preferencesRepositoryBoundary.js";

/**
 * Assemble the one narrow cross-owner capture capability used by artifact
 * workflows. Acquisition order is global and release order is its reverse.
 *
 * @param {{preferencesOwner: import('./PreferencesService.js').default, dataOwner: import('./DataCoordinator.js').default}} owners
 * @returns {import('../../types/storage-contracts.js').ArtifactCapturePort}
 */
export function createArtifactCapturePort({ preferencesOwner, dataOwner }) {
  return Object.freeze({
    async capture() {
      const preferencesLease =
        await acquirePreferencesReadLease(preferencesOwner);
      /** @type {Awaited<ReturnType<typeof acquireDataCoordinatorReadLease>> | null} */
      let dataLease = null;
      try {
        dataLease = await acquireDataCoordinatorReadLease(dataOwner);
        assertPreferencesReadLeaseCurrent(preferencesOwner, preferencesLease);
        assertDataCoordinatorReadLeaseCurrent(dataOwner, dataLease);
        const settings = materializeCanonicalPreferences(
          preferencesLease.value,
        );
        if (!settings) throw new TypeError("canonical_settings_required");
        const profiles =
          /** @type {import('../../types/data-contracts.js').ArtifactProjectProjection['profiles']} */ (
            materializeProfileMap(dataLease.value.profiles)
          );
        const currentProfile = dataLease.value.currentProfile;
        if (currentProfile !== null) requireProfileIdentifier(currentProfile);
        return structuredClone({
          project: { profiles, currentProfile },
          settings,
          source: {
            preferencesAuthorityEpoch: preferencesLease.authorityEpoch,
            preferencesRevision: preferencesLease.revision,
            dataAuthorityEpoch: dataLease.authorityEpoch,
            dataRevision: dataLease.revision,
          },
        });
      } finally {
        dataLease?.release();
        // Let the inner DataCoordinator gate open before the outer
        // Preferences gate. Besides making reverse-order release observable,
        // this preserves the global lock-order discipline for queued work.
        await Promise.resolve();
        preferencesLease.release();
      }
    },
  });
}

/**
 * Serialize only after capture has released both owner leases. The returned
 * artifact and capture are one fixed detached source for download and sync.
 *
 * @param {{capturePort: import('../../types/storage-contracts.js').ArtifactCapturePort, version?: string | null, now?: () => string}} options
 * @returns {import('../../types/storage-contracts.js').CurrentProjectArtifactSerializer}
 */
export function createCurrentProjectArtifactSerializer({
  capturePort,
  version,
  now = () => new Date().toISOString(),
}) {
  return Object.freeze({
    async serialize() {
      const capture = await capturePort.capture();
      const exported = now();
      const artifact = serializeProjectArtifact(
        capture.project,
        capture.settings,
        { version, exported },
      );
      return { artifact, capture: structuredClone(capture), exported };
    },
  });
}
