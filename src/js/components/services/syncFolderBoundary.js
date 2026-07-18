import { decodeProjectJson } from "./importJsonBoundary.js";
import { MAX_PROJECT_JSON_BYTES } from "./jsonDataBoundary.js";

/** @typedef {import('../../types/sync-boundary.js').SyncDirectoryCapability} SyncDirectoryCapability */
/** @typedef {import('../../types/sync-boundary.js').SyncDirectoryPermissionEffects} SyncDirectoryPermissionEffects */
/** @typedef {import('../../types/sync-boundary.js').SyncDirectoryPermissionResult} SyncDirectoryPermissionResult */
/** @typedef {import('../../types/sync-boundary.js').SyncPermissionMode} SyncPermissionMode */
/** @typedef {import('../../types/sync-boundary.js').SyncPermissionState} SyncPermissionState */
/** @typedef {import('../../types/sync-boundary.js').SyncProjectProbeOperation} SyncProjectProbeOperation */
/** @typedef {import('../../types/sync-boundary.js').SyncProjectProbeResult} SyncProjectProbeResult */

/** @param {unknown} value @returns {value is object} */
function isObject(value) {
  return typeof value === "object" && value !== null;
}

/** @param {Function} method @param {object} receiver */
function bindMethod(method, receiver) {
  return Function.prototype.bind.call(method, receiver);
}

/**
 * Decode the structural part of a directory handle obtained from an external
 * browser or IndexedDB boundary. Permission methods are decoded separately.
 *
 * @param {unknown} raw
 * @returns {import('../../types/sync-boundary.js').SyncDirectoryCapabilityDecodeResult}
 */
export function decodeSyncDirectoryCapability(raw) {
  if (!isObject(raw)) {
    return { success: false, error: "invalid_directory_capability" };
  }

  try {
    const kind = Reflect.get(raw, "kind");
    const name = Reflect.get(raw, "name");
    const getFileHandle = Reflect.get(raw, "getFileHandle");
    const getDirectoryHandle = Reflect.get(raw, "getDirectoryHandle");
    if (
      kind !== "directory" ||
      typeof name !== "string" ||
      name.length === 0 ||
      typeof getFileHandle !== "function" ||
      typeof getDirectoryHandle !== "function"
    ) {
      return { success: false, error: "invalid_directory_capability" };
    }

    return {
      success: true,
      value: {
        kind,
        name,
        raw: /** @type {import('../../types/sync-boundary.js').SyncDirectoryHandle} */ (
          raw
        ),
        getFileHandle: bindMethod(getFileHandle, raw),
        getDirectoryHandle: bindMethod(getDirectoryHandle, raw),
      },
    };
  } catch {
    return { success: false, error: "invalid_directory_capability" };
  }
}

/**
 * Decode a required operation input and fail before any downstream effect.
 * @param {unknown} raw
 * @returns {SyncDirectoryCapability}
 */
export function requireSyncDirectoryCapability(raw) {
  const decoded = decodeSyncDirectoryCapability(raw);
  if (!decoded.success)
    throw new TypeError("Invalid sync directory capability");
  return decoded.value;
}

/**
 * Decode the permission effects without making them part of the directory's
 * structural validity. TypeScript's DOM library does not currently expose
 * these File System Access API methods consistently.
 *
 * @param {unknown} raw
 * @returns {import('../../types/sync-boundary.js').SyncDirectoryPermissionEffectsDecodeResult}
 */
export function decodeSyncDirectoryPermissionEffects(raw) {
  if (!isObject(raw)) {
    return { success: false, error: "permission_api_unavailable" };
  }

  try {
    const queryPermission = Reflect.get(raw, "queryPermission");
    const requestPermission = Reflect.get(raw, "requestPermission");
    if (
      typeof queryPermission !== "function" ||
      typeof requestPermission !== "function"
    ) {
      return { success: false, error: "permission_api_unavailable" };
    }

    return {
      success: true,
      value: {
        queryPermission: bindMethod(queryPermission, raw),
        requestPermission: bindMethod(requestPermission, raw),
      },
    };
  } catch {
    return { success: false, error: "permission_api_unavailable" };
  }
}

/** @param {unknown} value @returns {value is SyncPermissionState} */
function isPermissionState(value) {
  return value === "granted" || value === "denied" || value === "prompt";
}

/**
 * Run and validate the permission effects independently from handle decoding.
 *
 * @param {SyncDirectoryPermissionEffects} effects
 * @param {SyncPermissionMode} [mode]
 * @returns {Promise<SyncDirectoryPermissionResult>}
 */
