import ComponentBase from '../ComponentBase.js'
import { respond, request } from '../../core/requestResponse.js'

/**
 * CommandService – the authoritative service for creating, deleting and
 * rearranging commands in a profile.  It owns no UI concerns whatsoever.  A
 * higher-level feature (CommandLibraryService / future templates) can call
 * this service to persist changes and broadcast events.
 * 
 * REFACTORED: Now uses DataCoordinator broadcast/cache pattern
 * - Caches profile state locally from DataCoordinator broadcasts
 * - Uses DataCoordinator request/response for all profile updates
 * - Implements late-join support for dynamic initialization
 * - Maintains all existing command operations and events
 */
export default class CommandService extends ComponentBase {
  constructor({ storage, eventBus, i18n, profileService = null, modalManager = null }) {
    super(eventBus)
    this.componentName = 'CommandService'
    // Legacy parameters kept for backward compatibility but not used directly
    this.storage         = storage
    this.i18n            = i18n
    this.profileService  = profileService
    this.modalManager    = modalManager

    this.currentProfile  = null
    this.currentEnvironment = 'space'
    this.selectedKey = null
    this.selectedAlias = null

    // REFACTORED: Cache profile state from DataCoordinator broadcasts
    this.cache = {
      currentProfile: null,
      currentEnvironment: 'space',
      profile: null, // Full profile object
      builds: { // Current profile's builds
        space: { keys: {} },
        ground: { keys: {} }
      },
      aliases: {}, // Current profile's aliases
      keys: {} // Current environment's keys
    }

    // Store detach functions for cleanup
    this._responseDetachFunctions = []

    // Register Request/Response endpoints for editing commands
    if (this.eventBus) {
      this._responseDetachFunctions.push(
        respond(this.eventBus, 'command:edit', ({ commandId, updatedCommand }) => 
          this.editCommand(commandId, updatedCommand)),
        respond(this.eventBus, 'command:duplicate', ({ commandId }) => 
          this.duplicateCommand(commandId)),
        respond(this.eventBus, 'command:delete', ({ commandId }) => 
          this.deleteCommand(commandId)),
        respond(this.eventBus, 'command:add', async ({ command, key, position }) => 
          this.addCommand(key, command, position)),
        respond(this.eventBus, 'command:reorder', ({ commandId, newPosition }) => 
          this.reorderCommand(commandId, newPosition)),
        respond(this.eventBus, 'command:validate', ({ command }) => 
          this.validateCommand(command))
      )
    }
  }

  /* ============================================================
   * Lifecycle
   * ============================================================ */
  async init() {
    super.init() // ComponentBase handles late-join automatically
    this.setupEventListeners()
  }

  onInit () {
    // Legacy method - now handled by init()
  }

  /** Convenience getter */
  getCurrentProfileId () {
    return this.currentProfile
  }

  /* ------------------------------------------------------------------
   * REFACTORED: Profile helpers now use cached data
   * ------------------------------------------------------------------ */
  getCurrentProfile () {
    if (!this.cache.currentProfile) return null
    return this.getCurrentBuild(this.cache.profile)
  }

  getCurrentBuild (profile) {
    if (!profile) return null

    // Use cached builds data
    const builds = this.cache.builds || {
      space: { keys: {} },
      ground: { keys: {} }
    }

    if (!builds[this.currentEnvironment]) {
      builds[this.currentEnvironment] = { keys: {} }
    }

    if (!builds[this.currentEnvironment].keys) {
      builds[this.currentEnvironment].keys = {}
    }

    return {
      ...profile,
      keys: builds[this.currentEnvironment].keys,
      aliases: this.cache.aliases || {},
    }
  }

