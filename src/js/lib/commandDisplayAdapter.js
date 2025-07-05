/**
 * Command Display Adapter
 * 
 * Converts between canonical string commands (used in business logic)
 * and rich command objects (used for UI display only).
 * 
 * This is the ONLY place in the codebase that should create rich command objects.
 * All services and storage work with string[] only.
 */

import { request } from '../core/requestResponse.js'
import eventBus from '../core/eventBus.js'

/**
 * Convert a canonical command string to a rich object for UI display
 * @param {string} commandString - The canonical command string
 * @param {Object} i18n - Internationalization object with t() method
 * @param {Object} options - Additional options
 * @returns {Object} Rich command object for display
 */
export async function enrichForDisplay(commandString, i18n, options = {}) {
  if (typeof commandString !== 'string') {
    console.warn('enrichForDisplay: commandString must be a string, got:', typeof commandString)
    return createFallbackRichObject(commandString, i18n)
  }

  // Resolve the event bus to use (caller provided → global → default import)
  const bus = options.eventBus || globalThis.eventBus || eventBus

  try {
    // Use STOCommandParser to get base parsing information
    const parseResult = await request(
      bus,
      'parser:parse-command-string',
      {
        commandString,
        options: { generateDisplayText: true }
      }
    )

    if (!parseResult || !parseResult.commands || parseResult.commands.length === 0) {
      return createFallbackRichObject(commandString, i18n)
    }

    // For command chains (multiple commands), take the first one for display
    // The UI will handle chains differently
    const parsedCommand = parseResult.commands[0]

    // Try to get command definition for additional metadata
    let commandDef = null
    try {
      commandDef = await request(bus, 'command:find-definition', { 
        command: commandString 
      })
    } catch (error) {
      // Command definition lookup failed, continue with parser data
    }

    // Build the rich object
    const richObject = {
      command: commandString,
      text: parsedCommand.displayText || commandString,
      displayText: parsedCommand.displayText || commandString,
      icon: parsedCommand.icon || '⚙️',
      type: parsedCommand.category || 'custom',
      category: parsedCommand.category || 'custom',
      parameters: parsedCommand.parameters || {},
      signature: parsedCommand.signature,
      baseCommand: parsedCommand.baseCommand,
      id: parsedCommand.id || `display_${Date.now()}_${Math.random()}`
    }

    // Override with command definition data if available
    if (commandDef) {
      richObject.icon = commandDef.icon || richObject.icon
      richObject.type = commandDef.categoryId || richObject.type
      richObject.category = commandDef.categoryId || richObject.category
      
      // Handle parameterized commands with special display logic
      if (commandDef.customizable && richObject.parameters) {
        richObject.text = formatParameterizedCommand(commandDef, richObject.parameters, i18n)
        richObject.displayText = richObject.text
      } else if (commandDef.name) {
        // Preserve detailed parser display for tray execution commands even though
        // their library definitions are flagged as non-customizable.
        const trayIds = new Set(['custom_tray', 'tray_with_backup'])
        if (!trayIds.has(commandDef.commandId)) {
          // Use translated name from definition for all other static commands
          richObject.text = commandDef.name
          richObject.displayText = commandDef.name
        }
      }
    }

    // Apply i18n translation if available
    if (i18n && typeof i18n.t === 'function') {
      const translationKey = getTranslationKey(parsedCommand, commandDef)
      if (translationKey) {
        const translated = i18n.t(translationKey, richObject.parameters)
        if (translated && translated !== translationKey) {
          // Preserve parameter details that were present in the original displayText object.
          if (typeof parsedCommand.displayText === 'object' && parsedCommand.displayText?.params) {
            const { tray, slot, backup_tray, backup_slot } = parsedCommand.displayText.params
            let paramSuffix = ''
            if (backup_tray !== undefined && backup_slot !== undefined) {
              paramSuffix = ` (${tray} ${slot} -> ${backup_tray} ${backup_slot})`
            } else if (tray !== undefined && slot !== undefined) {
              paramSuffix = ` (${tray} ${slot})`
            }
            richObject.text = `${translated}${paramSuffix}`
            richObject.displayText = richObject.text
          } else {
            richObject.text = translated
            richObject.displayText = translated
          }
        }
      }
    }

    // If displayText is still an object (no i18n available or translation failed),
    // fall back to its "fallback" or generic string representation so UI/title
    // rendering logic always receives a string.
    if (typeof richObject.displayText === 'object' && richObject.displayText) {
      // Keep objects that include an i18n key so downstream formatting can append
      // parameter details. Only flatten to string when the object lacks a key.
      if (!('key' in richObject.displayText)) {
        const fallback = richObject.displayText.fallback || richObject.displayText.text || commandString
        richObject.displayText = fallback
        richObject.text = fallback
      }
    }

    return richObject
  } catch (error) {
    console.warn('enrichForDisplay: Failed to parse command:', commandString, error)
    return createFallbackRichObject(commandString, i18n)
  }
}

