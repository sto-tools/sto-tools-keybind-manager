import ComponentBase from '../ComponentBase.js'
import { request, respond } from '../../core/requestResponse.js'
import { parameterCommands } from '../ui/ParameterCommandUI.js'
import eventBus from '../../core/eventBus.js'

/**
 * CommandChainService - Manages command chain display and editing operations
 * Responsible for adding, deleting, and reordering commands within chains
 * Fully decoupled - communicates only via event bus and request/response
 */
export default class CommandChainService extends ComponentBase {
  constructor ({ i18n, commandLibraryService, commandService = null } = {}) {
    super(eventBus)
    this.componentName = 'CommandChainService'
    this.i18n = i18n

    // REFACTORED: Remove direct service dependencies 
    // Legacy parameters kept temporarily for backward compatibility during migration
    // but are no longer used - all communication goes through event bus
    this.commandLibraryService = commandLibraryService || null
    this.commandService = commandService

    // Cached state - now using DataCoordinator broadcast/cache pattern
    this.selectedKey = null
    this.currentEnvironment = 'space'
    this.commands = []
    this.currentProfile = null
    
    // DataCoordinator cache
    this.cache = {
      profile: null,
      keys: {},
      aliases: {},
      currentProfile: null,
      currentEnvironment: 'space'
    }

    // Store detach functions for cleanup
    this._responseDetachFunctions = []

    // ---------------------------------------------------------
    // Register Request/Response endpoints for command chain management
    // ---------------------------------------------------------
    if (this.eventBus) {
      this._responseDetachFunctions.push(
        respond(this.eventBus, 'command-chain:add', ({ key, command, position }) => this.addCommand(key, command, position)),
        respond(this.eventBus, 'command-chain:delete', ({ key, index }) => this.deleteCommand(key, index)),
        respond(this.eventBus, 'command-chain:move', ({ key, fromIndex, toIndex }) => this.moveCommand(key, fromIndex, toIndex)),
        respond(this.eventBus, 'command-chain:get', ({ key }) => this.getCommandsForKey(key)),
        respond(this.eventBus, 'command-chain:clear', ({ key }) => this.clearCommandChain(key))
      )
    }
  }

  onInit () {
    this.setupEventListeners()
  }