  /* ------------------------------------------------------------------
   * REFACTORED: Core command operations now use DataCoordinator
   * ------------------------------------------------------------------ */
  /** Add a command (either to a keybind array or to an alias command string) */
  async addCommand (key, command) {
    if (!key) {
      this.ui?.showToast?.(
        this.i18n?.t?.('please_select_a_key_first') || 'Please select a key first',
        'warning'
      )
      return false
    }

    const profile = this.getCurrentProfile()
    if (!profile) {
      this.ui?.showToast?.(this.i18n.t('no_valid_profile'), 'error')
      return false
    }

    // Prepare profile updates
    const updates = {}
    
    if (this.currentEnvironment === 'alias') {
      // ----- Alias chain -----
      const currentAlias = this.cache.aliases && this.cache.aliases[key]
      const currentCommands = currentAlias && currentAlias.commands
        ? currentAlias.commands.split(/\s*\$\$\s*/).filter((cmd) => cmd.trim().length > 0)
        : []
      
      // Handle both single commands and arrays of commands (e.g., whole-tray execution)
      if (Array.isArray(command)) {
        // For arrays of commands, extract the command string from each
        command.forEach(cmd => {
          const commandString = cmd.command
          if (commandString) {
            currentCommands.push(commandString)
          }
        })
      } else {
        // For single commands, extract the command string
        const commandString = command.command
        if (commandString) {
          currentCommands.push(commandString)
        }
      }
      
      const newCommandString = currentCommands.join(' $$ ')
      updates.aliases = {
        ...this.cache.aliases,
        [key]: {
          ...(this.cache.aliases[key] || {}),
          commands: newCommandString
        }
      }
    } else {
      // ----- Key-bind -----
      const currentKeys = this.cache.keys[key] || []
      const newKeys = [...currentKeys, command]
      
      updates.builds = {
        ...this.cache.builds,
        [this.currentEnvironment]: {
          ...this.cache.builds[this.currentEnvironment],
          keys: {
            ...this.cache.builds[this.currentEnvironment].keys,
            [key]: newKeys
          }
        }
      }
    }

    try {
      // Update via DataCoordinator
      await request(this.eventBus, 'data:update-profile', {
        profileId: this.cache.currentProfile,
        updates
      })
      
      this.emit('command-added', { key, command })
      return true
    } catch (error) {
      console.error('Failed to add command:', error)
      this.ui?.showToast?.('Failed to add command', 'error')
      return false
    }
  }

  /** Delete command */
  async deleteCommand (key, index) {
    const profile = this.getCurrentProfile()
    if (!profile) return false

    const isAliasContext =
      this.currentEnvironment === 'alias' ||
      (this.cache.aliases && Object.prototype.hasOwnProperty.call(this.cache.aliases, key))

    const updates = {}

    if (isAliasContext) {
      const currentAlias = this.cache.aliases && this.cache.aliases[key]
      if (!currentAlias || !currentAlias.commands) return false

      const commands = currentAlias.commands
        .split(/\s*\$\$\s*/)
        .filter((cmd) => cmd.trim().length > 0)

      if (index >= 0 && index < commands.length) {
        commands.splice(index, 1)
        updates.aliases = {
          ...this.cache.aliases,
          [key]: {
            ...this.cache.aliases[key],
            commands: commands.join(' $$ ')
          }
        }
      }
    } else {
      const currentKeys = this.cache.keys[key] || []
      if (currentKeys[index]) {
        const newKeys = [...currentKeys]
        newKeys.splice(index, 1)
        
        updates.builds = {
          ...this.cache.builds,
          [this.currentEnvironment]: {
            ...this.cache.builds[this.currentEnvironment],
            keys: {
              ...this.cache.builds[this.currentEnvironment].keys,
              [key]: newKeys
            }
          }
        }
      }
    }

    try {
      // Update via DataCoordinator
      await request(this.eventBus, 'data:update-profile', {
        profileId: this.cache.currentProfile,
        updates
      })
      
      this.emit('command-deleted', { key, index })
      return true
    } catch (error) {
      console.error('Failed to delete command:', error)
      return false
    }
  }