/**
 * Convert any command (string or object) to its canonical string form
 * @param {string|Object} cmdOrObj - Command string or rich object
 * @returns {string} Canonical command string
 */
export function normalizeToString(cmdOrObj) {
  if (typeof cmdOrObj === 'string') {
    return cmdOrObj.trim()
  }
  
  if (cmdOrObj && typeof cmdOrObj === 'object') {
    return (cmdOrObj.command || cmdOrObj.text || '').trim()
  }
  
  return ''
}

/**
 * Convert any command to its optimized canonical string form (applies + prefix optimization)
 * @param {string|Object} cmdOrObj - Command string or rich object
 * @param {Object} options - Options including eventBus
 * @returns {Promise<string>} Optimized canonical command string
 */
export async function normalizeToOptimizedString(cmdOrObj, options = {}) {
  const commandString = normalizeToString(cmdOrObj)
  
  if (!commandString) {
    return ''
  }
  
  // Resolve the event bus to use (caller provided → global → default import)
  const bus = options.eventBus || globalThis.eventBus || eventBus

  try {
    // Parse the command to check if it can be optimized
    const parseResult = await request(bus, 'parser:parse-command-string', {
      commandString,
      options: { generateDisplayText: false }
    })
    
    if (parseResult?.commands?.[0]) {
      const parsedCmd = parseResult.commands[0]
      
      // Check if it's a tray execution command that can be optimized
      if (parsedCmd.signature && 
          (parsedCmd.signature.includes('TrayExecByTray') || 
           parsedCmd.signature.includes('TrayExecByTrayWithBackup')) &&
          parsedCmd.parameters) {
        
        const params = parsedCmd.parameters
        const active = params.active !== undefined ? params.active : 1
        
        if (parsedCmd.signature.includes('TrayExecByTrayWithBackup')) {
          // Handle TrayExecByTrayWithBackup optimization
          if (active === 1) {
            // Use + form
            const baseCommand = params.baseCommand || 'TrayExecByTrayWithBackup'
            const commandType = baseCommand.replace(/^\+/, '') // Remove + if present
            return `+${commandType} ${params.tray} ${params.slot} ${params.backup_tray} ${params.backup_slot}`
          } else {
            // Use explicit form
            const baseCommand = params.baseCommand || 'TrayExecByTrayWithBackup'
            const commandType = baseCommand.replace(/^\+/, '') // Remove + if present
            return `${commandType} ${active} ${params.tray} ${params.slot} ${params.backup_tray} ${params.backup_slot}`
          }
        } else {
          // Handle regular TrayExecByTray optimization
          if (active === 1) {
            // Use + form
            const baseCommand = params.baseCommand || 'TrayExecByTray'
            const commandType = baseCommand.replace(/^\+/, '') // Remove + if present
            return `+${commandType} ${params.tray} ${params.slot}`
          } else {
            // Use explicit form
            const baseCommand = params.baseCommand || 'TrayExecByTray'
            const commandType = baseCommand.replace(/^\+/, '') // Remove + if present
            return `${commandType} ${active} ${params.tray} ${params.slot}`
          }
        }
      }
    }
  } catch (error) {
    // If parsing fails, return original command
    console.warn('normalizeToOptimizedString: Failed to parse command for optimization:', commandString, error)
  }
  
  // Return original command if no optimization applied
  return commandString
}

/**
 * Convert an array of mixed commands to canonical string array
 * @param {Array|string|Object} commands - Mixed array of strings and objects, or single item
 * @returns {string[]} Array of canonical command strings
 */
export function normalizeToStringArray(commands) {
  // Handle single items (not arrays)
  if (!Array.isArray(commands)) {
    const normalized = normalizeToString(commands)
    return normalized ? [normalized] : []
  }
  
  return commands
    .map(normalizeToString)
    .filter(cmd => cmd.length > 0)
}

