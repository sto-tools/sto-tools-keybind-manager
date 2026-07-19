import { setOwnDataField } from "./jsonDataBoundary.js";

/** @typedef {import('./serviceTypes.js').ParsedAliasFile} ParsedAliasFile */
/** @typedef {import('./serviceTypes.js').ParsedKeybindFile} ParsedKeybindFile */
/** @typedef {import('./serviceTypes.js').ProfileData} ProfileData */
/** @typedef {import('./serviceTypes.js').StoredCommand} StoredCommand */

/**
 * @typedef {object} TextCommandCapabilities
 * @property {(commandString: string) => PromiseLike<{ commands?: import('./serviceTypes.js').StoredCommand[], isMirrored?: boolean }>} parseCommand
 * @property {(commands: StoredCommand | StoredCommand[] | null | undefined) => string[]} normalizeCommands
 * @property {(command: string) => PromiseLike<string>} optimizeCommand
 */

/**
 * Keep the established text-import interpretation of a mirrored command chain:
 * an odd chain retains its first half including the pivot; every other shape is
 * already its own original sequence.
 *
 * @param {string} commandString
 * @returns {string[]}
 */
export function extractOriginalTextCommands(commandString) {
  const commands = commandString.split(/\s*\$\$\s*/);
  if (commands.length < 3 || commands.length % 2 === 0) return commands;

  const midpoint = Math.floor(commands.length / 2);
  return commands.slice(0, midpoint + 1);
}

/**
 * @param {string[]} commands
 * @param {TextCommandCapabilities['optimizeCommand']} optimizeCommand
 */
async function optimizeCommands(commands, optimizeCommand) {
  const optimized = [];
  for (const command of commands) {
    optimized.push(await optimizeCommand(command));
  }
  return optimized;
}

/**
 * Produce one detached keybind-profile replacement and its success accounting.
 * Parser/optimizer behavior is supplied explicitly so this module owns no
 * EventBus, storage, browser, lifecycle, or application-global capability.
 *
 * Inputs are expected to have crossed the STO text boundary already. The
 * intentionally narrow scaffolding below preserves the historical direct-call
 * behavior for missing profiles and incomplete existing profile containers.
 *
 * @param {{
 *   profile: ProfileData | null | undefined,
 *   parsed: ParsedKeybindFile,
 *   environment: string,
 *   strategy: string,
 *   capabilities: TextCommandCapabilities,
 * }} options
 * @returns {Promise<Extract<import('../../types/rpc/import-export.js').KeybindImportResult, { success: true }> & { nextProfile: ProfileData }>}
 */
export async function planKeybindTextImport({
  profile,
  parsed,
  environment,
  strategy,
  capabilities,
}) {
  const nextProfile = structuredClone(
    profile || {
      builds: { space: { keys: {} }, ground: { keys: {} } },
    },
  );

  if (!nextProfile.builds) {
    nextProfile.builds = {
      space: { keys: {} },
      ground: { keys: {} },
    };
  }
  if (!nextProfile.builds[environment]) {
    nextProfile.builds[environment] = { keys: {} };
  }

  const destination = /** @type {Record<string, StoredCommand[]>} */ (
    nextProfile.builds[environment].keys
  );
  let imported = 0;
  let skipped = 0;
  let overwritten = 0;
  let cleared = 0;

  if (strategy === "overwrite_all") {
    const existingKeys = Object.keys(destination);
    cleared = existingKeys.length;
    for (const key of existingKeys) delete destination[key];

    const environmentMetadata = nextProfile.keybindMetadata?.[environment];
    if (environmentMetadata) {
      for (const key of existingKeys) delete environmentMetadata[key];
    }
  }

  for (const [key, data] of Object.entries(parsed.keybinds)) {
    if (
      strategy === "merge_keep" &&
      Object.prototype.hasOwnProperty.call(destination, key)
    ) {
      skipped++;
      continue;
    }

    if (
      strategy === "merge_overwrite" &&
      Object.prototype.hasOwnProperty.call(destination, key)
    ) {
      overwritten++;
    }

    const inspected = await capabilities.parseCommand(data.raw);
    let commands;
    if (inspected.isMirrored) {
      const originals = extractOriginalTextCommands(data.raw);
      const parsedOriginals = await capabilities.parseCommand(
        originals.join(" $$ "),
      );
      commands = capabilities.normalizeCommands(parsedOriginals.commands);

      if (!nextProfile.keybindMetadata) nextProfile.keybindMetadata = {};
      if (!nextProfile.keybindMetadata[environment]) {
        nextProfile.keybindMetadata[environment] = {};
      }
      const environmentMetadata = nextProfile.keybindMetadata[environment];
      if (
        !Object.prototype.hasOwnProperty.call(environmentMetadata, key) ||
        !environmentMetadata[key]
      ) {
        setOwnDataField(environmentMetadata, key, {});
      }
      environmentMetadata[key].stabilizeExecutionOrder = true;
    } else {
      commands = capabilities.normalizeCommands(data.commands);
    }

    setOwnDataField(
      destination,
      key,
      await optimizeCommands(commands, capabilities.optimizeCommand),
    );
    imported++;
  }

  return {
    success: true,
    nextProfile,
    imported: { keys: imported },
    skipped,
    overwritten,
    cleared,
    errors: parsed.errors,
    message: "import_completed_keybinds",
  };
}

/**
 * Produce one detached alias-profile replacement and its success accounting.
 * Command optimization is an explicit capability; persistence and notification
 * effects remain with ImportService.
 *
 * @param {{
 *   profile: ProfileData | null | undefined,
 *   parsed: ParsedAliasFile,
 *   strategy: string,
 *   optimizeCommand: TextCommandCapabilities['optimizeCommand'],
 * }} options
 * @returns {Promise<Extract<import('../../types/rpc/aliases.js').AliasImportResult, { success: true }> & { nextProfile: ProfileData }>}
 */
export async function planAliasTextImport({
  profile,
  parsed,
  strategy,
  optimizeCommand,
}) {
  const nextProfile = structuredClone(profile || { aliases: {} });
  if (!nextProfile.aliases) nextProfile.aliases = {};

  let imported = 0;
  let skipped = 0;
  let overwritten = 0;
  let cleared = 0;

  if (strategy === "overwrite_all") {
    const existingAliases = Object.keys(nextProfile.aliases);
    cleared = existingAliases.length;
    for (const alias of existingAliases) delete nextProfile.aliases[alias];

    if (nextProfile.aliasMetadata) {
      for (const alias of existingAliases) {
        delete nextProfile.aliasMetadata[alias];
      }
    }
  }

  for (const [name, data] of Object.entries(parsed.aliases)) {
    if (name.startsWith("sto_kb_")) continue;

    if (
      strategy === "merge_keep" &&
      Object.prototype.hasOwnProperty.call(nextProfile.aliases, name)
    ) {
      skipped++;
      continue;
    }

    if (
      strategy === "merge_overwrite" &&
      Object.prototype.hasOwnProperty.call(nextProfile.aliases, name)
    ) {
      overwritten++;
    }

    const commandString = data.commands || "";
    const commands = commandString.trim()
      ? commandString
          .trim()
          .split(/\s*\$\$\s*/)
          .filter((command) => command.trim())
      : [];
    const optimized = await optimizeCommands(commands, optimizeCommand);

    setOwnDataField(nextProfile.aliases, name, {
      commands: optimized,
      description: data.description || "",
    });
    imported++;
  }

  return {
    success: true,
    nextProfile,
    imported: { aliases: imported },
    skipped,
    overwritten,
    cleared,
    errors: parsed.errors,
    message: "import_completed_aliases",
  };
}
