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
    // Legacy state properties removed - ComponentBase handles all state caching now
    this.commands = []
    
    // Track active bindset (default to primary)
    this.activeBindset = 'Primary Bindset'
    
    // Flag to prevent race conditions during bindset switching
    this._bindsetSwitchInProgress = false
    this._bindsetOperationInProgress = false
    
    // Cache bind-to-alias mode setting from preferences
    this._bindToAliasMode = false

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
        // Removed deprecated command-chain:* request endpoints – callers should now use command:* APIs directly.
        // New: toggle or query execution-order stabilization
        this.respond('command:set-stabilize', ({ name, stabilize, bindset }) => this.setStabilize(name, stabilize, bindset)),
        this.respond('command:is-stabilized', ({ name, bindset }) => this.isStabilized(name, bindset)),
        // New: allow UI workflows (e.g., Import modal) to clear the destination
        // command chain synchronously via request/response.
        // Returns boolean success flag so caller can detect failures.
        this.respond('command-chain:clear', async ({ key, bindset }) => {
          try {
            return await this.clearCommandChain(key, bindset)
          } catch (err) {
            // Propagate error so request() caller receives it and can show details
            throw err
          }
        }),
        // New: expose stabilization state for validator service (unique)
        this.respond('command-chain:is-stabilized', ({ name, bindset }) => this.isStabilized(name, bindset)),
        
        // Bind-to-alias mode support (moved from CommandChainUI)
        this.respond('command-chain:get-bind-to-alias-mode', () => this.getBindToAliasMode()),
        this.respond('command-chain:generate-alias-name', ({ environment, keyName, bindsetName }) => 
          this.generateBindToAliasName(environment, keyName, bindsetName)),
        this.respond('command-chain:generate-alias-preview', ({ aliasName, commands }) => 
          this.generateAliasPreview(aliasName, commands)),
        /*this.respond('command:get-for-selected-key', async () => await this.getCommandsForSelectedKey()),
        this.respond('command:get-empty-state-info', async () => await this.getEmptyStateInfo()),
        this.respond('command:find-definition', ({ command }) => this.findCommandDefinition(command)),
        this.respond('command:get-warning', ({ command }) => this.getCommandWarning(command)),*/
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
        // Refresh commands if we have a selected key/alias
        // disabled due to command chain rendering not being atomic
        // RACE CONDITION FIX: Don't refresh during bindset operations or switching
        const selectedKeyName = this.currentEnvironment === 'alias' ? this.selectedAlias : this.selectedKey
        if (selectedKeyName && !this._bindsetSwitchInProgress && !this._bindsetOperationInProgress) {
          console.log(`[CommandChainService] refreshCommands() after profile:updated - activeBindset: ${this.activeBindset}`)
          this.refreshCommands()
        } else if (this._bindsetSwitchInProgress) {
          console.log(`[CommandChainService] Skipping refreshCommands() - bindset switch in progress`)
        } else if (this._bindsetOperationInProgress) {
          console.log(`[CommandChainService] Skipping refreshCommands() - bindset operation in progress`)
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
      // ComponentBase handles selection clearing automatically when profiles switch
    })

    // Listen for environment changes
    this.addEventListener('environment:changed', (data) => {
      const env = typeof data === 'string' ? data : data?.environment
      if (env) {
        this.currentEnvironment = env
        this.cache.currentEnvironment = env
        // Refresh commands when environment changes
        const selectedKeyName = this.currentEnvironment === 'alias' ? this.selectedAlias : this.selectedKey
        if (selectedKeyName) {
          this.refreshCommands()
        }
      }
    })

    // Listen for bindset changes to keep activeBindset synced
    console.log('[CommandChainService] Setting up bindset-selector:active-changed listener')
    this.addEventListener('bindset-selector:active-changed', ({ bindset, name }) => {
      const newName = bindset || name
      console.log(`[CommandChainService] *** bindset-selector:active-changed received: ${this.activeBindset} -> ${newName} ***`)
      if (newName) {
        // Set flag to prevent race conditions
        this._bindsetSwitchInProgress = true
        this.activeBindset = newName
        console.log(`[CommandChainService] Calling refreshCommands() for bindset: ${newName}`)
        // Refresh commands to show the chain for the new bindset
        this.refreshCommands()
        // Clear flag after a short delay
        setTimeout(() => {
          this._bindsetSwitchInProgress = false
          console.log(`[CommandChainService] Bindset switch completed for: ${newName}`)
        }, 100)
      }
    })

    // Listen for bindset operations to prevent race conditions
    this.addEventListener('bindset-operation:started', ({ type, bindset, key }) => {
      console.log(`[CommandChainService] Bindset operation started: ${type} key=${key} bindset=${bindset}`)
      this._bindsetOperationInProgress = true
    })

    this.addEventListener('bindset-operation:completed', ({ type, bindset, key }) => {
      console.log(`[CommandChainService] Bindset operation completed: ${type} key=${key} bindset=${bindset}`)
      this._bindsetOperationInProgress = false
    })

    // Listen for key added to bindset - immediately refresh command chain to show empty state
    this.addEventListener('bindset-selector:key-added', async ({ key, bindset }) => {
      console.log(`[CommandChainService] bindset-selector:key-added received: key=${key}, bindset=${bindset}, selectedKey=${this.cache.selectedKey}`)
      
      // Only refresh if this is the currently selected key
      if (key === this.cache.selectedKey) {
        console.log(`[CommandChainService] Key added to bindset ${bindset} - refreshing command chain to show empty state`)
        
        // Wait a small amount of time to ensure the active bindset has been updated
        // The BindsetSelectorService calls setActiveBindset() which triggers bindset-selector:active-changed
        // which updates this.activeBindset, but we need to make sure that happens first
        setTimeout(async () => {
          console.log(`[CommandChainService] About to refresh commands - activeBindset: ${this.activeBindset}, expected: ${bindset}`)
          const cmds = await this.getCommandsForSelectedKey()
          console.log(`[CommandChainService] Refreshed commands for new bindset ${bindset}: ${cmds.length} commands`)
          this.emit('chain-data-changed', { commands: cmds })
        }, 100)
      }
    })

    // Directly emit chain data changes whenever key/alias selection changes so
    // the command-chain UI always knows what it should be displaying.
    this.addEventListener('key-selected', async ({ key, name }) => {
      debugLog('key-selected', { key, name })
      if (this.cache.currentEnvironment === 'alias') return;
      
      // Let ComponentBase handle the selection state update
      // ComponentBase will set this.selectedKey = key and clear this.selectedAlias

      // Reset to Primary Bindset when selecting a different key (same logic as CommandChainUI)
      const selectedKeyName = key || name || null
      if (selectedKeyName && this.activeBindset !== 'Primary Bindset') {
        console.log(`[CommandChainService] Resetting activeBindset from ${this.activeBindset} to Primary Bindset for key selection`)
        this.activeBindset = 'Primary Bindset'
      }

      // Refresh commands list when a new key is selected
      const cmds = await this.getCommandsForSelectedKey()
      console.log('[CommandChainService] [key-selected] emitting chain-data-changed with', cmds.length, 'commands')
      this.emit('chain-data-changed', { commands: cmds })
    })

    // Handle alias selections explicitly so environment switches to alias
    this.addEventListener('alias-selected', async ({ name }) => {
      if (!name) return
      
      // Let ComponentBase handle the selection state update
      // ComponentBase will set this.selectedAlias = name and clear this.selectedKey
      
      // Always emit chain-data-changed for alias selections to ensure UI updates
      // The CommandChainUI will handle environment-specific rendering
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

    const refreshAfterChange = async (label, payload) => {
      console.log(`[CommandChainService] ${label} received:`, payload)
      let cmds = Array.isArray(payload?.commands) ? payload.commands : null
      if (!cmds) {
        cmds = await this.getCommandsForSelectedKey()
      }
      this.emit('chain-data-changed', { commands: cmds })
    }

    this.addEventListener('command-edited', async (data) => {
      await refreshAfterChange('command-edited', data)
    })
    this.addEventListener('command-deleted', async (data) => {
      await refreshAfterChange('command-deleted', data)
    })
    this.addEventListener('command-moved', async (data) => {
      await refreshAfterChange('command-moved', data)
    })

    // Note: command:add events are now handled by CommandUI
    // CommandChainService only handles the resulting command-added events
    // Edit command
    this.addEventListener('commandchain:edit', async ({ index }) => {
      if (index === undefined) return

      const cmds = await this.getCommandsForSelectedKey()
      const originalEntry = cmds[index]
      if (!originalEntry) return

      // Ensure we have a rich object representation for editing.
      let cmd
      if (typeof originalEntry === 'string') {
        // Wrap canonical string into minimal rich object for downstream logic
        cmd = { command: originalEntry }
      } else {
        cmd = originalEntry.parameters
          ? { ...originalEntry, parameters: { ...originalEntry.parameters } }
          : { ...originalEntry }
      }

      // Derive editable parameters when absent
      if (!cmd.parameters) {
        try {
          const parseResult = await this.request('parser:parse-command-string', {
            commandString: cmd.command,
            options: { generateDisplayText: false }
          })
          if (parseResult.commands && parseResult.commands[0]?.parameters) {
            cmd.parameters = parseResult.commands[0].parameters
          }
        } catch (error) {
          console.warn('[CommandChainService] Failed to derive parameters from command:', error)
        }
      }

      const def = await this.findCommandDefinition(cmd)
      const isCustomizable = !!(def && def.customizable)

      // Check if this is a custom command that should be editable
      const isCustomCommand = cmd.type === 'custom' || cmd.category === 'custom' || 
                              (cmd.command && await this.isCustomCommand(cmd.command))

      if (isCustomizable) {
        this.emit('parameter-command:edit', {
          index,
          command: cmd,
          commandDef: def,
          categoryId: def.categoryId || cmd.type,
          commandId: def.commandId
        })
        return
      } else if (isCustomCommand) {
        // Handle custom commands using the custom command editor
        const customDef = {
          name: 'Edit Custom Command',
          customizable: true,
          categoryId: 'custom',
          commandId: 'add_custom_command',
          parameters: {
            rawCommand: {
              type: 'text',
              default: cmd.command || '',
              placeholder: 'Enter any STO command',
              label: 'Command:'
            }
          }
        }
        
        this.emit('parameter-command:edit', {
          index,
          command: cmd,
          commandDef: customDef,
          categoryId: 'custom',
          commandId: 'add_custom_command'
        })
        return
      }

      // Non-customizable – inform UI
      if (typeof stoUI !== 'undefined' && stoUI.showToast) {
        stoUI.showToast(cmd.command || originalEntry, 'info')
      }
    })

    // Delete command
    this.addEventListener('commandchain:delete', async ({ index }) => {
      const selectedKeyName = this.cache.currentEnvironment === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey
      if (index === undefined || !selectedKeyName) return

      // Determine bindset context
      const bindsetParam = (this.cache.currentEnvironment === 'alias' || this.activeBindset === 'Primary Bindset')
        ? null
        : this.activeBindset
      try {
        await this.request('command:delete', {
          key: selectedKeyName,
          index,
          bindset: bindsetParam
        })
        this.emit('chain-data-changed', { commands: await this.getCommandsForSelectedKey() })
      } catch (error) {
        console.error('Failed to delete command:', error)
      }
    })

    // Move command
    this.addEventListener('commandchain:move', async ({ fromIndex, toIndex }) => {
      const selectedKeyName = this.cache.currentEnvironment === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey
      if (!selectedKeyName) return

      const bindsetParam = (this.cache.currentEnvironment === 'alias' || this.activeBindset === 'Primary Bindset')
        ? null
        : this.activeBindset
      try {
        await this.request('command:move', {
          key: selectedKeyName,
          fromIndex,
          toIndex,
          bindset: bindsetParam
        })
        this.emit('chain-data-changed', { commands: await this.getCommandsForSelectedKey() })
      } catch (error) {
        console.error('Failed to move command:', error)
      }
    })

    // Clear entire chain when broadcast event received (Button in UI)
    this.addEventListener('command-chain:clear', async ({ key }) => {
      if (!key) return
      await this.clearCommandChain(key)
    })
    
    // Handle preferences changes for bind-to-alias mode
    this.addEventListener('preferences:changed', ({ key, value }) => {
      if (key === 'bindToAliasMode') {
        console.log(`[CommandChainService] Preference changed: bindToAliasMode = ${value}`)
        this._bindToAliasMode = !!value
      }
    })
  }

  /* ------------------------------------------------------------------
   * REFACTORED: Replaced proxy methods with direct request/response calls
   * No longer delegates to underlying services - uses event bus exclusively
   * ------------------------------------------------------------------ */

  async getCommandsForSelectedKey () {
    try {
      const selectedKeyName = this.cache.currentEnvironment === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey
      console.log(`[CommandChainService] getCommandsForSelectedKey called - activeBindset: ${this.activeBindset}, selectedKey: ${this.cache.selectedKey}, selectedAlias: ${this.cache.selectedAlias}, resolvedKey: ${selectedKeyName}, environment: ${this.cache.currentEnvironment}`)
      
      // Alias environment handled directly
      if (this.cache.currentEnvironment === 'alias') {
        return await this.request('command:get-for-selected-key')
      }

      const activeBindset = this.activeBindset || 'Primary Bindset'
      console.log(`[CommandChainService] Using activeBindset: ${activeBindset}`)

      if (activeBindset !== 'Primary Bindset') {
        console.log(`[CommandChainService] Requesting commands from bindset: ${activeBindset}`)
        const startTime = Date.now()
        
        // Add a timeout to detect hanging requests
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout after 5 seconds')), 5000)
        })
        
        try {
          const selectedKeyName = this.cache.currentEnvironment === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey
          const requestPromise = this.request('bindset:get-key-commands', {
            bindset: activeBindset,
            environment: this.cache.currentEnvironment,
            key: selectedKeyName,
          })
          
          const cmds = await Promise.race([requestPromise, timeoutPromise])
          const duration = Date.now() - startTime
          console.log(`[CommandChainService] Received ${cmds?.length || 0} commands from bindset in ${duration}ms:`, cmds)
          return Array.isArray(cmds) ? cmds : []
        } catch (error) {
          const duration = Date.now() - startTime
          console.error(`[CommandChainService] bindset:get-key-commands failed after ${duration}ms:`, error)
          console.error(`[CommandChainService] This suggests BindsetService is not responding. Check if BindsetService is initialized.`)
          
          // Fallback to empty array for now to prevent UI from being stuck
          console.warn(`[CommandChainService] Falling back to empty commands array for bindset: ${activeBindset}`)
          return []
        }
      }

      // Primary bindset path
      console.log(`[CommandChainService] Requesting commands from Primary Bindset`)
      const cmds = await this.request('command:get-for-selected-key', {
        key: selectedKeyName,
        environment: this.cache.currentEnvironment,
        bindset: 'Primary Bindset'
      })
      console.log(`[CommandChainService] Received ${cmds?.length || 0} commands from Primary:`, cmds)
      return cmds
    } catch (error) {
      console.error('Failed to get commands for selected key:', error)
      return Array.isArray(this.commands) ? this.commands : []
    }
  }

  async getEmptyStateInfo () {
    try {
      return await this.request('command:get-empty-state-info')
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
      return await this.request('command:find-definition', { command })
    } catch (error) {
      console.error('Failed to find command definition:', error)
      return null
    }
  }

  async getCommandWarning (command) {
    try {
      return await this.request('command:get-warning', { command })
    } catch (error) {
      console.error('Failed to get command warning:', error)
      return null
    }
  }

  async isCustomCommand (command) {
    try {
      // Try to parse the command to determine its category
      const parseResult = await this.request('parser:parse-command-string', {
        commandString: command,
        options: { generateDisplayText: false }
      })
      
      if (parseResult.commands && parseResult.commands[0]) {
        const category = parseResult.commands[0].category
        return category === 'custom'
      }
      
      // If parsing fails, consider it a custom command
      return true
    } catch (error) {
      // If parsing fails, treat as custom command
      return true
    }
  }

  /* ------------------------------------------------------------------
   * Command Chain Management - Core Implementation
   * Handles adding, deleting, and reordering commands within chains
   * ------------------------------------------------------------------ */

  /**
   * Get commands for a specific key
   */
  async getCommandsForKey(key) {
    try {
      if (!key) return []

      const profile = await this.getCurrentProfile()
      if (!profile) return []

      if (this.currentEnvironment === 'alias') {
        // -----------------------------------------------------------------
        // Alias command chains – canonical string[] only (no legacy "$$" strings)
        // -----------------------------------------------------------------
        const alias = profile.aliases && profile.aliases[key]
        if (!alias || !Array.isArray(alias.commands)) return []
        // Return a shallow copy to avoid accidental mutation by callers
        return [...alias.commands]
      } else {
        // Keybind command chains (already canonical string[])
        const commands = profile.builds?.[this.currentEnvironment]?.keys?.[key]
        return Array.isArray(commands) ? [...commands] : []
      }
    } catch (error) {
      console.error('CommandChainService: Failed to get commands for key:', error)
      return []
    }
  }

  /**
   * Clear all commands from a key's command chain
   */
  async clearCommandChain(key, bindset = null) {
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

      const useBindset = (bindset && bindset !== 'Primary Bindset' && this.currentEnvironment !== 'alias')

      if (this.currentEnvironment === 'alias') {
        // Clear alias command chain - use canonical array format
        if (profile.aliases && profile.aliases[key]) {
          profile.aliases[key].commands = []
        }
      } else {
        if (useBindset) {
          // Clear commands within the active bindset
          if (!profile.bindsets?.[bindset]) {
            profile.bindsets = { ...(profile.bindsets || {}), [bindset]: { space: { keys: {} }, ground: { keys: {} } } }
          }
          if (!profile.bindsets[bindset][this.currentEnvironment]) {
            profile.bindsets[bindset][this.currentEnvironment] = { keys: {} }
          }
          profile.bindsets[bindset][this.currentEnvironment].keys[key] = []
        } else {
          // Clear keybind command chain in primary build
          const commands = profile.builds?.[this.currentEnvironment]?.keys?.[key]
          if (commands) {
            profile.builds[this.currentEnvironment].keys[key] = []
          }
        }
      }

      // Ensure we have a valid profile ID before making the request
      const profileId = this.cache.currentProfile || this.currentProfile
      if (!profileId) {
        console.error('CommandChainService: Cannot clear command chain - no current profile ID available')
        return false
      }

      let updatePayload
      if (this.currentEnvironment === 'alias') {
        updatePayload = {
          modify: {
            aliases: {
              [key]: profile.aliases[key]
            }
          }
        }
      } else if (useBindset) {
        updatePayload = {
          modify: {
            bindsets: {
              [bindset]: {
                [this.currentEnvironment]: {
                  keys: {
                    [key]: []
                  }
                }
              }
            }
          }
        }
      } else {
        updatePayload = {
          modify: {
            builds: {
              [this.currentEnvironment]: {
                keys: {
                  [key]: []
                }
              }
            }
          }
        }
      }

      const result = await this.request('data:update-profile', {
        profileId: profileId,
        ...updatePayload
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
    if (profile.keys) {
      this.cache.keys = profile.keys
    } else if (profile.builds && profile.builds[this.currentEnvironment]) {
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
    const selectedKeyName = this.currentEnvironment === 'alias' ? this.selectedAlias : this.selectedKey
    if (selectedKeyName) {
      const cmds = await this.request('command:get-for-selected-key', { key: selectedKeyName })
      this.emit('chain-data-changed', { commands: cmds })
    }
  }

  /**
   * Get current state for ComponentBase late-join system
   */
  getCurrentState() {
    return {
      selectedKey: this.selectedKey,
      commands: this.commands
      // REMOVED: currentEnvironment, currentProfile - not owned by CommandChainService
      // These will be managed by SelectionService (selection) and DataCoordinator (profile/environment)
    }
  }

  /**
   * Handle initial state from ComponentBase late-join system
   */
  handleInitialState(sender, state) {
    // REMOVED: DataCoordinator and SelectionService handling now in ComponentBase._handleInitialState
    // Component-specific initialization can be added here if needed
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

  /* ------------------------------------------------------------------
   * Stabilization helpers
   * ------------------------------------------------------------------ */

  /**
   * Return whether the specified key/alias currently has stabilization enabled.
   * @param {string} name - The key or alias name
   * @param {string} [bindset] - Optional bindset name (for bindset-specific stabilization)
   */
  isStabilized(name, bindset = null) {
    if (!name) return false
    const profile = this.cache.profile || null
    if (!profile) return false

    // Always check alias metadata first, regardless of current environment or bindset
    if (profile.aliasMetadata && profile.aliasMetadata[name] && profile.aliasMetadata[name].stabilizeExecutionOrder === true) {
      return true
    }

    // If we're in alias mode, only check alias metadata
    if (this.currentEnvironment === 'alias') {
      return false
    }

    // If bindset is specified, check bindset metadata
    if (bindset && bindset !== 'Primary Bindset') {
      return !!(profile.bindsetMetadata && profile.bindsetMetadata[bindset] &&
        profile.bindsetMetadata[bindset][this.currentEnvironment] &&
        profile.bindsetMetadata[bindset][this.currentEnvironment][name] &&
        profile.bindsetMetadata[bindset][this.currentEnvironment][name].stabilizeExecutionOrder === true)
    }

    // Default to primary bindset (keybindMetadata)
    return !!(profile.keybindMetadata && profile.keybindMetadata[this.currentEnvironment] &&
      profile.keybindMetadata[this.currentEnvironment][name] &&
      profile.keybindMetadata[this.currentEnvironment][name].stabilizeExecutionOrder === true)
  }

  /**
   * Toggle or set stabilization flag for current key / alias.
   * @param {string} name - The key or alias name
   * @param {boolean} [stabilize=true] - Whether to enable stabilization
   * @param {string} [bindset] - Optional bindset name (for bindset-specific stabilization)
   */
  async setStabilize(name, stabilize = true, bindset = null) {
    try {
      if (!name) return { success: false }

      // Use the cached profile directly, not the transformed profile from getCurrentProfile()
      // This ensures we have access to the original keybindMetadata and aliasMetadata
      const profile = this.cache.profile
      if (!profile) return { success: false }

      // Check if this is an alias by looking in the profile's aliases
      const isAlias = this.currentEnvironment === 'alias' || !!(profile.aliases && profile.aliases[name])
      let modifyPayload

      if (isAlias) {
        // Only send metadata for the specific alias being modified
        const aliasMetadata = {}
        const currentAliasMetadata = (profile.aliasMetadata && profile.aliasMetadata[name]) || {}
        
        // Create a copy of the current alias metadata
        aliasMetadata[name] = { ...currentAliasMetadata }

        if (stabilize) {
          aliasMetadata[name].stabilizeExecutionOrder = true
        } else {
          aliasMetadata[name].stabilizeExecutionOrder = false
        }

        modifyPayload = { aliasMetadata }
      } else if (!bindset || bindset === 'Primary Bindset') {
        // Primary bindset - use keybindMetadata
        const keybindMetadata = {}
        if (!keybindMetadata[this.currentEnvironment]) {
          keybindMetadata[this.currentEnvironment] = {}
        }
        
        const currentKeyMetadata = (profile.keybindMetadata && 
                                   profile.keybindMetadata[this.currentEnvironment] && 
                                   profile.keybindMetadata[this.currentEnvironment][name]) || {}
        
        // Create a copy of the current key metadata
        keybindMetadata[this.currentEnvironment][name] = { ...currentKeyMetadata }

        if (stabilize) {
          keybindMetadata[this.currentEnvironment][name].stabilizeExecutionOrder = true
        } else {
          keybindMetadata[this.currentEnvironment][name].stabilizeExecutionOrder = false
        }

        modifyPayload = { keybindMetadata }
      } else {
        // Bindset-specific metadata
        const bsMeta = {}
        bsMeta[bindset] = {}
        bsMeta[bindset][this.currentEnvironment] = {}

        const currentKeyMeta = (profile.bindsetMetadata && profile.bindsetMetadata[bindset] &&
          profile.bindsetMetadata[bindset][this.currentEnvironment] &&
          profile.bindsetMetadata[bindset][this.currentEnvironment][name]) || {}

        const newMeta = { ...currentKeyMeta }
        if (stabilize) {
          newMeta.stabilizeExecutionOrder = true
        } else {
          newMeta.stabilizeExecutionOrder = false
        }

        bsMeta[bindset][this.currentEnvironment][name] = newMeta

        modifyPayload = { bindsetMetadata: bsMeta }
      }

      // Persist via DataCoordinator
      const profileId = this.cache.currentProfile || this.currentProfile
      if (!profileId) return { success: false }

      const result = await this.request('data:update-profile', { profileId, modify: modifyPayload })
      if (result?.success) {
        // CRITICAL: Update local cache immediately to prevent race conditions
        // The profile:updated event will also trigger cache update, but that's async
        if (result.profile) {
          this.updateCacheFromProfile({ ...result.profile, id: profileId })
        }
        
        this.emit('stabilize-changed', { name, stabilize, isAlias, bindset })
        // Broadcast profile update for listeners that rely on metadata
        this.emit('profile:updated', { profileId, profile: result.profile })
        return { success: true }
      }
      return { success: false }
    } catch (err) {
      console.error('[CommandChainService] setStabilize failed', err)
      return { success: false, error: err.message }
    }
  }
  
  /* ------------------------------------------------------------------
   * Bind-to-alias mode support (moved from CommandChainUI)
   * ------------------------------------------------------------------ */
  
  /**
   * Get the current bind-to-alias mode setting from cached preferences
   */
  getBindToAliasMode() {
    return this._bindToAliasMode
  }
  
  /**
   * Generate alias name for bind-to-alias mode
   * Uses the same logic as CommandChainUI but as a service operation
   */
  async generateBindToAliasName(environment, keyName, bindsetName = null) {
    try {
      const { generateBindToAliasName } = await import('../../lib/aliasNameValidator.js')
      return generateBindToAliasName(environment, keyName, bindsetName)
    } catch (error) {
      console.error('[CommandChainService] Failed to generate alias name:', error)
      return null
    }
  }
  
  /**
   * Generate alias preview for bind-to-alias mode
   * Formats the alias command string for display
   */
  generateAliasPreview(aliasName, commands) {
    if (!aliasName) {
      return ''
    }
    
    try {
      // Handle null or non-array commands
      if (!Array.isArray(commands)) {
        return `alias ${aliasName} <&  &>`
      }
      
      // Convert commands to strings for alias generation, filtering out null/empty values
      const commandStrings = commands.map(cmd => {
        if (cmd === null || cmd === undefined) return ''
        return typeof cmd === 'string' ? cmd : (cmd.command || '')
      }).filter(Boolean)
      
      if (commandStrings.length === 0) {
        return `alias ${aliasName} <&  &>`
      }
      
      // Join commands with $$ separator for STO alias format
      const commandChain = commandStrings.join(' $$ ')
      return `alias ${aliasName} <& ${commandChain} &>`
    } catch (error) {
      console.error('[CommandChainService] Failed to generate alias preview:', error)
      return `alias ${aliasName} <&  &>`
    }
  }
  
  /**
   * Handle initial state for bind-to-alias mode preferences
   */
  handleInitialState(sender, state) {
    super.handleInitialState(sender, state)
    
    // Handle preferences state from PreferencesService
    if (sender === 'PreferencesService' && state?.settings) {
      this._bindToAliasMode = !!state.settings.bindToAliasMode
      console.log(`[CommandChainService] Set bindToAliasMode = ${this._bindToAliasMode} from late-join`)
    }
  }
} 