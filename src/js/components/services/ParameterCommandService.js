import ComponentBase from '../ComponentBase.js'
import { request } from '../../core/requestResponse.js'
import eventBus from '../../core/eventBus.js'
import CommandBuilderService from './CommandBuilderService.js'

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

    // Re-use the existing builder hierarchy that already lives in the codebase
    this.commandBuilderService = new CommandBuilderService({ eventBus: bus })
    
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
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /* ------------------------------------------------------------
   * Core builder logic (verbatim from legacy file with minimal tweaks)
   * ---------------------------------------------------------- */
  /**
   * Translate a command definition + user parameters into a concrete command
   * object (or array of objects for tray ranges).
   */
  buildParameterizedCommand (categoryId, commandId, commandDef, params = {}) {
    // Use the service's own cached selected key/alias state
    const selectedKey = this.currentEnvironment === 'alias' ? this.selectedAlias : this.selectedKey

    // Per-category builder functions.  The majority of this code is lifted
    // straight from the original `parameterCommands` module.  Apart from
    // replacing the free variable `commandBuilderService` with the injected
    // `this.commandBuilderService`, no functional changes were made.
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

      tray: (p) => {
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
          const commandType = p.command_type || 'STOTrayExecByTray'

          const cmds = this.commandBuilderService.build('tray', 'tray_range', {
            start_tray: startTray,
            start_slot: startSlot,
            end_tray:   endTray,
            end_slot:   endSlot,
            command_type: commandType,
          })

          return cmds.map((cmd, idx) => {
            let trayParam, slotParam
            try {
              const parts = cmd.replace('+', '').trim().split(/\s+/)
              trayParam = parseInt(parts[1])
              slotParam = parseInt(parts[2])
            } catch (_) { /* swallow */ }

            return {
              command: cmd,
              type:    categoryId,
              icon:    commandDef.icon,
              text:    idx === 0
                ? `Execute Range: Tray ${startTray + 1} Slot ${startSlot + 1} to Tray ${endTray + 1} Slot ${endSlot + 1}`
                : cmd,
              id:         this.generateCommandId(),
              parameters: { tray: trayParam, slot: slotParam },
            }
          })
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

          const cmds = this.commandBuilderService.build('tray', 'tray_range_with_backup', {
            active,
            start_tray:  startTray,
            start_slot:  startSlot,
            end_tray:    endTray,
            end_slot:    endSlot,
            backup_start_tray: backupStartTray,
            backup_start_slot: backupStartSlot,
            backup_end_tray:   backupEndTray,
            backup_end_slot:   backupEndSlot,
          })

          return cmds.map((cmd, idx) => {
            let activeParam, primaryTray, primarySlot, backupTrayParam, backupSlotParam
            try {
              const parts = cmd.trim().split(/\s+/)
              activeParam     = parseInt(parts[1])
              primaryTray     = parseInt(parts[2])
              primarySlot     = parseInt(parts[3])
              backupTrayParam = parseInt(parts[4])
              backupSlotParam = parseInt(parts[5])
            } catch (_) { /* swallow */ }

            return {
              command: cmd,
              type:    categoryId,
              icon:    commandDef.icon,
              text:    idx === 0
                ? `Execute Range with Backup: Tray ${startTray + 1}-${endTray + 1}`
                : cmd,
              id:         this.generateCommandId(),
              parameters: {
                active:      activeParam,
                tray:        primaryTray,
                slot:        primarySlot,
                backup_tray: backupTrayParam,
                backup_slot: backupSlotParam,
              },
            }
          })
        }

        /* ----- Whole tray ------------------------------------------------- */
        if (commandId === 'whole_tray') {
          const commandType = p.command_type || 'STOTrayExecByTray'
          const cmds = this.commandBuilderService.build('tray', 'whole_tray', { tray, command_type: commandType })

          return cmds.map((cmd, idx) => {
            let slotParam
            try {
              const parts = cmd.replace('+', '').trim().split(/\s+/)
              slotParam = parseInt(parts[2])
            } catch (_) { /* swallow */ }

            return {
              command: cmd,
              type:    categoryId,
              icon:    commandDef.icon,
              text:    idx === 0 ? `Execute Whole Tray ${tray + 1}` : cmd,
              id:         this.generateCommandId(),
              parameters: { tray, slot: slotParam },
            }
          })
        }

        /* ----- Whole tray WITH backup ------------------------------------ */
        if (commandId === 'whole_tray_with_backup') {
          const active     = p.active !== undefined ? p.active : 1
          const backupTray = p.backup_tray || 0

          const cmds = this.commandBuilderService.build('tray', 'whole_tray_with_backup', { active, tray, backup_tray: backupTray })

          return cmds.map((cmd, idx) => {
            let activeParam, primaryTray, primarySlot, backupTrayParam, backupSlotParam
            try {
              const parts = cmd.trim().split(/\s+/)
              activeParam     = parseInt(parts[1])
              primaryTray     = parseInt(parts[2])
              primarySlot     = parseInt(parts[3])
              backupTrayParam = parseInt(parts[4])
              backupSlotParam = parseInt(parts[5])
            } catch (_) { /* swallow */ }

            return {
              command: cmd,
              type:    categoryId,
              icon:    commandDef.icon,
              text:    idx === 0
                ? `Execute Whole Tray ${tray + 1} (with backup Tray ${backupTray + 1})`
                : cmd,
              id:         this.generateCommandId(),
              parameters: {
                active:      activeParam,
                tray:        primaryTray,
                slot:        primarySlot,
                backup_tray: backupTrayParam,
                backup_slot: backupSlotParam,
              },
            }
          })
        }

        /* ----- Single slot / default path -------------------------------- */
        const isEditing = this.editingContext && this.editingContext.isEditing
        const commandType = p.command_type || 'STOTrayExecByTray'
        const prefix = '+'

        if (isEditing) {
          const existingCmd = this.editingContext.existingCommand
          if (existingCmd && (existingCmd.command.startsWith('TrayExecByTray') || existingCmd.command.startsWith('+TrayExecByTray'))) {
            return {
              command: `+TrayExecByTray ${tray} ${slot}`,
              text:    `Execute Tray ${tray + 1} Slot ${slot + 1}`,
            }
          }
        }

        return {
          command: `${prefix}${commandType} ${tray} ${slot}`,
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

      communication: (p) => ({
        command: `${commandDef.command} ${p.message || 'Message text here'}`,
        text:    `${commandDef.name}: ${p.message || 'Message text here'}`,
      }),

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

    const result = builder(params)
    if (!result) return null // invalid params (e.g. empty alias name)

    if (Array.isArray(result)) return result // already fully-fledged command list

    return {
      command: result.command,
      type:    categoryId,
      icon:    commandDef.icon,
      text:    result.text,
      id:      this.generateCommandId(),
      parameters: params,
    }
  }

  /* ------------------------------------------------------------
   * Auxiliary helpers
   * ---------------------------------------------------------- */
  /**
   * Attempts to find the command definition in STO_DATA for a given concrete
   * command string.  Needed when editing an existing command chain.
   */
  async findCommandDefinition (command) {
    // Special handling for tray execution commands
    if (command.command.includes('TrayExec')) {
      const trayCategory = await request(this.eventBus, 'data:get-tray-category')
      if (trayCategory) {
        if (command.command.includes('TrayExecByTrayWithBackup') && command.command.includes('$$')) {
          const trayRangeWithBackupDef = trayCategory.commands.tray_range_with_backup
          if (trayRangeWithBackupDef) {
            return { commandId: 'tray_range_with_backup', ...trayRangeWithBackupDef }
          }
        } else if ((command.command.includes('STOTrayExecByTray') || command.command.includes('TrayExecByTray')) && command.command.includes('$$') && !command.command.includes('WithBackup')) {
          const trayRangeDef = trayCategory.commands.tray_range
          if (trayRangeDef) {
            return { commandId: 'tray_range', ...trayRangeDef }
          }
        } else if (command.command.includes('TrayExecByTrayWithBackup')) {
          const trayWithBackupDef = trayCategory.commands.tray_with_backup
          if (trayWithBackupDef) {
            return { commandId: 'tray_with_backup', ...trayWithBackupDef }
          }
        } else if (command.command.includes('STOTrayExecByTray') || (command.command.includes('TrayExecByTray') && !command.command.includes('WithBackup'))) {
          const customTrayDef = trayCategory.commands.custom_tray
          if (customTrayDef) {
            return { commandId: 'custom_tray', ...customTrayDef }
          }
        }
      }
    }

    try {
      const category = await request(this.eventBus, 'data:get-command-category', { categoryId: command.type })
      if (!category) return null

      // Exact match first (non-customisable commands)
      for (const [cmdId, cmdDef] of Object.entries(category.commands)) {
        if (cmdDef.command === command.command) {
          return { commandId: cmdId, ...cmdDef }
        }
      }

      // Fallback: match by base command string (customisable commands)
      for (const [cmdId, cmdDef] of Object.entries(category.commands)) {
        if (cmdDef.customizable && command.command.startsWith(cmdDef.command.split(' ')[0])) {
          return { commandId: cmdId, ...cmdDef }
        }
      }

      return null
    } catch (error) {
      // Fallback if DataService not available
      return null
    }
  }
} 