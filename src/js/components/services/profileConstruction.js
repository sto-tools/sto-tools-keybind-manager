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
