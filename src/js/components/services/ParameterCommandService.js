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

  /**
   * Generate whole tray command strings (all 10 slots)
   */
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

  /**
   * Generate range with backup commands
   */
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

  /**
   * Generate whole tray with backup commands
   */
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
        // Always use commandId 'target_entity' for this builder
        if (commandId === 'target_entity') {
          const entity = p.entityName || ''
          const cmdStr = `${commandDef.command || 'Target'} "${entity}"`
          return {
            command: cmdStr,
            text: `Target "${entity}"`,
          }
        }
        // Generic handling for other targeting commands (e.g. Assist)
        if (commandDef.customizable && commandDef.parameters) {
          const paramVals = []
          Object.keys(commandDef.parameters).forEach(key => {
            const val = p[key]
            if (val !== undefined && val !== '') {
              if (typeof val === 'string') {
                paramVals.push(`"${val}"`)
              } else {
                paramVals.push(val)
              }
            }
          })
          const cmdStr = [commandDef.command, ...paramVals].join(' ').trim()
          return {
            command: cmdStr,
            text: `${commandDef.name}: ${paramVals.join(' ')}`.trim(),
          }
        }

        // Fallback – return base command string if available
        return { command: commandDef.command, text: commandDef.name }
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

        // Generic parameter concatenation for customizable system commands
        if (commandDef.customizable && commandDef.parameters) {
          const paramVals = []
          Object.keys(commandDef.parameters).forEach(key => {
            const val = p[key]
            if (val !== undefined && val !== '') paramVals.push(val)
          })
          if (paramVals.length) cmd = `${commandDef.command} ${paramVals.join(' ')}`
        } else if ((commandId === 'bind_save_file' || commandId === 'bind_load_file') && p.filename) {
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

    const builder = builders[categoryId] || (() => ({ command: commandDef.command }))
    let result = await builder(params)

    // -------- Generic fallback ----------
    if (commandDef.customizable) {
      const ensureString = (res) => {
        if (!res) return res
        if (Array.isArray(res)) return res.map(ensureString)
        if (typeof res === 'string') return { command: res }
        if (typeof res.command === 'string' && res.command.trim() !== '') return res

        // Build command string from params if missing
        const parts = [commandDef.command]
        Object.keys(commandDef.parameters || {}).forEach(key => {
          const val = params[key]
          if (val !== undefined && val !== '') {
            parts.push(typeof val === 'string' ? `"${val}"` : val)
          }
        })
        res.command = parts.join(' ').trim()
        return res
      }
      result = ensureString(result)
    }

    return result
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