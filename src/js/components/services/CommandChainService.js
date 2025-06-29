import ComponentBase from '../ComponentBase.js'
import { request, respond } from '../../core/requestResponse.js'

/**
 * CommandChainService - Manages command chain display and editing operations
 * Responsible for adding, deleting, and reordering commands within chains
 * Fully decoupled - communicates only via event bus and request/response
 */
export default class CommandChainService extends ComponentBase {
  constructor ({ i18n, eventBus = null } = {}) {
    super(eventBus)
    this.componentName = 'CommandChainService'
    this.i18n = i18n

    // REFACTORED: No direct service dependencies – all communication via event bus
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
      if (data?.profile && data?.profileId) {
        // Add the profileId to the profile object since DataCoordinator doesn't include it
        const profileWithId = { ...data.profile, id: data.profileId }
        this.updateCacheFromProfile(profileWithId)
        // Refresh commands if we have a selected key
        // disabled due to command chain rendering not being atomic
        if (this.selectedKey) {
          this.refreshCommands()
        }
      }
    })

    this.addEventListener('profile:switched', (data) => {
      this.currentProfile = data.profileId || data.profile || data.id
      this.currentEnvironment = data.environment || 'space'
      
      // Ensure cache has the profile ID even if we don't have the full profile object
      this.cache.currentProfile = this.currentProfile
      this.cache.currentEnvironment = this.currentEnvironment
      
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
      if (this.currentEnvironment === 'alias') return;
      
      this.selectedKey = key || name || null

      // Refresh commands list when a new key is selected
      const cmds = await this.getCommandsForSelectedKey()
      console.log('[CommandChainService] [key-selected] emitting chain-data-changed with', cmds.length, 'commands')
      this.emit('chain-data-changed', { commands: cmds })
    })

    // Handle alias selections explicitly so environment switches to alias
    this.addEventListener('alias-selected', async ({ name }) => {
      if (!name) return
      if (this.currentEnvironment !== 'alias') return;
      
      this.selectedKey = name

      const cmds = await this.getCommandsForSelectedKey()
      console.log('[CommandChainService] [alias-selected] emitting chain-data-changed with', cmds.length, 'commands')
      this.emit('chain-data-changed', { commands: cmds })
    })

    // Handle command additions (from CommandService)
    this.addEventListener('command-added', async ({ command, key }) => {
      console.log('[CommandChainService] command-added received:', { command, key })
      const cmds = await this.getCommandsForSelectedKey()
      console.log('[CommandChainService] emitting chain-data-changed with', cmds.length, 'commands')
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

    // Note: command:add events are now handled by CommandUI
    // CommandChainService only handles the resulting command-added events
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

      // Derive editable parameters from the raw command string when they are
      // not already stored on the command object.  This uses STOCommandParser
      // so it works for **all** signature-recognised commands (tray exec,
      // communication, targeting, etc.) instead of only tray commands.
      if (!cmd.parameters) {
        try {
          const parseResult = await request(this.eventBus, 'parser:parse-command-string', {
            commandString: cmd.command,
            options: { generateDisplayText: false }
          })
          if (parseResult.commands && parseResult.commands[0] && parseResult.commands[0].parameters) {
            cmd.parameters = parseResult.commands[0].parameters
          }
        } catch (error) {
          console.warn('[CommandChainService] Failed to derive parameters from command:', error)
        }
      }

      const def = await this.findCommandDefinition(cmd)
      const isCustomizable = !!(def && def.customizable)

      if (isCustomizable) {
        // Emit event for parameter command editing - handled by ParameterCommandUI
        this.emit('parameter-command:edit', {
          index,
          command: cmd,
          commandDef: def,
          categoryId: def.categoryId || cmd.type,
          commandId: def.commandId
        })
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
      console.log('[CommandChainService] findCommandDefinition command:find-definition', { command })
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

      // Ensure we have a valid profile ID before making the request
      if (!this.cache.currentProfile) {
        console.error('CommandChainService: Cannot add command - no current profile ID in cache')
        // Try to get current profile from DataCoordinator as fallback
        try {
          const currentState = await request(this.eventBus, 'data:get-current-state')
          if (currentState?.currentProfile) {
            this.cache.currentProfile = currentState.currentProfile
            if (currentState.currentProfileData) {
              this.updateCacheFromProfile(currentState.currentProfileData)
            }
            console.log('[CommandChainService] Retrieved current profile from DataCoordinator as fallback:', this.cache.currentProfile)
          } else {
            console.error('CommandChainService: No current profile available from DataCoordinator')
            return false
          }
        } catch (error) {
          console.error('CommandChainService: Failed to get current profile from DataCoordinator:', error)
          return false
        }
      }

      // Use DataCoordinator explicit operations API to modify specific items
      const result = await request(this.eventBus, 'data:update-profile', {
        profileId: this.cache.currentProfile,
        modify: this.currentEnvironment === 'alias' ? {
          aliases: {
            [key]: profile.aliases[key]
          }
        } : {
          builds: {
            [this.currentEnvironment]: {
              keys: {
                [key]: profile.builds[this.currentEnvironment].keys[key]
              }
            }
          }
        }
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
      console.log('[CommandChainService] deleteCommand called:', {
        key,
        index,
        cacheCurrentProfile: this.cache.currentProfile,
        currentProfile: this.currentProfile,
        currentEnvironment: this.currentEnvironment
      })
      
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

      // Ensure we have a valid profile ID before making the request
      const profileId = this.cache.currentProfile || this.currentProfile
      if (!profileId) {
        console.error('CommandChainService: Cannot delete command - no current profile ID available')
        return false
      }

      // Use DataCoordinator explicit operations API to modify specific items
      const result = await request(this.eventBus, 'data:update-profile', {
        profileId: profileId,
        modify: isAliasContext ? {
          aliases: {
            [key]: profile.aliases[key]
          }
        } : {
          builds: {
            [this.currentEnvironment]: {
              keys: {
                [key]: profile.builds[this.currentEnvironment].keys[key]
              }
            }
          }
        }
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

      // Ensure we have a valid profile ID before making the request
      const profileId = this.cache.currentProfile || this.currentProfile
      if (!profileId) {
        console.error('CommandChainService: Cannot move command - no current profile ID available')
        return false
      }

      // Use DataCoordinator explicit operations API to modify specific items
      const result = await request(this.eventBus, 'data:update-profile', {
        profileId: profileId,
        modify: this.currentEnvironment === 'alias' ? {
          aliases: {
            [key]: profile.aliases[key]
          }
        } : {
          builds: {
            [this.currentEnvironment]: {
              keys: {
                [key]: profile.builds[this.currentEnvironment].keys[key]
              }
            }
          }
        }
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

        const result = await request(this.eventBus, 'parser:parse-command-string', { 
          commandString: alias.commands 
        })
        return result.commands.map((cmd, index) => ({
          ...cmd, // Use new format directly
          id: `alias_${index}`,
          // Ensure backward compatibility for any legacy fields still needed
          type: cmd.category,
          text: cmd.displayText
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

      // Ensure we have a valid profile ID before making the request
      const profileId = this.cache.currentProfile || this.currentProfile
      if (!profileId) {
        console.error('CommandChainService: Cannot clear command chain - no current profile ID available')
        return false
      }

      // Use DataCoordinator explicit operations API to modify specific items
      const result = await request(this.eventBus, 'data:update-profile', {
        profileId: profileId,
        modify: this.currentEnvironment === 'alias' ? {
          aliases: {
            [key]: profile.aliases[key]
          }
        } : {
          builds: {
            [this.currentEnvironment]: {
              keys: {
                [key]: profile.builds[this.currentEnvironment].keys[key]
              }
            }
          }
        }
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
    if (!profile) {
      console.log('[CommandChainService] updateCacheFromProfile called with null/undefined profile')
      return
    }

    console.log('[CommandChainService] updateCacheFromProfile called with profile:', {
      profileId: profile.id,
      environment: this.currentEnvironment,
      stackTrace: new Error().stack
    })

    this.cache.profile = profile
    this.cache.currentProfile = profile.id

    // Cache environment-specific data
    if (profile.builds && profile.builds[this.currentEnvironment]) {
      this.cache.keys = profile.builds[this.currentEnvironment].keys || {}
    }

    if (profile.aliases) {
      this.cache.aliases = profile.aliases
    }
    
    console.log('[CommandChainService] Cache updated:', {
      currentProfile: this.cache.currentProfile,
      keysCount: Object.keys(this.cache.keys || {}).length,
      aliasesCount: Object.keys(this.cache.aliases || {}).length
    })
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
      this.currentEnvironment = state.currentEnvironment || 'space'
      // Ensure the cache environment is also updated
      this.cache.currentEnvironment = this.currentEnvironment
      // Ensure cache has profile ID even if updateCacheFromProfile didn't set it
      this.cache.currentProfile = this.cache.currentProfile || state.currentProfile
      
      console.log(`[CommandChainService] Cache initialized from DataCoordinator:`, {
        profileId: this.cache.currentProfile,
        environment: this.cache.currentEnvironment
      })
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