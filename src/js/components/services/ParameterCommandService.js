import ComponentBase from '../ComponentBase.js'
import { request, respond } from '../../core/requestResponse.js'
import eventBus from '../../core/eventBus.js'
import CommandFormatAdapter from '../../lib/CommandFormatAdapter.js'
import { getParameterDefinition, isEditableSignature } from '../../lib/CommandSignatureDefinitions.js'

/**
/**
 * ParameterCommandService – handles building, validating, and editing parameterized commands for keybinds.
 * Provides request/response endpoints for command construction, definition lookup,
 * and ID generation. Caches editing context for UI parameter modals.
 */
export default class ParameterCommandService extends ComponentBase {
  constructor ({ eventBus: bus = eventBus, dataService = null } = {}) {
    super(bus)
    this.componentName = 'ParameterCommandService'
    
    // Initialize cache
    this.initializeCache()

    // Cache editing state from UI events (appropriate for parameter editing)
    this.editingContext = null

    // Store detach functions for cleanup
    this._responseDetachFunctions = []

    // Register Request/Response endpoints for parameterized command operations
    if (this.eventBus) {
      this._responseDetachFunctions.push(
        this.respond('parameter-command:build', async ({ categoryId, commandId, commandDef, params }) => 
          this.buildParameterizedCommand(categoryId, commandId, commandDef, params)),
        this.respond('parameter-command:find-definition', ({ commandString }) => 
          this.findCommandDefinition(commandString)),
        this.respond('parameter-command:generate-id', () => this.generateCommandId())
      )
    }
  }

  async init() {
    super.init() // ComponentBase handles late-join automatically
    this.setupEventListeners()
  }

  onInit() {
    // Legacy method - now handled by init()
  }

  setupEventListeners() {
    // REMOVED: Selection state management now handled by SelectionService
    
    this.addEventListener('environment:changed', (data) => {
      const env = typeof data === 'string' ? data : data.environment
      if (env) this.cache.currentEnvironment = env
    })

    // Listen for parameter editing events from UI
    this.addEventListener('parameter-edit:start', (data) => {
      this.editingContext = {
        isEditing: true,
        editIndex: data.index,
        existingCommand: data.command
      }
    })

    this.addEventListener('parameter-edit:end', () => {
      this.editingContext = null
    })
  }

  // Late-join state sync
  getCurrentState() {
    return {
      editingContext: this.editingContext
    }
  }

  // Cleanup method to detach all request/response handlers
  destroy() {
    if (this._responseDetachFunctions) {
      this._responseDetachFunctions.forEach(detach => {
        if (typeof detach === 'function') {
          detach()
        }
      })
      this._responseDetachFunctions = []
    }
    
    // Call parent destroy if it exists
    if (super.destroy && typeof super.destroy === 'function') {
      super.destroy()
    }
  }

