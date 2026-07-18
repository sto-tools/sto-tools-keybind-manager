/**
 * @typedef {[string, string, any, Record<string, any>]} ValidationArguments
 */

const simpleAliasSegmentPattern = /^[A-Za-z0-9]+$/;

/**
 * @template {string} Type
 * @param {number} activity
 * @param {Type} type
 * @param {string} suggestion
 * @returns {{ type: Type, commands: never[], aliases: Record<string, never>, success: false, error: string, errorCategory: string, suggestion: string }}
 */
function createActivityTranslationFailure(activity, type, suggestion) {
  return {
    type,
    commands: [],
    aliases: {},
    success: false,
    error: `Activity translation failed: ${activity}`,
    errorCategory: "invalid_activity_data",
    suggestion,
  };
}

/** @param {unknown} name */
export function sanitizeKBFBindsetName(name) {
  if (typeof name !== "string") return "unknown_bindset";
  if (name.length === 0) return "unnamed_bindset";
  let sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (/^[0-9]/.test(sanitized)) sanitized = `bs_${sanitized}`;
  return sanitized || "unnamed_bindset";
}

/**
 * Build Activity 95's bounded tray-slot expansion without reporting errors.
 * The caller owns publication of the returned validation diagnostic.
 *
 * @param {any} n1
 * @param {any} n2
 * @param {any} n3
 * @param {any} path
 * @returns {{
 *   translation: { type: "parameterized_command", commands: string[], aliases: Record<string, never> },
 *   validation: ValidationArguments | null
 * }}
 */
export function translateActivity95(n1, n2, n3, path) {
  const tray = n1 ?? 0;
  const fromSlot = n2 ?? 0;
  const toSlot = n3 ?? 0;
  /** @type {string[]} */
  const commands = [];
  const validRange =
    Number.isSafeInteger(tray) &&
    Number.isSafeInteger(fromSlot) &&
    Number.isSafeInteger(toSlot) &&
    tray >= 0 &&
    fromSlot >= 0 &&
    toSlot <= 9 &&
    fromSlot <= toSlot;

  if (!validRange) {
    return {
      translation: createActivityTranslationFailure(
        95,
        "parameterized_command",
        "Use a non-negative tray and an inclusive slot range from 0 to 9",
      ),
      validation: [
        "activity95Range",
        "must use safe integers and an ordered slot range from 0 to 9",
        { tray, fromSlot, toSlot },
        {
          expectedValue: "non-negative tray and inclusive slot range 0..9",
          suggestion:
            "Activity 95 may expand to at most the ten STO tray slots",
          fatal: true,
          path,
        },
      ],
    };
  }

  for (let slot = fromSlot; slot <= toSlot; slot++) {
    commands.push(`+TrayExecByTray ${tray.toString()} ${slot.toString()}`);
  }
  return {
    translation: { type: "parameterized_command", commands, aliases: {} },
    validation: null,
  };
}

