import {
  materializePreferenceSettingsMutation,
  materializePreferenceDataRecord,
} from "./preferencesMutationBoundary.js";
import {
  hasCompleteKnownSettings,
  sanitizeStoredSettingsPatch,
  isDataRecord,
} from "./settingsDataBoundary.js";

/**
 * Validate and detach a complete repository value without invoking producer
 * accessors. Partial action patches must be completed by the owner first.
 * @param {unknown} value
 * @returns {import('../../types/data-contracts.js').CanonicalSettings | null}
 */
export function materializeCanonicalPreferences(value) {
  const detached = materializePreferenceSettingsMutation(value);
  if (!detached) return null;
  const sanitized = sanitizeStoredSettingsPatch(detached);
  return !sanitized.repaired && hasCompleteKnownSettings(sanitized.value)
    ? /** @type {import('../../types/data-contracts.js').CanonicalSettings} */ (
        sanitized.value
      )
    : null;
}

/** @param {unknown} result @returns {import('../../types/storage-contracts.js').SettingsLoadResult | null} */
export function materializeSettingsLoadResult(result) {
  const receipt = materializePreferenceDataRecord(result);
  if (!receipt) return null;
  const size = Object.keys(receipt).length;
  if (
    receipt.status === "read_failed" &&
    size === 3 &&
    receipt.error === "storage_read_failed" &&
    (receipt.category === "quota" ||
      receipt.category === "security" ||
      receipt.category === "unknown")
  ) {
    return {
      status: "read_failed",
      error: "storage_read_failed",
      category: receipt.category,
    };
  }
  const value = materializeCanonicalPreferences(receipt.value);
  if (!value) return null;
  if (receipt.status === "current" && size === 2)
    return { status: "current", value };
  if (
    receipt.status === "repair_required" &&
    size === 3 &&
    (receipt.reason === "missing" ||
      receipt.reason === "invalid_json" ||
      receipt.reason === "invalid_data" ||
      receipt.reason === "repaired")
  ) {
    return { status: "repair_required", value, reason: receipt.reason };
  }
  return null;
}

/** @param {unknown} result @returns {import('../../types/storage-contracts.js').SettingsClearResult | null} */
export function materializeSettingsClearResult(result) {
  const receipt = materializePreferenceDataRecord(result);
  if (
    !receipt ||
    Object.keys(receipt).length !== 2 ||
    !isDataRecord(receipt.removal)
  )
    return null;
  const removal = receipt.removal;
  if (
    receipt.status === "cleared" &&
    Object.keys(removal).length === 1 &&
    removal.status === "acknowledged"
  ) {
    return { status: "cleared", removal: { status: "acknowledged" } };
  }
  if (
    receipt.status === "clear_failed" &&
    Object.keys(removal).length === 3 &&
    removal.status === "indeterminate" &&
    removal.error === "storage_write_failed" &&
    (removal.category === "quota" ||
      removal.category === "security" ||
      removal.category === "unknown")
  ) {
    return {
      status: "clear_failed",
      removal: {
        status: "indeterminate",
        error: "storage_write_failed",
        category: removal.category,
      },
    };
  }
  return null;
}

/**
 * Repository receipts are runtime boundaries too. In particular a truthy
 * object, false, malformed acknowledgement, or unverified value is not success.
 * @param {unknown} result
 * @returns {import('../../types/storage-contracts.js').SettingsWriteResult | null}
 */
export function materializeSettingsWriteResult(result) {
  const receipt = materializePreferenceDataRecord(result);
  if (
    !receipt ||
    !isDataRecord(receipt.write) ||
    !isDataRecord(receipt.verification)
  )
    return null;
  const write = receipt.write;
  const verification = receipt.verification;
  const writeKeys = Object.keys(write);
  const verificationKeys = Object.keys(verification);
  if (receipt.status === "committed") {
    if (
      Object.keys(receipt).length !== 4 ||
      writeKeys.length !== 1 ||
      write.status !== "acknowledged" ||
      verificationKeys.length !== 1 ||
      verification.status !== "verified"
    )
      return null;
    const value = materializeCanonicalPreferences(receipt.value);
    return value
      ? {
          status: "committed",
          value,
          write: { status: "acknowledged" },
          verification: { status: "verified" },
        }
      : null;
  }
  if (Object.keys(receipt).length !== 4) return null;
  if (
    receipt.status === "rejected" &&
    (receipt.error === "invalid_data" ||
      receipt.error === "serialization_failed") &&
    writeKeys.length === 1 &&
    write.status === "not_attempted" &&
    verificationKeys.length === 1 &&
    verification.status === "not_attempted"
  ) {
    return {
      status: "rejected",
      error: receipt.error,
      write: { status: "not_attempted" },
      verification: { status: "not_attempted" },
    };
  }
  if (
    receipt.status === "write_failed" &&
    receipt.error === "storage_write_failed" &&
    writeKeys.length === 3 &&
    write.status === "indeterminate" &&
    write.error === "storage_write_failed" &&
    (write.category === "quota" ||
      write.category === "security" ||
      write.category === "unknown") &&
    verificationKeys.length === 1 &&
    verification.status === "not_attempted"
  ) {
    return {
      status: "write_failed",
      error: "storage_write_failed",
      write: {
        status: "indeterminate",
        error: "storage_write_failed",
        category: write.category,
      },
      verification: { status: "not_attempted" },
    };
  }
  if (
    receipt.status === "verification_failed" &&
    receipt.error === "verification_failed" &&
    writeKeys.length === 1 &&
    write.status === "acknowledged" &&
    verificationKeys.length === 3 &&
    verification.status === "failed" &&
    verification.error === "verification_failed" &&
    (verification.reason === "read_failed" ||
      verification.reason === "value_mismatch" ||
      verification.reason === "invalid_data")
  ) {
    return {
      status: "verification_failed",
      error: "verification_failed",
      write: { status: "acknowledged" },
      verification: {
        status: "failed",
        error: "verification_failed",
        reason: verification.reason,
      },
    };
  }
  return null;
}