  setupEventListeners () {
    const debugLog = (label, payload) => {
      if (typeof window !== 'undefined') {
        console.log(`[CommandChainService] ${label}:`, payload)
      }
    }

    // DataCoordinator integration - listen for profile updates
    this.addEventListener('profile:updated', (data) => {
      if (data?.profile) {
        this.updateCacheFromProfile(data.profile)
        // Refresh commands if we have a selected key
        if (this.selectedKey) {
          this.refreshCommands()
        }
      }
    })

    this.addEventListener('profile:switched', (data) => {
      this.currentProfile = data.profileId || data.profile || data.id
      this.currentEnvironment = data.environment || 'space'
      if (data.profile) {
        this.updateCacheFromProfile(data.profile)
      }
      // Clear selections when switching profiles
      this.selectedKey = null
    })

    // Listen for environment changes
    this.addEventListener('environment:changed', (data) => {
      const env = typeof data === 'string' ? data : data?.environment
      if (env) {
        this.currentEnvironment = env
        this.cache.currentEnvironment = env
        // Refresh commands when environment changes
        if (this.selectedKey) {
          this.refreshCommands()
        }
      }
    })

    // Directly emit chain data changes whenever key/alias selection changes so
    // the command-chain UI always knows what it should be displaying.
    this.addEventListener('key-selected', async ({ key, name }) => {
      debugLog('key-selected', { key, name })
      this.selectedKey = key || name || null

      // Refresh commands list when a new key is selected
      const cmds = await this.getCommandsForSelectedKey()
      this.emit('chain-data-changed', { commands: cmds })
    })

    // Handle alias selections explicitly so environment switches to alias
    this.addEventListener('alias-selected', async ({ name }) => {
      if (!name) return
      this.currentEnvironment = 'alias'
      this.selectedKey = name

      const cmds = await this.getCommandsForSelectedKey()
      this.emit('chain-data-changed', { commands: cmds })
    })

    // Listen for command additions from CommandService (for static commands)
    this.addEventListener('command-added', async ({ key, command }) => {
      // Update chain data when a command is added
      const cmds = await this.getCommandsForSelectedKey()
      this.emit('chain-data-changed', { commands: cmds })
    })

    // Handle add-command requests from AliasModalService (legacy support)
    this.addEventListener('commandlibrary:add', async (payload = {}) => {
      const { categoryId, commandId, commandObj } = payload
      if (!categoryId || !commandId) return

      // REFACTORED: Use request/response instead of direct service access
      try {
        if (commandObj && this.selectedKey) {
          const before = await this.getCommandsForSelectedKey()
          await request(this.eventBus, 'command-chain:add', { 
            command: commandObj, 
            key: this.selectedKey 
          })
          const after = await this.getCommandsForSelectedKey()
          if (after.length !== before.length) {
            this.emit('chain-data-changed', { commands: after })
          }
        }
      } catch (error) {
        console.error('Failed to add command:', error)
      }
    })

    // Handle new command:add event from refactored UI
    this.addEventListener('command:add', (payload = {}) => {
      const { categoryId, commandId, commandDef } = payload

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
    this.addEventListener('commandchain:edit', async ({ index }) => {
      if (index === undefined) return

      const cmds = await this.getCommandsForSelectedKey()
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

      const def = await this.findCommandDefinition(cmd)
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
    this.addEventListener('commandchain:delete', async ({ index }) => {
      if (index === undefined || !this.selectedKey) return
      
      // REFACTORED: Use request/response instead of direct service access
      try {
        await request(this.eventBus, 'command-chain:delete', { 
          key: this.selectedKey, 
          index 
        })
        this.emit('chain-data-changed', { commands: await this.getCommandsForSelectedKey() })
      } catch (error) {
        console.error('Failed to delete command:', error)
      }
    })

    // Move command
    this.addEventListener('commandchain:move', async ({ fromIndex, toIndex }) => {
      if (!this.selectedKey) return
      
      // REFACTORED: Use request/response instead of direct service access
      try {
        await request(this.eventBus, 'command-chain:move', { 
          key: this.selectedKey, 
          fromIndex, 
          toIndex 
        })
        this.emit('chain-data-changed', { commands: await this.getCommandsForSelectedKey() })
      } catch (error) {
        console.error('Failed to move command:', error)
      }
    })
  }

  /* ------------------------------------------------------------------
   * REFACTORED: Replaced proxy methods with direct request/response calls
   * No longer delegates to underlying services - uses event bus exclusively
   * ------------------------------------------------------------------ */

  async getCommandsForSelectedKey () {
    try {
      return await request(this.eventBus, 'command:get-for-selected-key')
    } catch (error) {
      console.error('Failed to get commands for selected key:', error)
      return Array.isArray(this.commands) ? this.commands : []
    }
  }

  async getEmptyStateInfo () {
    try {
      return await request(this.eventBus, 'command:get-empty-state-info')
    } catch (error) {
      console.error('Failed to get empty state info:', error)
      return {
        title: '',
        preview: '',
        commandCount: 0,
        icon: '',
        emptyTitle: '',
        emptyDesc: '',
      }
    }
  }

  async findCommandDefinition (command) {
    try {
      return await request(this.eventBus, 'command:find-definition', { command })
    } catch (error) {
      console.error('Failed to find command definition:', error)
      return null
    }
  }

  async getCommandWarning (command) {
    try {
      return await request(this.eventBus, 'command:get-warning', { command })
    } catch (error) {
      console.error('Failed to get command warning:', error)
      return null
    }
  }

  /* ------------------------------------------------------------------
   * Command Chain Management - Core Implementation
   * Handles adding, deleting, and reordering commands within chains
   * ------------------------------------------------------------------ */

  /**
   * Add a command to a key's command chain
   */
  async addCommand(key, command, position) {
    try {
      if (!key) {
        console.warn('CommandChainService: Cannot add command - no key specified')
        return false
      }

      const profile = await this.getCurrentProfile()
      if (!profile) {
        console.warn('CommandChainService: Cannot add command - no active profile')
        return false
      }

      if (this.currentEnvironment === 'alias') {
        // Handle alias command chains
        const currentAlias = profile.aliases && profile.aliases[key]
        const currentCommands = currentAlias && currentAlias.commands
          ? currentAlias.commands.split(/\s*\$\$\s*/).filter((cmd) => cmd.trim().length > 0)
          : []

        // Handle both single commands and arrays of commands
        if (Array.isArray(command)) {
          command.forEach(cmd => {
            const commandString = cmd.command
            if (commandString) {
              if (position !== undefined && position >= 0 && position <= currentCommands.length) {
                currentCommands.splice(position, 0, commandString)
              } else {
                currentCommands.push(commandString)
              }
            }
          })
        } else {
          const commandString = command.command
          if (commandString) {
            if (position !== undefined && position >= 0 && position <= currentCommands.length) {
              currentCommands.splice(position, 0, commandString)
            } else {
              currentCommands.push(commandString)
            }
          }
        }

        const newCommandString = currentCommands.join(' $$ ')
        if (!profile.aliases) profile.aliases = {}
        if (!profile.aliases[key]) profile.aliases[key] = {}
        profile.aliases[key].commands = newCommandString
      } else {
        // Handle keybind command chains
        // Ensure proper profile structure exists
        if (!profile.builds) profile.builds = {}
        if (!profile.builds[this.currentEnvironment]) profile.builds[this.currentEnvironment] = {}
        if (!profile.builds[this.currentEnvironment].keys) profile.builds[this.currentEnvironment].keys = {}
        if (!profile.builds[this.currentEnvironment].keys[key]) profile.builds[this.currentEnvironment].keys[key] = []
        
        const commands = profile.builds[this.currentEnvironment].keys[key]
        if (position !== undefined && position >= 0 && position <= commands.length) {
          commands.splice(position, 0, command)
        } else {
          commands.push(command)
        }
      }

      // Use DataCoordinator to save profile changes
      const updates = {}
      if (this.currentEnvironment === 'alias') {
        updates.aliases = { [key]: profile.aliases[key] }
      } else {
        updates.builds = {
          [this.currentEnvironment]: {
            keys: { [key]: profile.builds[this.currentEnvironment].keys[key] }
          }
        }
      }

      const result = await request(this.eventBus, 'data:update-profile', {
        profileId: this.cache.currentProfile,
        updates
      })

      if (result?.success) {
        this.emit('command-added', { key, command })
        return true
      } else {
        console.error('CommandChainService: Failed to save profile via DataCoordinator')
        return false
      }
    } catch (error) {
      console.error('CommandChainService: Failed to add command:', error)
      return false
    }
  }

  /**
   * Delete a command from a key's command chain
   */
  async deleteCommand(key, index) {
    try {
      if (!key || index === undefined) {
        console.warn('CommandChainService: Cannot delete command - invalid parameters')
        return false
      }

      const profile = await this.getCurrentProfile()
      if (!profile) {
        console.warn('CommandChainService: Cannot delete command - no active profile')
        return false
      }

      const isAliasContext = this.currentEnvironment === 'alias' ||
        (profile.aliases && Object.prototype.hasOwnProperty.call(profile.aliases, key))

      if (isAliasContext) {
        // Handle alias command chains
        const currentAlias = profile.aliases && profile.aliases[key]
        if (!currentAlias || !currentAlias.commands) return false

        const commands = currentAlias.commands
          .split(/\s*\$\$\s*/)
          .filter(cmd => cmd.trim().length > 0)

        if (index >= 0 && index < commands.length) {
          commands.splice(index, 1)
          profile.aliases[key].commands = commands.join(' $$ ')
        }
      } else {
        // Handle keybind command chains
        const commands = profile.builds?.[this.currentEnvironment]?.keys?.[key]
        if (commands && commands[index]) {
          commands.splice(index, 1)
        }
      }

      // Use DataCoordinator to save profile changes
      const updates = {}
      if (isAliasContext) {
        updates.aliases = { [key]: profile.aliases[key] }
      } else {
        updates.builds = {
          [this.currentEnvironment]: {
            keys: { [key]: profile.builds[this.currentEnvironment].keys[key] }
          }
        }
      }

      const result = await request(this.eventBus, 'data:update-profile', {
        profileId: this.cache.currentProfile,
        updates
      })

      if (result?.success) {
        this.emit('command-deleted', { key, index })
        return true
      } else {
        console.error('CommandChainService: Failed to save profile via DataCoordinator')
        return false
      }
    } catch (error) {
      console.error('CommandChainService: Failed to delete command:', error)
      return false
    }
  }

  /**
   * Move a command to a new position within a key's command chain
   */
  async moveCommand(key, fromIndex, toIndex) {
    try {
      if (!key || fromIndex === undefined || toIndex === undefined) {
        console.warn('CommandChainService: Cannot move command - invalid parameters')
        return false
      }

      const profile = await this.getCurrentProfile()
      if (!profile) {
        console.warn('CommandChainService: Cannot move command - no active profile')
        return false
      }

      if (this.currentEnvironment === 'alias') {
        // Handle alias command chains
        const currentAlias = profile.aliases && profile.aliases[key]
        if (!currentAlias || !currentAlias.commands) return false

        const commands = currentAlias.commands.split(/\s*\$\$\s*/).filter(cmd => cmd.trim().length > 0)
        if (fromIndex >= 0 && fromIndex < commands.length && toIndex >= 0 && toIndex < commands.length) {
          const [movedCommand] = commands.splice(fromIndex, 1)
          commands.splice(toIndex, 0, movedCommand)
          profile.aliases[key].commands = commands.join(' $$ ')
        }
      } else {
        // Handle keybind command chains
        const commands = profile.builds?.[this.currentEnvironment]?.keys?.[key]
        if (commands && fromIndex >= 0 && fromIndex < commands.length && 
            toIndex >= 0 && toIndex < commands.length) {
          const [movedCommand] = commands.splice(fromIndex, 1)
          commands.splice(toIndex, 0, movedCommand)
        }
      }

      // Use DataCoordinator to save profile changes
      const updates = {}
      if (this.currentEnvironment === 'alias') {
        updates.aliases = { [key]: profile.aliases[key] }
      } else {
        updates.builds = {
          [this.currentEnvironment]: {
            keys: { [key]: profile.builds[this.currentEnvironment].keys[key] }
          }
        }
      }

      const result = await request(this.eventBus, 'data:update-profile', {
        profileId: this.cache.currentProfile,
        updates
      })

      if (result?.success) {
        this.emit('command-moved', { key, fromIndex, toIndex })
        return true
      } else {
        console.error('CommandChainService: Failed to save profile via DataCoordinator')
        return false
      }
    } catch (error) {
      console.error('CommandChainService: Failed to move command:', error)
      return false
    }
  }

  /**
   * Get commands for a specific key
   */
  async getCommandsForKey(key) {
    try {
      if (!key) return []

      const profile = await this.getCurrentProfile()
      if (!profile) return []

      if (this.currentEnvironment === 'alias') {
        // Handle alias command chains
        const alias = profile.aliases && profile.aliases[key]
        if (!alias || !alias.commands) return []

        const commands = await request(this.eventBus, 'fileops:parse-command-string', { 
          commandString: alias.commands 
        })
        return commands.map((cmd, index) => ({
          command: cmd.command,
          text: cmd.command,
          type: 'alias',
          icon: '🎭',
          id: `alias_${index}`,
        }))
      } else {
        // Handle keybind command chains
        const commands = profile.builds?.[this.currentEnvironment]?.keys?.[key]
        return commands || []
      }
    } catch (error) {
      console.error('CommandChainService: Failed to get commands for key:', error)
      return []
    }
  }

  /**
   * Clear all commands from a key's command chain
   */
  async clearCommandChain(key) {
    try {
      if (!key) {
        console.warn('CommandChainService: Cannot clear chain - no key specified')
        return false
      }

      const profile = await this.getCurrentProfile()
      if (!profile) {
        console.warn('CommandChainService: Cannot clear chain - no active profile')
        return false
      }

      if (this.currentEnvironment === 'alias') {
        // Clear alias command chain
        if (profile.aliases && profile.aliases[key]) {
          profile.aliases[key].commands = ''
        }
      } else {
        // Clear keybind command chain
        const commands = profile.builds?.[this.currentEnvironment]?.keys?.[key]
        if (commands) {
          profile.builds[this.currentEnvironment].keys[key] = []
        }
      }

      // Use DataCoordinator to save profile changes
      const updates = {}
      if (this.currentEnvironment === 'alias') {
        updates.aliases = { [key]: profile.aliases[key] }
      } else {
        updates.builds = {
          [this.currentEnvironment]: {
            keys: { [key]: profile.builds[this.currentEnvironment].keys[key] }
          }
        }
      }

      const result = await request(this.eventBus, 'data:update-profile', {
        profileId: this.cache.currentProfile,
        updates
      })

      if (result?.success) {
        this.emit('command-chain-cleared', { key })
        return true
      } else {
        console.error('CommandChainService: Failed to save profile via DataCoordinator')
        return false
      }
    } catch (error) {
      console.error('CommandChainService: Failed to clear command chain:', error)
      return false
    }
  }

  /* ------------------------------------------------------------------
   * DataCoordinator Integration Methods
   * ------------------------------------------------------------------ */

  /**
   * Update local cache from profile data received from DataCoordinator
   */
  updateCacheFromProfile(profile) {
    if (!profile) return

    this.cache.profile = profile
    this.cache.currentProfile = profile.id

    // Cache environment-specific data
    if (profile.builds && profile.builds[this.currentEnvironment]) {
      this.cache.keys = profile.builds[this.currentEnvironment].keys || {}
    }

    if (profile.aliases) {
      this.cache.aliases = profile.aliases
    }
  }

  /**
   * Get the current profile with build-specific data from cache
   */
  getCurrentProfile() {
    if (!this.cache.profile) return null

    return this.getCurrentBuild(this.cache.profile)
  }

  /**
   * Get the current build for a profile using cached data
   */
  getCurrentBuild(profile) {
    if (!profile) return null

    if (!profile.builds) {
      profile.builds = {
        space: { keys: {} },
        ground: { keys: {} },
      }
    }

    if (!profile.builds[this.currentEnvironment]) {
      profile.builds[this.currentEnvironment] = { keys: {} }
    }

    if (!profile.builds[this.currentEnvironment].keys) {
      profile.builds[this.currentEnvironment].keys = {}
    }

    return {
      ...profile,
      keys: profile.builds[this.currentEnvironment].keys,
      aliases: profile.aliases || {},
    }
  }

  /**
   * Refresh commands for the currently selected key
   */
  async refreshCommands() {
    if (this.selectedKey) {
      const cmds = await this.getCommandsForSelectedKey()
      this.emit('chain-data-changed', { commands: cmds })
    }
  }

  /**
   * Get current state for ComponentBase late-join system
   */
  getCurrentState() {
    return {
      selectedKey: this.selectedKey,
      currentEnvironment: this.currentEnvironment,
      currentProfile: this.currentProfile,
      commands: this.commands
    }
  }

  /**
   * Handle initial state from ComponentBase late-join system
   */
  handleInitialState(sender, state) {
    if (sender === 'DataCoordinator' && state?.currentProfileData) {
      this.updateCacheFromProfile(state.currentProfileData)
      this.currentProfile = state.currentProfile
      this.currentEnvironment = state.currentEnvironment
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    // Clean up request/response handlers
    if (this._responseDetachFunctions) {
      this._responseDetachFunctions.forEach(detach => detach())
      this._responseDetachFunctions = []
    }

    super.destroy()
  }
} 