import {
  assertSafeDataKey,
  cloneJsonData,
  getInvalidDataPath,
  hasOwnDataField,
  invalidProjectData,
  isDataRecord,
  setOwnDataField,
} from "./jsonDataBoundary.js";

const supportedParseFields = new Set(
  "bindsets aliases errors warnings stats".split(" "),
);
const supportedBindsetFields = new Set(["keys", "aliases", "metadata"]);
const supportedKeyFields = new Set(["commands", "metadata"]);
const supportedAliasFields = new Set(
  "commands description type name isGenerated isLoader category metadata steps currentIndex next".split(
    " ",
  ),
);
const supportedStatsFields = new Set(
  "totalBindsets totalKeys totalAliases processedLayers skippedActivities totalActivities".split(
    " ",
  ),
);
const supportedConfigurationFields = new Set(
  "selectedBindsets bindsetMappings bindsetRenames singleBindsetMode".split(
    " ",
  ),
);
const diagnosticIntegerFields =
  "layer recordIndex timestamp keysetRecordIndex fieldIndex activityFieldIndex activity contentSize maxFileSize decodedLength foundRecords originalCount".split(
    " ",
  );
const supportedKeyMetadataFields = new Set(["stabilizeExecutionOrder"]);
const supportedBindsetMetadataFields = new Set(["displayName"]);

/** @param {unknown} error @param {string} code @param {string} fallbackPath */
function boundaryFailure(error, code, fallbackPath) {
  const path = getInvalidDataPath(error);
  if (path === undefined) throw error;
  const params = { path: path || fallbackPath };
  return { success: false, error: code, params };
}

/** @param {Record<string, unknown>} value @param {Set<string>} fields @param {string} path */
function assertOnlySupportedFields(value, fields, path) {
  for (const key of Object.keys(value)) {
    assertSafeDataKey(key, `${path}.${key}`);
    if (!fields.has(key)) invalidProjectData(`${path}.${key}`);
  }
}

/** @param {Record<string, any>} value @param {string} key */
const ownValue = (value, key) =>
  hasOwnDataField(value, key) ? value[key] : undefined;

/** @param {unknown} value @param {string} path @param {{ min?: number, max?: number }} [range] */
function decodeSafeInteger(value, path, range = {}) {
  if (!Number.isSafeInteger(value)) invalidProjectData(path);
  const integer = /** @type {number} */ (value);
  if (range.min !== undefined && integer < range.min) invalidProjectData(path);
  if (range.max !== undefined && integer > range.max) invalidProjectData(path);
  return integer;
}

/** @param {unknown} value @param {string} path */
const decodeCount = (value, path) => decodeSafeInteger(value, path, { min: 0 });

/** @param {unknown} value @param {string} path */
function decodeNonemptySafeName(value, path) {
  if (typeof value !== "string" || value.trim().length === 0)
    invalidProjectData(path);
  assertSafeDataKey(value, path);
  return value;
}

/** @param {unknown} value @param {string} path */
function decodeMetadata(value, path) {
  const metadata = cloneJsonData(value, path);
  if (!isDataRecord(metadata)) invalidProjectData(path);
  return metadata;
}

/** @param {unknown} value @param {string} path */
function decodeKeyMetadata(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  assertOnlySupportedFields(value, supportedKeyMetadataFields, path);
  /** @type {import('../../types/kbf-boundary.js').KBFKeyMetadata} */
  const metadata = {};
  if (hasOwnDataField(value, "stabilizeExecutionOrder")) {
    if (typeof value.stabilizeExecutionOrder !== "boolean")
      invalidProjectData(`${path}.stabilizeExecutionOrder`);
    metadata.stabilizeExecutionOrder = value.stabilizeExecutionOrder;
  }
  return metadata;
}

/** @param {unknown} value @param {string} path */
function decodeBindsetMetadata(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  assertOnlySupportedFields(value, supportedBindsetMetadataFields, path);
  /** @type {import('../../types/kbf-boundary.js').KBFBindsetMetadata} */
  const metadata = {};
  if (hasOwnDataField(value, "displayName")) {
    if (typeof value.displayName !== "string")
      invalidProjectData(`${path}.displayName`);
    metadata.displayName = value.displayName;
  }
  return metadata;
}

/** @param {unknown} value @param {string} path */
function decodeCommands(value, path) {
  if (!Array.isArray(value)) invalidProjectData(path);
  return value.map((command, index) => {
    if (typeof command !== "string") invalidProjectData(`${path}[${index}]`);
    return command;
  });
}

