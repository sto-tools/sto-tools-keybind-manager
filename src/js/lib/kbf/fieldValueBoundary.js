/** @typedef {{ fieldName: string, value: string, hasColon: boolean }} KBFRecord */
/** @typedef {(message: string, context?: Record<string, any>) => void} DiagnosticCallback */

const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
const MAX_KBF_COMBO_TOKENS = 10;

/** @param {unknown} error */
const asError = (error) =>
  error instanceof Error ? error : new Error(String(error));

/** @param {string} value */
const containsAsciiControl = (value) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });

/**
 * Parse a KBF integer field without accepting coercion or lossy integers.
 * @param {{
 *   record: KBFRecord,
 *   fieldIndex: number,
 *   fieldName: string,
 *   minValue?: number | null,
 *   maxValue?: number | null,
 *   addError?: DiagnosticCallback,
 *   addWarning?: DiagnosticCallback
 * }} input
 * @returns {number | null}
 */
export function parseKBFIntegerField({
  record,
  fieldIndex,
  fieldName,
  minValue = null,
  maxValue = null,
  addError,
  addWarning,
}) {
  if (!record.hasColon || !record.value) {
    addError?.(`Invalid ${fieldName} field: missing colon or value`, {
      fieldName: record.fieldName,
      value: record.value,
      fieldIndex,
    });
    return null;
  }

  const value = record.value.trim();
  if (value.length === 0) {
    addError?.(`Empty ${fieldName} field`, { fieldIndex });
    return null;
  }
  if (!/^-?\d+$/.test(value)) {
    addError?.(`Invalid ${fieldName} field: must be numeric`, {
      fieldIndex,
      value,
    });
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isSafeInteger(numericValue)) {
    addError?.(`${fieldName} field must be a safe integer`, {
      fieldIndex,
      value,
      fatal: true,
    });
    return null;
  }
  if (minValue !== null && numericValue < minValue) {
    addWarning?.(`${fieldName} value below minimum, using minimum`, {
      fieldIndex,
      value: numericValue,
      minValue,
    });
    return minValue;
  }
  if (maxValue !== null && numericValue > maxValue) {
    addWarning?.(`${fieldName} value above maximum, using maximum`, {
      fieldIndex,
      value: numericValue,
      maxValue,
    });
    return maxValue;
  }
  return numericValue;
}

/**
 * Decode a Base64 KBF text field, rejecting invalid UTF-8 when validation is
 * enabled and retaining the legacy replacement-character fallback otherwise.
 * @param {{
 *   record: KBFRecord,
 *   fieldIndex: number,
 *   validateUtf8?: boolean,
 *   addError?: DiagnosticCallback,
 *   addWarning?: DiagnosticCallback
 * }} input
 * @returns {string | null}
 */
