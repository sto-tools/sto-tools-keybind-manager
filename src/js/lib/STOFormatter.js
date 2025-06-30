// STOFormatter.js - Centralized utilities for formatting STO keybinds & aliases
// This library is intentionally dependency-free so it can be used from services, UIs, tests, etc.

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
 * @param {string} key - Key name (e.g., "Space", "F1")
 * @param {Array<{command:string}>} commands - Array of command objects
 * @returns {string} Formatted keybind string (including trailing newline) or empty string if no valid commands.
 */
export function formatKeybindLine(key, commands = []) {
  if (!commands || commands.length === 0) return ''

  const valid = commands
    .filter((c) => c && typeof c.command === 'string' && c.command.trim().length)
    .map((c) => c.command.trim())

  if (valid.length === 0) return ''

  const chained = valid.join(' $$ ')
  return `${key} "${chained}"\n`
}

// Convenience helpers -------------------------------------------------------

/**
 * Sort aliases by name and return formatted lines.
 */
export function formatAliasBlock(aliases = {}, includeHeader = false) {
  if (!aliases || Object.keys(aliases).length === 0) return ''

  let block = ''
  if (includeHeader) {
    block += `; Command Aliases\n; ================================================================\n\n`
  }
  const sorted = Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b))
  sorted.forEach(([name, alias]) => {
    block += formatAliasLine(name, alias)
    block += '\n'
  })
  return block
}

/**
 * Format a section of keybinds given a key→commands map.
 */
export function formatKeybindBlock(keysObj = {}) {
  if (!keysObj || Object.keys(keysObj).length === 0) return ''

  let block = ''
  Object.entries(keysObj).forEach(([key, cmds]) => {
    block += formatKeybindLine(key, cmds)
  })
  block += '\n'
  return block
} 