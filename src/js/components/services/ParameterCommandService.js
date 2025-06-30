import ComponentBase from '../ComponentBase.js'
import { request } from '../../core/requestResponse.js'
import eventBus from '../../core/eventBus.js'
import CommandFormatAdapter from '../../lib/CommandFormatAdapter.js'
import { getParameterDefinition, isEditableSignature } from '../../lib/CommandSignatureDefinitions.js'

/**
 * ParameterCommandService – contains the heavy business logic that was
 * previously mixed into the large `parameterCommands` feature module.
 *
 * Responsibilities (initial extraction):
 * • generateCommandId – centralised id helper (pure logic)
 * • buildParameterizedCommand – creates concrete command objects/arrays
 *   from a command definition + parameter set.
 * • findCommandDefinition – attempts to resolve a command definition from
 *   an existing command string for editing purposes.
 *
 * This service follows the project's broadcast/cache pattern:
 * • Listens for state changes via events (key-selected, alias-selected, environment:changed)
 * • Caches state locally for business logic use
 * • Provides late-join state sync for components that initialize after state is set
 * • Only uses request/response for actions, not state access
 */
export default class ParameterCommandService extends ComponentBase {
  constructor ({ eventBus: bus = eventBus, dataService = null } = {}) {
    super(bus)
    this.componentName = 'ParameterCommandService'
    
    // Cache selected key/alias state
    this.selectedKey = null
    this.selectedAlias = null
    this.currentEnvironment = 'space'

    // Cache editing state from UI events
    this.editingContext = null

    // Note: No request/response handlers for state access - we follow broadcast/cache pattern
  }

  onInit() {
    // Listen for key/alias selection events to maintain our own state
    this.addEventListener('key-selected', (data) => {
      this.selectedKey = data.key || data.name
      this.selectedAlias = null // Clear alias when key is selected
    })
    
    this.addEventListener('alias-selected', (data) => {
      this.selectedAlias = data.name
      this.selectedKey = null // Clear key when alias is selected
    })
    
    this.addEventListener('environment:changed', (data) => {
      const env = typeof data === 'string' ? data : data.environment
      if (env) this.currentEnvironment = env
    })

    // Listen for parameter editing events from UI
    this.addEventListener('parameter-edit:start', (data) => {
      this.editingContext = {
        isEditing: true,
        editIndex: data.index,
        selectedKey: data.key,
        existingCommand: data.command
      }
    })

    this.addEventListener('parameter-edit:end', () => {
      this.editingContext = null
    })
  }

  /* ------------------------------------------------------------
   * Late-join state sync
   * ---------------------------------------------------------- */
  getCurrentState() {
    return {
      selectedKey: this.selectedKey,
      selectedAlias: this.selectedAlias,
      currentEnvironment: this.currentEnvironment,
      editingContext: this.editingContext
    }
  }

  handleInitialState(sender, state) {
    if (!state) return
    
    // Sync with other services that manage selection state
    if (state.selectedKey !== undefined) {
      this.selectedKey = state.selectedKey
    }
    if (state.selectedAlias !== undefined) {
      this.selectedAlias = state.selectedAlias  
    }
    if (state.currentEnvironment !== undefined) {
      this.currentEnvironment = state.currentEnvironment
    }
    if (state.editingContext !== undefined) {
      this.editingContext = state.editingContext
    }
  }

