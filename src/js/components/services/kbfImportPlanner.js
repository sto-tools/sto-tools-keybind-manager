import { hasOwnDataField, setOwnDataField } from "./jsonDataBoundary.js";

/** @typedef {import('./serviceTypes.js').ProfileData} ProfileData */
/** @typedef {import('../../types/kbf-boundary.js').KBFParseResult} KBFParseResult */
/** @typedef {import('../../types/kbf-boundary.js').KBFImportConfiguration} KBFImportConfiguration */
/** @typedef {'merge_keep' | 'merge_overwrite' | 'overwrite_all'} ImportStrategy */

/**
 * @typedef {Object} KBFImportPlanOptions
 * @property {ProfileData} profile
 * @property {KBFParseResult} parseResult
 * @property {'space' | 'ground'} environment
 * @property {ImportStrategy} strategy
 * @property {KBFImportConfiguration | null} configuration
 * @property {boolean} bindsetsEnabled
 */

/**
 * @typedef {Object} KBFImportPlanSuccess
 * @property {true} success
 * @property {ProfileData} nextProfile
 * @property {{ bindsets: number, keys: number, aliases: number }} imported
 * @property {number} skipped
 * @property {number} overwritten
 * @property {number} cleared
 * @property {{ processedLayers: number[], skippedActivities: number, totalActivities: number, totalErrors: number, totalWarnings: number }} stats
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {string[]} bindsetNames
 * @property {{ hasMasterBindset: boolean, masterBindsetName: string | undefined, mappedToPrimary: boolean, displayName: string | null }} masterBindset
 * @property {{ isSingleBindset: boolean, onlyBindsetIsMaster: boolean, requiresBindsetSelection: boolean, totalBindsetsAvailable: number, selectedBindsetsCount: number }} singleBindsetFile
 */

/**
 * @typedef {Object} KBFImportPlanFailure
 * @property {false} success
 * @property {'multiple_bindsets_not_allowed' | 'non_primary_mapping_not_allowed'} error
 * @property {string} message
 * @property {string[]} errors
 * @property {string[]} warnings
 */

/** @typedef {KBFImportPlanSuccess | KBFImportPlanFailure} KBFImportPlanResult */

/** @param {unknown} diagnostic */
function diagnosticMessage(diagnostic) {
  if (typeof diagnostic === "string") return diagnostic;
  if (
    diagnostic &&
    typeof diagnostic === "object" &&
    "message" in diagnostic &&
    typeof diagnostic.message === "string"
  ) {
    return diagnostic.message;
  }
  return String(diagnostic);
}

/** @param {Record<string, any>} record @param {string} key */
function ownValue(record, key) {
  return hasOwnDataField(record, key) ? record[key] : undefined;
}

/**
 * @param {Record<string, any>} record
 * @param {string} key
 * @param {() => Record<string, any>} create
 */
function ensureOwnRecord(record, key, create) {
  const existing = ownValue(record, key);
  if (existing) return existing;
  const created = create();
  setOwnDataField(record, key, created);
  return created;
}

function emptyBuild() {
  return { keys: {}, aliases: {} };
}

function emptyBindset() {
  return {
    space: { keys: {} },
    ground: { keys: {} },
  };
}

/** @param {string[]} commands */
function normalizeCommands(commands) {
  return commands.map((command) => command.trim()).filter(Boolean);
}

/** @param {import('../../types/kbf-boundary.js').KBFAliasDefinition} alias */
function materializeAlias(alias) {
  const aliasRecord = /** @type {Record<string, unknown>} */ (alias);
  const selectedStep =
    alias.steps && alias.steps.length > 0
      ? alias.steps[alias.currentIndex ?? 0]
      : undefined;
  const commands = alias.commands || (selectedStep ? [selectedStep] : []);
  /** @type {Record<string, any>} */
  const materialized = {
    commands: normalizeCommands(commands),
    description: alias.description || "",
    metadata: structuredClone(alias.metadata || {}),
  };

  for (const field of [
    "type",
    "name",
    "isGenerated",
    "isLoader",
    "category",
    "currentIndex",
    "next",
  ]) {
    if (hasOwnDataField(alias, field)) {
      setOwnDataField(materialized, field, aliasRecord[field]);
    }
  }
  if (alias.steps) materialized.steps = [...alias.steps];
  return materialized;
}

/**
 * Resolve one source bindset's destination using the same defaults as the
 * established importer: configured mappings default to a custom bindset, and
 * a lone unconfigured Master bindset maps to the primary build.
 *
 * @param {string} bindsetName
 * @param {Record<string, 'primary' | 'custom'>} mappings
 * @param {Record<string, string>} renames
 */
