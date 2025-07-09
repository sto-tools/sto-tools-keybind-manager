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

/**
 * Generate an alias name from environment and key name for bind-to-alias mode.
 * Follows the pattern: environment_key (e.g., "space_q", "ground_f1")
 * Ensures the result is a valid alias name by converting invalid characters.
 */
export function generateBindToAliasName (environment, keyName, bindsetName = null) {
  // Sanitize environment name (should already be clean, but just in case)
  const cleanEnv = (environment || 'space').toLowerCase().replace(/[^a-z0-9]/g, '')
  
  // Convert special characters to meaningful names before general sanitization
  let cleanKey = (keyName || '').toLowerCase()
  
  // Handle specific special characters with meaningful names
  const specialCharMap = {
    '[': 'leftbracket',
    ']': 'rightbracket',
    '(': 'leftparen',
    ')': 'rightparen',
    '{': 'leftbrace',
    '}': 'rightbrace',
    '<': 'less',
    '>': 'greater',
    '=': 'equals',
    '-': 'minus',
    '_': 'underscore',
    '\\': 'backslash',
    '/': 'slash',
    '|': 'pipe',
    '`': 'backtick',
    '~': 'tilde',
    '!': 'exclamation',
    '@': 'at',
    '#': 'hash',
    '$': 'dollar',
    '%': 'percent',
    '^': 'caret',
    '&': 'ampersand',
    '*': 'asterisk',
    '?': 'question',
    ':': 'colon',
    ';': 'semicolon',
    '"': 'quote',
    "'": 'apostrophe',
    ',': 'comma',
    '.': 'period'
  }
  
  // Replace special characters with their names
  for (const [char, name] of Object.entries(specialCharMap)) {
    // Escape the character for use in regex
    const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleanKey = cleanKey.replace(new RegExp(escapedChar, 'g'), name)
  }
  
  // Now do general sanitization - convert remaining invalid characters to underscores
  cleanKey = cleanKey
    .replace(/[^a-z0-9_]/g, '_')  // Replace any remaining non-alphanumeric/underscore with _
    .replace(/^_+|_+$/g, '')      // Remove leading/trailing underscores
    .replace(/_+/g, '_')          // Collapse multiple underscores to single
  
  if (!cleanKey) return null // Invalid if key becomes empty
  
  // Ensure key part starts with a letter (prepend 'k' for 'key' if it starts with number)
  if (/^[0-9]/.test(cleanKey)) {
    cleanKey = `k${cleanKey}`
  }
  
  // Optional bindset part (omit when primary or blank)
  let bindsetPart = ''
  if (bindsetName && bindsetName !== 'Primary Bindset') {
    // Sanitize bindset similar to key – spaces/invalid chars to underscores
    bindsetPart = bindsetName.toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_')
  }
  
  const aliasName = bindsetPart
    ? `${cleanEnv}_${bindsetPart}_${cleanKey}`
    : `${cleanEnv}_${cleanKey}`
  
  return isAliasNamePatternValid(aliasName) ? aliasName : null
}

/**
 * Check if an alias name was generated by bind-to-alias mode.
 * Returns the parsed environment and key if it matches the pattern, null otherwise.
 */
export function parseBindToAliasName (aliasName) {
  if (!aliasName || typeof aliasName !== 'string') return null
  
  const match = aliasName.match(/^([a-z]+)_(.+)$/)
  if (!match) return null
  
  const [, environment, keyPart] = match
  
  // Handle keys that were prefixed with 'k' for keys starting with numbers
  let originalKey = keyPart
  if (keyPart.startsWith('k') && /^k[0-9]/.test(keyPart)) {
    originalKey = keyPart.substring(1)
  }
  
  return { environment, keyPart, originalKey: originalKey.replace(/_/g, ' ') }
} 