  /* ------------------------------------------------------------
   * Helpers
   * ---------------------------------------------------------- */
  generateCommandId () {
    // Use slice to avoid deprecated String.prototype.substr
    return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  /**
   * Generate range of individual command strings for bulk operations
   */
  generateTrayRangeCommands(baseCommand, startTray, startSlot, endTray, endSlot) {
    const commands = []
    
    for (let tray = startTray; tray <= endTray; tray++) {
      const maxSlot = (tray === endTray) ? endSlot : 9 // Assume 10 slots per tray (0-9)
      const minSlot = (tray === startTray) ? startSlot : 0
      
      for (let slot = minSlot; slot <= maxSlot; slot++) {
        commands.push(`+${baseCommand} ${tray} ${slot}`)
      }
    }
    
    return commands
  }

  /**
   * Generate whole tray command strings (all 10 slots)
   */
  generateWholeTrayCommands(baseCommand, tray) {
    const commands = []
    for (let slot = 0; slot <= 9; slot++) {
      commands.push(`+${baseCommand} ${tray} ${slot}`)
    }
    return commands
  }

  /**
   * Generate backup tray range commands
   */
  generateTrayRangeWithBackupCommands(active, startTray, startSlot, endTray, endSlot, backupStartTray, backupStartSlot, backupEndTray, backupEndSlot) {
    const commands = []
    
    for (let tray = startTray; tray <= endTray; tray++) {
      const maxSlot = (tray === endTray) ? endSlot : 9
      const minSlot = (tray === startTray) ? startSlot : 0
      
      for (let slot = minSlot; slot <= maxSlot; slot++) {
        // Calculate corresponding backup position
        const backupTray = backupStartTray + (tray - startTray)
        const backupSlot = backupStartSlot + (slot - startSlot)
        commands.push(`TrayExecByTrayWithBackup ${active} ${tray} ${slot} ${backupTray} ${backupSlot}`)
      }
    }
    
    return commands
  }

  /**
   * Generate whole tray with backup commands
   */
  generateWholeTrayWithBackupCommands(active, tray, backupTray) {
    const commands = []
    for (let slot = 0; slot <= 9; slot++) {
      commands.push(`TrayExecByTrayWithBackup ${active} ${tray} ${slot} ${backupTray} ${slot}`)
    }
    return commands
  }

  /**
   * Parse command strings through STOCommandParser for consistent format
   */
  async parseCommandsToObjects(commandStrings) {
    const parsePromises = commandStrings.map(async cmdStr => {
      try {
        const result = await this.request('parser:parse-command-string', { commandString: cmdStr })
        if (result.commands && result.commands.length > 0) {
          return result.commands[0] // Take first match
        }
      } catch (error) {
        console.warn('Failed to parse command:', cmdStr, error)
      }
      
      // Fallback if parser doesn't recognize command
      return {
        command: cmdStr,
        category: 'tray',
        displayText: cmdStr,
        id: this.generateCommandId(),
        parameters: {}
      }
    })
    
    return Promise.all(parsePromises)
  }

  /* ------------------------------------------------------------
   * Core builder logic (verbatim from legacy file with minimal tweaks)
   * ---------------------------------------------------------- */
  /**
   * Translate a command definition + user parameters into a concrete command
   * object (or array of objects for tray ranges).
   */
  async buildParameterizedCommand (categoryId, commandId, commandDef, params = {}) {
    // Use the service's own cached selected key/alias state
    const selectedKey = this.currentEnvironment === 'alias' ? this.selectedAlias : this.selectedKey

    // Per-category builder functions. Refactored to use STOCommandParser 
    // as single source of truth instead of CommandBuilderService.
    const builders = {
      targeting: (p) => {
        if (commandId === 'target' && p.entityName) {
          return {
            command: `${commandDef.command} "${p.entityName}"`,
            text: `Target: ${p.entityName}`,
          }
        }
        return { command: commandDef.command, text: commandDef.name }
      },

      tray: async (p) => {
        const tray = p.tray || 0
        const slot = p.slot || 0

        if (commandId === 'tray_with_backup') {
          const active     = p.active !== undefined ? p.active : 1
          const backupTray = p.backup_tray || 0
          const backupSlot = p.backup_slot || 0

          return {
            command: `TrayExecByTrayWithBackup ${active} ${tray} ${slot} ${backupTray} ${backupSlot}`,
            text:    `Execute Tray ${tray + 1} Slot ${slot + 1} (backup: Tray ${backupTray + 1} Slot ${backupSlot + 1})`,
          }
        }

        /* ----- Tray range ------------------------------------------------- */
        if (commandId === 'tray_range') {
          const startTray   = p.start_tray  || 0
          const startSlot   = p.start_slot  || 0
          const endTray     = p.end_tray    || 0
          const endSlot     = p.end_slot    || 0
          
          // Preserve original command format from baseCommand or use command_type parameter
          let baseCommand
          if (commandDef.baseCommand) {
            baseCommand = commandDef.baseCommand
          } else if (p.baseCommand) {
            baseCommand = p.baseCommand
          } else {
            baseCommand = p.command_type || '+STOTrayExecByTray'
          }

          // Generate individual command strings, then parse through STOCommandParser for consistent format
          const commandStrings = this.generateTrayRangeCommands(baseCommand, startTray, startSlot, endTray, endSlot)
          return await this.parseCommandsToObjects(commandStrings)
        }

        /* ----- Tray range WITH backup ------------------------------------ */
        if (commandId === 'tray_range_with_backup') {
          const active            = p.active !== undefined ? p.active : 1
          const startTray         = p.start_tray        || 0
          const startSlot         = p.start_slot        || 0
          const endTray           = p.end_tray          || 0
          const endSlot           = p.end_slot          || 0
          const backupStartTray   = p.backup_start_tray || 0
          const backupStartSlot   = p.backup_start_slot || 0
          const backupEndTray     = p.backup_end_tray   || 0
          const backupEndSlot     = p.backup_end_slot   || 0

          // Generate individual command strings, then parse through STOCommandParser for consistent format
          const commandStrings = this.generateTrayRangeWithBackupCommands(
            active, startTray, startSlot, endTray, endSlot,
            backupStartTray, backupStartSlot, backupEndTray, backupEndSlot
          )
          return await this.parseCommandsToObjects(commandStrings)
        }

        /* ----- Whole tray ------------------------------------------------- */
        if (commandId === 'whole_tray') {
          // Preserve original command format from baseCommand or use command_type parameter
          let baseCommand
          if (commandDef.baseCommand) {
            baseCommand = commandDef.baseCommand
          } else if (p.baseCommand) {
            baseCommand = p.baseCommand
          } else {
            baseCommand = p.command_type || '+STOTrayExecByTray'
          }
          
          // Generate individual command strings, then parse through STOCommandParser for consistent format
          const commandStrings = this.generateWholeTrayCommands(baseCommand, tray)
          return await this.parseCommandsToObjects(commandStrings)
        }

        /* ----- Whole tray WITH backup ------------------------------------ */
        if (commandId === 'whole_tray_with_backup') {
          const active     = p.active !== undefined ? p.active : 1
          const backupTray = p.backup_tray || 0

          // Generate individual command strings, then parse through STOCommandParser for consistent format
          const commandStrings = this.generateWholeTrayWithBackupCommands(active, tray, backupTray)
          return await this.parseCommandsToObjects(commandStrings)
        }

        /* ----- Single slot / default path -------------------------------- */
        const isEditing = this.editingContext && this.editingContext.isEditing
        
        // Preserve original command format from baseCommand or use command_type parameter
        let finalCommand
        if (commandDef.baseCommand) {
          // Use the original baseCommand preserved from parsing
          finalCommand = `${commandDef.baseCommand} ${tray} ${slot}`
        } else if (p.baseCommand) {
          // Use baseCommand from current parameters
          finalCommand = `${p.baseCommand} ${tray} ${slot}`
        } else if (p.command_type) {
          // Use explicit command_type parameter (with + prefix if it doesn't already have one)
          const commandType = p.command_type
          const prefix = commandType.startsWith('+') ? '' : '+'
          finalCommand = `${prefix}${commandType} ${tray} ${slot}`
        } else {
          // Default fallback
          finalCommand = `+STOTrayExecByTray ${tray} ${slot}`
        }

        if (isEditing) {
          const existingCmd = this.editingContext.existingCommand
          if (existingCmd && (existingCmd.command.startsWith('TrayExecByTray') || existingCmd.command.startsWith('+TrayExecByTray'))) {
            // Preserve the original command format when editing
            if (commandDef.baseCommand) {
              finalCommand = `${commandDef.baseCommand} ${tray} ${slot}`
            } else if (p.baseCommand) {
              finalCommand = `${p.baseCommand} ${tray} ${slot}`
            } else {
              finalCommand = `+TrayExecByTray ${tray} ${slot}`
            }
          }
        }

        return {
          command: finalCommand,
          text:    `Execute Tray ${tray + 1} Slot ${slot + 1}`,
          parameters: { tray, slot },
        }
      },

      /* ------------------------------------------------------------------ */
      movement: (p) => {
        let cmd = commandDef.command
        if (commandId === 'throttle_adjust' && p.amount !== undefined) {
          cmd = `${commandDef.command} ${p.amount}`
        } else if (commandId === 'throttle_set' && p.position !== undefined) {
          cmd = `${commandDef.command} ${p.position}`
        }
        return { command: cmd, text: commandDef.name }
      },

      camera: (p) => {
        let cmd = commandDef.command
        if (commandId === 'cam_distance' && p.distance !== undefined) {
          cmd = `${commandDef.command} ${p.distance}`
        }
        return { command: cmd, text: commandDef.name }
      },

      communication: (p) => {
        /*
         * If the user is editing a predefined communication command such as
         * "Team Message" or "Zone Message", the parameter modal only exposes
         * the message input – the verb (team/zone/say) is implicit in the
         * selected command definition.  When the verb parameter is therefore
         * **missing** we should fall back to the verb contained in the
         * command definition instead of unconditionally defaulting to "say".
         */
        const fallbackVerb = (commandDef && commandDef.command) ? commandDef.command : 'say'
        const verb    = p.verb || fallbackVerb
        const message = p.message || 'Message text here'

        const command = `${verb} "${message}"`
        return {
          command,
          text: `${verb}: "${message}"`
        }
      },

      vfx: (p) => {
        if (commandId === 'vfx_exclusion') {
          const effects = p.effects || ''
          return {
            command: `dynFxSetFXExlusionList ${effects}`,
            text: `VFX Exclude: ${effects}`
          }
        } else if (commandId === 'vfx_exclusion_alias') {
          const aliasName = p.aliasName || ''
          return {
            command: `dynFxSetFXExlusionList_${aliasName}`,
            text: `VFX Alias: ${aliasName}`
          }
        }
        return { command: commandDef.command, text: commandDef.name }
      },

      targeting: (p) => {
        if (commandId === 'target_entity') {
          const entityName = p.entityName || ''
          return {
            command: `Target "${entityName}"`,
            text: `Target "${entityName}"`
          }
        }
        return { command: commandDef.command, text: commandDef.name }
      },

      power: (p) => {
        if (commandId === 'power_exec') {
          const powerName = p.powerName || ''
          return {
            command: `+power_exec ${powerName}`,
            text: `Power: ${powerName}`
          }
        }
        return { command: commandDef.command, text: commandDef.name }
      },

      combat: (p) => {
        // Static combat commands don't have editable parameters
        const commandName = p.commandName || commandDef.command
        return { command: commandName, text: commandDef.name }
      },

      system: (p) => {
        let cmd = commandDef.command
        if ((commandId === 'bind_save_file' || commandId === 'bind_load_file') && p.filename) {
          cmd = `${commandDef.command} ${p.filename}`
        } else if (commandId === 'combat_log' && p.state !== undefined) {
          cmd = `${commandDef.command} ${p.state}`
        }
        return { command: cmd, text: commandDef.name }
      },

      /*
       * Alias builder – simply returns the alias name entered by the user.
       * Mirrors the original behaviour so that parameter editing works
       * consistently.
       */
      alias: (p) => {
        const aliasName = p.alias_name?.trim() || ''
        if (!aliasName) return null // caller handles validation feedback
        return { command: aliasName, text: `Alias: ${aliasName}` }
      },
    }

    const builder = builders[categoryId]
    if (!builder) return null

    const result = await builder(params)
    if (!result) return null // invalid params (e.g. empty alias name)

    if (Array.isArray(result)) return result // already fully-fledged command list

    return {
      command: result.command,
      type:    categoryId,
      icon:    commandDef.icon,
      displayText: result.text,
      id:      this.generateCommandId(),
      parameters: params,
    }
  }

  /* ------------------------------------------------------------
   * Auxiliary helpers
   * ---------------------------------------------------------- */
  /**
   * Attempts to find the command definition for a given command using STOCommandParser.
   * This replaces the old DataService-dependent logic with signature-based recognition.
   */
  async findCommandDefinition (command) {
    try {
      // Normalize command to consistent format
      const normalizedCommand = CommandFormatAdapter.normalize(command)
      if (!normalizedCommand) return null

      // Use STOCommandParser to re-parse and get signature
      const parseResult = await this.request('parser:parse-command-string', {
        commandString: normalizedCommand.command
      })

      if (!parseResult?.commands?.[0]) {
        return null
      }

      const parsedCommand = parseResult.commands[0]
      
      // Check if this signature has a parameter definition
      const parameterDefinition = getParameterDefinition(parsedCommand.signature)
      if (!parameterDefinition) {
        return null
      }

      // Only return definition if it has editable parameters
      if (!isEditableSignature(parsedCommand.signature)) {
        return null
      }

      // Merge the signature-based definition with the parsed command data
      // Flatten extracted parameters to the top level for UI convenience
      return {
        commandId: parameterDefinition.commandId,
        categoryId: parameterDefinition.category,
        name: parameterDefinition.name,
        description: parameterDefinition.description,
        icon: parameterDefinition.icon,
        category: parameterDefinition.category,
        parameters: parameterDefinition.parameters,
        // Include parsed metadata for context
        signature: parsedCommand.signature,
        baseCommand: parsedCommand.baseCommand,
        extractedParameters: parsedCommand.parameters,
        // Flatten extracted parameters to top level for easy access
        ...parsedCommand.parameters
      }
    } catch (error) {
      console.warn('[ParameterCommandService] Error finding command definition:', error)
      return null
    }
  }
} 