/** @param {unknown} value @param {string} path */
function decodeKeyData(value, path) {
  if (Array.isArray(value)) {
    return { commands: decodeCommands(value, path), metadata: {} };
  }
  if (!isDataRecord(value)) invalidProjectData(path);
  assertOnlySupportedFields(value, supportedKeyFields, path);
  if (!hasOwnDataField(value, "commands")) {
    invalidProjectData(`${path}.commands`);
  }
  const metadata = hasOwnDataField(value, "metadata")
    ? decodeKeyMetadata(value.metadata, `${path}.metadata`)
    : {};
  return {
    commands: decodeCommands(value.commands, `${path}.commands`),
    metadata,
  };
}

/** @param {unknown} value @param {string} path @param {string} aliasName */
function decodeAlias(value, path, aliasName) {
  if (!isDataRecord(value)) invalidProjectData(path);
  assertOnlySupportedFields(value, supportedAliasFields, path);
  /** @type {Record<string, any>} */
  const alias = {};

  if (hasOwnDataField(value, "commands")) {
    alias.commands = decodeCommands(value.commands, `${path}.commands`);
  }
  for (const field of ["description", "type", "category"]) {
    if (hasOwnDataField(value, field)) {
      if (typeof value[field] !== "string")
        invalidProjectData(`${path}.${field}`);
      setOwnDataField(alias, field, value[field]);
    }
  }
  if (hasOwnDataField(value, "name")) {
    const name = decodeNonemptySafeName(value.name, `${path}.name`);
    if (name !== aliasName) invalidProjectData(`${path}.name`);
    alias.name = name;
  }
  for (const field of ["isGenerated", "isLoader"]) {
    if (hasOwnDataField(value, field)) {
      if (typeof value[field] !== "boolean")
        invalidProjectData(`${path}.${field}`);
      setOwnDataField(alias, field, value[field]);
    }
  }
  if (hasOwnDataField(value, "metadata")) {
    alias.metadata = decodeMetadata(value.metadata, `${path}.metadata`);
  }
  if (hasOwnDataField(value, "steps")) {
    if (!Array.isArray(value.steps)) invalidProjectData(`${path}.steps`);
    alias.steps = value.steps.map((step, index) =>
      decodeNonemptySafeName(step, `${path}.steps[${index}]`),
    );
  }
  if (hasOwnDataField(value, "currentIndex")) {
    alias.currentIndex = decodeSafeInteger(
      value.currentIndex,
      `${path}.currentIndex`,
      { min: 0 },
    );
    if (!alias.steps || alias.currentIndex >= alias.steps.length) {
      invalidProjectData(`${path}.currentIndex`);
    }
  }
  if (hasOwnDataField(value, "next")) {
    alias.next = decodeNonemptySafeName(value.next, `${path}.next`);
  }
  return alias;
}

/** @param {unknown} value @param {string} path */
function decodeAliasMap(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  /** @type {Record<string, import('../../types/kbf-boundary.js').KBFAliasDefinition>} */
  const aliases = {};
  for (const [name, alias] of Object.entries(value)) {
    decodeNonemptySafeName(name, `${path}.${name}`);
    setOwnDataField(aliases, name, decodeAlias(alias, `${path}.${name}`, name));
  }
  return aliases;
}

/** @param {unknown} value @param {string} path */
function decodeKeyMap(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  /** @type {Record<string, import('../../types/kbf-boundary.js').KBFKeyData>} */
  const keys = {};
  for (const [name, keyData] of Object.entries(value)) {
    decodeNonemptySafeName(name, `${path}.${name}`);
    setOwnDataField(keys, name, decodeKeyData(keyData, `${path}.${name}`));
  }
  return keys;
}

/** @param {unknown} value @param {string} path */
function decodeBindset(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  assertOnlySupportedFields(value, supportedBindsetFields, path);
  if (!hasOwnDataField(value, "keys")) invalidProjectData(`${path}.keys`);
  return {
    keys: decodeKeyMap(value.keys, `${path}.keys`),
    aliases: hasOwnDataField(value, "aliases")
      ? decodeAliasMap(value.aliases, `${path}.aliases`)
      : {},
    metadata: hasOwnDataField(value, "metadata")
      ? decodeBindsetMetadata(value.metadata, `${path}.metadata`)
      : {},
  };
}

/** @param {unknown} value @param {string} path */
function decodeBindsetMap(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  /** @type {Record<string, import('../../types/kbf-boundary.js').KBFBindset>} */
  const bindsets = {};
  for (const [name, bindset] of Object.entries(value)) {
    decodeNonemptySafeName(name, `${path}.${name}`);
    setOwnDataField(bindsets, name, decodeBindset(bindset, `${path}.${name}`));
  }
  return bindsets;
}

