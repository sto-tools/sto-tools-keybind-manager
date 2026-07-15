const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

/** @param {unknown} input */
export function isArrayBuffer(input) {
  return (
    typeof ArrayBuffer !== "undefined" &&
    (input instanceof ArrayBuffer ||
      Object.prototype.toString.call(input) === "[object ArrayBuffer]")
  );
}

/**
 * @typedef {(message: string, context?: Object) => void} DiagnosticCallback
 * @typedef {{
 *   addError?: DiagnosticCallback,
 *   addWarning?: DiagnosticCallback,
 *   layerName?: string,
 *   context?: Object,
 *   allowEmpty?: boolean,
 *   cleanWhitespace?: boolean,
 *   minSize?: number,
 *   validateUtf8?: boolean,
 *   errorMessages?: {
 *     invalidBase64?: string,
 *     decodeFailed?: string,
 *     emptyResult?: string
 *   },
 *   validateContent?: (decoded: string, context: Object) => {
 *     valid: boolean,
 *     warning?: boolean,
 *     message: string,
 *     context?: Object
 *   }
 * }} DecodeOptions
 */

/**
 * @param {*} input
 * @param {DecodeOptions} [options]
 */
export function normalizeInputForDecoding(
  input,
  { addError, layerName = "Unknown", context = {} } = {},
) {
  if (isArrayBuffer(input)) {
    try {
      const content = new TextDecoder("utf-8").decode(input);
      return { content, success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addError?.(`Failed to decode ArrayBuffer to string: ${message}`, {
        contentType: "ArrayBuffer",
        contentSize: input.byteLength,
        ...context,
      });
      return { content: "", success: false };
    }
  }

  if (typeof input === "string") {
    return { content: input, success: true };
  }

  addError?.(`Invalid content type for ${layerName} decoding`, {
    contentType: typeof input,
    expectedType: "string|ArrayBuffer",
    ...context,
  });
  return { content: "", success: false };
}

/**
 * @param {*} payload
 * @param {DecodeOptions} [options]
 * @returns {string|null}
 */
export function decodeBase64(payload, options = {}) {
  const {
    addError,
    addWarning,
    layerName = "Unknown",
    allowEmpty = false,
    cleanWhitespace = false,
    minSize = 0,
    context = {},
  } = options;

  if (typeof payload !== "string") {
    addError?.(`${layerName}: payload is missing or invalid`, {
      ...context,
      payloadType: typeof payload,
    });
    return null;
  }

  let trimmed = payload.trim();
  if (trimmed.length === 0) {
    addError?.(`${layerName}: payload is empty`, context);
    return null;
  }

  if (cleanWhitespace) {
    trimmed = trimmed.replace(/\s+/g, "").replace(/[\r\n\t]/g, "");
  }

  if (!BASE64_PATTERN.test(trimmed)) {
    addError?.(`${layerName} payload contains invalid Base64 data`, {
      ...context,
      payloadLength: trimmed.length,
      payloadPreview: trimmed.slice(0, 50),
    });
    return null;
  }

  if (trimmed.length % 4 !== 0) {
    addError?.(
      `${layerName} payload length ${trimmed.length} is not a multiple of 4`,
      {
        ...context,
        remainder: trimmed.length % 4,
      },
    );
    return null;
  }

  if (minSize && trimmed.length < minSize) {
    addError?.(`${layerName} content too small to contain valid KBF data`, {
      ...context,
      payloadLength: trimmed.length,
      minimumExpected: minSize,
    });
    return null;
  }

  try {
    const decoded = atob(trimmed);
    if (!decoded && !allowEmpty) {
      addError?.(`${layerName} decoding produced empty result`, context);
      return null;
    }
    if (options.validateContent) {
      const validation = options.validateContent(decoded, context);
      if (!validation.valid) {
        if (validation.warning) {
          addWarning?.(validation.message, validation.context);
        } else {
          addError?.(validation.message, validation.context);
          return null;
        }
      }
    }
    return decoded;
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "Error";
    const errorMessage = error instanceof Error ? error.message : String(error);
    addError?.(`${layerName} Base64 decoding failed`, {
      ...context,
      errorType: errorName,
      errorMessage,
      payloadLength: trimmed.length,
    });
    return null;
  }
}

/**
 * @param {*} bytes
 * @param {DecodeOptions} [options]
 * @returns {string}
 */
export function decodeUtf8(bytes, options = {}) {
  const { addError, addWarning, validateUtf8 = true, context = {} } = options;

  if (!(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer)) {
    addError?.("UTF-8 bytes must be a Uint8Array or ArrayBuffer", {
      constructorName: bytes?.constructor?.name,
      ...context,
    });
    return "";
  }

  const byteArray =
    bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;

  if (byteArray.length === 0) {
    addWarning?.("UTF-8 byte array is empty", context);
    return "";
  }

  try {
    const decoder = new TextDecoder("utf-8", { fatal: validateUtf8 });
    return decoder.decode(byteArray);
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "Error";
    const errorMessage = error instanceof Error ? error.message : String(error);
    addError?.(`UTF-8 decoding failed: ${errorName}: ${errorMessage}`, {
      ...context,
      errorType: errorName,
      errorMessage,
      inputLength: byteArray.length,
    });

    try {
      const fallbackDecoder = new TextDecoder("utf-8", { fatal: false });
      return fallbackDecoder.decode(byteArray);
    } catch (fallbackError) {
      const fallbackMessage =
        fallbackError instanceof Error
          ? fallbackError.message
          : String(fallbackError);
      addError?.(`UTF-8 fallback decoding failed: ${fallbackMessage}`, {
        ...context,
        originalError: errorMessage,
        fallbackError: fallbackMessage,
      });
      return "";
    }
  }
}

/**
 * @param {string} base64String
 * @returns {boolean}
 */
export function isValidBase64(base64String) {
  try {
    return btoa(atob(base64String)) === base64String;
  } catch {
    return false;
  }
}
