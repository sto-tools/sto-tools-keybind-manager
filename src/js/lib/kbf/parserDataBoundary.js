const unsafeDynamicNames = new Set(["__proto__", "prototype", "constructor"]);

/** @typedef {{ success: false, message: string, context: Record<string, any> }} ParserBoundaryFailure */
/** @template Value @typedef {{ success: true, value: Value } | ParserBoundaryFailure} ParserBoundaryResult */

/** @param {unknown} value @returns {value is string} */
const isSafeDynamicName = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  !unsafeDynamicNames.has(value);

/** @param {Record<string, any>} target @param {string} key @param {any} value */
function setOwnDataField(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

/** @param {string} message @param {Record<string, any>} context @returns {ParserBoundaryFailure} */
const failure = (message, context) => ({ success: false, message, context });

/**
 * Reserve a parser-owned bindset without invoking inherited setters or
 * accepting a normalized-name collision.
 * @param {Record<string, any>} bindsets
 * @param {unknown} name
 * @param {string | undefined} displayName
 * @returns {ParserBoundaryResult<{ keys: Record<string, any>, aliases: Record<string, any>, metadata: Record<string, any> }>}
 */
export function reserveKBFBindset(bindsets, name, displayName) {
  if (!isSafeDynamicName(name)) {
    return failure("Unsafe KBF bindset name", {
      fatal: true,
      path: `$.bindsets.${String(name)}`,
      bindsetName: name,
    });
  }
  if (Object.hasOwn(bindsets, name)) {
    return failure("KBF bindset names collide after normalization", {
      fatal: true,
      path: `$.bindsets.${name}`,
      bindsetName: name,
    });
  }
  const bindset = {
    keys: {},
    aliases: {},
    metadata: displayName ? { displayName } : {},
  };
  setOwnDataField(bindsets, name, bindset);
  return { success: true, value: bindset };
}

/**
 * Reserve a parser-owned key without invoking inherited setters or accepting
 * a canonical-name collision.
 * @param {Record<string, any>} keys
 * @param {string} bindsetName
 * @param {unknown} canonicalKey
 * @returns {ParserBoundaryResult<{ commands: any[], metadata: Record<string, any> }>}
 */
export function reserveKBFKey(keys, bindsetName, canonicalKey) {
  if (!isSafeDynamicName(canonicalKey)) {
    return failure("Unsafe canonical KBF key name", {
      fatal: true,
      path: `$.bindsets.${bindsetName}.keys.${String(canonicalKey)}`,
      bindsetName,
      canonicalKey,
    });
  }
  if (Object.hasOwn(keys, canonicalKey)) {
    return failure("KBF keys collide after normalization", {
      fatal: true,
      path: `$.bindsets.${bindsetName}.keys.${canonicalKey}`,
      bindsetName,
      canonicalKey,
    });
  }
  const key = { commands: [], metadata: {} };
  setOwnDataField(keys, canonicalKey, key);
  return { success: true, value: key };
}

/**
 * Store a generated alias without invoking inherited setters or accepting an
 * unsafe or colliding alias name.
 * @param {Record<string, any>} aliases
 * @param {Record<string, any>} alias
 * @returns {ParserBoundaryResult<Record<string, any>>}
 */
export function storeKBFAlias(aliases, alias) {
  if (!isSafeDynamicName(alias.name)) {
    return failure("Unsafe generated KBF alias name", {
      fatal: true,
      path: `$.aliases.${String(alias.name)}`,
      aliasName: alias.name,
    });
  }
  if (Object.hasOwn(aliases, alias.name)) {
    return failure("Generated KBF aliases collide", {
      fatal: true,
      path: `$.aliases.${alias.name}`,
      aliasName: alias.name,
    });
  }
  setOwnDataField(aliases, alias.name, alias);
  return { success: true, value: alias };
}

/**
 * Normalize the translator's supported object and legacy group-array shapes.
 * @param {any} translation
 */
export function normalizeKBFTranslation(translation) {
  if (!translation) return { commands: [], aliases: [] };

  /** @type {any[]} */
  let commands = [];
  /** @type {Record<string, any>[]} */
  const aliases = [];
  /** @param {any} aliasCollection */
  const pushAliases = (aliasCollection) => {
    if (Array.isArray(aliasCollection)) {
      aliases.push(...aliasCollection);
    } else if (aliasCollection && typeof aliasCollection === "object") {
      for (const [name, alias] of Object.entries(aliasCollection)) {
        if (alias && typeof alias === "object" && !Array.isArray(alias)) {
          aliases.push({ ...alias, name });
        }
      }
    }
  };

  pushAliases(translation?.aliases);
  if (translation.commands && Array.isArray(translation.commands)) {
    commands = translation.commands;
  } else if (Array.isArray(translation)) {
    for (const group of translation) {
      if (Array.isArray(group?.forward)) commands.push(...group.forward);
      pushAliases(group?.aliases);
    }
  }
  return { commands, aliases };
}

/** @param {any} input @param {Record<string, any>} [options] */
export function extractKBFParserPayload(input, options = {}) {
  const context = {
    recordIndex: input?.recordIndex || options.recordIndex || 0,
    keysetRecordIndex:
      input?.keysetRecordIndex || options.keysetRecordIndex || 0,
    fieldIndex: input?.fieldIndex || options.fieldIndex || 0,
  };
  if (typeof input === "string") return { payload: input, context };
  if (input && typeof input === "object" && input.payload) {
    return { payload: input.payload, context: { ...context, ...input } };
  }
  return { payload: null, context };
}
