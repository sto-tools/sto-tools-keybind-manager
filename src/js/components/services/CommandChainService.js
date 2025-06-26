import ComponentBase from '../ComponentBase.js'
import { parameterCommands } from '../ui/ParameterCommandUI.js'
import eventBus from '../../core/eventBus.js'

/**
 * CommandChainService – owns the data for the command-chain editor (the pane
 * inside .command-chain-container).  The single source of truth for chain operations.
 */
export default class CommandChainService extends ComponentBase {
  constructor ({ i18n, commandLibraryService, commandService = null } = {}) {
    super(eventBus)
    this.i18n = i18n
    this.currentEnvironment = 'space'
    this.selectedKey = null
    this.commands = [] // array of command objects

    // Underlying authoritative service (legacy)
    this.commandLibraryService = commandLibraryService || null
    // New central service
    this.commandService = commandService
  }

  onInit () {
    this.setupEventListeners()
  }

  setupEventListeners () {
    const debugLog = (label, payload) => {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[CommandChainService] ${label}`, payload)
      }
    }

    // Receive broadcasts from existing components
    this.addEventListener('command-chain:update', (payload = {}) => {
      debugLog('command-chain:update', payload)
      const { commands, selectedKey, environment } = payload

      this.commands = Array.isArray(commands) ? commands : []

      // Sync key/environment either from payload or authoritative service
      if (selectedKey !== undefined) this.selectedKey = selectedKey
      if (environment !== undefined) this.currentEnvironment = environment

      const svcInit = this.commandService || this.commandLibraryService
      if (svcInit) {
        this.selectedKey = this.selectedKey || svcInit.selectedKey
        this.currentEnvironment = this.currentEnvironment || svcInit.currentEnvironment
      }

      // forward to UI listeners that might care
      this.emit('chain-data-changed', { commands: this.commands })
    })

    // Keep environment/key in sync – other components should emit these.
    this.addEventListener('command-chain:select', ({ key, environment }) => {
      this.selectedKey = key
      if (environment) this.currentEnvironment = environment
    })

    this.addEventListener('environment:changed', (data) => {
      debugLog('environment:changed', data)
      const env = typeof data === 'string' ? data : data?.environment
      if (env) {
        this.currentEnvironment = env
        this.selectedKey = null  // Clear selection when environment changes
        this.commands = []
        this.emit('chain-data-changed', { commands: this.commands })
      }
    })

    // Maintain selected alias/key in sync with higher-level services so that
    // the command-chain UI always knows what it should be displaying.
    this.addEventListener('key-selected', ({ key, name }) => {
      debugLog('key-selected', { key, name })
      this.selectedKey = key || name || null

      // Refresh commands list when a new key is selected
      const cmds = this.getCommandsForSelectedKey()
      this.emit('chain-data-changed', { commands: cmds })
    })

    // Handle alias selections explicitly so environment switches to alias
    this.addEventListener('alias-selected', ({ name }) => {
      if (!name) return
      this.currentEnvironment = 'alias'
      this.selectedKey = name

      const cmds = this.getCommandsForSelectedKey()
      this.emit('chain-data-changed', { commands: cmds })
    })

    // Listen for command additions from CommandService (for static commands)
    this.addEventListener('command-added', ({ key, command }) => {
      // Update chain data when a command is added
      const cmds = this.getCommandsForSelectedKey()
      this.emit('chain-data-changed', { commands: cmds })
    })

    // Handle add-command requests from AliasModalService (legacy support)
    this.addEventListener('commandlibrary:add', (payload = {}) => {
      const { categoryId, commandId, commandObj } = payload
      if (!categoryId || !commandId) return
      const svc = this.commandLibraryService || this.commandService
      if (!svc) return

      // Ensure alias environment sync if necessary
      if (this.currentEnvironment === 'alias') {
        svc.currentEnvironment = 'alias'
      }

      // Only handle commandObj case (from AliasModalService)
      if (commandObj && this.selectedKey) {
        const before = this.getCommandsForSelectedKey()
        const success = svc.addCommand(this.selectedKey, commandObj)
        if (success) {
          const after = this.getCommandsForSelectedKey()
          if (after.length !== before.length) {
            this.emit('chain-data-changed', { commands: after })
          }
        }
      }
    })

    // Handle new command:add event from refactored UI
    this.addEventListener('command:add', (payload = {}) => {
      const { categoryId, commandId, commandDef } = payload
      const svc = this.commandLibraryService || this.commandService
      if (!svc) return

      // Ensure alias environment sync if necessary
      if (this.currentEnvironment === 'alias') {
        svc.currentEnvironment = 'alias'
      }

      // Only handle customizable commands - static commands are handled by CommandUI
      if (categoryId && commandId && commandDef) {
        // Customizable command - delegate directly to parameterCommands
        if (typeof parameterCommands !== 'undefined' && parameterCommands.showParameterModal) {
          parameterCommands.showParameterModal(categoryId, commandId, commandDef)
        }
      }
      // Note: Static commands are handled by CommandUI, which will emit chain-data-changed
      // when the command is actually added, so we don't need to handle them here
    })

    // Edit command
    this.addEventListener('commandchain:edit', ({ index }) => {
      if (index === undefined) return

      const cmds = this.getCommandsForSelectedKey()
      const originalCmd  = cmds[index]
      if (!originalCmd) return

      // -------------------------------------------------------------------
      // Create a copy of the command to avoid mutating the original profile
      // data during edit. Any derived parameters are applied only to this copy.
      // -------------------------------------------------------------------
      const cmd = originalCmd.parameters
        ? { ...originalCmd, parameters: { ...originalCmd.parameters } }
        : { ...originalCmd }

      // Derive parameters for tray execution commands when not stored
      if (!cmd.parameters && /TrayExecByTray/.test(cmd.command)) {
        const m = cmd.command.match(/(?:\+)?(?:STO)?TrayExecByTray\s+(\d+)\s+(\d+)/i)
        if (m) {
          cmd.parameters = { tray: parseInt(m[1]), slot: parseInt(m[2]) }
        } else {
          const mb = cmd.command.match(/(?:\+)?(?:STO)?TrayExecByTrayWithBackup\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i)
          if (mb) {
            cmd.parameters = {
              active: parseInt(mb[1]),
              tray: parseInt(mb[2]),
              slot: parseInt(mb[3]),
              backup_tray: parseInt(mb[4]),
              backup_slot: parseInt(mb[5]),
            }
          }
        }
      }

      const def = this.findCommandDefinition(cmd)
      const isCustomizable = !!(def && def.customizable)

      if (isCustomizable) {
        const helper = (typeof window !== 'undefined' && window.app?.editParameterizedCommand) ||
                       (typeof parameterCommands !== 'undefined' && parameterCommands.editParameterizedCommand)

        if (helper) {
          if (typeof window !== 'undefined' && window.app?.editParameterizedCommand) {
            window.app.editParameterizedCommand(index, cmd, def)
          } else {
            helper.call(window.app || {}, index, cmd, def)
          }
        } else {
          parameterCommands.showParameterModal(def.categoryId || cmd.type, def.commandId, def)
        }
        return
      }

      // Non-customizable command – info only
      if (typeof stoUI !== 'undefined' && stoUI.showToast) {
        stoUI.showToast(originalCmd.command, 'info')
      }
    })

    // Delete command
    this.addEventListener('commandchain:delete', ({ index }) => {
      const svcDel = this.commandService || this.commandLibraryService
      if (index === undefined || !svcDel || !this.selectedKey) return
      const ok = svcDel.deleteCommand && svcDel.deleteCommand(this.selectedKey, index)
      if (ok) {
        this.emit('chain-data-changed', { commands: this.getCommandsForSelectedKey() })
      }
    })

    // Move command (already done above?) – ensure unique once
    this.addEventListener('commandchain:move', ({ fromIndex, toIndex }) => {
      const svcMove = this.commandService || this.commandLibraryService
      if (!svcMove || !this.selectedKey) return
      const ok = svcMove.moveCommand && svcMove.moveCommand(this.selectedKey, fromIndex, toIndex)
      if (ok) {
        this.emit('chain-data-changed', { commands: this.getCommandsForSelectedKey() })
      }
    })
  }

  /* ------------------------------------------------------------------
   * Proxy helpers – delegate to underlying CommandLibraryService while we
   * transition. This keeps the existing public contract intact for UI and
   * tests.
   * ------------------------------------------------------------------ */

  getCommandsForSelectedKey () {
    const svc2 = this.commandLibraryService || this.commandService
    if (svc2 && typeof svc2.getCommandsForSelectedKey === 'function') {
      return svc2.getCommandsForSelectedKey()
    }
    return Array.isArray(this.commands) ? this.commands : []
  }

  getEmptyStateInfo () {
    const svc2 = this.commandLibraryService || this.commandService
    if (svc2 && typeof svc2.getEmptyStateInfo === 'function') {
      return svc2.getEmptyStateInfo()
    }
    return {
      title: '',
      preview: '',
      commandCount: 0,
      icon: '',
      emptyTitle: '',
      emptyDesc: '',
    }
  }

  findCommandDefinition (command) {
    const svc2 = this.commandLibraryService || this.commandService
    if (svc2 && typeof svc2.findCommandDefinition === 'function') {
      return svc2.findCommandDefinition(command)
    }
    return null
  }

  getCommandWarning (command) {
    const svc2 = this.commandLibraryService || this.commandService
    if (svc2 && typeof svc2.getCommandWarning === 'function') {
      return svc2.getCommandWarning(command)
    }
    return null
  }
} 