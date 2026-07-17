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
import { decodeProfileData } from "./profileDataBoundary.js";
import { decodeProjectSettings } from "./settingsDataBoundary.js";

/** @param {string} content */
function projectByteLength(content) {
  return new TextEncoder().encode(content).byteLength;
}

/**
 * Parse and validate a complete project payload before orchestration can write
 * any part of it. Metadata fields remain optional for accepted legacy exports.
 * @param {unknown} content
 * @returns {import('../../types/data-contracts.js').ProjectDecodeResult}
 */
export function decodeProjectJson(content) {
  if (typeof content !== "string") {
    return {
      success: false,
      error: "invalid_project_file",
      params: { path: "$" },
    };
  }
  if (
    content.length > MAX_PROJECT_JSON_BYTES ||
    projectByteLength(content) > MAX_PROJECT_JSON_BYTES
  ) {
    return {
      success: false,
      error: "invalid_project_file",
      params: { path: "$" },
    };
  }

  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { success: false, error: "import_failed_invalid_json" };
  }

  try {
    const detached = cloneJsonData(parsed, "$", 0);
    if (!isDataRecord(detached)) invalidProjectData("$");
    if (detached.type !== "project") invalidProjectData("$.type");
    if (!isDataRecord(detached.data)) invalidProjectData("$.data");
    if (
      hasOwnDataField(detached, "version") &&
      typeof detached.version !== "string"
    ) {
      invalidProjectData("$.version");
    }
    if (
      hasOwnDataField(detached, "exported") &&
      typeof detached.exported !== "string"
    ) {
      invalidProjectData("$.exported");
    }

    /** @type {import('../../types/data-contracts.js').CanonicalProjectData} */
    const data = {};
    if (hasOwnDataField(detached.data, "profiles")) {
      if (!isDataRecord(detached.data.profiles)) {
        invalidProjectData("$.data.profiles");
      }
      /** @type {Record<string, import('../../types/data-contracts.js').CanonicalProfileData>} */
      const profiles = {};
      for (const [profileId, profile] of Object.entries(
        detached.data.profiles,
      )) {
        assertSafeDataKey(profileId, `$.data.profiles.${profileId}`);
        setOwnDataField(
          profiles,
          profileId,
          decodeProfileData(profile, profileId, `$.data.profiles.${profileId}`),
        );
      }
      data.profiles = profiles;
    }
    if (hasOwnDataField(detached.data, "settings")) {
      data.settings = decodeProjectSettings(
        detached.data.settings,
        "$.data.settings",
      );
    }
    if (hasOwnDataField(detached.data, "currentProfile")) {
      if (
        detached.data.currentProfile !== null &&
        typeof detached.data.currentProfile !== "string"
      ) {
        invalidProjectData("$.data.currentProfile");
      }
      if (typeof detached.data.currentProfile === "string") {
        assertSafeDataKey(
          detached.data.currentProfile,
          "$.data.currentProfile",
        );
      }
      data.currentProfile = detached.data.currentProfile;
    }

    /** @type {import('../../types/data-contracts.js').ProjectEnvelope} */
    const value = { type: "project", data };
    if (typeof detached.version === "string") value.version = detached.version;
    if (typeof detached.exported === "string") {
      value.exported = detached.exported;
    }
    return { success: true, value };
  } catch (error) {
    const path = getInvalidDataPath(error);
    return {
      success: false,
      error: "invalid_project_file",
      params: { path: path || "$" },
    };
  }
}