export function decodeKBFTextField({
  record,
  fieldIndex,
  validateUtf8 = true,
  addError,
  addWarning,
}) {
  if (!record.hasColon) {
    addError?.(`Invalid ${record.fieldName} field: missing colon`, {
      fieldName: record.fieldName,
      value: record.value,
      fieldIndex,
      fatal: true,
    });
    return null;
  }
  if (record.value === null || record.value === undefined) return "";

  const base64Text = record.value.trim();
  if (base64Text.length === 0) return "";
  if (!base64Pattern.test(base64Text) || base64Text.length % 4 !== 0) {
    addError?.(`${record.fieldName} field contains invalid Base64 data`, {
      fieldIndex,
      textLength: base64Text.length,
      textPreview: base64Text.slice(0, 50),
      fatal: true,
    });
    return null;
  }

  try {
    const binaryString = atob(base64Text);
    if (btoa(binaryString) !== base64Text) {
      addError?.(
        `${record.fieldName} field contains non-canonical Base64 data`,
        { fieldIndex, fatal: true },
      );
      return null;
    }
    const utf8Bytes = Uint8Array.from(binaryString, (character) =>
      character.charCodeAt(0),
    );
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(utf8Bytes);
    } catch (error) {
      const utf8Error = asError(error);
      if (validateUtf8 !== false) {
        addError?.(`${record.fieldName} field contains invalid UTF-8 data`, {
          fieldIndex,
          errorType: utf8Error.name,
          errorMessage: utf8Error.message,
          fatal: true,
        });
        return null;
      }

      addWarning?.(
        `${record.fieldName} field contains invalid UTF-8 data, using fallback decoding`,
        {
          fieldIndex,
          errorType: utf8Error.name,
          errorMessage: utf8Error.message,
        },
      );
      try {
        return new TextDecoder("utf-8", { fatal: false }).decode(utf8Bytes);
      } catch (error) {
        const fallbackError = asError(error);
        addError?.(
          `Complete ${record.fieldName} field UTF-8 decoding failure`,
          {
            fieldIndex,
            errorType: fallbackError.name,
            errorMessage: fallbackError.message,
            fatal: true,
          },
        );
        return null;
      }
    }
  } catch (error) {
    const decodeError = asError(error);
    addError?.(`Failed to Base64 decode ${record.fieldName} field`, {
      fieldIndex,
      errorType: decodeError.name,
      errorMessage: decodeError.message,
      textLength: base64Text.length,
      fatal: true,
    });
    return null;
  }
}

/**
 * Decode one KBF Combo field without dropping or coercing chord segments.
 * Every segment must be canonical Base64, strict UTF-8, and a known key token.
 *
 * @param {{
 *   record: KBFRecord,
 *   fieldIndex: number,
 *   canonicalizeToken: (token: string) => string | null,
 *   addError?: DiagnosticCallback
 * }} input
 * @returns {string[] | null}
 */
export function decodeKBFComboField({
  record,
  fieldIndex,
  canonicalizeToken,
  addError,
}) {
  /** @param {string} message @param {Record<string, any>} context */
  const reject = (message, context = {}) => {
    addError?.(message, { fieldIndex, ...context, fatal: true });
    return null;
  };

  if (!record.hasColon || typeof record.value !== "string") {
    return reject("Invalid Combo field: missing colon or string value", {
      fieldName: record.fieldName,
      value: record.value,
    });
  }

  const comboValue = record.value.trim();
  if (comboValue.length === 0) return [];
  const tokens = comboValue.split("*");
  if (tokens.length > MAX_KBF_COMBO_TOKENS) {
    return reject(
      `Combo field exceeds the ${MAX_KBF_COMBO_TOKENS}-token limit`,
      { tokenCount: tokens.length },
    );
  }

  const decodedTokens = [];
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    const token = tokens[tokenIndex];
    if (
      token.length === 0 ||
      token !== token.trim() ||
      !base64Pattern.test(token) ||
      token.length % 4 !== 0
    ) {
      return reject("Combo field contains invalid Base64 data", {
        tokenIndex,
      });
    }

    try {
      const binary = atob(token);
      if (btoa(binary) !== token) {
        return reject("Combo field contains non-canonical Base64 data", {
          tokenIndex,
        });
      }
      const bytes = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0),
      );
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const canonical = canonicalizeToken(decoded);
      if (
        decoded.length === 0 ||
        decoded !== decoded.trim() ||
        containsAsciiControl(decoded) ||
        typeof canonical !== "string" ||
        canonical.length === 0 ||
        canonical !== canonical.trim() ||
        containsAsciiControl(canonical)
      ) {
        return reject("Combo field contains an unsafe key token", {
          tokenIndex,
        });
      }
      decodedTokens.push(canonical);
    } catch (error) {
      const decodeError = asError(error);
      return reject("Failed to decode Combo field token", {
        tokenIndex,
        errorType: decodeError.name,
        errorMessage: decodeError.message,
      });
    }
  }
  return decodedTokens;
}