export async function ensureSyncDirectoryPermission(
  effects,
  mode = "readwrite",
) {
  /** @type {unknown} */
  let queryState;
  try {
    queryState = await effects.queryPermission({ mode });
  } catch (cause) {
    return {
      success: false,
      error: "permission_api_failed",
      operation: "query",
      cause,
    };
  }
  if (!isPermissionState(queryState)) {
    return {
      success: false,
      error: "invalid_permission_result",
      operation: "query",
      value: queryState,
    };
  }
  if (queryState === "granted") return { success: true, state: "granted" };

  /** @type {unknown} */
  let requestState;
  try {
    requestState = await effects.requestPermission({ mode });
  } catch (cause) {
    return {
      success: false,
      error: "permission_api_failed",
      operation: "request",
      cause,
    };
  }
  if (!isPermissionState(requestState)) {
    return {
      success: false,
      error: "invalid_permission_result",
      operation: "request",
      value: requestState,
    };
  }
  if (requestState === "granted") {
    return { success: true, state: "granted" };
  }
  return {
    success: false,
    error: "permission_denied",
    state: requestState,
  };
}

/** @param {unknown} error @param {string} name */
function isDomExceptionNamed(error, name) {
  return error instanceof DOMException && error.name === name;
}

/** @param {unknown} error */
function isAccessDenied(error) {
  return (
    isDomExceptionNamed(error, "NotAllowedError") ||
    isDomExceptionNamed(error, "SecurityError")
  );
}

/**
 * @param {SyncProjectProbeOperation} operation
 * @param {unknown} cause
 * @returns {SyncProjectProbeResult}
 */
function probeEffectFailure(operation, cause) {
  return {
    success: false,
    error: isAccessDenied(cause)
      ? "project_file_access_denied"
      : "project_file_read_failed",
    operation,
    cause,
  };
}

/** @param {unknown} raw */
function decodeProjectFileHandle(raw) {
  if (!isObject(raw)) return null;
  try {
    const kind = Reflect.get(raw, "kind");
    const name = Reflect.get(raw, "name");
    const getFile = Reflect.get(raw, "getFile");
    if (
      kind !== "file" ||
      typeof name !== "string" ||
      name.length === 0 ||
      typeof getFile !== "function"
    ) {
      return null;
    }
    return { getFile: bindMethod(getFile, raw) };
  } catch {
    return null;
  }
}

/**
 * @param {unknown} raw
 * @returns {{ size: number, text: () => Promise<unknown> } | null}
 */
function decodeReadableProjectFile(raw) {
  if (!isObject(raw)) return null;
  try {
    const size = Reflect.get(raw, "size");
    const text = Reflect.get(raw, "text");
    if (
      !Number.isSafeInteger(size) ||
      Number(size) < 0 ||
      typeof text !== "function"
    ) {
      return null;
    }
    return { size: Number(size), text: bindMethod(text, raw) };
  } catch {
    return null;
  }
}

/** @param {string} content */
function projectContentByteLength(content) {
  return new TextEncoder().encode(content).byteLength;
}

/**
 * Probe project.json without allowing raw file content to cross the boundary.
 * Only a real DOMException named NotFoundError means the file is absent.
 *
 * @param {SyncDirectoryCapability} directory
 * @returns {Promise<SyncProjectProbeResult>}
 */
export async function probeSyncProjectFile(directory) {
  /** @type {unknown} */
  let rawFileHandle;
  try {
    rawFileHandle = await directory.getFileHandle("project.json", {
      create: false,
    });
  } catch (cause) {
    if (isDomExceptionNamed(cause, "NotFoundError")) {
      return { success: true, state: "absent" };
    }
    return probeEffectFailure("get_file_handle", cause);
  }

  const fileHandle = decodeProjectFileHandle(rawFileHandle);
  if (!fileHandle) {
    return {
      success: false,
      error: "invalid_project_file_capability",
      path: "handle",
    };
  }

  /** @type {unknown} */
  let rawFile;
  try {
    rawFile = await fileHandle.getFile();
  } catch (cause) {
    return probeEffectFailure("get_file", cause);
  }

  const file = decodeReadableProjectFile(rawFile);
  if (!file) {
    return {
      success: false,
      error: "invalid_project_file_capability",
      path: "file",
    };
  }
  if (file.size > MAX_PROJECT_JSON_BYTES) {
    return {
      success: false,
      error: "project_file_too_large",
      source: "file.size",
      size: file.size,
      limit: MAX_PROJECT_JSON_BYTES,
    };
  }

  /** @type {unknown} */
  let rawContent;
  try {
    rawContent = await file.text();
  } catch (cause) {
    return probeEffectFailure("read_text", cause);
  }
  if (typeof rawContent !== "string") {
    return {
      success: false,
      error: "invalid_project_file_capability",
      path: "file.text()",
    };
  }

  const contentSize =
    rawContent.length > MAX_PROJECT_JSON_BYTES
      ? rawContent.length
      : projectContentByteLength(rawContent);
  if (contentSize > MAX_PROJECT_JSON_BYTES) {
    return {
      success: false,
      error: "project_file_too_large",
      source: "file.text()",
      size: contentSize,
      limit: MAX_PROJECT_JSON_BYTES,
    };
  }

  const decoded = decodeProjectJson(rawContent);
  if (!decoded.success) {
    return {
      success: false,
      error: "invalid_project",
      decode: decoded,
    };
  }
  return {
    success: true,
    state: "present",
    value: decoded.value,
    content: rawContent,
    fileName: "project.json",
  };
}
