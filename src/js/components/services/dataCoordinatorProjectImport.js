import {
  materializeProfileMap,
  requireProfileIdentifier,
  validatePlannedProjectRoot,
} from "./dataCoordinatorMutationBoundary.js";
import { publishReloadedCoordinatorState } from "./dataCoordinatorPublication.js";
import {
  enqueueDataCoordinatorMutation,
  recordDataCoordinatorPublication,
} from "./dataCoordinatorMutationQueue.js";
import { isDataRecord } from "./jsonDataBoundary.js";
import { materializeMutationValue } from "./mutationRequestBoundary.js";
import { materializeCanonicalPreferences } from "./preferencesRepositoryBoundary.js";
import { decodeProjectSettings } from "./settingsDataBoundary.js";
import {
  durableStage,
  fingerprintWorkflowValue,
} from "./storageWorkflowReceipt.js";

const skipped = () => durableStage("skipped", false);
const pending = () => durableStage("pending", false);

/** @param {unknown} value */
function materializeImportedProjectData(value) {
  const detached = materializeMutationValue(value);
  if (!isDataRecord(detached)) throw new TypeError("invalid_project_file");
  /** @type {{profiles?: Record<string, import('./serviceTypes.js').ProfileData>, settings?: import('../../types/data-contracts.js').SettingsData, currentProfile?: string | null}} */
  const result = {};
  if (Object.hasOwn(detached, "profiles")) {
    result.profiles = materializeProfileMap(detached.profiles);
  }
  if (Object.hasOwn(detached, "settings")) {
    result.settings = decodeProjectSettings(
      detached.settings,
      "$.data.settings",
    );
  }
  if (Object.hasOwn(detached, "currentProfile")) {
    if (detached.currentProfile !== null) {
      result.currentProfile = requireProfileIdentifier(detached.currentProfile);
    } else {
      result.currentProfile = null;
    }
  }
  return result;
}

/** @param {import('../../types/storage-contracts.js').ProjectRestoreReceipt} receipt */
const cloneReceipt = (receipt) => structuredClone(receipt);

/** @param {string} fingerprint */
function initialReceipt(fingerprint) {
  return /** @type {import('../../types/storage-contracts.js').ProjectRestoreReceipt} */ ({
    validation: durableStage("complete", true, { fingerprint }),
    settings: skipped(),
    project: pending(),
    preferencesActivation: skipped(),
    dataActivation: pending(),
  });
}

/**
 * Complete one project import while DataCoordinator exclusively owns its
 * legacy root writer. The optional Preferences persistence capability is
 * invoked only after the destination overlay and complete root validate.
 *
 * @param {import('./DataCoordinator.js').default} owner
 * @param {unknown} projectData
 * @param {import('../../types/storage-contracts.js').ImportedProjectOwnerActionOptions} [options]
 * @returns {Promise<import('../../types/storage-contracts.js').ImportedProjectOwnerResult>}
 */
