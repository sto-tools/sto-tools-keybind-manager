import ComponentBase from '../ComponentBase.js'
import { respond, request } from '../../core/requestResponse.js'

/**
 * CommandService – the authoritative service for creating, deleting and
 * rearranging commands in a profile.  It owns no UI concerns whatsoever.  A
 * higher-level feature (CommandLibraryService / future templates) can call
 * this service to persist changes and broadcast events.
 */
export default class CommandService extends ComponentBase {
  constructor({ storage, eventBus, i18n, profileService = null, modalManager = null }) {
    super(eventBus)
    this.componentName = 'CommandService'
    this.storage         = storage
    this.i18n            = i18n
    this.profileService  = profileService
    this.modalManager    = modalManager

    this.currentProfile  = null
    this.currentEnvironment = 'space'
    this.selectedKey = null
    this.selectedAlias = null

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
        respond(this.eventBus, 'command:add', ({ command, key, position }) => 
          this.addCommand(key, command, position)),
        respond(this.eventBus, 'command:reorder', ({ commandId, newPosition }) => 
          this.reorderCommand(commandId, newPosition)),
        respond(this.eventBus, 'command:validate', ({ command }) => 
          this.validateCommand(command))
      )
    }
  }

  /** Convenience getter */
  getCurrentProfileId () {
    return this.currentProfile
  }

  /* ------------------------------------------------------------------
   * Profile helpers – copied verbatim from the original CommandLibraryService
   * ------------------------------------------------------------------ */
  getCurrentProfile () {
    if (!this.currentProfile) return null
    const profile = this.storage.getProfile(this.currentProfile)
    if (!profile) return null
    return this.getCurrentBuild(profile)
  }

  getCurrentBuild (profile) {
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

  /* ------------------------------------------------------------------
   * Core command operations
   * ------------------------------------------------------------------ */
  /** Add a command (either to a keybind array or to an alias command string) */
  addCommand (key, command) {
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

    if (this.currentEnvironment === 'alias') {
      // ----- Alias chain -----
      const currentAlias = profile.aliases && profile.aliases[key]
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
      if (!profile.aliases) profile.aliases = {}
      if (!profile.aliases[key]) profile.aliases[key] = {}
      profile.aliases[key].commands = newCommandString
    } else {
      // ----- Key-bind -----
      if (!profile.keys[key]) profile.keys[key] = []
      profile.keys[key].push(command)
    }

    this.storage.saveProfile(this.currentProfile, profile)
    this.emit('command-added', { key, command })
    return true
  }

  /** Delete command */
  deleteCommand (key, index) {
    const profile = this.getCurrentProfile()
    if (!profile) return false

    const isAliasContext =
      this.currentEnvironment === 'alias' ||
      (profile.aliases && Object.prototype.hasOwnProperty.call(profile.aliases, key))

    if (isAliasContext) {
      const currentAlias = profile.aliases && profile.aliases[key]
      if (!currentAlias || !currentAlias.commands) return false

      const commands = currentAlias.commands
        .split(/\s*\$\$\s*/)
        .filter((cmd) => cmd.trim().length > 0)

      if (index >= 0 && index < commands.length) {
        commands.splice(index, 1)
        profile.aliases[key].commands = commands.join(' $$ ')
      }
    } else {
      if (profile.keys[key] && profile.keys[key][index]) {
        profile.keys[key].splice(index, 1)
      }
    }

    this.storage.saveProfile(this.currentProfile, profile)
    this.emit('command-deleted', { key, index })
    return true
  }

  /** Move command */
  moveCommand (key, fromIndex, toIndex) {
    const profile = this.getCurrentProfile()
    if (!profile) return false

    if (this.currentEnvironment === 'alias') {
      const currentAlias = profile.aliases && profile.aliases[key]
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
        profile.aliases[key].commands = commands.join(' $$ ')
      }
    } else {
      if (
        profile.keys[key] &&
        fromIndex >= 0 &&
        fromIndex < profile.keys[key].length &&
        toIndex >= 0 &&
        toIndex < profile.keys[key].length
      ) {
        const [moved] = profile.keys[key].splice(fromIndex, 1)
        profile.keys[key].splice(toIndex, 0, moved)
      }
    }

    this.storage.saveProfile(this.currentProfile, profile)
    this.emit('command-moved', { key, fromIndex, toIndex })
    return true
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

  onInit () {
    this.setupEventListeners()
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Listen for profile changes
    this.addEventListener('profile-switched', (data) => {
      this.currentProfile = data.profile
      this.currentEnvironment = data.environment
    })

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
        // Clear selections when environment changes since they're context-specific
        this.selectedKey = null
        this.selectedAlias = null
      }
    })

    // Listen for command addition events from UI components (broadcast pattern)
    this.addEventListener('command:add', (data) => {
      const { command, key, position } = data
      this.addCommand(key, command, position)
    })
  }

  /**
   * Return all commands associated with a key for the current environment.
   * Alias environment returns the split command string array.
   */
  getCommandsForKey (key) {
    const profile = this.getCurrentProfile()
    if (!profile) return []

    if (this.currentEnvironment === 'alias') {
      const alias = profile.aliases && profile.aliases[key]
      if (!alias || !alias.commands) return []
      return alias.commands.split(/\s*\$\$\s*/).filter(c => c.trim().length > 0)
    }
    return profile.keys[key] || []
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
    if (sender === 'ProfileService') {
      if (state.currentProfile) this.currentProfile = state.currentProfile
      if (state.currentEnvironment) this.currentEnvironment = state.currentEnvironment
    }
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