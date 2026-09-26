/**
 * Keep persistence receipts closed: never leak exception text or stored data.
 * Browser DOMExceptions expose name through an inherited accessor, so read it
 * defensively rather than assuming that caught values are ordinary Errors.
 * @param {unknown} error
 * @returns {import('../../types/storage-contracts.js').StorageFailureCategory}
 */
export function storageFailureCategory(error) {
  try {
    if (typeof error !== "object" || error === null || !("name" in error)) {
      return "unknown";
    }
    if (error.name === "QuotaExceededError") return "quota";
    if (error.name === "SecurityError") return "security";
  } catch {
    // Hostile thrown values still produce a closed, durability-honest receipt.
  }
  return "unknown";
}
