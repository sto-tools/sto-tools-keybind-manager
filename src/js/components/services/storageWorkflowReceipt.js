/** @param {unknown} value */
export function fingerprintWorkflowValue(value) {
  const serialized = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}:${serialized.length}`;
}

/**
 * @param {import('../../types/storage-contracts.js').DurableStageStatus} status
 * @param {boolean | 'indeterminate'} committed
 * @param {{fingerprint?: string, error?: import('../../types/storage-contracts.js').StorageWorkflowErrorCode}} [details]
 * @returns {import('../../types/storage-contracts.js').DurableStageReceipt}
 */
export function durableStage(status, committed, details = {}) {
  return Object.freeze({ status, committed, ...details });
}
