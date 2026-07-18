/**
 * @typedef {{
 *   bindsetName: string | null | undefined,
 *   mappingType: string,
 *   customName?: string | null
 * }} KBFBindsetMappingInput
 */
/** @typedef {import('../../types/kbf-boundary.js').KBFImportConfiguration} KBFImportConfiguration */

/** @template Value @returns {Record<string, Value>} */
function createDataRecord() {
  return Object.create(null);
}

/**
 * @template Value
 * @param {Record<string, Value>} record
 * @param {string} key
 * @param {Value} value
 */
function setDataField(record, key, value) {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

/**
 * Materialize the enhanced KBF mapping controls into detached configuration
 * data. Imported names remain opaque record keys; this function deliberately
 * has no DOM or selector dependency.
 *
 * Mapping behavior matches the existing UI: `none` omits a bindset, `mapped`
 * creates a custom destination (trimmed, with the source name as its fallback),
 * and every other selected mapping targets the primary bindset.
 *
 * @param {readonly KBFBindsetMappingInput[]} mappings
 * @returns {KBFImportConfiguration | null}
 */
export function materializeKBFImportConfiguration(mappings) {
  const selectedBindsets = [];
  /** @type {Record<string, 'primary' | 'custom'>} */
  const bindsetMappings = createDataRecord();
  /** @type {Record<string, string>} */
  const bindsetRenames = createDataRecord();

  for (const mapping of mappings) {
    const { bindsetName, mappingType } = mapping;
    if (!bindsetName || mappingType === "none") continue;

    selectedBindsets.push(bindsetName);
    if (mappingType === "mapped") {
      const customName = mapping.customName?.trim();
      setDataField(bindsetMappings, bindsetName, "custom");
      setDataField(bindsetRenames, bindsetName, customName || bindsetName);
    } else {
      setDataField(bindsetMappings, bindsetName, "primary");
    }
  }

  if (selectedBindsets.length === 0) return null;
  return { selectedBindsets, bindsetMappings, bindsetRenames };
}

/**
 * Materialize the reduced-functionality KBF selection. An empty string remains
 * a selected value when supplied, matching an existing checked radio control;
 * only an absent selection returns null.
 *
 * @param {string | null | undefined} selectedBindsetName
 * @returns {KBFImportConfiguration | null}
 */
export function materializeSingleKBFImportConfiguration(selectedBindsetName) {
  if (selectedBindsetName === null || selectedBindsetName === undefined) {
    return null;
  }

  /** @type {Record<string, 'primary' | 'custom'>} */
  const bindsetMappings = createDataRecord();
  setDataField(bindsetMappings, selectedBindsetName, "primary");

  return {
    selectedBindsets: [selectedBindsetName],
    bindsetMappings,
    bindsetRenames: createDataRecord(),
    singleBindsetMode: true,
  };
}
