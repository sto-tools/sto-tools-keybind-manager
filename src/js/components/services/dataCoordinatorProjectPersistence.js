import { validatePlannedProjectRoot } from "./dataCoordinatorMutationBoundary.js";
import { isDataRecord } from "./jsonDataBoundary.js";
import { materializeMutationValue } from "./mutationRequestBoundary.js";

/**
 * @typedef {Object} CoordinatorProjectRoot
 * @property {string} version
 * @property {string} [created]
 * @property {string} lastModified
 * @property {string} [lastBackup]
 * @property {string | null} currentProfile
 * @property {Record<string, import('./serviceTypes.js').ProfileData>} profiles
 * @property {Record<string, import('./serviceTypes.js').AliasDefinition | import('./serviceTypes.js').StoredCommand[] | string>} [globalAliases]
 */

/** @param {unknown} value */
function ownDataRecord(value) {
  if (!isDataRecord(value)) return null;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") return null;
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !("value" in descriptor)) {
        return null;
      }
    }
    return descriptors;
  } catch {
    return null;
  }
}

/** @param {unknown} value */
function materializeProjectRoot(value) {
  const detached = materializeMutationValue(value);
  if (!isDataRecord(detached) || typeof detached.version !== "string") {
    throw new Error("verification_failed");
  }
  validatePlannedProjectRoot(detached, { version: detached.version });
  return /** @type {CoordinatorProjectRoot} */ (detached);
}

/**
 * Read the repository without adopting repair output or writing defaults.
 * @param {import('./DataCoordinator.js').default} owner
 */
export function loadCoordinatorProjectRoot(owner) {
  if (!owner.projectRepository) throw new Error("storage_read_failed");
  let result;
  try {
    result = owner.projectRepository.load();
  } catch {
    throw new Error("storage_read_failed");
  }
  const descriptors = ownDataRecord(result);
  const status = descriptors?.status?.value;
  if (status === "read_failed") throw new Error("storage_read_failed");
  if (status !== "current" && status !== "repair_required") {
    throw new Error("verification_failed");
  }
  const root = materializeProjectRoot(descriptors?.value?.value);
  let resetSentinel = null;
  if (status === "repair_required") {
    const reset = ownDataRecord(descriptors?.resetSentinel?.value);
    if (reset?.status?.value === "pending_consumption") {
      const expected = reset.expectedValue?.value;
      if (typeof expected !== "string" || expected.length === 0) {
        throw new Error("verification_failed");
      }
      resetSentinel = expected;
    }
  }
  return { root, resetSentinel, repairRequired: status === "repair_required" };
}

/** @param {import('./DataCoordinator.js').default} owner */
export function cloneCoordinatorProjectRoot(owner) {
  if (!owner._projectRoot) throw new Error("data_owner_not_ready");
  return structuredClone(owner._projectRoot);
}

/** @param {import('./DataCoordinator.js').default} owner */
export function coordinatorProjectVersion(owner) {
  return owner._projectRoot?.version || owner.state.metadata.version || "1.0.0";
}

/**
 * Persist one complete candidate. The caller must adopt the returned root before
 * publishing either the compatibility storage event or owner state.
 * @param {import('./DataCoordinator.js').default} owner
 * @param {unknown} candidate
 * @param {{verification?: "required" | "not_requested", consumeResetSentinel?: string | null, purpose?: "startup_recovery"}} [options]
 */
export function commitCoordinatorProjectRoot(
  owner,
  candidate,
  { verification = "not_requested", consumeResetSentinel = null, purpose } = {},
) {
  if (!owner.projectRepository) throw new Error("storage_write_failed");
  const version = coordinatorProjectVersion(owner);
  validatePlannedProjectRoot(candidate, { version });
  const pendingSentinel = consumeResetSentinel ?? owner._pendingResetSentinel;
  const writeOptions = pendingSentinel
    ? {
        verification: /** @type {const} */ ("required"),
        consumeResetSentinel: pendingSentinel,
        ...(purpose ? { purpose } : {}),
      }
    : purpose
      ? { verification: /** @type {const} */ ("required"), purpose }
      : { verification };
  let result;
  try {
    result = owner.projectRepository.commit(
      /** @type {import('../../types/data-contracts.js').StoredApplicationData} */ (
        candidate
      ),
      writeOptions,
    );
  } catch {
    throw new Error("storage_write_failed");
  }
  const descriptors = ownDataRecord(result);
  if (descriptors?.status?.value !== "committed") {
    const error = descriptors?.error?.value;
    throw new Error(typeof error === "string" ? error : "storage_write_failed");
  }
  const accepted = materializeProjectRoot(descriptors.value?.value);
  return accepted;
}

/**
 * Atomically replace the owner's private whole-root state and public data
 * projection from one detached repository value.
 * @param {import('./DataCoordinator.js').default} owner
 * @param {CoordinatorProjectRoot} root
 * @param {number} operation
 */
export function adoptCoordinatorProjectRoot(owner, root, operation) {
  owner._assertCurrentOperation(operation);
  const accepted = structuredClone(root);
  owner._projectRoot = accepted;
  owner._pendingResetSentinel = null;
  owner.state.profiles = structuredClone(accepted.profiles || {});
  owner.state.currentProfile = accepted.currentProfile || null;
  owner.state.currentEnvironment =
    owner.state.currentProfile &&
    owner.state.profiles[owner.state.currentProfile]
      ? owner.state.profiles[owner.state.currentProfile].currentEnvironment ||
        "space"
      : "space";
  owner.state.metadata = {
    lastModified: accepted.lastModified,
    version: accepted.version || "1.0.0",
  };
  return accepted;
}

/**
 * Retain an uncommitted repair draft after reset. Only the next verified commit
 * may consume its reset sentinel.
 * @param {import('./DataCoordinator.js').default} owner
 * @param {{root: CoordinatorProjectRoot, resetSentinel: string | null}} loaded
 * @param {number} operation
 */
export function adoptPendingCoordinatorProjectRoot(owner, loaded, operation) {
  const accepted = adoptCoordinatorProjectRoot(owner, loaded.root, operation);
  owner._pendingResetSentinel = loaded.resetSentinel;
  return accepted;
}