/** @param {unknown} value */
function frameAliasSegment(value) {
  const source = String(value);
  let encoded = "";
  for (let index = 0; index < source.length; index++) {
    encoded += source.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return `${source.length}x${encoded}`;
}

/** @param {Record<string, any>} context @param {string} value */
function sanitizeAliasSegment(context, value) {
  if (typeof context.sanitize !== "function") return value;
  const sanitized = context.sanitize(value);
  return typeof sanitized === "string" ? sanitized : String(sanitized);
}

/**
 * @param {string} prefix
 * @param {Record<string, any>} context
 */
function createCycleAlias(prefix, context) {
  const baseKeyName = String(context.baseKeyName || "key");
  const activityIndex = String(context.index || 0);
  const keyAndIndex = `${baseKeyName}_${activityIndex}`;
  if (
    typeof context.bindsetName !== "string" ||
    context.bindsetName.length === 0
  ) {
    return `${prefix}_${keyAndIndex}`;
  }

  const bindsetName = context.bindsetName;
  const safeBindset = sanitizeAliasSegment(context, bindsetName);
  const safeKey = sanitizeAliasSegment(context, baseKeyName);
  if (
    simpleAliasSegmentPattern.test(bindsetName) &&
    simpleAliasSegmentPattern.test(baseKeyName) &&
    simpleAliasSegmentPattern.test(activityIndex) &&
    simpleAliasSegmentPattern.test(safeBindset) &&
    simpleAliasSegmentPattern.test(safeKey)
  ) {
    return `${prefix}_${safeBindset}_${safeKey}_${activityIndex}`;
  }

  return `${prefix}_scoped_b${frameAliasSegment(bindsetName)}_k${frameAliasSegment(baseKeyName)}_i${frameAliasSegment(activityIndex)}`;
}

/** @param {Record<string, any>} context */
export function createEmoteCycleAlias(context) {
  return createCycleAlias("sto_kb_emotecycle", context);
}

/** @param {Record<string, any>} context */
export function createVisibleEmoteCycleAlias(context) {
  return createCycleAlias("sto_kb_emotecyclevisible", context);
}

/**
 * Reject characters that cannot be represented safely in STO's line-oriented
 * command-file format. The caller owns publication of the diagnostic.
 *
 * @param {unknown} text
 * @param {unknown} text2
 * @param {unknown} path
 * @returns {ValidationArguments | null}
 */
function validateActivityCommandText(text, text2, path) {
  /** @type {Array<[string, unknown]>} */
  const fields = [
    ["text", text],
    ["text2", text2],
  ];
  for (const [field, value] of fields) {
    if (typeof value !== "string" || !hasUnsafeCommandText(value)) {
      continue;
    }
    return [
      field,
      "must not contain control or line-separator characters",
      value,
      {
        expectedValue: "single-line Unicode text without control characters",
        suggestion:
          "Remove CR, LF, NUL, control, and Unicode line-separator characters",
        fatal: true,
        path: path ? `${String(path)}.${field}` : undefined,
      },
    ];
  }
  return null;
}

/** @param {number} activity @param {Record<string, any>} context */
export function rejectUnsafeText(activity, context) {
  const validation = validateActivityCommandText(
    context.text,
    context.text2,
    context.path,
  );
  if (!validation) return null;
  return {
    validation,
    failure: createActivityTranslationFailure(
      activity,
      "text_command",
      "Use single-line text without control or line-separator characters",
    ),
  };
}

/** @param {string} value */
function hasUnsafeCommandText(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x2028 ||
      codePoint === 0x2029
    ) {
      return true;
    }
  }
  return false;
}

/** @param {string} token */
export function provideTokenFallback(token) {
  const tokenLower = token.toLowerCase();
  if (tokenLower.startsWith("f") && /^\d+$/.test(tokenLower.slice(1))) {
    return token.toUpperCase();
  }
  if (tokenLower.startsWith("numpad")) {
    return token.charAt(0).toUpperCase() + token.slice(1);
  }
  if (tokenLower.includes("mouse") || tokenLower.includes("button")) {
    return "MouseButton";
  }
  if (token.length <= 3) return token.toUpperCase();
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/**
 * Append combo tokens already decoded by the KBF field parser. Raw combo
 * strings remain unhandled so ActivityTranslator can use its legacy decoder.
 *
 * @param {string} canonicalKey
 * @param {unknown} combo
 * @returns {{ handled: boolean, key: string, validation: ValidationArguments | null }}
 */
export function translateDecodedCombo(canonicalKey, combo) {
  if (!Array.isArray(combo) || combo.length === 0) {
    return { handled: false, key: canonicalKey, validation: null };
  }

  const decodedTokens = combo.filter(
    (token) =>
      typeof token === "string" &&
      token.length > 0 &&
      token === token.trim() &&
      !token.includes("+") &&
      !hasUnsafeCommandText(token),
  );
  if (decodedTokens.length !== combo.length || decodedTokens.length > 10) {
    return {
      handled: true,
      key: "",
      validation: [
        "combo",
        "must contain between one and ten safe decoded key tokens",
        combo,
        {
          expectedValue: "string[1..10]",
          suggestion: "Reject malformed or excessive combo chord tokens",
          fatal: true,
        },
      ],
    };
  }

  return {
    handled: true,
    key: `${canonicalKey}+${decodedTokens.join("+")}`,
    validation: null,
  };
}

/**
 * Describe a legacy raw-combo failure without publishing it.
 *
 * @param {unknown} error
 * @param {string} canonicalKey
 * @param {string} combo
 */
export function describeComboProcessingFailure(error, canonicalKey, combo) {
  const errorObject = error instanceof Error ? error : new Error(String(error));
  return {
    message: `Combo chord processing failed: ${errorObject.message}`,
    context: {
      category: "handler_error",
      severity: "warning",
      canonicalKey,
      combo,
      error: errorObject.name,
      recoverable: true,
      suggestion: "Combo chord processing failed, using base key without chord",
    },
  };
}
