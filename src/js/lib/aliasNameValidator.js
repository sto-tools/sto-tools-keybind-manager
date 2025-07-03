/*
 * aliasNameValidator.js – reusable helpers for validating alias names.
 * Ensures a proposed alias name does not collide with real STO commands
 * (excluding VFX-specific dynFxSetFXExclusionList aliases which are virtual).
 */
import { STOCommandParser } from './STOCommandParser.js'
import { SIGNATURE_DEFINITIONS } from './CommandSignatureDefinitions.js'

// Build reserved command set once at module load
const parser = STOCommandParser.createStandalone()

function extractCommandTokens () {
  const tokens = new Set()
  Object.values(parser.signatures).forEach(def => {
    const isVfx = (def.category || '').toLowerCase() === 'vfx'
    if (isVfx) return // allow VFX names

    // base command name (e.g. TrayExecByTray)
    if (def.baseCommand) tokens.add(def.baseCommand.toLowerCase())

    // Try to capture inline alternatives like (say|team|zone)
    if (Array.isArray(def.patterns)) {
      def.patterns.forEach(p => {
        const altMatch = p.regex?.source?.match(/^\^\(([^)]+)\)/)
        if (altMatch) {
          altMatch[1].split('|').forEach(cmd => tokens.add(cmd.toLowerCase()))
        }
      })
    }
  })
  return tokens
}

// Build reserved set and include explicit options from definitions
const RESERVED_COMMANDS = (() => {
  const set = extractCommandTokens()
  // Include 'options' array values from signature definitions
  Object.values(SIGNATURE_DEFINITIONS).forEach(def => {
    const opts = def.parameters?.command_type?.options || def.parameters?.verb?.options || []
    opts.forEach(opt => set.add(opt.toLowerCase()))
  })
  return set
})()

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/

/**
 * Check if an alias name passes basic pattern rules.
 */
export function isAliasNamePatternValid (name = '') {
  return NAME_PATTERN.test(name)
}

/**
 * Check if an alias name is allowed (pattern + not reserved).
 */
export function isAliasNameAllowed (name = '') {
  if (!isAliasNamePatternValid(name)) return false
  return !RESERVED_COMMANDS.has(name.toLowerCase())
}

/**
 * Return validation error code for alias name or null if valid.
 */
export function getAliasNameError (name = '') {
  if (!isAliasNamePatternValid(name)) return 'invalid_alias_name'
  if (RESERVED_COMMANDS.has(name.toLowerCase())) return 'reserved_command_name'
  return null
} 