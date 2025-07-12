import ComponentBase from '../ComponentBase.js'
import { respond, request } from '../../core/requestResponse.js'
import { normalizeToString, normalizeToStringArray } from '../../lib/commandDisplayAdapter.js'

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
        this.respond('command:add', async ({ command, key, position, bindset }) => 
          this.addCommand(key, command, bindset || position)),
        this.respond('command:edit', async ({ key, index, updatedCommand, bindset }) => 
          this.editCommand(key, index, updatedCommand, bindset)),
        this.respond('command:validate', ({ command }) => 
          this.validateCommand(command)),
        this.respond('command:delete', async ({ key, index, bindset }) =>
          this.deleteCommand(key, index, bindset)),
        this.respond('command:move', async ({ key, fromIndex, toIndex, bindset }) =>
          this.moveCommand(key, fromIndex, toIndex, bindset))
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
  /** Add command to key or alias */
  async addCommand (key, command, bindset = null) {
    const profile = this.getCurrentProfile()
    if (!profile) {
      this.ui?.showToast?.(this.i18n.t('no_valid_profile'), 'error')
      return false
    }

    // Determine if we should use a bindset (when bindset is specified and not in alias mode)
    const useBindset = (bindset && bindset !== 'Primary Bindset' && this.currentEnvironment !== 'alias')

    // Get current alias commands (handle both legacy string and new array format)
    const currentAlias = this.cache.aliases && this.cache.aliases[key]
    let currentCommands = []
    if (currentAlias && Array.isArray(currentAlias.commands)) {
      currentCommands = [...currentAlias.commands]
    }
    
    // Normalize commands to canonical strings
    const commandsToAdd = Array.isArray(command) 
      ? normalizeToStringArray(command)
      : [normalizeToString(command)]
    
    // Filter out empty commands
    const validCommands = commandsToAdd.filter(cmd => cmd.length > 0)
    if (validCommands.length === 0) {
      console.warn('CommandService: No valid commands to add')
      return false
    }
    
    // Add normalized commands to current list  
    currentCommands.push(...validCommands)

    // ----- Key-bind -----
    let currentKeys = []
    if (useBindset) {
      currentKeys = (profile.bindsets?.[bindset]?.[this.currentEnvironment]?.keys?.[key]) || []
    } else {
      currentKeys = this.cache.keys[key] || []
    }
    
    // Use the same normalized commands for keybinds
    const newKeys = [...currentKeys, ...validCommands]
    
    try {
      // Build explicit operations object
      const ops = {}
      if (this.currentEnvironment === 'alias') {
        console.log('[CommandService] addCommand: alias')
        const aliasExists = !!profile.aliases?.[key]
        if (aliasExists) {
          ops.modify = {
            aliases: {
              [key]: {
                ...(profile.aliases[key] || {}),
                commands: currentCommands // Use array format
              }
            }
          }
        } else {
          ops.add = {
            aliases: {
              [key]: {
                commands: currentCommands,
                description: '',
                type: 'alias'
              }
            }
          }
        }
      } else if (!useBindset) {
        const keyExists = !!profile.builds?.[this.currentEnvironment]?.keys?.[key]
        if (keyExists) {
          ops.modify = {
            builds: {
              [this.currentEnvironment]: {
                keys: { [key]: newKeys }
              }
            }
          }
        } else {
          ops.add = {
            builds: {
              [this.currentEnvironment]: {
                keys: { [key]: newKeys }
              }
            }
          }
        }
      } else {
        // Bindset path
        const bindsetExists = !!profile.bindsets?.[bindset]
        const envExists = !!profile.bindsets?.[bindset]?.[this.currentEnvironment]
        const bsSection = profile.bindsets?.[bindset]?.[this.currentEnvironment]?.keys || {}
        // If bindset or environment does not exist, use add; otherwise always use modify
        if (!bindsetExists || !envExists) {
          ops.add = {
            bindsets: {
              [bindset]: {
                [this.currentEnvironment]: {
                  keys: { [key]: newKeys }
                }
              }
            }
          }
        } else {
          ops.modify = {
            bindsets: {
              [bindset]: {
                [this.currentEnvironment]: {
                  keys: { [key]: newKeys }
                }
              }
            }
          }
        }
        console.log('[CommandService] addCommand: bindset update', {
          bindset,
          environment: this.currentEnvironment,
          key,
          bindsetExists,
          envExists,
          ops,
          currentKeys: bsSection,
          profileBindsets: profile.bindsets?.[bindset]?.[this.currentEnvironment]?.keys
        })
      }

      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        ...ops
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
  async deleteCommand (key, index, bindset = null) {
    // Determine if we should use a bindset (when bindset is specified and not in alias mode)
    const useBindset = (bindset && bindset !== 'Primary Bindset' && this.currentEnvironment !== 'alias')

    const profile = this.getCurrentProfile()
    if (!profile) return false

    if (!key || index === undefined) return false

    const isAliasContext = this.currentEnvironment === 'alias' ||
      (this.cache.aliases && Object.prototype.hasOwnProperty.call(this.cache.aliases, key))

    let payload = null
    let updatedCommands = null // capture latest commands for event emission

    if (isAliasContext) {
      const aliasObj = this.cache.aliases[key]
      if (!aliasObj || !Array.isArray(aliasObj.commands)) return false

      const commandsArr = [...aliasObj.commands]

      if (index < 0 || index >= commandsArr.length) return false

      commandsArr.splice(index, 1)

      // Store for later emission
      updatedCommands = [...commandsArr]

      if (commandsArr.length === 0) {
        payload = { delete: { aliases: [key] } }
      } else {
        payload = {
          modify: {
            aliases: {
              [key]: {
                ...aliasObj,
                commands: commandsArr // Keep as array in new format
              }
            }
          }
        }
      }
    } else {
      // Fetch commands from appropriate location depending on active bindset
      const keyCommands = useBindset
        ? (profile.bindsets?.[bindset]?.[this.currentEnvironment]?.keys?.[key] || [])
        : (this.cache.keys[key] || [])

      if (!keyCommands[index]) return false

      const newKeyCommands = [...keyCommands]
      newKeyCommands.splice(index, 1)

      // Store for later emission
      updatedCommands = [...newKeyCommands]

      // Build explicit operations
      if (useBindset) {
        payload = {
          modify: {
            bindsets: {
              [bindset]: {
                [this.currentEnvironment]: {
                  keys: { [key]: newKeyCommands }
                }
              }
            }
          }
        }
      } else {
        if (newKeyCommands.length === 0) {
          payload = {
            delete: {
              builds: {
                [this.currentEnvironment]: {
                  keys: [key]
                }
              }
            }
          }
        } else {
          payload = {
            modify: {
              builds: {
                [this.currentEnvironment]: {
                  keys: { [key]: newKeyCommands }
                }
              }
            }
          }
        }
      }
    }

    if (!payload) return false

    try {
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        ...payload
      })
      
      // Emit event with the commands we just computed
      this.emit('command-deleted', { key, index, commands: updatedCommands })
      return true
    } catch (error) {
      console.error('Failed to delete command:', error)
      this.ui?.showToast?.('Failed to delete command', 'error')
      return false
    }
  }

  /** Move command */
  async moveCommand (key, fromIndex, toIndex, bindset = null) {
    const useBindset = (bindset && bindset !== 'Primary Bindset' && this.currentEnvironment !== 'alias')

    const profile = this.getCurrentProfile()
    if (!profile) return false

    let payload = null

    if (this.currentEnvironment === 'alias') {
      const aliasObj = this.cache.aliases && this.cache.aliases[key]
      if (!aliasObj || !Array.isArray(aliasObj.commands)) return false

      const commandsArr = [...aliasObj.commands]

      if (
        fromIndex < 0 || fromIndex >= commandsArr.length ||
        toIndex < 0 || toIndex >= commandsArr.length
      ) return false

      const [moved] = commandsArr.splice(fromIndex, 1)
      commandsArr.splice(toIndex, 0, moved)

      payload = {
        modify: {
          aliases: {
            [key]: {
              ...aliasObj,
              commands: commandsArr // Keep as array in new format
            }
          }
        }
      }
    } else {
      const keyCmds = useBindset
        ? (profile.bindsets?.[bindset]?.[this.currentEnvironment]?.keys?.[key] || [])
        : (this.cache.keys[key] || [])

      if (
        fromIndex < 0 || fromIndex >= keyCmds.length ||
        toIndex < 0 || toIndex >= keyCmds.length
      ) return false

      const newCmds = [...keyCmds]
      const [moved] = newCmds.splice(fromIndex, 1)
      newCmds.splice(toIndex, 0, moved)

      if (useBindset) {
        payload = {
          modify: {
            bindsets: {
              [bindset]: {
                [this.currentEnvironment]: {
                  keys: { [key]: newCmds }
                }
              }
            }
          }
        }
      } else {
        payload = {
          modify: {
            builds: {
              [this.currentEnvironment]: {
                keys: { [key]: newCmds }
              }
            }
          }
        }
      }
    }

    try {
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        ...payload
      })
      
      const updatedCmds = await this.fetchCommandsForKey(key, bindset)
      this.emit('command-moved', { key, fromIndex, toIndex, commands: updatedCmds })
      return true
    } catch (error) {
      console.error('Failed to move command:', error)
      return false
    }
  }

  /** Edit/Update a command at a specific index */
  async editCommand (key, index, updatedCommand, bindset = null) {
    console.log('[CommandService] editCommand called with:', { key, index, updatedCommand })
    
    if (!key || index === undefined || !updatedCommand) {
      console.warn('CommandService: Cannot edit command - missing key, index, or updated command')
      return false
    }

    const useBindset = (bindset && bindset !== 'Primary Bindset' && this.currentEnvironment !== 'alias')

    const profile = this.getCurrentProfile()
    if (!profile) {
      this.ui?.showToast?.('No valid profile', 'error')
      return false
    }

    let payload = null

    if (this.currentEnvironment === 'alias') {
      const aliasObj = this.cache.aliases[key]
      if (!aliasObj || !Array.isArray(aliasObj.commands)) return false

      const commandsArr = [...aliasObj.commands]

      if (index < 0 || index >= commandsArr.length) return false

      // Normalize updated command to string
      const commandString = normalizeToString(updatedCommand)
      commandsArr[index] = commandString

      payload = {
        modify: {
          aliases: {
            [key]: {
              ...aliasObj,
              commands: commandsArr // Keep as array in new format
            }
          }
        }
      }
    } else {
      const keyCmds = useBindset
        ? (profile.bindsets?.[bindset]?.[this.currentEnvironment]?.keys?.[key] || [])
        : (this.cache.keys[key] || [])

      if (index < 0 || index >= keyCmds.length) return false

      const newCmds = [...keyCmds]
      // Normalize updated command to string for keybinds too
      newCmds[index] = normalizeToString(updatedCommand)

      if (useBindset) {
        payload = {
          modify: {
            bindsets: {
              [bindset]: {
                [this.currentEnvironment]: {
                  keys: { [key]: newCmds }
                }
              }
            }
          }
        }
      } else {
        payload = {
          modify: {
            builds: {
              [this.currentEnvironment]: {
                keys: { [key]: newCmds }
              }
            }
          }
        }
      }
    }

    console.log('[CommandService] editCommand updates:', payload)
    
    try {
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        ...payload
      })
      
      console.log('[CommandService] editCommand completed successfully')
      const updatedCmds = await this.fetchCommandsForKey(key, bindset)
      this.emit('command-edited', { key, index, updatedCommand, commands: updatedCmds })
      return true
    } catch (error) {
      console.error('Failed to edit command:', error)
      this.ui?.showToast?.('Failed to update command', 'error')
      return false
    }
  }

  /* ------------------------------------------------------------------
   * Command lookup helpers (unchanged from library)
   * ------------------------------------------------------------------ */
  async findCommandDefinition (command) {
    try {
      const hasCommands = await this.request('data:has-commands')
      if (!hasCommands) return null
      
      // Special Tray logic is preserved from original implementation (copy-paste)
      const isTrayExec = command.command && command.command.includes('TrayExec')
      if (isTrayExec) {
        const trayCategory = await this.request('data:get-tray-category')
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

      const category = await this.request('data:get-command-category', { categoryId: command.type })
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
      const hasCommands = await this.request('data:has-commands')
      if (!hasCommands) return null

      const categories = await this.request('data:get-commands')
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
      const { command, key, bindset } = data
      console.log('[CommandService] extracted:', { command, key, bindset })
      const result = await this.addCommand(key, command, bindset)
      console.log('[CommandService] addCommand result:', result)
    })

    // Listen for command edit events from UI components (broadcast pattern)
    this.addEventListener('command:edit', async (data) => {
      console.log('[CommandService] command:edit received:', data)
      const { key, index, updatedCommand, bindset = null } = data
      console.log('[CommandService] extracted:', { key, index, updatedCommand, bindset })
      const result = await this.editCommand(key, index, updatedCommand, bindset)
      console.log('[CommandService] editCommand result:', result)
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
    
    // Update keys for current environment – prefer flattened profile.keys if present
    if (profile.keys) {
      this.cache.keys = profile.keys
    } else {
      this.cache.keys = this.cache.builds[this.cache.currentEnvironment]?.keys || {}
    }
  }

  /**
   * Return all commands associated with a key for the current environment.
   * Alias environment returns the command array (now normalized to string[]).
   * REFACTORED: Now uses cached data and handles normalized string arrays
   */
  getCommandsForKey (key) {
    if (this.currentEnvironment === 'alias') {
      const alias = this.cache.aliases && this.cache.aliases[key]
      if (!alias || !Array.isArray(alias.commands)) return []
      
      return Array.isArray(alias.commands) ? alias.commands : []
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
      selectedAlias: this.selectedAlias
      // REMOVED: currentEnvironment, currentProfile - not owned by CommandService
      // These will be managed by SelectionService (selection) and DataCoordinator (profile/environment)
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

  /** Helper: fetch latest commands for a key taking bindset into account */
  async fetchCommandsForKey (key, bindset = null) {
    try {
      if (this.currentEnvironment === 'alias') {
        return await this.request('command:get-for-selected-key')
      }
      const useBindset = (bindset && bindset !== 'Primary Bindset')
      if (useBindset) {
        const cmds = await this.request('bindset:get-key-commands', {
          bindset,
          environment: this.currentEnvironment,
          key
        })
        return Array.isArray(cmds) ? cmds : []
      }
      return await this.request('data:get-key-commands', {
        environment: this.currentEnvironment,
        key
      })
    } catch {
      return []
    }
  }
} 