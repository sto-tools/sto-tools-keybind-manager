/**
 * CommandFormatAdapter - Bridge between STOCommandParser output and ParameterCommandService input
 * 
 * Converts between the new rich parser format and the legacy format expected by
 * ParameterCommandService to maintain backward compatibility while leveraging
 * the enhanced parsing capabilities.
 */

export class CommandFormatAdapter {
  /**
   * Convert STOCommandParser output to ParameterCommandService input format
   * @param {Object} parsedCommand - Command from STOCommandParser
   * @returns {Object} Legacy format command object
   */
  static newToOld(parsedCommand) {
    if (!parsedCommand) return null
    
    return {
      command: parsedCommand.command,
      type: parsedCommand.category,
      parameters: parsedCommand.parameters || {},
      // Bridge additional metadata for enhanced functionality
      signature: parsedCommand.signature,
      baseCommand: parsedCommand.baseCommand,
      displayText: parsedCommand.displayText,
      icon: parsedCommand.icon,
      id: parsedCommand.id
    }
  }

  /**
   * Convert legacy format to STOCommandParser-like format (for consistency)
   * @param {Object} legacyCommand - Legacy command object
   * @returns {Object} Parser-like format command object
   */
  static oldToNew(legacyCommand) {
    if (!legacyCommand) return null
    
    return {
      command: legacyCommand.command,
      category: legacyCommand.type,
      parameters: legacyCommand.parameters || {},
      signature: legacyCommand.signature || 'Unknown()',
      baseCommand: legacyCommand.baseCommand || 'Unknown',
      displayText: legacyCommand.displayText || legacyCommand.command,
      icon: legacyCommand.icon || '⚙️',
      id: legacyCommand.id || `legacy_${Date.now()}`
    }
  }

  /**
   * Extract command string from either format
   * @param {Object} command - Command in either format
   * @returns {string} Command string
   */
  static getCommandString(command) {
    return command?.command || ''
  }

  /**
   * Extract category/type from either format
   * @param {Object} command - Command in either format  
   * @returns {string} Category string
   */
  static getCategory(command) {
    return command?.category || command?.type || 'custom'
  }

  /**
   * Extract parameters from either format
   * @param {Object} command - Command in either format
   * @returns {Object} Parameters object
   */
  static getParameters(command) {
    return command?.parameters || {}
  }

  /**
   * Check if a command has parameterized signature
   * @param {Object} command - Command in either format
   * @returns {boolean} True if command appears parameterized
   */
  static isParameterized(command) {
    const signature = command?.signature
    if (!signature) return false
    
    // Check if signature has parameters (contains parentheses with content)
    return /\(.+\)/.test(signature) && signature !== 'UnknownCommand(command: string)'
  }

  /**
   * Normalize command object to ensure consistent structure
   * @param {Object} command - Command in any format
   * @returns {Object} Normalized command object
   */
  static normalize(command) {
    if (!command) return null
    
    // If it looks like STOCommandParser output, convert to legacy format
    if (command.signature && command.category) {
      return this.newToOld(command)
    }
    
    // If it looks like legacy format, ensure all fields are present
    if (command.command && command.type) {
      return {
        command: command.command,
        type: command.type,
        parameters: command.parameters || {},
        signature: command.signature,
        baseCommand: command.baseCommand,
        displayText: command.displayText || command.command,
        icon: command.icon || '⚙️',
        id: command.id
      }
    }
    
    return command
  }
}

export default CommandFormatAdapter 