/** @param {unknown} value @param {string} path @returns {import('../../types/kbf-boundary.js').KBFDiagnostic} */
function decodeDiagnostic(value, path) {
  if (typeof value === "string") return value;
  if (!isDataRecord(value)) invalidProjectData(path);
  const diagnostic = cloneJsonData(value, path);
  if (!isDataRecord(diagnostic) || typeof diagnostic.message !== "string") {
    invalidProjectData(`${path}.message`);
  }
  if (hasOwnDataField(diagnostic, "fatal")) {
    if (typeof diagnostic.fatal !== "boolean" || diagnostic.fatal) {
      invalidProjectData(`${path}.fatal`);
    }
  }
  if (
    hasOwnDataField(diagnostic, "recoverable") &&
    typeof diagnostic.recoverable !== "boolean"
  )
    invalidProjectData(`${path}.recoverable`);
  for (const field of diagnosticIntegerFields) {
    if (hasOwnDataField(diagnostic, field)) {
      decodeSafeInteger(diagnostic[field], `${path}.${field}`);
    }
  }
  return /** @type {import('../../types/kbf-boundary.js').KBFDiagnostic} */ (
    diagnostic
  );
}

/** @param {unknown} value @param {string} path */
function decodeDiagnostics(value, path) {
  if (!Array.isArray(value)) invalidProjectData(path);
  return value.map((diagnostic, index) =>
    decodeDiagnostic(diagnostic, `${path}[${index}]`),
  );
}

/** @param {unknown} value @param {string} path */
function decodeStats(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  assertOnlySupportedFields(value, supportedStatsFields, path);
  for (const field of [
    "totalBindsets",
    "totalKeys",
    "totalAliases",
    "processedLayers",
    "skippedActivities",
  ]) {
    if (!hasOwnDataField(value, field)) invalidProjectData(`${path}.${field}`);
  }
  if (!Array.isArray(value.processedLayers)) {
    invalidProjectData(`${path}.processedLayers`);
  }
  let priorLayer = 0;
  const processedLayers = value.processedLayers.map((layer, index) => {
    const decoded = decodeSafeInteger(
      layer,
      `${path}.processedLayers[${index}]`,
      { min: 1, max: 6 },
    );
    if (decoded <= priorLayer)
      invalidProjectData(`${path}.processedLayers[${index}]`);
    priorLayer = decoded;
    return decoded;
  });
  const stats = {
    totalBindsets: decodeCount(value.totalBindsets, `${path}.totalBindsets`),
    totalKeys: decodeCount(value.totalKeys, `${path}.totalKeys`),
    totalAliases: decodeCount(value.totalAliases, `${path}.totalAliases`),
    processedLayers,
    skippedActivities: decodeCount(
      value.skippedActivities,
      `${path}.skippedActivities`,
    ),
  };
  if (hasOwnDataField(value, "totalActivities")) {
    const totalActivities = decodeCount(
      value.totalActivities,
      `${path}.totalActivities`,
    );
    if (totalActivities < stats.skippedActivities)
      invalidProjectData(`${path}.totalActivities`);
    setOwnDataField(stats, "totalActivities", totalActivities);
  }
  return stats;
}

/** @param {unknown} value @returns {import('../../types/kbf-boundary.js').KBFParseResultDecodeResult} */
export function decodeKBFParseResult(value) {
  try {
    if (!isDataRecord(value)) invalidProjectData("$");
    assertOnlySupportedFields(value, supportedParseFields, "$");
    for (const field of supportedParseFields) {
      if (!hasOwnDataField(value, field)) invalidProjectData(`$.${field}`);
    }
    const bindsets = decodeBindsetMap(value.bindsets, "$.bindsets");
    const aliases = decodeAliasMap(value.aliases, "$.aliases");
    const stats = decodeStats(value.stats, "$.stats");
    const actualBindsetCount = Object.keys(bindsets).length;
    const actualKeyCount = Object.values(bindsets).reduce(
      (count, bindset) => count + Object.keys(bindset.keys).length,
      0,
    );
    const actualAliasCount = Object.keys(aliases).length;
    if (stats.totalBindsets !== actualBindsetCount)
      invalidProjectData("$.stats.totalBindsets");
    if (stats.totalKeys !== actualKeyCount)
      invalidProjectData("$.stats.totalKeys");
    if (stats.totalAliases !== actualAliasCount)
      invalidProjectData("$.stats.totalAliases");
    return {
      success: true,
      value: {
        bindsets,
        aliases,
        errors: decodeDiagnostics(value.errors, "$.errors"),
        warnings: decodeDiagnostics(value.warnings, "$.warnings"),
        stats,
      },
    };
  } catch (error) {
    return /** @type {import('../../types/kbf-boundary.js').KBFParseResultDecodeResult} */ (
      boundaryFailure(error, "invalid_kbf_parse_result", "$")
    );
  }
}

