// STOFormatter.js - Centralized utilities for formatting STO keybinds & aliases
// This library is intentionally dependency-free so it can be used from services, UIs, tests, etc.

import { encodeKeyForExport } from './keyEncoding.js'

/**
 * Format an alias line in STO syntax
 * Example: alias MyAlias <& say Hello World $$ FireAll &>
 * @param {string} name - Alias name
 * @param {{ commands: string, description?: string }} alias - Alias object
 * @param {boolean} includeDescription - If true, prepend description comment when available
 * @returns {string} Formatted alias string (including trailing newline)
 */
export function formatAliasLine(name, alias = {}, includeDescription = true) {
  let line = ''
  if (includeDescription && alias.description) {
    line += `; ${alias.description}\n`
  }
  line += `alias ${name} <& ${alias.commands} &>\n`
  return line
}

/**
 * Format a keybind line in STO syntax. Multiple commands are chained with `$$`.
 * Example: Space "Target_Enemy_Near $$ FireAll"
 * @param {string} key - Key name (e.g., "Space", "F1", "`")
 * @param {Array<{command:string}>} commands - Array of command objects
 * @returns {string} Formatted keybind string (including trailing newline) or empty string if no valid commands.
 */
export function formatKeybindLine(key, commands = []) {
  // Encode the key for export (e.g., ` becomes 0x29)
  const encodedKey = encodeKeyForExport(key)
  
  // If there are no commands we still output the key followed by an empty quoted
  // string so that downstream export files (and the game) recognise that the
  // keybind exists but intentionally runs no commands (e.g. `F4 ""`).
  if (Array.isArray(commands) && commands.length === 0) {
    return `${encodedKey} ""\n`
  }

  const valid = commands
    .map((c) => typeof c === 'string' ? c.trim() : (c && typeof c.command === 'string' ? c.command.trim() : ''))
    .filter((s) => s.length > 0)

  // After filtering we might still end up with an empty list (e.g. all commands
  // were null/empty). Generate an empty quoted string in that case as well.
  if (valid.length === 0) {
    return `${encodedKey} ""\n`
  }

  const chained = valid.join(' $$ ')
  return `${encodedKey} "${chained}"\n`
}

 