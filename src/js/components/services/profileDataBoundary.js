import {
  assertSafeDataKey,
  cloneJsonData,
  hasOwnDataField,
  invalidProjectData,
  isDataRecord,
  setOwnDataField,
} from "./jsonDataBoundary.js";
import {
  repairNullableAliasCommands,
  repairStoredProfileCommandNulls,
} from "./storedProfileCompatibility.js";

/** @param {unknown} mode @param {string} path @returns {'space' | 'ground'} */
function decodeLegacyEnvironment(mode, path) {
  if (mode === null || mode === undefined || mode === "") return "space";
  if (!["string", "number", "boolean"].includes(typeof mode)) {
    invalidProjectData(path);
  }
  const normalized = String(mode).toLowerCase();
  return normalized === "ground" || normalized === "ground mode"
    ? "ground"
    : "space";
}

/** @param {unknown} value @param {string} path */
function decodeOptionalString(value, path) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") invalidProjectData(path);
  return value;
}

/** @param {unknown} value @param {string} path */
function decodeSafeIdentifier(value, path) {
  if (typeof value !== "string") invalidProjectData(path);
  assertSafeDataKey(value, path);
  return value;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {import('../../types/data-contracts.js').StoredCommand}
 */
function decodeStoredCommand(value, path) {
  if (typeof value === "string") return value;
  if (!isDataRecord(value)) invalidProjectData(path);
  const cloned = cloneJsonData(value, path);
  if (!isDataRecord(cloned)) invalidProjectData(path);

  for (const field of [
    "command",
    "text",
    "id",
    "type",
    "category",
    "categoryId",
    "commandId",
    "name",
    "description",
    "icon",
    "environment",
    "warning",
    "placement",
  ]) {
    if (hasOwnDataField(cloned, field) && typeof cloned[field] !== "string") {
      invalidProjectData(`${path}.${field}`);
    }
  }
  for (const field of ["custom", "customizable", "palindromicGeneration"]) {
    if (hasOwnDataField(cloned, field) && typeof cloned[field] !== "boolean") {
      invalidProjectData(`${path}.${field}`);
    }
  }
  if (
    hasOwnDataField(cloned, "parameters") &&
    !isDataRecord(cloned.parameters)
  ) {
    invalidProjectData(`${path}.parameters`);
  }
  return /** @type {import('../../types/data-contracts.js').RichCommand} */ (
    cloned
  );
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {import('../../types/data-contracts.js').StoredCommand[]}
 */
function decodeCommandList(value, path) {
  if (value === null || value === undefined || value === "") return [];
  if (typeof value === "string") {
    return value
      .split(/\s*\$\$\s*/)
      .map((command) => command.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.map((command, index) =>
      decodeStoredCommand(command, `${path}[${index}]`),
    );
  }
  if (isDataRecord(value)) return [decodeStoredCommand(value, path)];
  return invalidProjectData(path);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {Record<string, import('../../types/data-contracts.js').StoredCommand[]>}
 */
function decodeKeyMap(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  /** @type {Record<string, import('../../types/data-contracts.js').StoredCommand[]>} */
  const result = {};
  for (const [key, commands] of Object.entries(value)) {
    assertSafeDataKey(key, `${path}.${key}`);
    setOwnDataField(result, key, decodeCommandList(commands, `${path}.${key}`));
  }
  return result;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {import('../../types/data-contracts.js').CanonicalAliasDefinition}
 */
function decodeAlias(value, path) {
  if (typeof value === "string" || Array.isArray(value)) {
    return { commands: decodeCommandList(value, `${path}.commands`) };
  }
  if (!isDataRecord(value)) invalidProjectData(path);
  const cloned = cloneJsonData(value, path);
  if (!isDataRecord(cloned)) invalidProjectData(path);

  for (const field of ["description", "type", "name", "category"]) {
    if (hasOwnDataField(cloned, field) && typeof cloned[field] !== "string") {
      invalidProjectData(`${path}.${field}`);
    }
  }
  for (const field of ["isGenerated", "isLoader"]) {
    if (hasOwnDataField(cloned, field) && typeof cloned[field] !== "boolean") {
      invalidProjectData(`${path}.${field}`);
    }
  }
  if (hasOwnDataField(cloned, "metadata") && !isDataRecord(cloned.metadata)) {
    invalidProjectData(`${path}.metadata`);
  }
  const result = /** @type {Record<string, any>} */ (cloned);
  if (hasOwnDataField(value, "commands")) {
    result.commands = decodeCommandList(value.commands, `${path}.commands`);
  }
  return /** @type {import('../../types/data-contracts.js').CanonicalAliasDefinition} */ (
    result
  );
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {Record<string, import('../../types/data-contracts.js').CanonicalAliasDefinition>}
 */
export function decodeAliasMap(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  /** @type {Record<string, import('../../types/data-contracts.js').CanonicalAliasDefinition>} */
  const result = {};
  for (const [name, alias] of Object.entries(value)) {
    assertSafeDataKey(name, `${path}.${name}`);
    setOwnDataField(result, name, decodeAlias(alias, `${path}.${name}`));
  }
  return result;
}

/**
 * Validate and detach a persisted alias map without canonicalizing its accepted
 * compatibility representation.
 * @param {unknown} value
 * @param {string} path
 */
export function decodeStoredAliasMap(value, path) {
  // Validate every known field and nested extension through the canonical
  // decoder, but retain the independently detached source representation.
  decodeAliasMap(value, path);
  const cloned = cloneJsonData(value, path);
  if (!isDataRecord(cloned)) invalidProjectData(path);
  const changed = repairNullableAliasCommands(cloned);
  return {
    aliases:
      /** @type {Record<string, import('../../types/data-contracts.js').AliasDefinition | import('../../types/data-contracts.js').StoredCommand[] | string>} */ (
        cloned
      ),
    changed,
  };
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {import('../../types/data-contracts.js').CanonicalEnvironmentBindingData}
 */
function decodeEnvironmentBinding(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  const cloned = cloneJsonData(value, path);
  if (!isDataRecord(cloned)) invalidProjectData(path);
  const result = /** @type {Record<string, any>} */ (cloned);
  result.keys = hasOwnDataField(value, "keys")
    ? decodeKeyMap(value.keys, `${path}.keys`)
    : {};
  if (hasOwnDataField(value, "aliases")) {
    result.aliases = decodeAliasMap(value.aliases, `${path}.aliases`);
  }
  return /** @type {import('../../types/data-contracts.js').CanonicalEnvironmentBindingData} */ (
    result
  );
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {Record<string, import('../../types/data-contracts.js').CanonicalEnvironmentBindingData>}
 */
function decodeEnvironmentMap(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  /** @type {Record<string, import('../../types/data-contracts.js').CanonicalEnvironmentBindingData>} */
  const result = {};
  for (const [environment, binding] of Object.entries(value)) {
    assertSafeDataKey(environment, `${path}.${environment}`);
    setOwnDataField(
      result,
      environment,
      decodeEnvironmentBinding(binding, `${path}.${environment}`),
    );
  }
  return result;
}

/** @returns {import('../../types/data-contracts.js').CanonicalEnvironmentBindingData} */
function emptyEnvironmentBinding() {
  return { keys: {} };
}

/**
 * @param {import('../../types/data-contracts.js').CanonicalEnvironmentBindingData} lowerPriority
 * @param {import('../../types/data-contracts.js').CanonicalEnvironmentBindingData} higherPriority
 */
function mergeEnvironmentBinding(lowerPriority, higherPriority) {
  const aliases = {
    ...(lowerPriority.aliases || {}),
    ...(higherPriority.aliases || {}),
  };
  return {
    ...lowerPriority,
    ...higherPriority,
    keys: { ...lowerPriority.keys, ...higherPriority.keys },
    ...(lowerPriority.aliases || higherPriority.aliases ? { aliases } : {}),
  };
}

/**
 * @param {Record<string, import('../../types/data-contracts.js').CanonicalEnvironmentBindingData>} target
 * @param {Record<string, import('../../types/data-contracts.js').CanonicalEnvironmentBindingData>} source
 */
function overlayEnvironmentMap(target, source) {
  for (const [environment, binding] of Object.entries(source)) {
    const existing = hasOwnDataField(target, environment)
      ? target[environment]
      : emptyEnvironmentBinding();
    setOwnDataField(
      target,
      environment,
      mergeEnvironmentBinding(existing, binding),
    );
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {import('../../types/data-contracts.js').BindsetKeyMetadata}
 */
function decodeMetadata(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  const cloned = cloneJsonData(value, path);
  if (!isDataRecord(cloned)) invalidProjectData(path);
  if (
    hasOwnDataField(cloned, "stabilizeExecutionOrder") &&
    typeof cloned.stabilizeExecutionOrder !== "boolean"
  ) {
    invalidProjectData(`${path}.stabilizeExecutionOrder`);
  }
  return /** @type {import('../../types/data-contracts.js').BindsetKeyMetadata} */ (
    cloned
  );
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {Record<string, import('../../types/data-contracts.js').BindsetKeyMetadata>}
 */
function decodeMetadataMap(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  /** @type {Record<string, import('../../types/data-contracts.js').BindsetKeyMetadata>} */
  const result = {};
  for (const [key, metadata] of Object.entries(value)) {
    assertSafeDataKey(key, `${path}.${key}`);
    setOwnDataField(result, key, decodeMetadata(metadata, `${path}.${key}`));
  }
  return result;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {Record<string, Record<string, import('../../types/data-contracts.js').BindsetKeyMetadata>>}
 */
function decodeEnvironmentMetadata(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  /** @type {Record<string, Record<string, import('../../types/data-contracts.js').BindsetKeyMetadata>>} */
  const result = {};
  for (const [environment, metadata] of Object.entries(value)) {
    assertSafeDataKey(environment, `${path}.${environment}`);
    setOwnDataField(
      result,
      environment,
      decodeMetadataMap(metadata, `${path}.${environment}`),
    );
  }
  return result;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {Record<string, Record<string, Record<string, import('../../types/data-contracts.js').BindsetKeyMetadata>>>}
 */
function decodeBindsetMetadata(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  /** @type {Record<string, Record<string, Record<string, import('../../types/data-contracts.js').BindsetKeyMetadata>>>} */
  const result = {};
  for (const [bindset, metadata] of Object.entries(value)) {
    assertSafeDataKey(bindset, `${path}.${bindset}`);
    setOwnDataField(
      result,
      bindset,
      decodeEnvironmentMetadata(metadata, `${path}.${bindset}`),
    );
  }
  return result;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {Record<string, import('../../types/data-contracts.js').CanonicalBindsetData>}
 */
function decodeBindsets(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  /** @type {Record<string, import('../../types/data-contracts.js').CanonicalBindsetData>} */
  const result = {};
  for (const [bindset, environments] of Object.entries(value)) {
    assertSafeDataKey(bindset, `${path}.${bindset}`);
    setOwnDataField(
      result,
      bindset,
      decodeEnvironmentMap(environments, `${path}.${bindset}`),
    );
  }
  return result;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {Record<string, string | null>}
 */
function decodeSelections(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  /** @type {Record<string, string | null>} */
  const result = {};
  for (const [selection, identifier] of Object.entries(value)) {
    assertSafeDataKey(selection, `${path}.${selection}`);
    if (identifier !== null && typeof identifier !== "string") {
      invalidProjectData(`${path}.${selection}`);
    }
    if (typeof identifier === "string") {
      assertSafeDataKey(identifier, `${path}.${selection}`);
    }
    setOwnDataField(result, selection, identifier);
  }
  return result;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {import('../../types/data-contracts.js').VertigoSettings}
 */
function decodeVertigoSettings(value, path) {
  if (!isDataRecord(value)) invalidProjectData(path);
  const cloned = cloneJsonData(value, path);
  if (!isDataRecord(cloned)) invalidProjectData(path);
  if (
    hasOwnDataField(cloned, "showPlayerSay") &&
    typeof cloned.showPlayerSay !== "boolean"
  ) {
    invalidProjectData(`${path}.showPlayerSay`);
  }
  if (hasOwnDataField(cloned, "selectedEffects")) {
    if (!isDataRecord(cloned.selectedEffects)) {
      invalidProjectData(`${path}.selectedEffects`);
    }
    for (const [environment, effects] of Object.entries(
      cloned.selectedEffects,
    )) {
      assertSafeDataKey(environment, `${path}.selectedEffects.${environment}`);
      if (
        !Array.isArray(effects) ||
        effects.some((effect) => typeof effect !== "string")
      ) {
        invalidProjectData(`${path}.selectedEffects.${environment}`);
      }
    }
  }
  return /** @type {import('../../types/data-contracts.js').VertigoSettings} */ (
    cloned
  );
}

/**
 * Convert one unknown profile into the canonical project-import shape.
 * @param {unknown} value
 * @param {string} profileId
 * @param {string} [path]
 * @returns {import('../../types/data-contracts.js').CanonicalProfileData}
 */
export function decodeProfileData(
  value,
  profileId,
  path = `data.profiles.${profileId}`,
) {
  assertSafeDataKey(profileId, path);
  if (!isDataRecord(value)) invalidProjectData(path);
  const cloned = cloneJsonData(value, path);
  if (!isDataRecord(cloned)) invalidProjectData(path);
  if (typeof value.name !== "string" || value.name.trim().length === 0) {
    invalidProjectData(`${path}.name`);
  }

  const mode = hasOwnDataField(value, "mode") ? value.mode : undefined;
  const modeEnvironment = decodeLegacyEnvironment(mode, `${path}.mode`);
  /** @type {string} */
  let currentEnvironment = modeEnvironment;
  if (hasOwnDataField(value, "currentEnvironment")) {
    if (value.currentEnvironment !== "") {
      currentEnvironment = decodeSafeIdentifier(
        value.currentEnvironment,
        `${path}.currentEnvironment`,
      );
    }
  }
  const legacyEnvironment =
    currentEnvironment === "ground" || currentEnvironment === "space"
      ? currentEnvironment
      : modeEnvironment;

  const decodedLegacyKeys = hasOwnDataField(value, "keys")
    ? decodeKeyMap(value.keys, `${path}.keys`)
    : null;
  const decodedLegacyKeybinds = hasOwnDataField(value, "keybinds")
    ? decodeEnvironmentMap(
        Object.fromEntries(
          Object.entries(
            isDataRecord(value.keybinds)
              ? value.keybinds
              : invalidProjectData(`${path}.keybinds`),
          ).map(([environment, keys]) => [environment, { keys }]),
        ),
        `${path}.keybinds`,
      )
    : null;

  /** @type {Record<string, import('../../types/data-contracts.js').CanonicalEnvironmentBindingData>} */
  const builds = {};
  if (decodedLegacyKeybinds) {
    overlayEnvironmentMap(builds, decodedLegacyKeybinds);
  }
  if (decodedLegacyKeys) {
    const existing = hasOwnDataField(builds, legacyEnvironment)
      ? builds[legacyEnvironment]
      : emptyEnvironmentBinding();
    setOwnDataField(builds, legacyEnvironment, {
      ...existing,
      keys: { ...existing.keys, ...decodedLegacyKeys },
    });
  }
  if (hasOwnDataField(value, "builds")) {
    overlayEnvironmentMap(
      builds,
      decodeEnvironmentMap(value.builds, `${path}.builds`),
    );
  }
  if (!hasOwnDataField(builds, "space")) {
    setOwnDataField(builds, "space", emptyEnvironmentBinding());
  }
  if (!hasOwnDataField(builds, "ground")) {
    setOwnDataField(builds, "ground", emptyEnvironmentBinding());
  }

  /** @type {Record<string, Record<string, import('../../types/data-contracts.js').BindsetKeyMetadata>>} */
  let keybindMetadata = {};
  if (hasOwnDataField(value, "keybindMetadata")) {
    const rawKeybindMetadata = value.keybindMetadata;
    if (!isDataRecord(rawKeybindMetadata)) {
      invalidProjectData(`${path}.keybindMetadata`);
    }
    const scoped = [...Object.keys(builds), "alias"].some((environment) =>
      hasOwnDataField(rawKeybindMetadata, environment),
    );
    keybindMetadata = scoped
      ? decodeEnvironmentMetadata(rawKeybindMetadata, `${path}.keybindMetadata`)
      : {
          [legacyEnvironment]: decodeMetadataMap(
            rawKeybindMetadata,
            `${path}.keybindMetadata`,
          ),
        };
  }

  const result = /** @type {Record<string, any>} */ (cloned);
  delete result.mode;
  delete result.keys;
  delete result.keybinds;
  result.name = value.name;
  result.description = hasOwnDataField(value, "description")
    ? decodeOptionalString(value.description, `${path}.description`)
    : "";
  result.currentEnvironment = currentEnvironment;
  result.builds = builds;
  result.aliases = hasOwnDataField(value, "aliases")
    ? decodeAliasMap(value.aliases, `${path}.aliases`)
    : {};
  result.bindsets = hasOwnDataField(value, "bindsets")
    ? decodeBindsets(value.bindsets, `${path}.bindsets`)
    : {};
  result.keybindMetadata = keybindMetadata;
  result.aliasMetadata = hasOwnDataField(value, "aliasMetadata")
    ? decodeMetadataMap(value.aliasMetadata, `${path}.aliasMetadata`)
    : {};
  result.bindsetMetadata = hasOwnDataField(value, "bindsetMetadata")
    ? decodeBindsetMetadata(value.bindsetMetadata, `${path}.bindsetMetadata`)
    : {};
  result.selections = hasOwnDataField(value, "selections")
    ? decodeSelections(value.selections, `${path}.selections`)
    : {};

  for (const field of [
    "id",
    "environment",
    "created",
    "lastModified",
    "migrationVersion",
  ]) {
    if (!hasOwnDataField(value, field)) continue;
    const decoded = decodeOptionalString(value[field], `${path}.${field}`);
    if (field === "id" || field === "environment") {
      assertSafeDataKey(decoded || "", `${path}.${field}`);
    }
    result[field] = decoded;
  }
  if (hasOwnDataField(value, "vertigoSettings")) {
    result.vertigoSettings = decodeVertigoSettings(
      value.vertigoSettings,
      `${path}.vertigoSettings`,
    );
  }

  return /** @type {import('../../types/data-contracts.js').CanonicalProfileData} */ (
    result
  );
}

/**
 * Validate one profile read from persistent storage without rewriting a
 * representation that already has a builds map. The old mode-and-keys shape is
 * the sole structural migration performed here.
 *
 * @param {unknown} value
 * @param {string} profileId
 * @param {string} [path]
 * @returns {{
 *   profile: import('../../types/data-contracts.js').ProfileData,
 *   migrated: boolean,
 *   changed: boolean,
 * }}
 */
export function decodeStoredProfileData(
  value,
  profileId,
  path = `data.profiles.${profileId}`,
) {
  assertSafeDataKey(profileId, path);
  if (!isDataRecord(value)) invalidProjectData(path);

  const cloned = cloneJsonData(value, path);
  if (!isDataRecord(cloned)) invalidProjectData(path);

  const hasBuilds = hasOwnDataField(value, "builds");
  const isLegacyModeAndKeys =
    !hasBuilds &&
    hasOwnDataField(value, "mode") &&
    hasOwnDataField(value, "keys");
  if (!hasBuilds && !isLegacyModeAndKeys) {
    invalidProjectData(`${path}.builds`);
  }
  if (hasBuilds) {
    if (!isDataRecord(value.builds)) invalidProjectData(`${path}.builds`);
    if (
      !hasOwnDataField(value.builds, "space") &&
      !hasOwnDataField(value.builds, "ground")
    ) {
      invalidProjectData(`${path}.builds`);
    }
  }

  // This validates every known nested structure, including legacy/hybrid
  // fields and non-standard build environments. Its canonical output is used
  // only when the persisted profile is the pre-builds mode-and-keys shape.
  const canonical = decodeProfileData(value, profileId, path);

  const repaired = isLegacyModeAndKeys
    ? false
    : repairStoredProfileCommandNulls(cloned);

  return {
    profile: isLegacyModeAndKeys
      ? canonical
      : /** @type {import('../../types/data-contracts.js').ProfileData} */ (
          cloned
        ),
    migrated: isLegacyModeAndKeys,
    changed: isLegacyModeAndKeys || repaired,
  };
}
