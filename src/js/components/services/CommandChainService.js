import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { parameterCommands } from '../../features/parameterCommands.js'

/**
 * CommandChainService – owns the data for the command-chain editor (the pane
 * inside .command-chain-container).  In phase-1 it merely mirrors the updates
 * coming from CommandLibraryUI so we can wire up the new component without
 * breaking anything.  In phase-2 it will become the single source of truth
 * for chain operations.
 */
export default class CommandChainService extends ComponentBase {
  constructor ({ i18n, commandLibraryService } = {}) {
    super(eventBus)
    this.i18n = i18n
    this.currentEnvironment = 'space'
    this.selectedKey = null
    this.commands = [] // array of command objects

    // Underlying authoritative service (legacy)
    this.commandLibraryService = commandLibraryService || null
  }

  onInit () {
    this.setupEventListeners()
  }

  setupEventListeners () {
    // Receive broadcasts from existing components
    this.addEventListener('command-chain:update', (payload = {}) => {
      const { commands, selectedKey, environment } = payload

      this.commands = Array.isArray(commands) ? commands : []

      // Sync key/environment either from payload or authoritative service
      if (selectedKey !== undefined) this.selectedKey = selectedKey
      if (environment !== undefined) this.currentEnvironment = environment

      if (this.commandLibraryService) {
        this.selectedKey = this.selectedKey || this.commandLibraryService.selectedKey
        this.currentEnvironment = this.currentEnvironment || this.commandLibraryService.currentEnvironment
      }

      // forward to UI listeners that might care
      this.emit('chain-data-changed', { commands: this.commands })
    })

    // Keep environment/key in sync – other components should emit these.
    this.addEventListener('command-chain:select', ({ key, environment }) => {
      this.selectedKey = key
      if (environment) this.currentEnvironment = environment
    })

    this.addEventListener('environment-changed', (env) => {
      this.currentEnvironment = env
      this.selectedKey = null
      this.commands = []
      this.emit('chain-data-changed', { commands: this.commands })
    })

    // Maintain selected alias/key in sync with higher-level services so that
    // the command-chain UI always knows what it should be displaying.
    this.addEventListener('key-selected', ({ key, name }) => {
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

    // Handle add-command requests from command library UI
    this.addEventListener('commandlibrary:add', (payload = {}) => {
      const { categoryId, commandId, commandObj } = payload
      if (!categoryId || !commandId) return
      if (!this.commandLibraryService) return

      // Ensure alias environment sync if necessary
      if (this.currentEnvironment === 'alias') {
        this.commandLibraryService.setCurrentEnvironment('alias')
      }

      // Selected key should already be set; guard against missing key
      if (!this.selectedKey) {
        // UI will take care of warning inside service
        this.commandLibraryService.addCommandFromLibrary(categoryId, commandId)
        return
      }

      const before = this.getCommandsForSelectedKey()
      let success = false
      if (commandObj) {
        // Directly add provided command object
        success = this.commandLibraryService.addCommand(this.selectedKey, commandObj)
      } else {
        success = this.commandLibraryService.addCommandFromLibrary(categoryId, commandId)
      }
      if (success) {
        const after = this.getCommandsForSelectedKey()
        if (after.length !== before.length) {
          this.emit('chain-data-changed', { commands: after })
        }
      }
    })

    // Edit command
    this.addEventListener('commandchain:edit', ({ index }) => {
      if (index === undefined) return

      const cmds = this.getCommandsForSelectedKey()
      const cmd  = cmds[index]
      if (!cmd) return

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
        } else if (this.commandLibraryService) {
          this.commandLibraryService.showParameterModal(def.categoryId || cmd.type, def.commandId, def)
        }
        return
      }

      // Non-customizable command – info only
      if (typeof stoUI !== 'undefined' && stoUI.showToast) {
        stoUI.showToast(cmd.command, 'info')
      }
    })

    // Delete command
    this.addEventListener('commandchain:delete', ({ index }) => {
      if (index === undefined || !this.commandLibraryService || !this.selectedKey) return
      const ok = this.commandLibraryService.deleteCommand(this.selectedKey, index)
      if (ok) {
        this.emit('chain-data-changed', { commands: this.getCommandsForSelectedKey() })
      }
    })

    // Move command (already done above?) – ensure unique once
    this.addEventListener('commandchain:move', ({ fromIndex, toIndex }) => {
      if (fromIndex === undefined || toIndex === undefined) return
      if (!this.commandLibraryService || !this.selectedKey) return
      const ok = this.commandLibraryService.moveCommand(this.selectedKey, fromIndex, toIndex)
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
    if (this.commandLibraryService && typeof this.commandLibraryService.getCommandsForSelectedKey === 'function') {
      return this.commandLibraryService.getCommandsForSelectedKey()
    }
    return Array.isArray(this.commands) ? this.commands : []
  }

  getEmptyStateInfo () {
    if (this.commandLibraryService && typeof this.commandLibraryService.getEmptyStateInfo === 'function') {
      return this.commandLibraryService.getEmptyStateInfo()
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
    if (this.commandLibraryService && typeof this.commandLibraryService.findCommandDefinition === 'function') {
      return this.commandLibraryService.findCommandDefinition(command)
    }
    return null
  }

  getCommandWarning (command) {
    if (this.commandLibraryService && typeof this.commandLibraryService.getCommandWarning === 'function') {
      return this.commandLibraryService.getCommandWarning(command)
    }
    return null
  }
} 