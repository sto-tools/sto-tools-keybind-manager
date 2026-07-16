/** @typedef {import('./serviceTypes.js').CoordinatorState} CoordinatorState */
/** @typedef {import('./serviceTypes.js').ProfileData} ProfileData */
/** @typedef {import('./serviceTypes.js').StoredCommand} StoredCommand */
/** @typedef {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot} DataStateSnapshot */

/**
 * Clone state at the projection boundary so a consumer cannot mutate canonical
 * DataCoordinator data through a returned object or array.
 *
 * @template Value
 * @param {Value} value
 * @returns {Value}
 */
function clone(value) {
  return structuredClone(value);
}

/** @type {WeakSet<object>} */
const trustedSnapshots = new WeakSet();

let latestAuthorityEpoch = 0;

/**
 * Allocate an ordered identity for one DataCoordinator incarnation. Consumers
 * use this before the per-authority revision so a replacement owner can begin
 * again at revision zero without admitting delayed snapshots from its
 * predecessor.
 *
 * @returns {number}
 */
export function nextDataStateAuthorityEpoch() {
  latestAuthorityEpoch += 1;
  return latestAuthorityEpoch;
}

/**
 * Recursively freeze the JSON-like records and arrays used by application
 * state. Snapshot data is detached before it reaches this boundary, so the
 * frozen graph can be shared safely by every consumer.
 *
 * @template Value
 * @param {Value} value
 * @param {WeakSet<object>} [seen]
 * @returns {Value}
 */
function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return value;

  const object = /** @type {object} */ (value);
  if (seen.has(object)) return value;
  seen.add(object);

  for (const key of Reflect.ownKeys(object)) {
    deepFreeze(Reflect.get(object, key), seen);
  }
  return Object.freeze(value);
}

/**
 * Mark one detached snapshot as safe for identity sharing.
 *
 * @param {DataStateSnapshot} snapshot
 * @returns {DataStateSnapshot}
 */
function trustSnapshot(snapshot) {
  deepFreeze(snapshot);
  trustedSnapshots.add(snapshot);
  return snapshot;
}

/**
 * Adopt a DataCoordinator snapshot for a consumer cache. Snapshots created by
 * this module are already detached and recursively frozen, so live delivery is
 * O(1). Untrusted late-join and compatibility inputs are cloned before being
 * frozen and never share mutable producer-owned state.
 *
 * @param {DataStateSnapshot} snapshot
 * @returns {DataStateSnapshot}
 */
export function immutableDataStateSnapshot(snapshot) {
  if (trustedSnapshots.has(snapshot)) return snapshot;
  return trustSnapshot(clone(snapshot));
}

/**
 * Compare a candidate snapshot using owner epoch first and that owner's local
 * revision second. Both values are validated at the protocol boundary.
 *
 * @param {DataStateSnapshot} snapshot
 * @param {DataStateSnapshot | null} currentSnapshot
 * @returns {boolean}
 */
function isDataStateSnapshotNewer(snapshot, currentSnapshot) {
  const candidateEpoch = snapshot.authorityEpoch;
  const candidateRevision = snapshot.revision;
  if (
    !Number.isSafeInteger(candidateEpoch) ||
    candidateEpoch < 1 ||
    !Number.isSafeInteger(candidateRevision) ||
    candidateRevision < 0
  ) {
    return false;
  }
  if (!currentSnapshot) return true;
  return (
    candidateEpoch > currentSnapshot.authorityEpoch ||
    (candidateEpoch === currentSnapshot.authorityEpoch &&
      candidateRevision > currentSnapshot.revision)
  );
}

/**
 * Apply ordering and immutability through one adoption path shared by live
 * broadcasts and late-join replies.
 *
 * @param {DataStateSnapshot} snapshot
 * @param {DataStateSnapshot | null} currentSnapshot
 * @returns {DataStateSnapshot | null}
 */
