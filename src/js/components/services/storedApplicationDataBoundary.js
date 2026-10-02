import {
  assertSafeDataKey,
  cloneJsonData,
  getInvalidDataPath,
  hasOwnDataField,
  invalidProjectData,
  isDataRecord,
  MAX_PROJECT_JSON_BYTES,
  setOwnDataField,
} from "./jsonDataBoundary.js";
import {
  decodeStoredAliasMap,
  decodeStoredProfileData,
} from "./profileDataBoundary.js";

/** @param {string} content */
function storedDataByteLength(content) {
  return new TextEncoder().encode(content).byteLength;
}

/** @param {Record<string, unknown>} value @param {string} field */
function validateOptionalStringField(value, field) {
  if (hasOwnDataField(value, field) && typeof value[field] !== "string") {
    invalidProjectData(`$.${field}`);
  }
}

/**
 * Parse and validate the complete persisted application root before it can
 * enter DataCoordinator's accepted root. The boundary is deliberately distinct from
 * project import: already-structured profiles retain compatibility fields and
 * their exact command representation, while pure mode+keys profiles receive
 * the historical structural migration without losing optional data.
 *
 * @param {unknown} content
 * @param {{ defaults: import('../../types/data-contracts.js').StoredApplicationData, version: string }} options
 * @returns {import('../../types/data-contracts.js').StoredApplicationDecodeResult}
 */
export function decodeStoredApplicationJson(content, { defaults, version }) {
  return decodeStoredApplicationRoot(content, { defaults, version }, false);
}

/**
 * Migration-only decoding of a historical persisted root. Embedded settings
 * are ignored, never inspected or validated, and removed before the remaining
 * root is cloned so hostile embedded data cannot discard valid project data.
 * @param {unknown} content
 * @param {{ defaults: import('../../types/data-contracts.js').StoredApplicationData, version: string }} options
 * @returns {import('../../types/data-contracts.js').StoredApplicationDecodeResult}
 */
export function decodeLegacyStoredApplicationJson(
  content,
  { defaults, version },
) {
  return decodeStoredApplicationRoot(content, { defaults, version }, true);
}

/**
 * @param {unknown} content
 * @param {{ defaults: import('../../types/data-contracts.js').StoredApplicationData, version: string }} options
 * @param {boolean} allowLegacySettings
 * @returns {import('../../types/data-contracts.js').StoredApplicationDecodeResult}
 */
function decodeStoredApplicationRoot(
  content,
  { defaults, version },
  allowLegacySettings,
) {
  if (
    typeof content !== "string" ||
    content.length > MAX_PROJECT_JSON_BYTES ||
    storedDataByteLength(content) > MAX_PROJECT_JSON_BYTES
  ) {
    return { success: false, error: "invalid_data", path: "$" };
  }

  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (cause) {
    return { success: false, error: "invalid_json", cause };
  }

  try {
    if (!isDataRecord(parsed)) invalidProjectData("$");
    const hadEmbeddedSettings = hasOwnDataField(parsed, "settings");
    if (hadEmbeddedSettings) {
      if (!allowLegacySettings) invalidProjectData("$.settings");
      delete parsed.settings;
    }
    const detached = cloneJsonData(parsed, "$", 0);
    if (!isDataRecord(detached)) invalidProjectData("$");
    if (!hasOwnDataField(detached, "profiles")) {
      invalidProjectData("$.profiles");
    }
    if (!hasOwnDataField(detached, "currentProfile")) {
      invalidProjectData("$.currentProfile");
    }
    if (!isDataRecord(detached.profiles)) {
      invalidProjectData("$.profiles");
    }
    if (
      detached.currentProfile !== null &&
      typeof detached.currentProfile !== "string"
    ) {
      invalidProjectData("$.currentProfile");
    }
    if (typeof detached.currentProfile === "string") {
      assertSafeDataKey(detached.currentProfile, "$.currentProfile");
    }

    let changed = hadEmbeddedSettings;
    for (const field of ["version", "created", "lastModified", "lastBackup"]) {
      validateOptionalStringField(detached, field);
    }
    if (!hasOwnDataField(detached, "version")) {
      detached.version = version;
      changed = true;
    }
    if (!hasOwnDataField(detached, "lastModified")) {
      detached.lastModified = defaults.lastModified;
      changed = true;
    }

    changed = detached.version !== version || changed;
    let migrated = hadEmbeddedSettings;
    /** @type {Record<string, import('../../types/data-contracts.js').ProfileData>} */
    const profiles = {};
    for (const [profileId, profile] of Object.entries(detached.profiles)) {
      assertSafeDataKey(profileId, `$.profiles.${profileId}`);
      const decoded = decodeStoredProfileData(
        profile,
        profileId,
        `$.profiles.${profileId}`,
      );
      setOwnDataField(profiles, profileId, decoded.profile);
      migrated = decoded.migrated || migrated;
      changed = decoded.changed || changed;
    }
    /** @type {Record<string, any>} */ (detached).profiles = profiles;
    changed = changed || migrated;

    if (!detached.globalAliases) {
      /** @type {Record<string, any>} */ (detached).globalAliases = {};
      changed = true;
    } else {
      const aliases = decodeStoredAliasMap(
        detached.globalAliases,
        "$.globalAliases",
      );
      changed = aliases.changed || changed;
      /** @type {Record<string, any>} */ (detached).globalAliases =
        aliases.aliases;
    }

    const profileIds = Object.keys(profiles);
    let currentProfile = detached.currentProfile;
    if (profileIds.length === 0) {
      if (currentProfile !== null) changed = true;
      currentProfile = null;
    } else if (
      currentProfile === null ||
      !hasOwnDataField(profiles, currentProfile)
    ) {
      currentProfile = profileIds[0];
      changed = true;
    }
    detached.currentProfile = currentProfile;

    return {
      success: true,
      value:
        /** @type {import('../../types/data-contracts.js').StoredApplicationData} */ (
          detached
        ),
      changed,
      migrated,
    };
  } catch (error) {
    return {
      success: false,
      error: "invalid_data",
      path: getInvalidDataPath(error) || "$",
    };
  }
}
