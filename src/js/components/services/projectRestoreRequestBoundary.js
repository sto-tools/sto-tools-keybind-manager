import { hasOwnDataField, isDataRecord } from "./jsonDataBoundary.js";
import { materializeMutationRequest } from "./mutationRequestBoundary.js";

/**
 * @param {string} path
 * @returns {{ success: false, error: 'invalid_project_file', params: { path: string } }}
 */
export function invalidRestoreRequest(path) {
  return {
    success: false,
    error: "invalid_project_file",
    params: { path },
  };
}

/**
 * Decode the public RPC envelope without invoking inherited or accessor code.
 * @param {unknown} payload
 * @returns {{ success: true, content: string, fileName: string | undefined } | ReturnType<typeof invalidRestoreRequest>}
 */
export function decodeRestoreRequest(payload) {
  /** @type {Record<string, unknown>} */
  let record;
  /** @type {string} */
  let content;
  try {
    if (isDataRecord(payload)) {
      const fileNameDescriptor = Object.getOwnPropertyDescriptor(
        payload,
        "fileName",
      );
      if (fileNameDescriptor && !("value" in fileNameDescriptor)) {
        return invalidRestoreRequest("$.fileName");
      }
    }
    payload = materializeMutationRequest(payload, ["content", "fileName"]);
    if (!isDataRecord(payload) || !hasOwnDataField(payload, "content")) {
      return invalidRestoreRequest("$");
    }
    const descriptor = Object.getOwnPropertyDescriptor(payload, "content");
    if (
      !descriptor ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string"
    ) {
      return invalidRestoreRequest("$");
    }
    record = payload;
    content = descriptor.value;
  } catch {
    return invalidRestoreRequest("$");
  }

  try {
    if (!hasOwnDataField(record, "fileName")) {
      return { success: true, content, fileName: undefined };
    }
    const descriptor = Object.getOwnPropertyDescriptor(record, "fileName");
    if (!descriptor || !("value" in descriptor)) {
      return invalidRestoreRequest("$.fileName");
    }
    const fileName = descriptor.value;
    if (fileName !== undefined && typeof fileName !== "string") {
      return invalidRestoreRequest("$.fileName");
    }
    return { success: true, content, fileName };
  } catch {
    return invalidRestoreRequest("$.fileName");
  }
}