/** @param {unknown} value @param {string} path @param {Set<string>} available */
function decodeConfigurationName(value, path, available) {
  const name = decodeNonemptySafeName(value, path);
  if (!available.has(name)) invalidProjectData(path);
  return name;
}

/** @param {unknown} value @param {unknown} availableBindsetNames @returns {import('../../types/kbf-boundary.js').KBFConfigurationDecodeResult} */
export function decodeKBFImportConfiguration(value, availableBindsetNames) {
  try {
    if (!Array.isArray(availableBindsetNames))
      invalidProjectData("availableBindsetNames");
    const available = new Set();
    availableBindsetNames.forEach((name, index) => {
      const decoded = decodeNonemptySafeName(
        name,
        `availableBindsetNames[${index}]`,
      );
      if (available.has(decoded))
        invalidProjectData(`availableBindsetNames[${index}]`);
      available.add(decoded);
    });
    if (value === null || value === undefined)
      return { success: true, value: null };
    if (!isDataRecord(value)) invalidProjectData("$");
    assertOnlySupportedFields(value, supportedConfigurationFields, "$");

    const selectedSource = hasOwnDataField(value, "selectedBindsets")
      ? value.selectedBindsets
      : availableBindsetNames;
    if (!Array.isArray(selectedSource))
      invalidProjectData("$.selectedBindsets");
    const selectedNames = new Set();
    const selectedBindsets = selectedSource.map((name, index) => {
      const path = `$.selectedBindsets[${index}]`;
      const decoded = decodeConfigurationName(name, path, available);
      if (selectedNames.has(decoded)) invalidProjectData(path);
      selectedNames.add(decoded);
      return decoded;
    });

    /** @type {Record<string, 'primary' | 'custom'>} */
    const bindsetMappings = {};
    const mappings = hasOwnDataField(value, "bindsetMappings")
      ? value.bindsetMappings
      : {};
    if (!isDataRecord(mappings)) invalidProjectData("$.bindsetMappings");
    for (const [name, mapping] of Object.entries(mappings)) {
      const path = `$.bindsetMappings.${name}`;
      decodeConfigurationName(name, path, available);
      if (mapping !== "primary" && mapping !== "custom")
        invalidProjectData(path);
      setOwnDataField(bindsetMappings, name, mapping);
    }

    /** @type {Record<string, string>} */
    const bindsetRenames = {};
    const renames = hasOwnDataField(value, "bindsetRenames")
      ? value.bindsetRenames
      : {};
    if (!isDataRecord(renames)) invalidProjectData("$.bindsetRenames");
    for (const [name, destination] of Object.entries(renames)) {
      const path = `$.bindsetRenames.${name}`;
      decodeConfigurationName(name, path, available);
      const decoded = decodeNonemptySafeName(destination, path);
      setOwnDataField(bindsetRenames, name, decoded);
    }

    const customDestinations = new Set();
    for (const name of selectedBindsets) {
      const mapping = ownValue(bindsetMappings, name) || "custom";
      if (mapping !== "custom") continue;
      const destination = ownValue(bindsetRenames, name) || name;
      if (customDestinations.has(destination)) {
        const field = hasOwnDataField(bindsetRenames, name)
          ? "bindsetRenames"
          : "bindsetMappings";
        invalidProjectData(`$.${field}.${name}`);
      }
      customDestinations.add(destination);
    }

    /** @type {import('../../types/kbf-boundary.js').KBFImportConfiguration} */
    const configuration = { selectedBindsets, bindsetMappings, bindsetRenames };
    if (hasOwnDataField(value, "singleBindsetMode")) {
      if (typeof value.singleBindsetMode !== "boolean")
        invalidProjectData("$.singleBindsetMode");
      if (value.singleBindsetMode) {
        if (selectedBindsets.length !== 1)
          invalidProjectData("$.selectedBindsets");
        const selectedBindset = selectedBindsets[0];
        const mapping = ownValue(bindsetMappings, selectedBindset) || "primary";
        if (mapping !== "primary")
          invalidProjectData(`$.bindsetMappings.${selectedBindset}`);
        if (!hasOwnDataField(bindsetMappings, selectedBindset)) {
          setOwnDataField(bindsetMappings, selectedBindset, "primary");
        }
      }
      configuration.singleBindsetMode = value.singleBindsetMode;
    }
    return { success: true, value: configuration };
  } catch (error) {
    return /** @type {import('../../types/kbf-boundary.js').KBFConfigurationDecodeResult} */ (
      boundaryFailure(error, "invalid_kbf_configuration", "$")
    );
  }
}

export {
  decodeKBFActivity95Range,
  decodeKBFActivityInteger,
  decodeKBFActivityOrder,
  validateKBFActivitySemantics,
} from "../../lib/kbf/activityDataBoundary.js";