export async function replaceProjectFromImport(
  owner,
  projectData,
  { persistImportedSettings } = {},
) {
  const imported = materializeImportedProjectData(projectData);
  const validationFingerprint = fingerprintWorkflowValue(imported);
  await owner._initialStateCommitted;

  try {
    return await enqueueDataCoordinatorMutation(owner, async () => {
      const operation = owner._captureOperationGeneration();
      const receipt = initialReceipt(validationFingerprint);
      owner._assertCurrentOperation(operation);
      const destination = structuredClone(owner.storage.getAllData());
      const importedProfiles = imported.profiles ?? {};
      const profiles = {
        ...(destination.profiles || {}),
        ...importedProfiles,
      };
      const topLevelSelection = Object.hasOwn(imported, "currentProfile");
      const legacySelection =
        imported.settings !== undefined &&
        Object.hasOwn(imported.settings, "currentProfile");
      /** @type {Array<[string, string]>} */
      const references = [];
      if (topLevelSelection && typeof imported.currentProfile === "string") {
        references.push([imported.currentProfile, "$.data.currentProfile"]);
      }
      if (
        legacySelection &&
        typeof imported.settings?.currentProfile === "string"
      ) {
        references.push([
          imported.settings.currentProfile,
          "$.data.settings.currentProfile",
        ]);
      }
      for (const [profileId, path] of references) {
        if (!Object.hasOwn(profiles, profileId)) {
          receipt.project = durableStage("failed", false, {
            error: "invalid_data",
          });
          receipt.dataActivation = skipped();
          return {
            success: /** @type {const} */ (false),
            error: /** @type {const} */ ("invalid_project_file"),
            params: { path },
            durable: /** @type {const} */ (false),
            receipt: cloneReceipt(receipt),
          };
        }
      }

      const requestedProfile = topLevelSelection
        ? imported.currentProfile
        : legacySelection
          ? imported.settings?.currentProfile
          : destination.currentProfile;
      const selectedProfile =
        typeof requestedProfile === "string"
          ? requestedProfile
          : Object.keys(profiles)[0] || null;
      const nextRoot = {
        ...destination,
        profiles,
        currentProfile: selectedProfile,
      };
      try {
        validatePlannedProjectRoot(nextRoot, {
          version: owner.storage.version,
        });
      } catch {
        receipt.project = durableStage("failed", false, {
          error: "invalid_data",
        });
        receipt.dataActivation = skipped();
        return {
          success: /** @type {const} */ (false),
          error: /** @type {const} */ ("invalid_project_file"),
          params: { path: "$.data" },
          durable: /** @type {const} */ (false),
          receipt: cloneReceipt(receipt),
        };
      }
      const projectProjection = {
        profiles: structuredClone(profiles),
        currentProfile: nextRoot.currentProfile,
      };
      const projectFingerprint = fingerprintWorkflowValue(projectProjection);

      /** @type {import('../../types/data-contracts.js').CanonicalSettings | undefined} */
      let stagedSettings;
      if (imported.settings !== undefined && persistImportedSettings) {
        let settingsResult;
        try {
          settingsResult = await persistImportedSettings(imported.settings);
        } catch {
          receipt.settings = durableStage("failed", "indeterminate", {
            error: "storage_write_failed",
          });
          receipt.project = skipped();
          receipt.dataActivation = skipped();
          return {
            success: /** @type {const} */ (false),
            error: /** @type {const} */ ("storage_write_failed"),
            stage: /** @type {const} */ ("settings"),
            durable: /** @type {const} */ ("indeterminate"),
            receipt: cloneReceipt(receipt),
          };
        }
        if (settingsResult?.status !== "committed") {
          const indeterminate =
            settingsResult?.status === "write_failed" ||
            settingsResult?.status === "verification_failed";
          receipt.settings = durableStage(
            "failed",
            indeterminate ? "indeterminate" : false,
            {
              error:
                settingsResult?.status === "verification_failed"
                  ? "verification_failed"
                  : settingsResult?.status === "rejected"
                    ? "invalid_data"
                    : "storage_write_failed",
            },
          );
          receipt.project = skipped();
          receipt.dataActivation = skipped();
          return {
            success: /** @type {const} */ (false),
            error: /** @type {const} */ ("storage_write_failed"),
            stage: /** @type {const} */ ("settings"),
            durable: indeterminate
              ? /** @type {const} */ ("indeterminate")
              : /** @type {const} */ (false),
            receipt: cloneReceipt(receipt),
          };
        }
        const materializedSettings = materializeCanonicalPreferences(
          settingsResult.value,
        );
        if (!materializedSettings) {
          receipt.settings = durableStage("failed", "indeterminate", {
            error: "verification_failed",
          });
          receipt.project = skipped();
          receipt.dataActivation = skipped();
          return {
            success: /** @type {const} */ (false),
            error: /** @type {const} */ ("storage_write_failed"),
            stage: /** @type {const} */ ("settings"),
            durable: /** @type {const} */ ("indeterminate"),
            receipt: cloneReceipt(receipt),
          };
        }
        stagedSettings = materializedSettings;
        receipt.settings = durableStage("complete", true, {
          fingerprint: fingerprintWorkflowValue(stagedSettings),
        });
        receipt.preferencesActivation = pending();
        try {
          owner._assertCurrentOperation(operation);
        } catch {
          receipt.project = skipped();
          receipt.dataActivation = skipped();
          return {
            success: /** @type {const} */ (false),
            error: /** @type {const} */ ("operation_cancelled"),
            stage: /** @type {const} */ ("project"),
            durable: /** @type {const} */ (true),
            receipt: cloneReceipt(receipt),
            activationMaterial: {
              project: projectProjection,
              settings: structuredClone(stagedSettings),
            },
          };
        }
      }

      let persisted = false;
      try {
        persisted = (await owner.storage.saveAllData(nextRoot)) !== false;
      } catch {
        persisted = false;
      }
      if (!persisted) {
        receipt.project = durableStage("failed", "indeterminate", {
          fingerprint: projectFingerprint,
          error: "storage_write_failed",
        });
        receipt.dataActivation = skipped();
        return {
          success: /** @type {const} */ (false),
          error: /** @type {const} */ ("storage_write_failed"),
          stage: /** @type {const} */ ("project"),
          durable: /** @type {const} */ ("indeterminate"),
          receipt: cloneReceipt(receipt),
          ...(stagedSettings
            ? {
                activationMaterial: {
                  project: projectProjection,
                  settings: structuredClone(stagedSettings),
                },
              }
            : {}),
        };
      }
      receipt.project = durableStage("complete", true, {
        fingerprint: projectFingerprint,
      });

      try {
        owner._assertCurrentOperation(operation);
        const durableRoot = owner.storage.getAllData();
        owner.state.profiles = structuredClone(durableRoot.profiles || {});
        owner.state.currentProfile = durableRoot.currentProfile || null;
        owner.state.currentEnvironment =
          owner.state.currentProfile &&
          owner.state.profiles[owner.state.currentProfile]
            ? owner.state.profiles[owner.state.currentProfile]
                .currentEnvironment || "space"
            : "space";
        owner.state.metadata = {
          lastModified: durableRoot.lastModified,
          version: durableRoot.version || owner.storage.version || "1.0.0",
        };
        const publications = publishReloadedCoordinatorState(owner, operation);
        recordDataCoordinatorPublication(owner, publications);
        owner._assertCurrentOperation(operation);
        receipt.dataActivation = durableStage("complete", true, {
          fingerprint: projectFingerprint,
        });
      } catch {
        receipt.dataActivation = durableStage("failed", false, {
          fingerprint: projectFingerprint,
          error: "operation_cancelled",
        });
        return {
          success: /** @type {const} */ (false),
          error: /** @type {const} */ ("operation_cancelled"),
          stage: /** @type {const} */ ("dataActivation"),
          durable: /** @type {const} */ (true),
          receipt: cloneReceipt(receipt),
          activationMaterial: {
            project: projectProjection,
            ...(stagedSettings
              ? { settings: structuredClone(stagedSettings) }
              : {}),
          },
        };
      }

      return {
        success: /** @type {const} */ (true),
        currentProfile: owner.state.currentProfile,
        importedProfiles: Object.keys(importedProfiles).length,
        receipt: cloneReceipt(receipt),
        activationMaterial: {
          project: projectProjection,
          ...(stagedSettings
            ? { settings: structuredClone(stagedSettings) }
            : {}),
        },
      };
    });
  } catch {
    const receipt = initialReceipt(validationFingerprint);
    receipt.project = durableStage("failed", false, {
      error: "operation_cancelled",
    });
    receipt.dataActivation = skipped();
    return {
      success: false,
      error: "operation_cancelled",
      stage: "project",
      durable: false,
      receipt: cloneReceipt(receipt),
    };
  }
}