function resolveDestination(bindsetName, mappings, renames) {
  return {
    mapping: ownValue(mappings, bindsetName) || "custom",
    name: ownValue(renames, bindsetName) || bindsetName,
  };
}

/**
 * Produce a detached profile replacement and KBF import accounting without
 * touching storage, services, browser state, or the canonical parser result.
 * All inputs are expected to have passed their respective data boundaries.
 *
 * @param {KBFImportPlanOptions} options
 * @returns {KBFImportPlanResult}
 */
export function planKBFImport({
  profile,
  parseResult,
  environment,
  strategy,
  configuration,
  bindsetsEnabled,
}) {
  const errors = parseResult.errors.map(diagnosticMessage);
  const warnings = parseResult.warnings.map(diagnosticMessage);
  const bindsetNames = Object.keys(parseResult.bindsets);
  const isSingleBindsetFile = bindsetNames.length === 1;
  const onlyBindsetIsMaster =
    isSingleBindsetFile && bindsetNames[0].toLowerCase() === "master";

  let bindsetsToProcess = bindsetNames;
  /** @type {Record<string, string>} */
  const bindsetRenames = {};
  /** @type {Record<string, 'primary' | 'custom'>} */
  const bindsetMappings = {};

  if (configuration) {
    bindsetsToProcess = configuration.selectedBindsets;
    for (const [name, rename] of Object.entries(configuration.bindsetRenames)) {
      setOwnDataField(bindsetRenames, name, rename);
    }
    for (const [name, mapping] of Object.entries(
      configuration.bindsetMappings,
    )) {
      setOwnDataField(bindsetMappings, name, mapping);
    }
  } else if (onlyBindsetIsMaster) {
    setOwnDataField(bindsetMappings, bindsetNames[0], "primary");
  }

  if (!bindsetsEnabled && bindsetsToProcess.length > 1) {
    return {
      success: false,
      error: "multiple_bindsets_not_allowed",
      message:
        "Multiple bindset import is not allowed when bindsets are disabled",
      errors: [
        `Configuration specifies ${bindsetsToProcess.length} bindsets but bindsetsEnabled = false`,
      ],
      warnings,
    };
  }

  // Resolve every omitted mapping once so validation, collision checks, and
  // materialization all consume the same destination. Disabled bindsets can
  // only target the primary build; enabled bindsets retain the established
  // custom-bindset default.
  for (const bindsetName of bindsetsToProcess) {
    if (!hasOwnDataField(bindsetMappings, bindsetName)) {
      setOwnDataField(
        bindsetMappings,
        bindsetName,
        bindsetsEnabled ? "custom" : "primary",
      );
    }
  }

  const customDestinations = new Set();
  for (const bindsetName of bindsetsToProcess) {
    const destination = resolveDestination(
      bindsetName,
      bindsetMappings,
      bindsetRenames,
    );
    if (destination.mapping !== "custom") continue;
    if (customDestinations.has(destination.name)) {
      throw new TypeError(
        `Canonical KBF configuration contains colliding custom destination "${destination.name}"`,
      );
    }
    customDestinations.add(destination.name);
  }

  if (!bindsetsEnabled && bindsetsToProcess.length > 0) {
    for (const bindsetName of bindsetsToProcess) {
      const mapping = ownValue(bindsetMappings, bindsetName);
      if (mapping !== "primary") {
        return {
          success: false,
          error: "non_primary_mapping_not_allowed",
          message:
            "Bindsets can only be mapped to primary bindset when bindsets are disabled",
          errors: [
            `Bindset "${bindsetName}" is mapped to "${mapping}" but only "primary" is allowed when bindsetsEnabled = false`,
          ],
          warnings,
        };
      }
    }
  }

  const nextProfile = structuredClone(profile);
  const profileRecord = /** @type {Record<string, any>} */ (nextProfile);
  const builds = ensureOwnRecord(profileRecord, "builds", () => ({}));
  const build = ensureOwnRecord(builds, environment, emptyBuild);
  const primaryKeys = ensureOwnRecord(build, "keys", () => ({}));
  ensureOwnRecord(build, "aliases", () => ({}));
  const bindsets = ensureOwnRecord(profileRecord, "bindsets", () => ({}));
  const aliases = ensureOwnRecord(profileRecord, "aliases", () => ({}));
  const keybindMetadata = ensureOwnRecord(
    profileRecord,
    "keybindMetadata",
    () => ({}),
  );
  ensureOwnRecord(profileRecord, "aliasMetadata", () => ({}));
  const bindsetMetadata = ensureOwnRecord(
    profileRecord,
    "bindsetMetadata",
    () => ({}),
  );

  let keysImported = 0;
  let aliasesImported = 0;
  let keysSkipped = 0;
  let keysOverwritten = 0;
  let keysCleared = 0;
  let hasPrimaryBindset = false;

  /** @param {string} bindsetName */
  function getTarget(bindsetName) {
    const destination = resolveDestination(
      bindsetName,
      bindsetMappings,
      bindsetRenames,
    );
    if (destination.mapping === "primary") {
      return {
        mapping: destination.mapping,
        keys: primaryKeys,
        metadataBindsetName: null,
      };
    }

    const bindset = ensureOwnRecord(bindsets, destination.name, emptyBindset);
    const environmentData = ensureOwnRecord(bindset, environment, () => ({
      keys: {},
    }));
    const keys = ensureOwnRecord(environmentData, "keys", () => ({}));
    return {
      mapping: destination.mapping,
      keys,
      metadataBindsetName: destination.name,
    };
  }

  /** @param {{ metadataBindsetName: string | null }} target */
  function getTargetMetadata(target) {
    if (target.metadataBindsetName === null) {
      return ownValue(keybindMetadata, environment);
    }
    const metadataByEnvironment = ownValue(
      bindsetMetadata,
      target.metadataBindsetName,
    );
    return metadataByEnvironment
      ? ownValue(metadataByEnvironment, environment)
      : undefined;
  }

  /** @param {{ metadataBindsetName: string | null }} target */
  function ensureTargetMetadata(target) {
    if (target.metadataBindsetName === null) {
      return ensureOwnRecord(keybindMetadata, environment, () => ({}));
    }
    const metadataByEnvironment = ensureOwnRecord(
      bindsetMetadata,
      target.metadataBindsetName,
      () => ({}),
    );
    return ensureOwnRecord(metadataByEnvironment, environment, () => ({}));
  }

  if (strategy === "overwrite_all") {
    for (const bindsetName of bindsetNames) {
      if (!bindsetsToProcess.includes(bindsetName)) continue;
      const target = getTarget(bindsetName);
      const existingKeys = Object.keys(target.keys);
      keysCleared += existingKeys.length;
      const metadata = getTargetMetadata(target);
      for (const key of existingKeys) {
        delete target.keys[key];
        if (metadata) delete metadata[key];
      }
    }
  }

  for (const [bindsetName, bindsetData] of Object.entries(
    parseResult.bindsets,
  )) {
    if (!bindsetsToProcess.includes(bindsetName)) continue;
    const target = getTarget(bindsetName);
    if (target.mapping === "primary") hasPrimaryBindset = true;

    for (const [key, keyData] of Object.entries(bindsetData.keys)) {
      if (strategy === "merge_keep" && hasOwnDataField(target.keys, key)) {
        keysSkipped++;
        continue;
      }
      if (strategy === "merge_overwrite" && hasOwnDataField(target.keys, key)) {
        keysOverwritten++;
      }

      setOwnDataField(target.keys, key, normalizeCommands(keyData.commands));
      keysImported++;

      if (keyData.metadata.stabilizeExecutionOrder) {
        const environmentMetadata = ensureTargetMetadata(target);
        const metadata = ensureOwnRecord(environmentMetadata, key, () => ({}));
        metadata.stabilizeExecutionOrder = true;
      }
    }
  }

  for (const [aliasName, aliasData] of Object.entries(parseResult.aliases)) {
    setOwnDataField(aliases, aliasName, materializeAlias(aliasData));
    aliasesImported++;
  }

  const masterBindsetName = bindsetNames.find(
    (name) => name.toLowerCase() === "master",
  );
  return {
    success: true,
    nextProfile,
    imported: {
      bindsets: bindsetsToProcess.length,
      keys: keysImported,
      aliases: aliasesImported,
    },
    skipped: keysSkipped,
    overwritten: keysOverwritten,
    cleared: keysCleared,
    stats: {
      processedLayers: parseResult.stats.processedLayers,
      skippedActivities: parseResult.stats.skippedActivities,
      totalActivities: parseResult.stats.totalActivities || 0,
      totalErrors: errors.length,
      totalWarnings: warnings.length,
    },
    errors,
    warnings,
    bindsetNames,
    masterBindset: {
      hasMasterBindset: masterBindsetName !== undefined,
      masterBindsetName,
      mappedToPrimary: hasPrimaryBindset,
      displayName: hasPrimaryBindset ? "Primary Bindset" : null,
    },
    singleBindsetFile: {
      isSingleBindset: isSingleBindsetFile,
      onlyBindsetIsMaster,
      requiresBindsetSelection: isSingleBindsetFile
        ? false
        : parseResult.stats.totalBindsets > 1,
      totalBindsetsAvailable: parseResult.stats.totalBindsets,
      selectedBindsetsCount: bindsetsToProcess.length,
    },
  };
}
