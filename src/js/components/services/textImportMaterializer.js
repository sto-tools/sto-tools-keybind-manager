import { decodeKeyFromImport } from "../../lib/keyEncoding.js";
import { setOwnDataField } from "./jsonDataBoundary.js";
import { decodeAliasText, decodeKeybindText } from "./textImportBoundary.js";

const diagnosticTranslationKeys = {
  unrecognized_keybind_line: "import_keybind_line_unrecognized",
  unsafe_keybind_name: "import_keybind_name_unsafe",
  unrecognized_alias_line: "import_alias_line_unrecognized",
  unsafe_alias_name: "import_alias_name_unsafe",
};

/** @param {unknown} error */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {import('../../types/text-import-boundary.js').TextImportDiagnostic[]} diagnostics
 * @param {(key: string, options: Record<string, unknown>) => string} translate
 */
function materializeDiagnostics(diagnostics, translate) {
  return diagnostics.map((diagnostic) =>
    translate(diagnosticTranslationKeys[diagnostic.code], {
      line: diagnostic.line,
      source: diagnostic.source,
    }),
  );
}

/**
 * @param {unknown} content
 * @param {{
 *   parseCommand: (commandString: string) => PromiseLike<{ commands: import('./serviceTypes.js').StoredCommand[] }>,
 *   translate: (key: string, options: Record<string, unknown>) => string
 * }} capabilities
 * @returns {Promise<import('./serviceTypes.js').ParsedKeybindFile>}
 */
export async function materializeKeybindText(content, capabilities) {
  /** @type {Record<string, import('./serviceTypes.js').ParsedKeybind>} */
  const keybinds = {};
  /** @type {Record<string, import('./serviceTypes.js').AliasDefinition>} */
  const aliases = {};
  const decoded = decodeKeybindText(content);
  if (!decoded.success) {
    return { keybinds, aliases, errors: [], failure: decoded };
  }
  const errors = materializeDiagnostics(
    decoded.value.diagnostics,
    capabilities.translate,
  );

  const sourceOrderedEntries = Object.values(decoded.value.entries).sort(
    (left, right) => left.line - right.line,
  );
  for (const entry of sourceOrderedEntries) {
    try {
      const key = decodeKeyFromImport(entry.key);
      const parsed = await capabilities.parseCommand(entry.raw);
      setOwnDataField(keybinds, key, {
        raw: entry.raw,
        commands: parsed.commands,
      });
    } catch (error) {
      errors.push(
        capabilities.translate("import_keybind_line_parse_error", {
          line: entry.line,
          reason: getErrorMessage(error),
        }),
      );
    }
  }
  return { keybinds, aliases, errors };
}

/**
 * @param {unknown} content
 * @param {(key: string, options: Record<string, unknown>) => string} translate
 * @returns {import('./serviceTypes.js').ParsedAliasFile}
 */
export function materializeAliasText(content, translate) {
  /** @type {Record<string, { commands: string, description?: string }>} */
  const aliases = {};
  const decoded = decodeAliasText(content);
  if (!decoded.success) return { aliases, errors: [], failure: decoded };
  const errors = materializeDiagnostics(decoded.value.diagnostics, translate);

  for (const entry of Object.values(decoded.value.entries)) {
    setOwnDataField(aliases, entry.name, {
      commands: entry.commands,
      ...(entry.description === undefined
        ? {}
        : { description: entry.description }),
    });
  }
  return { aliases, errors };
}

/**
 * @param {import('../../types/text-import-boundary.js').KeybindTextFailure} failure
 * @returns {Extract<import('../../types/rpc/import-export.js').KeybindImportResult, { success: false }>}
 */
export function keybindTextFailureResult(failure) {
  if (failure.error === "keybind_file_too_large") {
    return {
      success: false,
      error: failure.error,
      params: { size: failure.size, limit: failure.limit },
    };
  }
  return { success: false, error: failure.error };
}

/**
 * @param {import('../../types/text-import-boundary.js').AliasTextFailure} failure
 * @returns {Extract<import('../../types/rpc/aliases.js').AliasImportResult, { success: false }>}
 */
export function aliasTextFailureResult(failure) {
  if (failure.error === "alias_file_too_large") {
    return {
      success: false,
      error: failure.error,
      params: { size: failure.size, limit: failure.limit },
    };
  }
  return { success: false, error: failure.error };
}
