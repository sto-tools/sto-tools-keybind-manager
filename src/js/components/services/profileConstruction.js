/** @typedef {import('./serviceTypes.js').ProfileData} ProfileData */

/**
 * Timestamps are captured by the orchestration facade so these constructors
 * remain deterministic and preserve the caller's exact clock-read ordering.
 *
 * @typedef {Object} ProfileConstructionTimestamps
 * @property {string} created
 * @property {string} lastModified
 */

/**
 * Derive the persisted profile-map key using the established profile identity
 * algorithm. Validation and collision handling remain facade responsibilities.
 *
 * @param {string} name
 * @returns {string}
 */
export function generateProfileId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 50);
}

/**
 * Construct the exact empty profile draft accepted by the persistence facade.
 * Input validation and timestamp acquisition deliberately stay outside this
 * pure transformation.
 *
 * @param {string} name
 * @param {string} description
 * @param {string} mode
 * @param {ProfileConstructionTimestamps} timestamps
 * @returns {ProfileData}
 */
export function createEmptyProfileDraft(
  name,
  description,
  mode,
  { created, lastModified },
) {
  return {
    name: name.trim(),
    description: description.trim(),
    currentEnvironment: mode,
    builds: {
      space: { keys: {} },
      ground: { keys: {} },
    },
    keybindMetadata: { space: {}, ground: {} },
    aliasMetadata: {},
    bindsetMetadata: {},
    bindsets: {},
    aliases: {},
    created,
    lastModified,
  };
}

/**
 * Construct a renamed deep copy of an existing profile. The JSON round trip is
 * intentional: it preserves the established persisted-profile clone semantics
 * rather than broadening them to structured-cloneable values.
 *
 * @param {ProfileData} sourceProfile
 * @param {string} newName
 * @param {ProfileConstructionTimestamps} timestamps
 * @returns {ProfileData}
 */
export function createClonedProfileDraft(
  sourceProfile,
  newName,
  { created, lastModified },
) {
  return {
    ...JSON.parse(JSON.stringify(sourceProfile)),
    name: newName.trim(),
    description: `Copy of ${sourceProfile.name}`,
    created,
    lastModified,
  };
}

/**
 * Detach and project one validated static profile into the exact raw draft
 * accepted by the normalization facade. Timestamps deliberately remain absent
 * so the caller retains the established clone-before-clock ordering.
 *
 * @param {ProfileData} sourceProfile
 * @returns {ProfileData}
 */
export function createDefaultProfileDraft(sourceProfile) {
  const source = structuredClone(sourceProfile);
  return {
    name: source.name,
    description: source.description || "",
    currentEnvironment: source.currentEnvironment || "space",
    builds: source.builds || {
      space: { keys: {} },
      ground: { keys: {} },
    },
    bindsets: source.bindsets || {},
    aliases: source.aliases || {},
    selections: source.selections || {},
    keybindMetadata: source.keybindMetadata || {},
    aliasMetadata: source.aliasMetadata || {},
    bindsetMetadata: source.bindsetMetadata || {},
  };
}

/**
 * Construct the exact timestamp-free minimal fallback draft. The persisted
 * compatibility literals and intentionally absent metadata fields are part of
 * the established profile representation.
 *
 * @returns {ProfileData}
 */
export function createFallbackProfileDraft() {
  return {
    name: "Default",
    description: "Basic space build profile",
    currentEnvironment: "space",
    builds: {
      space: { keys: {} },
      ground: { keys: {} },
    },
    bindsets: {},
    aliases: {},
  };
}

/**
 * Plan one shallow profile-batch adoption without mutating either owner state
 * or the normalized incoming profiles. The first incoming key is observable
 * because it becomes the initial profile when no current profile exists.
 *
 * @param {Pick<import('./serviceTypes.js').CoordinatorState, 'profiles' | 'currentProfile' | 'currentEnvironment'>} state
 * @param {Record<string, ProfileData>} incomingProfiles
 * @returns {{
 *   nextProfiles: Record<string, ProfileData>,
 *   nextCurrentProfile: string | null,
 *   nextCurrentEnvironment: string,
 *   profileActivated: boolean
 * }}
 */
export function planProfileBatch(state, incomingProfiles) {
  const nextProfiles = {
    ...state.profiles,
    ...incomingProfiles,
  };
  const firstProfileId = Object.keys(incomingProfiles)[0];
  const profileActivated =
    !state.currentProfile && firstProfileId !== undefined;

  return {
    nextProfiles,
    nextCurrentProfile: profileActivated
      ? firstProfileId
      : state.currentProfile,
    nextCurrentEnvironment: profileActivated
      ? nextProfiles[firstProfileId].currentEnvironment || "space"
      : state.currentEnvironment,
    profileActivated,
  };
}