  // Helpers
  generateCommandId () {
    // Use slice to avoid deprecated String.prototype.substr
    return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  // Generate range of individual command strings for bulk operations
  generateTrayRangeCommands(baseCommand, startTray, startSlot, endTray, endSlot, active = 1) {
    const commands = []
    
    // Handle single tray case
    if (startTray === endTray) {
      for (let slot = startSlot; slot <= endSlot; slot++) {
        if (active === 1 && !baseCommand.startsWith('+')) {
          // Use + form when active=1 and baseCommand doesn't already have +
          commands.push(`+${baseCommand} ${startTray} ${slot}`)
        } else if (active === 1 && baseCommand.startsWith('+')) {
          // baseCommand already has +, use as-is
          commands.push(`${baseCommand} ${startTray} ${slot}`)
        } else {
          // Use explicit form when active=0
          const cleanCommand = baseCommand.replace(/^\+/, '')
          commands.push(`${cleanCommand} ${active} ${startTray} ${slot}`)
        }
      }
    } else {
      // Handle cross-tray range
      // Same slot on each tray from startTray to endTray
      for (let tray = startTray; tray <= endTray; tray++) {
        if (active === 1 && !baseCommand.startsWith('+')) {
          commands.push(`+${baseCommand} ${tray} ${startSlot}`)
        } else if (active === 1 && baseCommand.startsWith('+')) {
          commands.push(`${baseCommand} ${tray} ${startSlot}`)
        } else {
          const cleanCommand = baseCommand.replace(/^\+/, '')
          commands.push(`${cleanCommand} ${active} ${tray} ${startSlot}`)
        }
      }
    }
    
    return commands
  }

  // Generate whole tray command strings (all 10 slots)
  generateWholeTrayCommands(baseCommand, tray, active = 1) {
    const commands = []
    for (let slot = 0; slot <= 9; slot++) {
      if (active === 1 && !baseCommand.startsWith('+')) {
        // Use + form when active=1 and baseCommand doesn't already have +
        commands.push(`+${baseCommand} ${tray} ${slot}`)
      } else if (active === 1 && baseCommand.startsWith('+')) {
        // baseCommand already has +, use as-is
        commands.push(`${baseCommand} ${tray} ${slot}`)
      } else {
        // Use explicit form when active=0
        const cleanCommand = baseCommand.replace(/^\+/, '')
        commands.push(`${cleanCommand} ${active} ${tray} ${slot}`)
      }
    }
    return commands
  }

  // Generate range with backup commands
  generateTrayRangeWithBackupCommands(active, startTray, startSlot, endTray, endSlot, backupStartTray, backupStartSlot, backupEndTray, backupEndSlot) {
    const commands = []
    
    // Handle single tray case
    if (startTray === endTray) {
      for (let slot = startSlot; slot <= endSlot; slot++) {
        const backupSlot = backupStartSlot + (slot - startSlot)
        if (active === 1) {
          // Use + form when active=1
          commands.push(`+TrayExecByTrayWithBackup ${startTray} ${slot} ${backupStartTray} ${backupSlot}`)
        } else {
          // Use explicit form when active=0
          commands.push(`TrayExecByTrayWithBackup ${active} ${startTray} ${slot} ${backupStartTray} ${backupSlot}`)
        }
      }
    } else {
      // Handle cross-tray range (same slot on each tray)
      for (let tray = startTray; tray <= endTray; tray++) {
        const backupTray = backupStartTray + (tray - startTray)
        if (active === 1) {
          commands.push(`+TrayExecByTrayWithBackup ${tray} ${startSlot} ${backupTray} ${backupStartSlot}`)
        } else {
          commands.push(`TrayExecByTrayWithBackup ${active} ${tray} ${startSlot} ${backupTray} ${backupStartSlot}`)
        }
      }
    }
    
    return commands
  }

  // Generate whole tray with backup commands
  generateWholeTrayWithBackupCommands(active, tray, backupTray) {
    const commands = []
    for (let slot = 0; slot <= 9; slot++) {
      if (active === 1) {
        // Use + form when active=1
        commands.push(`+TrayExecByTrayWithBackup ${tray} ${slot} ${backupTray} ${slot}`)
      } else {
        // Use explicit form when active=0
        commands.push(`TrayExecByTrayWithBackup ${active} ${tray} ${slot} ${backupTray} ${slot}`)
      }
    }
    return commands
  }

  // Parse command strings through STOCommandParser for consistent format
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

  // Core builder logic (verbatim from legacy file with minimal tweaks)
  // Translate a command definition + user parameters into a concrete command
  // object (or array of objects for tray ranges).
  async buildParameterizedCommand (categoryId, commandId, commandDef, params = {}) {
    // Per-category builder functions. Refactored to use STOCommandParser 
    // as single source of truth instead of CommandBuilderService.
    const builders = {
      targeting: (p) => {
        // Handle both legacy data.js format (commandId: 'target') and signature-based format (commandId: 'target_entity')
        if ((commandId === 'target' || commandId === 'target_entity') && p.entityName) {
          return {
            command: `Target "${p.entityName}"`,
            text: `Target: ${p.entityName}`,
          }
        }
        // Ensure command is always a string, even if commandDef.command is malformed
        const commandString = typeof commandDef.command === 'string' ? commandDef.command : 'Target'
        return { command: commandString, text: commandDef.name }
      },

      tray: async (p) => {
        const tray = p.tray || 0
        const slot = p.slot || 0
        const active = p.active !== undefined ? p.active : 1 // Default to active=1

        if (commandId === 'tray_with_backup') {
          const backupTray = p.backup_tray || 0
          const backupSlot = p.backup_slot || 0

          // Normalize based on active parameter
          if (active === 1) {
            // Use + form when active=1
            return {
              command: `+TrayExecByTrayWithBackup ${tray} ${slot} ${backupTray} ${backupSlot}`,
              text:    `Execute Tray ${tray + 1} Slot ${slot + 1} (backup: Tray ${backupTray + 1} Slot ${backupSlot + 1})`,
            }
          } else {
            // Use explicit form when active=0
            return {
              command: `TrayExecByTrayWithBackup ${active} ${tray} ${slot} ${backupTray} ${backupSlot}`,
              text:    `Execute Tray ${tray + 1} Slot ${slot + 1} (backup: Tray ${backupTray + 1} Slot ${backupSlot + 1})`,
            }
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
            const commandType = p.command_type || 'STOTrayExecByTray'
            // Normalize based on active parameter
            if (active === 1) {
              baseCommand = `+${commandType}`
            } else {
              baseCommand = commandType
            }
          }

          // Generate individual command strings, then parse through STOCommandParser for consistent format
          const commandStrings = this.generateTrayRangeCommands(baseCommand, startTray, startSlot, endTray, endSlot, active)
          return await this.parseCommandsToObjects(commandStrings)
        }

        /* ----- Tray range WITH backup ------------------------------------ */
        if (commandId === 'tray_range_with_backup') {
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
            const commandType = p.command_type || 'STOTrayExecByTray'
            // Normalize based on active parameter
            if (active === 1) {
              baseCommand = `+${commandType}`
            } else {
              baseCommand = commandType
            }
          }
          
          // Generate individual command strings, then parse through STOCommandParser for consistent format
          const commandStrings = this.generateWholeTrayCommands(baseCommand, tray, active)
          return await this.parseCommandsToObjects(commandStrings)
        }

        /* ----- Whole tray WITH backup ------------------------------------ */
        if (commandId === 'whole_tray_with_backup') {
          const backupTray = p.backup_tray || 0

          // Generate individual command strings, then parse through STOCommandParser for consistent format
          const commandStrings = this.generateWholeTrayWithBackupCommands(active, tray, backupTray)
          return await this.parseCommandsToObjects(commandStrings)
        }

        /* ----- Single slot / default path -------------------------------- */
        const isEditing = this.editingContext && this.editingContext.isEditing
        
        // Determine command type
        let commandType
        if (commandDef.baseCommand) {
          // Extract command type from baseCommand (remove + if present)
          commandType = commandDef.baseCommand.replace(/^\+/, '')
        } else if (p.baseCommand) {
          // Extract command type from baseCommand parameter
          commandType = p.baseCommand.replace(/^\+/, '')
        } else if (p.command_type) {
          commandType = p.command_type
        } else {
          commandType = 'STOTrayExecByTray' // Default fallback
        }

        // Normalize output based on active parameter
        let finalCommand
        if (active === 1) {
          // Use + form when active=1
          finalCommand = `+${commandType} ${tray} ${slot}`
        } else {
          // Use explicit form when active=0
          finalCommand = `${commandType} ${active} ${tray} ${slot}`
        }

        return {
          command: finalCommand,
          text:    `Execute Tray ${tray + 1} Slot ${slot + 1}`,
          parameters: { active, tray, slot },
        }
      },

      /* ------------------------------------------------------------------ */
      movement: (p) => {
        let cmd = commandDef.command
        if (commandId === 'throttle_adjust' && p.amount !== undefined) {
          // Handle case where commandDef.command might be undefined
          const baseCmd = cmd || 'ThrottleAdjust'
          cmd = `${baseCmd} ${p.amount}`
        } else if (commandId === 'throttle_set' && p.position !== undefined) {
          // Handle case where commandDef.command might be undefined
          const baseCmd = cmd || 'ThrottleSet'
          cmd = `${baseCmd} ${p.position}`
        }
        // Ensure cmd is always a string, even if commandDef.command was undefined
        const finalCmd = cmd || commandDef.name || 'Movement Command'
        return { command: finalCmd, text: commandDef.name }
      },

      camera: (p) => {
        let cmd = commandDef.command
        if (commandId === 'cam_distance' && p.distance !== undefined) {
          // Handle case where commandDef.command might be undefined
          const baseCmd = cmd || 'camdist'
          cmd = `${baseCmd} ${p.distance}`
        }
        // Ensure cmd is always a string, even if commandDef.command was undefined
        const finalCmd = cmd || commandDef.name || 'Camera Command'
        return { command: finalCmd, text: commandDef.name }
      },

      custom: (p) => {
        // Handle custom raw command input
        const rawCommand = p.rawCommand || ''
        if (!rawCommand.trim()) {
          // Throw a translation key so UI layers can translate appropriately
          throw new Error('please_enter_a_raw_command')
        }
        
        return {
          command: rawCommand.trim(),
          text: `Custom: ${rawCommand.trim()}`,
          type: 'custom',
          category: 'custom'
        }
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
            // Use correct spelling first
            command: `dynFxSetFXExclusionList ${effects}`,
            text: `VFX Exclude: ${effects}`
          }
        } else if (commandId === 'vfx_exclusion_alias') {
          const aliasName = p.aliasName || ''
          return {
            // Use correct spelling for alias command
            command: `dynFxSetFXExclusionList_${aliasName}`,
            text: `VFX Alias: ${aliasName}`
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
          // Handle case where commandDef.command might be undefined
          const baseCmd = cmd || (commandId === 'bind_save_file' ? 'bind_save_file' : 'bind_load_file')
          cmd = `${baseCmd} ${p.filename}`
        } else if (commandId === 'combat_log' && p.state !== undefined) {
          // Handle case where commandDef.command might be undefined
          const baseCmd = cmd || 'CombatLog'
          cmd = `${baseCmd} ${p.state}`
        } else if (commandId === 'ui_remember_positions' && p.state !== undefined) {
          // Handle Remember UI Positions command
          const baseCmd = cmd || 'UIRememberPositions'
          cmd = `${baseCmd} ${p.state}`
        } else if (commandId === 'chat_log' && p.state !== undefined) {
          // Handle Chat Log command
          const baseCmd = cmd || 'ChatLog'
          cmd = `${baseCmd} ${p.state}`
        } else if (commandId === 'ui_tooltip_delay' && p.seconds !== undefined) {
          // Handle UI Tooltip Delay command
          const baseCmd = cmd || 'ui_TooltipDelay'
          cmd = `${baseCmd} ${p.seconds}`
        } else if (commandId === 'remember_ui_lists' && p.state !== undefined) {
          // Handle Remember UI Lists command
          const baseCmd = cmd || 'RememberUILists'
          cmd = `${baseCmd} ${p.state}`
        } else if (commandId === 'safe_login' && p.state !== undefined) {
          // Handle Safe Login command
          const baseCmd = cmd || 'SafeLogin'
          cmd = `${baseCmd} ${p.state}`
        } else if (commandId === 'net_timing_graph' && p.state !== undefined) {
          // Handle Net Timing Graph command
          const baseCmd = cmd || 'netTimingGraph'
          cmd = `${baseCmd} ${p.state}`
        } else if (commandId === 'net_timing_graph_alpha' && p.alpha !== undefined) {
          // Handle Net Timing Graph Alpha command
          const baseCmd = cmd || 'netTimingGraphAlpha'
          cmd = `${baseCmd} ${p.alpha}`
        } else if (commandId === 'net_timing_graph_paused' && p.state !== undefined) {
          // Handle Net Timing Graph Paused command
          const baseCmd = cmd || 'netTimingGraphPaused'
          cmd = `${baseCmd} ${p.state}`
        } else if (commandId === 'netgraph' && p.state !== undefined) {
          // Handle Net Graph command
          const baseCmd = cmd || 'netgraph'
          cmd = `${baseCmd} ${p.state}`
        } else if (commandId === 'ui_load_file' && p.filename) {
          // Handle UI Load File command
          const baseCmd = cmd || 'ui_load_file'
          cmd = `${baseCmd} ${p.filename}`
        } else if (commandId === 'ui_save_file' && p.filename) {
          // Handle UI Save File command
          const baseCmd = cmd || 'ui_save_file'
          cmd = `${baseCmd} ${p.filename}`
        }
        // Ensure cmd is always a string, even if commandDef.command was undefined
        const finalCmd = cmd || commandDef.name || 'System Command'
        return { command: finalCmd, text: commandDef.name }
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

      // Bridge officer commands (previously missing)
      bridge_officer: (p) => {
        if (commandId === 'assist' && p.name) {
          return {
            command: `Assist "${p.name}"`,
            text: `Assist: ${p.name}`
          }
        } else if (commandId === 'assist') {
          // Assist without a name targets current selection
          return {
            command: 'Assist',
            text: 'Assist Current Target'
          }
        }
        // For other bridge officer commands, use the base command
        return { command: commandDef.command, text: commandDef.name }
      },

      // Cosmetic commands (previously missing)  
      cosmetic: (p) => {
        if (commandId === 'setactivecostume' && p.modifier1 && p.modifier2) {
          return {
            command: `${commandDef.command} ${p.modifier1} ${p.modifier2}`,
            text: `Set Costume: ${p.modifier1} ${p.modifier2}`
          }
        }
        // For other cosmetic commands, use the base command
        return { command: commandDef.command, text: commandDef.name }
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
      parameters: result.parameters || params, // Use builder's parameters if available, otherwise fall back to input params
    }
  }

  // Auxiliary helpers
  // Attempts to find the command definition for a given command using STOCommandParser.
  // This replaces the old DataService-dependent logic with signature-based recognition.
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