/**
 * Adopt a retained acknowledged project projection without re-reading or
 * rewriting its artifact. This is the only retry path after a durable root
 * commit whose original owner could not complete adoption.
 *
 * @param {import('./DataCoordinator.js').default} owner
 * @param {unknown} project
 * @param {{fingerprint: string}} options
 * @returns {Promise<import('../../types/storage-contracts.js').ImportedProjectActivationResult>}
 */
export async function activateImportedProject(
  owner,
  project,
  { fingerprint } = /** @type {any} */ ({}),
) {
  let projection;
  try {
    const detached = materializeMutationValue(project);
    if (!isDataRecord(detached)) throw new TypeError();
    const profiles = materializeProfileMap(detached.profiles);
    const currentProfile =
      detached.currentProfile === null
        ? null
        : requireProfileIdentifier(detached.currentProfile);
    projection = { profiles, currentProfile };
    if (
      typeof fingerprint !== "string" ||
      fingerprintWorkflowValue(projection) !== fingerprint
    ) {
      throw new TypeError();
    }
  } catch {
    return {
      success: false,
      error: "invalid_project_activation",
      retryable: true,
      receipt: durableStage("failed", false, { error: "invalid_data" }),
    };
  }
  await owner._initialStateCommitted;
  try {
    return await enqueueDataCoordinatorMutation(owner, () => {
      const operation = owner._captureOperationGeneration();
      owner._assertCurrentOperation(operation);
      const durableRoot = owner.storage.getAllData(true);
      const durableProjection = {
        profiles: durableRoot.profiles || {},
        currentProfile: durableRoot.currentProfile || null,
      };
      if (
        fingerprintWorkflowValue(durableProjection) !== fingerprint ||
        JSON.stringify(durableProjection) !== JSON.stringify(projection)
      ) {
        return {
          success: /** @type {const} */ (false),
          error: /** @type {const} */ ("invalid_project_activation"),
          retryable: /** @type {const} */ (true),
          receipt: durableStage("failed", false, {
            fingerprint,
            error: "verification_failed",
          }),
        };
      }
      owner.state.profiles = structuredClone(durableProjection.profiles);
      owner.state.currentProfile = durableProjection.currentProfile;
      owner.state.currentEnvironment =
        durableProjection.currentProfile &&
        durableProjection.profiles[durableProjection.currentProfile]
          ? durableProjection.profiles[durableProjection.currentProfile]
              .currentEnvironment || "space"
          : "space";
      owner.state.metadata = {
        lastModified: durableRoot.lastModified,
        version: durableRoot.version || owner.storage.version || "1.0.0",
      };
      const publications = publishReloadedCoordinatorState(owner, operation);
      recordDataCoordinatorPublication(owner, publications);
      owner._assertCurrentOperation(operation);
      return {
        success: /** @type {const} */ (true),
        currentProfile: durableProjection.currentProfile,
        receipt: durableStage("complete", true, { fingerprint }),
      };
    });
  } catch {
    return {
      success: false,
      error: "operation_cancelled",
      retryable: true,
      receipt: durableStage("failed", false, {
        fingerprint,
        error: "operation_cancelled",
      }),
    };
  }
}
