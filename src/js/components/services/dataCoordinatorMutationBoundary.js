import {
  materializeMutationRequest,
  materializeMutationValue,
  materializeProfilePrecondition,
  requireMutationString,
} from "./mutationRequestBoundary.js";
import { isDataRecord, MAX_PROJECT_JSON_BYTES } from "./jsonDataBoundary.js";
import { decodeProfileData } from "./profileDataBoundary.js";
import { generateProfileId } from "./profileConstruction.js";
import { decodeStoredApplicationJson } from "./storedApplicationDataBoundary.js";
import { hasBoundedPreferencesJson } from "./preferencesJsonBudget.js";
import {
  assertSafeProfileIdentifier,
  assertSafeProfileOperations,
} from "./profileOperations.js";

const operationFields = [
  "add",
  "delete",
  "modify",
  "properties",
  "replacement",
  "updateSource",
];
const patchFields = [
  "aliases",
  "builds",
  "bindsets",
  "aliasMetadata",
  "keybindMetadata",
  "bindsetMetadata",
];

/** @param {unknown} value @returns {string} */
export function requireProfileIdentifier(value) {
  const identifier = requireMutationString(value);
  assertSafeProfileIdentifier(identifier, "profile mutation identifier");
  return identifier;
}

/** @param {unknown} newName */
export function validateProfileCloneName(newName) {
  const name = requireMutationString(newName);
  if (!name.trim()) throw new TypeError("invalid_profile_name");
  return { name, profileId: requireProfileIdentifier(generateProfileId(name)) };
}

/** @param {unknown} name @param {unknown} [mode] */
export function validateProfileCreation(name, mode = "space") {
  return {
    ...validateProfileCloneName(name),
    mode: requireProfileIdentifier(mode),
  };
}

/** Validate profile-map input before an owner lifecycle or state is captured.
 * @param {unknown} value
 * @returns {Record<string, import('./serviceTypes.js').ProfileData>}
 */
export function materializeProfileMap(value) {
  const profiles = materializeMutationValue(value);
  if (!isDataRecord(profiles))
    throw new TypeError("invalid_profile_operations");
  for (const [profileId, profile] of Object.entries(profiles)) {
    requireProfileIdentifier(profileId);
    decodeProfileData(profile, profileId);
  }
  return /** @type {Record<string, import('./serviceTypes.js').ProfileData>} */ (
    profiles
  );
}

// Date#toISOString uses at most 27 ASCII characters, including extended years.
const maximumTimestamp = "+000000-01-01T00:00:00.000Z";
/** @param {unknown} value */
const jsonBytes = (value) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

/**
 * Bound the complete proposed root, not merely an independently valid patch.
 * Reserve the entire possible write metadata record in addition to existing
 * bytes. This intentionally double-counts existing stamp fields, allowing both
 * fresh timestamps and preserved backup timestamps without predicting a clock
 * value or mutating the candidate. Near-limit values fail before persistence.
 * Decoder output is validation evidence only: compatibility shapes/extensions
 * are never normalized or adopted here.
 * @param {unknown} root
 * @param {{version: string}} options
 * @param {number} [additionalReserve]
 */
export function validatePlannedProjectRoot(
  root,
  { version },
  additionalReserve = 0,
) {
  const candidate = materializeMutationValue(root);
  if (!isDataRecord(candidate))
    throw new TypeError("invalid_profile_operations");
  requireMutationString(version, { allowEmpty: true });
  const reserve =
    jsonBytes({
      version,
      lastModified: maximumTimestamp,
      lastBackup: maximumTimestamp,
    }) + additionalReserve;
  if (!hasBoundedPreferencesJson(candidate, MAX_PROJECT_JSON_BYTES - reserve))
    throw new TypeError("invalid_profile_operations");
  const defaults =
    /** @type {import('../../types/data-contracts.js').StoredApplicationData} */ ({
      ...candidate,
      version,
      lastModified: maximumTimestamp,
      settings: {},
    });
  const decoded = decodeStoredApplicationJson(JSON.stringify(candidate), {
    defaults,
    version,
  });
  if (!decoded.success) throw new TypeError("invalid_profile_operations");
}

/** Validate a profile replacement in its complete persistence envelope.
 * @param {unknown} profileId
 * @param {unknown} profile
 * @param {unknown} root
 * @param {{version: string}} options
 */
export function validatePlannedProfileRoot(profileId, profile, root, options) {
  const id = requireProfileIdentifier(profileId);
  const candidate = materializeMutationValue(profile);
  decodeProfileData(candidate, id);
  const current = materializeMutationValue(root);
  if (!isDataRecord(current) || !isDataRecord(current.profiles))
    throw new TypeError("invalid_profile_operations");
  validatePlannedProjectRoot(
    { ...current, profiles: { ...current.profiles, [id]: candidate } },
    options,
    jsonBytes({ lastModified: maximumTimestamp }),
  );
}