export function adoptDataStateSnapshot(snapshot, currentSnapshot) {
  return isDataStateSnapshotNewer(snapshot, currentSnapshot)
    ? immutableDataStateSnapshot(snapshot)
    : null;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {object} value @param {PropertyKey} key */
function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

const knownEnvironments = new Set(["space", "ground", "alias"]);

/**
 * Build the complete detached state snapshot used by DataCoordinator's
 * late-join and live-state protocols.
 *
 * @param {CoordinatorState} state
 * @param {{ authorityEpoch: number, ready: boolean, revision: number }} status
 * @returns {DataStateSnapshot}
 */
export function createDataStateSnapshot(
  state,
  { authorityEpoch, ready, revision },
) {
  const profiles = clone(state.profiles || {});
  const currentProfile = state.currentProfile || null;
  const currentEnvironment = state.currentEnvironment || "space";
  const currentProfileData =
    currentProfile && hasOwn(profiles, currentProfile)
      ? createVirtualProfile(
          currentProfile,
          profiles[currentProfile],
          currentEnvironment,
        )
      : null;

  return trustSnapshot({
    authorityEpoch,
    ready,
    revision,
    currentProfile,
    currentEnvironment,
    currentProfileData,
    profiles,
    settings: clone(state.settings || {}),
    metadata: clone(state.metadata || { lastModified: null, version: "1.0.0" }),
  });
}

/**
 * Create the compatibility projection for the active profile without adding
 * virtual build scaffolding to the canonical profile itself.
 *
 * @param {string} profileId
 * @param {ProfileData | null | undefined} profile
 * @param {string} environment
 * @returns {ProfileData | null}
 */
export function createVirtualProfile(profileId, profile, environment) {
  if (!profile) return null;

  const projected = clone(profile);
  if (!isRecord(projected.builds)) {
    projected.builds = {
      space: { keys: {} },
      ground: { keys: {} },
    };
  }

  const builds = projected.builds;
  if (!hasOwn(builds, environment) && knownEnvironments.has(environment)) {
    builds[environment] = { keys: {} };
  } else if (
    hasOwn(builds, environment) &&
    isRecord(builds[environment]) &&
    !isRecord(builds[environment].keys)
  ) {
    builds[environment].keys = {};
  }

  const environmentBuild =
    hasOwn(builds, environment) && isRecord(builds[environment])
      ? builds[environment]
      : null;
  const keys = clone(environmentBuild?.keys || {});

  return {
    ...projected,
    id: profileId,
    builds,
    keys,
    aliases: clone(projected.aliases || {}),
    keybindMetadata: clone(projected.keybindMetadata || {}),
    aliasMetadata: clone(projected.aliasMetadata || {}),
    environment,
  };
}

/**
 * Read a detached canonical profile from a complete state snapshot.
 *
 * @param {DataStateSnapshot} snapshot
 * @param {string | null | undefined} [profileId]
 * @returns {ProfileData | null}
 */
export function getSnapshotProfile(snapshot, profileId = undefined) {
  const resolvedProfileId =
    profileId === undefined ? snapshot.currentProfile : profileId;
  if (!resolvedProfileId) return null;

  if (!hasOwn(snapshot.profiles, resolvedProfileId)) return null;
  const profile = snapshot.profiles[resolvedProfileId];
  return profile ? clone(profile) : null;
}

/**
 * Project the primary-bindset key map for one environment.
 *
 * @param {ProfileData | null | undefined} profile
 * @param {string | null | undefined} environment
 * @returns {Record<string, StoredCommand[]>}
 */
export function getPrimaryKeys(profile, environment) {
  if (!profile || !environment) return {};
  const builds = profile.builds;
  if (!isRecord(builds) || !hasOwn(builds, environment)) return {};
  const build = builds[environment];
  if (!isRecord(build)) return {};
  const keys = build.keys;
  return isRecord(keys)
    ? /** @type {Record<string, StoredCommand[]>} */ (clone(keys))
    : {};
}

/**
 * Project one detached primary-bindset command list.
 *
 * @param {ProfileData | null | undefined} profile
 * @param {string | null | undefined} environment
 * @param {string | null | undefined} key
 * @returns {StoredCommand[]}
 */
export function getPrimaryKeyCommands(profile, environment, key) {
  if (!profile || !environment || !key) return [];
  const builds = profile.builds;
  if (!isRecord(builds) || !hasOwn(builds, environment)) return [];
  const build = builds[environment];
  if (!isRecord(build) || !isRecord(build.keys)) return [];
  const keys = build.keys;
  if (!hasOwn(keys, key)) return [];
  const commands = keys[key];
  return Array.isArray(commands) ? clone(commands) : [];
}

/**
 * Project one detached command list from an explicit bindset. Primary Bindset
 * deliberately uses the canonical build rather than an active-bindset overlay.
 *
 * @param {ProfileData | null | undefined} profile
 * @param {string | null | undefined} bindset
 * @param {string | null | undefined} environment
 * @param {string | null | undefined} key
 * @returns {StoredCommand[]}
 */
export function getBindsetKeyCommands(profile, bindset, environment, key) {
  if (!profile || !environment || !key) return [];
  if (!bindset || bindset === "Primary Bindset") {
    return getPrimaryKeyCommands(profile, environment, key);
  }

  const bindsets = profile.bindsets;
  if (!isRecord(bindsets) || !hasOwn(bindsets, bindset)) return [];
  const selectedBindset = bindsets[bindset];
  if (!isRecord(selectedBindset) || !hasOwn(selectedBindset, environment)) {
    return [];
  }
  const build = selectedBindset[environment];
  if (!isRecord(build) || !isRecord(build.keys) || !hasOwn(build.keys, key)) {
    return [];
  }
  const commands = build.keys[key];
  return Array.isArray(commands) ? clone(commands) : [];
}
