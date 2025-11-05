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
   * Extract command string from either format
   * @param {Object} command - Command in either format
   * @returns {string} Command string
   */
  static getCommandString(command) {
    return command?.command || ''
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