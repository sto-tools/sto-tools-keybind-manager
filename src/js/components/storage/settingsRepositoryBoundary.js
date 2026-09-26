import {
  decodeProjectSettings,
  decodeStoredSettingsJson,
  hasCompleteKnownSettings,
} from "../services/settingsDataBoundary.js";
import { serializeRepositoryData } from "./repositoryJsonBoundary.js";

/** @typedef {import('../../types/data-contracts.js').CanonicalSettings} CanonicalSettings */
/** @typedef {import('../../types/storage-contracts.js').RepositoryInputError} RepositoryInputError */

/**
 * Strict complete-record replacement: inspect/detach plain JSON before the
 * established settings validators can read any caller-supplied properties.
 * @param {unknown} input
 * @returns {{success: true, json: string, value: CanonicalSettings} | {success: false, error: RepositoryInputError}}
 */
export function prepareSettingsRepositoryValue(input) {
  const serialized = serializeRepositoryData(input);
  if (!serialized.success) return serialized;
  try {
    const value = decodeProjectSettings(serialized.value);
    if (!hasCompleteKnownSettings(value)) {
      return { success: false, error: "invalid_data" };
    }
    return { success: true, json: serialized.json, value };
  } catch {
    return { success: false, error: "invalid_data" };
  }
}

/**
 * Forgiving, read-only recovery is deliberately distinct from replacement.
 * Complete known fields are mandatory for a current standalone record, even
 * though the legacy decoder does not flag a merely partial record as repaired.
 * @param {unknown} content
 * @param {CanonicalSettings} defaults Validated, detached construction defaults.
 * @returns {Exclude<import('../../types/storage-contracts.js').SettingsLoadResult, {status: "read_failed"}>}
 */
export function decodeSettingsRepositoryJson(content, defaults) {
  const decoded = decodeStoredSettingsJson(content, defaults);
  const value = /** @type {CanonicalSettings} */ (decoded.value);
  if (content === null) {
    return { status: "repair_required", reason: "missing", value };
  }
  if (decoded.error) {
    return { status: "repair_required", reason: decoded.error, value };
  }
  if (
    decoded.repaired ||
    typeof content !== "string" ||
    !hasCompleteKnownSettings(JSON.parse(content))
  ) {
    return { status: "repair_required", reason: "repaired", value };
  }
  return { status: "current", value };
}
