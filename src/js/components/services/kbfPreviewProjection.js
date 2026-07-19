/** @typedef {import('./serviceTypes.js').KBFParseResult} KBFParseResult */

/**
 * Project one validated KBF parse result into the successful UI-preview
 * contract. Parsing, validation, diagnostics collection, and lifecycle effects
 * remain with the caller.
 *
 * @param {KBFParseResult} parseResult
 * @param {number} estimatedSize
 * @param {string[]} errors
 * @param {string[]} warnings
 * @returns {Extract<import('../../types/rpc/import-export.js').KBFParseForUiResult, { valid: true }>}
 */
export function projectKBFPreview(
  parseResult,
  estimatedSize,
  errors,
  warnings,
) {
  const bindsetNames = Object.keys(parseResult.bindsets);
  const masterBindsetName = bindsetNames.find(
    (name) => name.toLowerCase() === "master",
  );
  const hasMasterBindset = masterBindsetName !== undefined;
  const isSingleBindsetFile = bindsetNames.length === 1;
  const onlyBindsetIsMaster =
    isSingleBindsetFile && bindsetNames[0].toLowerCase() === "master";
  const requiresBindsetSelection = parseResult.stats.totalBindsets > 1;

  /** @type {Record<string, number>} */
  const bindsetKeyCounts = {};
  for (const name of bindsetNames) {
    const keys = parseResult.bindsets[name].keys;
    bindsetKeyCounts[name] =
      keys && typeof keys === "object" ? Object.keys(keys).length : 0;
  }

  const masterBindset = masterBindsetName
    ? parseResult.bindsets[masterBindsetName]
    : undefined;
  const masterDisplayName =
    typeof masterBindset?.metadata?.displayName === "string"
      ? masterBindset.metadata.displayName
      : "Primary Bindset";

  return {
    valid: true,
    bindsets: parseResult.bindsets,
    bindsetNames,
    bindsetKeyCounts,
    hasMasterBindset,
    masterDisplayName,
    metadata: {
      totalBindsets: parseResult.stats.totalBindsets,
      estimatedSize,
      hasAliases:
        parseResult.aliases && Object.keys(parseResult.aliases).length > 0,
    },
    validation: { valid: true, errors, warnings },
    singleBindsetFile: {
      isSingleBindset: isSingleBindsetFile,
      onlyBindsetIsMaster,
      requiresBindsetSelection,
    },
    requiresBindsetSelection,
  };
}