  /** Move command */
  async moveCommand (key, fromIndex, toIndex) {
    const profile = this.getCurrentProfile()
    if (!profile) return false

    const updates = {}

    if (this.currentEnvironment === 'alias') {
      const currentAlias = this.cache.aliases && this.cache.aliases[key]
      if (!currentAlias || !currentAlias.commands) return false

      const commands = currentAlias.commands
        .split(/\s*\$\$\s*/)
        .filter((cmd) => cmd.trim().length > 0)

      if (
        fromIndex >= 0 &&
        fromIndex < commands.length &&
        toIndex >= 0 &&
        toIndex < commands.length
      ) {
        const [moved] = commands.splice(fromIndex, 1)
        commands.splice(toIndex, 0, moved)
        
        updates.aliases = {
          ...this.cache.aliases,
          [key]: {
            ...this.cache.aliases[key],
            commands: commands.join(' $$ ')
          }
        }
      }
    } else {
      const currentKeys = this.cache.keys[key] || []
      if (
        fromIndex >= 0 &&
        fromIndex < currentKeys.length &&
        toIndex >= 0 &&
        toIndex < currentKeys.length
      ) {
        const newKeys = [...currentKeys]
        const [moved] = newKeys.splice(fromIndex, 1)
        newKeys.splice(toIndex, 0, moved)
        
        updates.builds = {
          ...this.cache.builds,
          [this.currentEnvironment]: {
            ...this.cache.builds[this.currentEnvironment],
            keys: {
              ...this.cache.builds[this.currentEnvironment].keys,
              [key]: newKeys
            }
          }
        }
      }
    }

    try {
      // Update via DataCoordinator
      await request(this.eventBus, 'data:update-profile', {
        profileId: this.cache.currentProfile,
        updates
      })
      
      this.emit('command-moved', { key, fromIndex, toIndex })
      return true
    } catch (error) {
      console.error('Failed to move command:', error)
      return false
    }
  }