/**
 * Create a fallback rich object when parsing fails
 * @param {*} commandString - The command that failed to parse
 * @param {Object} i18n - Internationalization object
 * @returns {Object} Fallback rich object
 */
function createFallbackRichObject(commandString, i18n) {
  const cmdStr = String(commandString || '').trim()
  return {
    command: cmdStr,
    text: cmdStr || (i18n?.t?.('unknown_command') || 'Unknown Command'),
    displayText: cmdStr || (i18n?.t?.('unknown_command') || 'Unknown Command'),
    icon: '⚙️',
    type: 'custom',
    category: 'custom',
    parameters: {},
    signature: 'UnknownCommand()',
    baseCommand: 'Unknown',
    id: `fallback_${Date.now()}_${Math.random()}`
  }
}

/**
 * Format parameterized commands for display
 * @param {Object} commandDef - Command definition
 * @param {Object} parameters - Extracted parameters
 * @param {Object} i18n - Internationalization object
 * @returns {string} Formatted display text
 */
function formatParameterizedCommand(commandDef, parameters, i18n) {
  if (!commandDef || !parameters) {
    return commandDef?.name || 'Parameterized Command'
  }

  const { commandId, categoryId } = commandDef

  // Special formatting for known command types
  if (categoryId === 'communication' || commandId === 'communication') {
    if (parameters.verb && parameters.message) {
      return `${parameters.verb}: "${parameters.message}"`
    }
  } else if (commandId === 'tray_with_backup') {
    // Show parameters even when active is 0 (disabled) since they still convey meaning.
    if (parameters.tray !== undefined && parameters.slot !== undefined) {
      return `${commandDef.name} (${parameters.tray} ${parameters.slot} ${parameters.backup_tray ?? ''} ${parameters.backup_slot ?? ''})`
    }
  } else if (commandId === 'custom_tray') {
    if (parameters.tray !== undefined && parameters.slot !== undefined) {
      return `${commandDef.name} (${parameters.tray} ${parameters.slot})`
    }
  } else if (commandId === 'target') {
    if (parameters.entityName) {
      return `${commandDef.name}: ${parameters.entityName}`
    }
  }

  // Default formatting
  return commandDef.name || 'Parameterized Command'
}

/**
 * Get the appropriate translation key for a command
 * @param {Object} parsedCommand - Parsed command from STOCommandParser
 * @param {Object} commandDef - Command definition if available
 * @returns {string|null} Translation key or null if none found
 */
function getTranslationKey(parsedCommand, commandDef) {
  // Try command definition first
  if (commandDef?.translationKey) {
    return commandDef.translationKey
  }
  
  // Try base command
  if (parsedCommand?.baseCommand) {
    return `command.${parsedCommand.baseCommand.toLowerCase()}`
  }
  
  // Try signature-based key
  if (parsedCommand?.signature) {
    const sigName = parsedCommand.signature.split('(')[0]
    return `command.${sigName.toLowerCase()}`
  }
  
  return null
}

/**
 * Batch enrich multiple commands for display
 * @param {string[]} commandStrings - Array of canonical command strings
 * @param {Object} i18n - Internationalization object
 * @param {Object} options - Additional options
 * @returns {Promise<Object[]>} Array of rich command objects
 */
export async function enrichArrayForDisplay(commandStrings, i18n, options = {}) {
  if (!Array.isArray(commandStrings)) {
    return []
  }
  
  const promises = commandStrings.map(cmdStr => enrichForDisplay(cmdStr, i18n, options))
  return Promise.all(promises)
}

/**
 * Check if a value is a rich command object (vs a string)
 * @param {*} value - Value to check
 * @returns {boolean} True if it's a rich object
 */
export function isRichObject(value) {
  return Boolean(value && 
         typeof value === 'object' && 
         !Array.isArray(value) &&
         typeof value.command === 'string' &&
         value.command.trim().length > 0)
}

/**
 * Debug helper: Count rich objects in data structure
 * @param {*} data - Data structure to analyze
 * @returns {number} Number of rich objects found
 */
export function countRichObjects(data) {
  let count = 0
  
  function traverse(obj) {
    if (isRichObject(obj)) {
      count++
    } else if (Array.isArray(obj)) {
      obj.forEach(traverse)
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(traverse)
    }
  }
  
  traverse(data)
  return count
} 