/** @param {unknown} value */
function validateDeleteIdentifiers(value) {
  if (!Array.isArray(value)) throw new TypeError("invalid_profile_operations");
  for (const identifier of value) requireProfileIdentifier(identifier);
}

/**
 * Validate request intent without reading any accepted profile. The existing
 * profile schema validates partial operation payloads against a synthetic
 * detached container; its normalized output is deliberately not persisted.
 * @param {unknown} value
 * @returns {import('./serviceTypes.js').ProfileOperations}
 */
function materializeProfileOperations(value) {
  const operations = materializeMutationRequest(value, operationFields);
  for (const operation of ["add", "modify"]) {
    if (operations[operation] === undefined) continue;
    const patch = materializeMutationRequest(
      operations[operation],
      patchFields,
    );
    decodeProfileData({ name: "mutation-validation", ...patch }, "validation");
  }
  if (operations.delete !== undefined) {
    const deletion = materializeMutationRequest(operations.delete, [
      "aliases",
      "builds",
      "bindsets",
      "bindsetMetadata",
    ]);
    for (const field of ["aliases", "bindsets", "bindsetMetadata"]) {
      if (deletion[field] !== undefined)
        validateDeleteIdentifiers(deletion[field]);
    }
    if (deletion.builds !== undefined) {
      if (!isDataRecord(deletion.builds))
        throw new TypeError("invalid_profile_operations");
      for (const [environment, value] of Object.entries(deletion.builds)) {
        requireProfileIdentifier(environment);
        const build = materializeMutationRequest(value, ["keys"]);
        if (build.keys !== undefined) validateDeleteIdentifiers(build.keys);
      }
    }
  }
  if (operations.properties !== undefined) {
    const properties = materializeMutationRequest(operations.properties, [
      "name",
      "description",
      "currentEnvironment",
      "lastModified",
      "selections",
      "vertigoSettings",
    ]);
    decodeProfileData(
      { name: "mutation-validation", ...properties },
      "validation",
    );
  }
  if (operations.replacement !== undefined) {
    decodeProfileData(operations.replacement, "replacement");
  }
  if (operations.updateSource !== undefined) {
    requireMutationString(operations.updateSource, { allowEmpty: true });
  }
  if (
    !operationFields.slice(0, -1).some((key) => operations[key] !== undefined)
  ) {
    throw new TypeError(
      "Explicit operations (add/delete/modify/properties/replacement) required",
    );
  }
  const result = /** @type {import('./serviceTypes.js').ProfileOperations} */ (
    operations
  );
  assertSafeProfileOperations(result);
  return result;
}

/** @param {unknown} value @returns {import('../../types/rpc/data.js').ProfileUpdateRequest} */
export function materializeProfileUpdateRequest(value) {
  const request = materializeMutationRequest(value, [
    "profileId",
    "updates",
    "createIfMissing",
    "precondition",
    ...operationFields,
  ]);
  const profileId = requireProfileIdentifier(request.profileId);
  if (
    request.createIfMissing !== undefined &&
    request.createIfMissing !== true
  ) {
    throw new TypeError("createIfMissing must be true when supplied");
  }
  const flat = Object.fromEntries(
    operationFields
      .filter((key) => request[key] !== undefined)
      .map((key) => [key, request[key]]),
  );
  const flatOperationsPresent = operationFields
    .slice(0, -1)
    .some((key) => request[key] !== undefined);
  const flatUpdates = flatOperationsPresent
    ? materializeProfileOperations(flat)
    : null;
  const outerSource =
    request.updateSource === undefined
      ? undefined
      : requireMutationString(request.updateSource, {
          allowEmpty: true,
        });
  const updates =
    request.updates === undefined
      ? (flatUpdates ?? materializeProfileOperations(flat))
      : materializeProfileOperations(request.updates);
  if (outerSource !== undefined && !updates.updateSource)
    updates.updateSource = outerSource;
  if (
    request.createIfMissing &&
    (request.updates === undefined ||
      flatOperationsPresent ||
      !updates.replacement ||
      updates.add ||
      updates.delete ||
      updates.modify ||
      updates.properties)
  ) {
    throw new TypeError(
      "createIfMissing requires a replacement-only profile update",
    );
  }
  return /** @type {import('../../types/rpc/data.js').ProfileUpdateRequest} */ ({
    profileId,
    updates,
    ...(request.createIfMissing ? { createIfMissing: true } : {}),
    ...(request.precondition === undefined
      ? {}
      : {
          precondition: materializeProfilePrecondition(request.precondition),
        }),
  });
}
