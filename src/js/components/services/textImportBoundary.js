export const MAX_STO_TEXT_IMPORT_BYTES = 1024 * 1024;

const unsafeNames = new Set(["__proto__", "prototype", "constructor"]);

/** @param {string} value */
function utf8ByteLength(value) {
  let size = 0;
  for (const character of value) {
    const codePoint = /** @type {number} */ (character.codePointAt(0));
    if (codePoint <= 0x7f) size += 1;
    else if (codePoint <= 0x7ff) size += 2;
    else if (codePoint <= 0xffff) size += 3;
    else size += 4;
  }
  return size;
}

/**
 * @template Value
 * @param {Record<string, Value>} target
 * @param {string} key
 * @param {Value} value
 */
function setOwn(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

/**
 * @template {'invalid_keybind_file_content' | 'invalid_alias_file_content'} InvalidError
 * @template {'keybind_file_too_large' | 'alias_file_too_large'} TooLargeError
 * @param {unknown} raw
 * @param {InvalidError} invalidError
 * @param {TooLargeError} tooLargeError
 * @returns {
 *   | { success: false, error: InvalidError }
 *   | { success: false, error: TooLargeError, size: number, limit: number }
 *   | { success: true, lines: string[] }
 * }
 */
function decodeTextDocument(raw, invalidError, tooLargeError) {
  if (typeof raw !== "string" || raw.length === 0) {
    return { success: false, error: invalidError };
  }

  const size = utf8ByteLength(raw);
  if (size > MAX_STO_TEXT_IMPORT_BYTES) {
    return {
      success: false,
      error: tooLargeError,
      size,
      limit: MAX_STO_TEXT_IMPORT_BYTES,
    };
  }

  const content = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  if (content.length === 0) return { success: false, error: invalidError };
  return { success: true, lines: content.split(/\r?\n/) };
}

/** @param {string} line */
function matchKeybindLine(line) {
  const match = line.match(/^(\S+)\s+"(.*)"\s*$/);
  return match ? { key: match[1], raw: match[2] } : null;
}

/** @param {string} line */
function matchAliasLine(line) {
  const bracketPrefix = line.match(/^alias\s+(\S+)\s+<&/);
  if (bracketPrefix && line.endsWith("&>")) {
    return {
      name: bracketPrefix[1],
      commands: line.slice(bracketPrefix[0].length, -2).trim(),
    };
  }
  const quoted = line.match(/^alias\s+(\S+)\s+"(.*)"\s*$/);
  return quoted ? { name: quoted[1], commands: quoted[2] } : null;
}

/**
 * Decode the bounded lexical keybind format. STOCommandParser remains the
 * authority for interpreting each captured command string.
 *
 * @param {unknown} raw
 * @returns {import('../../types/text-import-boundary.js').KeybindTextDecodeResult}
 */
export function decodeKeybindText(raw) {
  const document = decodeTextDocument(
    raw,
    "invalid_keybind_file_content",
    "keybind_file_too_large",
  );
  if (!document.success) return document;

  /** @type {Record<string, import('../../types/text-import-boundary.js').KeybindTextEntry>} */
  const entries = {};
  /** @type {import('../../types/text-import-boundary.js').TextImportDiagnostic[]} */
  const diagnostics = [];

  document.lines.forEach(
    /** @param {string} sourceLine @param {number} index */ (
      sourceLine,
      index,
    ) => {
      const source = sourceLine.trim();
      if (!source || source.startsWith(";") || source.startsWith("#")) return;
      if (matchAliasLine(source)) return;

      const entry = matchKeybindLine(source);
      if (!entry) {
        diagnostics.push({
          code: "unrecognized_keybind_line",
          line: index + 1,
          source,
        });
        return;
      }
      if (unsafeNames.has(entry.key)) {
        diagnostics.push({
          code: "unsafe_keybind_name",
          line: index + 1,
          source,
        });
        return;
      }
      setOwn(entries, entry.key, { ...entry, line: index + 1 });
    },
  );

  return { success: true, value: { entries, diagnostics } };
}

/**
 * Decode the bounded lexical alias format and preserve exporter descriptions.
 *
 * @param {unknown} raw
 * @returns {import('../../types/text-import-boundary.js').AliasTextDecodeResult}
 */
export function decodeAliasText(raw) {
  const document = decodeTextDocument(
    raw,
    "invalid_alias_file_content",
    "alias_file_too_large",
  );
  if (!document.success) return document;

  /** @type {Record<string, import('../../types/text-import-boundary.js').AliasTextEntry>} */
  const entries = {};
  /** @type {import('../../types/text-import-boundary.js').TextImportDiagnostic[]} */
  const diagnostics = [];
  /** @type {{ value: string, line: number } | null} */
  let pendingDescription = null;

  document.lines.forEach(
    /** @param {string} sourceLine @param {number} index */ (
      sourceLine,
      index,
    ) => {
      const line = index + 1;
      const source = sourceLine.trim();
      if (!source) {
        pendingDescription = null;
        return;
      }
      if (source.startsWith(";")) {
        pendingDescription = { value: source.slice(1).trim(), line };
        return;
      }
      if (source.startsWith("#")) {
        pendingDescription = null;
        return;
      }
      if (matchKeybindLine(source)) {
        pendingDescription = null;
        return;
      }

      const entry = matchAliasLine(source);
      if (!entry) {
        diagnostics.push({
          code: "unrecognized_alias_line",
          line,
          source,
        });
        pendingDescription = null;
        return;
      }
      if (unsafeNames.has(entry.name)) {
        diagnostics.push({ code: "unsafe_alias_name", line, source });
        pendingDescription = null;
        return;
      }
      const description =
        pendingDescription?.line === line - 1
          ? pendingDescription.value
          : undefined;
      setOwn(entries, entry.name, {
        ...entry,
        ...(description === undefined ? {} : { description }),
        line,
      });
      pendingDescription = null;
    },
  );

  return { success: true, value: { entries, diagnostics } };
}
