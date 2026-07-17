import commandCategories from "./commandCategories.js";

/** @typedef {import('../components/services/serviceTypes.js').CommandCategory} CommandCategory */
/** @typedef {import('../components/services/serviceTypes.js').CommandDefinition} CommandDefinition */
/**
 * @typedef {{
 *   t: (key: string, options?: import('i18next').TOptions) => string
 * }} I18nLike
 */
/** @typedef {string | { command?: string, text?: string }} CommandReference */
/**
 * @typedef {CommandDefinition & {
 *   categoryId: string,
 *   commandId: string
 * }} CommandDefinitionMatch
 */

/**
 * The order of these spreads is part of the catalog contract. Definition
 * lookup returns the first matching command, including duplicate tray command
 * templates whose more general forms intentionally precede range variants.
 *
 * Localization mutates this shared object in place. Consumers that need an
 * isolated result must use getCommandCategories() instead of cloning once at
 * module initialization.
 *
 * @type {Record<string, CommandCategory>}
 */
export { commandCategories };

/** @param {string} value */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {CommandDefinition} definition
 * @param {string} commandId
 * @param {I18nLike | null | undefined} i18n
 * @returns {CommandDefinition}
 */
function translateCommandDefinition(definition, commandId, i18n) {
  const translated = { ...definition };
  if (!i18n) return translated;

  translated.name = i18n.t(`command_definitions.${commandId}.name`, {
    defaultValue: definition.name,
  });
  translated.description = i18n.t(
    `command_definitions.${commandId}.description`,
    { defaultValue: definition.description },
  );
  return translated;
}

/**
 * Return a detached snapshot so UI code cannot mutate the shared localized
 * catalog while rendering or filtering it.
 *
 * @param {Record<string, CommandCategory>} [categories]
 * @returns {Record<string, CommandCategory>}
 */
export function getCommandCategories(categories = commandCategories) {
  return typeof structuredClone === "function"
    ? structuredClone(categories)
    : JSON.parse(JSON.stringify(categories));
}

/**
 * Resolve a display definition using the historic two-pass matching rules.
 * Exact matches win. Parameterized and tray commands then use the first
 * compatible catalog prefix in insertion order.
 *
 * @param {CommandReference | undefined} command
 * @param {I18nLike | null} [i18n]
 * @param {Record<string, CommandCategory>} [categories]
 * @returns {CommandDefinitionMatch | null}
 */
export function findCommandDefinition(
  command,
  i18n = null,
  categories = commandCategories,
) {
  const commandString =
    typeof command === "string"
      ? command.trim()
      : (command?.command || "").trim();
  const commandDisplay =
    typeof command === "string" ? command.trim() : (command?.text || "").trim();

  for (const [categoryId, category] of Object.entries(categories)) {
    for (const [commandId, definition] of Object.entries(
      category.commands || {},
    )) {
      if (
        definition.command === commandString ||
        definition.name === commandDisplay
      ) {
        return {
          ...translateCommandDefinition(definition, commandId, i18n),
          commandId,
          categoryId,
        };
      }
    }
  }

  for (const [categoryId, category] of Object.entries(categories)) {
    for (const [commandId, definition] of Object.entries(
      category.commands || {},
    )) {
      if (!commandString || typeof definition.command !== "string") continue;

      const basePattern = definition.command.split(/\s+/)[0];
      const variants = new Set([
        basePattern,
        basePattern.replace(/^\+/, ""),
        basePattern.replace(/^\+?STO/, ""),
        basePattern.replace(/^\+?STO/, "+"),
      ]);
      const matchers = Array.from(variants)
        .filter(Boolean)
        .map((variant) => new RegExp(`^${escapeRegex(variant)}(\\s|$)`, "i"));
      const commandWithoutPlus = commandString.replace(/^\+/, "");
      const startsWithBase = matchers.some(
        (matcher) =>
          matcher.test(commandString) || matcher.test(commandWithoutPlus),
      );

      if (startsWithBase) {
        return {
          ...translateCommandDefinition(definition, commandId, i18n),
          commandId,
          categoryId,
        };
      }
    }
  }

  return null;
}

/**
 * Resolve warning metadata with the command library's historic exact-then-
 * containment semantics.
 *
 * @param {CommandReference | undefined} command
 * @param {Record<string, CommandCategory>} [categories]
 * @returns {string | null}
 */
export function getCommandWarning(command, categories = commandCategories) {
  const commandString =
    typeof command === "string"
      ? command.trim()
      : (command?.command || "").trim();

  for (const category of Object.values(categories)) {
    for (const definition of Object.values(category.commands || {})) {
      if (
        (commandString && definition.command === commandString) ||
        (command &&
          typeof command === "object" &&
          (definition.command === command.command ||
            definition.name === command.text))
      ) {
        return definition.warning || null;
      }
    }
  }

  for (const category of Object.values(categories)) {
    for (const definition of Object.values(category.commands || {})) {
      if (
        !commandString ||
        typeof definition.command !== "string" ||
        !commandString.includes(definition.command)
      ) {
        continue;
      }

      if (
        commandString.includes("TrayExec") ||
        commandString.startsWith(definition.command)
      ) {
        return definition.warning || null;
      }
    }
  }

  return null;
}

/**
 * Exact canonical lookup used by environment compatibility checks.
 *
 * @param {string | undefined} command
 * @param {Record<string, CommandCategory>} [categories]
 * @returns {CommandDefinitionMatch | null}
 */
export function findCommandByName(command, categories = commandCategories) {
  if (!command) return null;

  for (const [categoryId, category] of Object.entries(categories)) {
    for (const [commandId, definition] of Object.entries(
      category.commands || {},
    )) {
      if (definition.command === command) {
        return { ...definition, categoryId, commandId };
      }
    }
  }

  return null;
}

export default commandCategories;