  /* ------------------------------------------------------------------
   * Command lookup helpers (unchanged from library)
   * ------------------------------------------------------------------ */
  async findCommandDefinition (command) {
    try {
      const hasCommands = await request(this.eventBus, 'data:has-commands')
      if (!hasCommands) return null
      
      // Special Tray logic is preserved from original implementation (copy-paste)
      const isTrayExec = command.command && command.command.includes('TrayExec')
      if (isTrayExec) {
        const trayCategory = await request(this.eventBus, 'data:get-tray-category')
        if (trayCategory) {
          if (command.command.includes('TrayExecByTrayWithBackup') && command.command.includes('$$')) {
            return { commandId: 'tray_range_with_backup', ...trayCategory.commands.tray_range_with_backup }
          } else if (
            (command.command.includes('STOTrayExecByTray') || command.command.includes('TrayExecByTray')) &&
            command.command.includes('$$') &&
            !command.command.includes('WithBackup')
          ) {
            return { commandId: 'tray_range', ...trayCategory.commands.tray_range }
          } else if (command.command.includes('TrayExecByTrayWithBackup')) {
            return { commandId: 'tray_with_backup', ...trayCategory.commands.tray_with_backup }
          } else if (
            command.command.includes('STOTrayExecByTray') ||
            (command.command.includes('TrayExecByTray') && !command.command.includes('WithBackup'))
          ) {
            return { commandId: 'custom_tray', ...trayCategory.commands.custom_tray }
          }
        }
      }

      const category = await request(this.eventBus, 'data:get-command-category', { categoryId: command.type })
      if (!category) return null

      for (const [cmdId, cmdDef] of Object.entries(category.commands)) {
        if (cmdDef.command === command.command) {
          return { commandId: cmdId, ...cmdDef }
        }
      }

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

  async getCommandWarning (command) {
    try {
      const hasCommands = await request(this.eventBus, 'data:has-commands')
      if (!hasCommands) return null

      const categories = await request(this.eventBus, 'data:get-commands')
      for (const [categoryId, category] of Object.entries(categories)) {
        for (const [cmdId, cmdData] of Object.entries(category.commands)) {
          if (
            cmdData.command === command.command ||
            cmdData.name === command.text ||
            (command.command && command.command.includes(cmdData.command))
          ) {
            return cmdData.warning || null
          }
        }
      }
      return null
    } catch (error) {
      // Fallback if DataService not available
      return null
    }
  }

  /* ------------------------------------------------------------------ */
  generateCommandId () {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * REFACTORED: Set up event listeners for DataCoordinator integration
   */
  setupEventListeners() {
    // REFACTORED: Listen to DataCoordinator broadcasts instead of direct storage access
    
    // Cache profile state from DataCoordinator broadcasts
    this.addEventListener('profile:updated', ({ profileId, profile }) => {
      if (profileId === this.cache.currentProfile) {
        this.updateCacheFromProfile(profile)
      }
    })

    // Profile switched (new modular event)
    this.addEventListener('profile:switched', ({ profileId, profile, environment }) => {
      this.currentProfile = profileId
      this.cache.currentProfile = profileId
      
      if (environment) {
        this.currentEnvironment = environment
        this.cache.currentEnvironment = environment
      }
      
      this.updateCacheFromProfile(profile)
    })

    // Late-join support now handled by ComponentBase automatically

    // Listen for key selection changes
    this.addEventListener('key-selected', (data) => {
      this.selectedKey = data.key
      this.selectedAlias = null // Clear alias selection when key is selected
    })

    // Listen for alias selection changes
    this.addEventListener('alias-selected', (data) => {
      this.selectedAlias = data.name
      this.selectedKey = null // Clear key selection when alias is selected
    })

    // Listen for environment changes (space ↔ ground ↔ alias)
    this.addEventListener('environment:changed', (data) => {
      const env = typeof data === 'string' ? data : data?.environment
      if (env) {
        this.currentEnvironment = env
        this.cache.currentEnvironment = env
        
        // Update keys cache for new environment
        this.cache.keys = this.cache.builds[env]?.keys || {}
        
        // Clear selections when environment changes since they're context-specific
        this.selectedKey = null
        this.selectedAlias = null
      }
    })

    // Listen for command addition events from UI components (broadcast pattern)
    this.addEventListener('command:add', async (data) => {
      console.log('[CommandService] command:add received:', data)
      const { command, key, position } = data
      console.log('[CommandService] extracted:', { command, key, position })
      const result = await this.addCommand(key, command, position)
      console.log('[CommandService] addCommand result:', result)
    })
  }

  /**
   * Update local cache from profile data
   */
  updateCacheFromProfile(profile) {
    if (!profile) return
    
    this.cache.profile = profile
    
    // Update builds structure
    this.cache.builds = profile.builds || {
      space: { keys: {} },
      ground: { keys: {} }
    }
    
    // Update aliases
    this.cache.aliases = profile.aliases || {}
    
    // Update keys for current environment
    this.cache.keys = this.cache.builds[this.cache.currentEnvironment]?.keys || {}
  }

  /**
   * Return all commands associated with a key for the current environment.
   * Alias environment returns the split command string array.
   * REFACTORED: Now uses cached data
   */
  getCommandsForKey (key) {
    if (this.currentEnvironment === 'alias') {
      const alias = this.cache.aliases && this.cache.aliases[key]
      if (!alias || !alias.commands) return []
      return alias.commands.split(/\s*\$\$\s*/).filter(c => c.trim().length > 0)
    }
    return this.cache.keys[key] || []
  }

  /**
   * Placeholder command validator – always returns true.
   * Can be expanded later with proper validation logic.
   */
  validateCommand (command) {
    if (!command) return { valid: false, reason: 'empty' }
    return { valid: true }
  }

  /* ------------------------------------------------------------------
   * Late-join state sharing
   * ------------------------------------------------------------------ */
  getCurrentState() {
    return {
      selectedKey: this.selectedKey,
      selectedAlias: this.selectedAlias,
      currentEnvironment: this.currentEnvironment,
      currentProfile: this.currentProfile
    }
  }

  handleInitialState (sender, state) {
    if (!state) return
    
    // Handle state from DataCoordinator via ComponentBase late-join
    if (sender === 'DataCoordinator' && state.currentProfileData) {
      const profile = state.currentProfileData
      this.currentProfile = profile.id
      this.cache.currentProfile = profile.id
      this.currentEnvironment = profile.environment || 'space'
      this.cache.currentEnvironment = this.currentEnvironment
      
      this.updateCacheFromProfile(profile)
      
      console.log(`[${this.componentName}] Received initial state from DataCoordinator`)
    }
    
    // Handle state from other CommandService instances
    if (sender === 'CommandService') {
      this.selectedKey = state.selectedKey ?? this.selectedKey
      this.selectedAlias = state.selectedAlias ?? this.selectedAlias
    }
    
    // Handle state from KeyService
    if (sender === 'KeyService' && state.selectedKey) {
      this.selectedKey = state.selectedKey
    }
  }

  /**
   * Cleanup method to detach all request/response handlers
   */
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
} 