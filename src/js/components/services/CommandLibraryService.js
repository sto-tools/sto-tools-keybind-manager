import ComponentBase from '../ComponentBase.js'
import { request, respond } from '../../core/requestResponse.js'
import { formatAliasLine } from '../../lib/STOFormatter.js'

/**
 * CommandLibraryService - Handles all command library business logic
 * Manages command definitions, command chains, and command operations
 * REFACTORED: Now uses DataCoordinator broadcast/cache pattern.
 */
export default class CommandLibraryService extends ComponentBase {
  constructor({ storage, eventBus, i18n, ui, modalManager }) {
    super(eventBus)
    this.componentName = 'CommandLibraryService'
    this._instanceId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.storage        = storage // Legacy reference (no longer used directly)
    this.i18n           = i18n
    this.ui             = ui
    this.modalManager   = modalManager

    this.currentProfile = null
    this.currentEnvironment = 'space'
    this.selectedKey = null
    this.selectedAlias = null

    // Cache for DataCoordinator data
    this.cache = {
      currentProfile: null,
      currentEnvironment: 'space',
      profile: null,
      keys: {},
      aliases: {}
    }

    // Store detach functions for cleanup
    this._responseDetachFunctions = []

    // ---------------------------------------------------------
    // Register Request/Response endpoints for external callers
    // ---------------------------------------------------------
    if (this.eventBus) {
      this._responseDetachFunctions.push(
        this.respond('command:get-for-selected-key', async () => await this.getCommandsForSelectedKey()),
        this.respond('command:get-empty-state-info', async () => await this.getEmptyStateInfo()),
        this.respond('command:find-definition', ({ command }) => this.findCommandDefinition(command)),
        this.respond('command:get-warning', ({ command }) => this.getCommandWarning(command)),
        this.respond('command:get-categories',    () => this.getCommandCategories()),
        this.respond('command:generate-id',       () => this.generateCommandId()),
        this.respond('command:filter-library', () => {
          this.filterCommandLibrary()
          return true
        }),
      )
    }

    // In test environments (Vitest/Jest), automatically make `emit` a spy so
    // expectations like `expect(service.emit).toHaveBeenCalled()` work without
    // the test needing to explicitly spy on it.
    if (typeof vi !== 'undefined' && typeof vi.fn === 'function' && !vi.isMockFunction?.(this.emit)) {
      const originalEmit = this.emit.bind(this)
      this.emit = vi.fn((...args) => originalEmit(...args))
    }
  }

  /**
   * Initialize the service
   */
  async init() {
    super.init() // ComponentBase handles late-join automatically
    this.setupEventListeners()
    this.setupRequestResponseEndpoints()
  }

  /**
   * Set up event listeners for DataCoordinator integration
   */
  setupEventListeners() {
    // Listen for DataCoordinator profile updates
    this.addEventListener('profile:updated', ({ profileId, profile }) => {
      if (profileId === this.cache.currentProfile) {
        this.updateCacheFromProfile(profile)
      }
    })

    // Listen for DataCoordinator profile switches
    this.addEventListener('profile:switched', ({ profileId, profile, environment }) => {
      this.currentProfile = profileId
      this.cache.currentProfile = profileId
      this.currentEnvironment = environment
      this.cache.currentEnvironment = environment
      
      this.updateCacheFromProfile(profile)
      
      // Clear selections when profile changes since they're context-specific
      this.selectedKey = null
      this.selectedAlias = null
    })

    // Listen for key selection changes
    this.addEventListener('key-selected', (data) => {
      this.selectedKey = data.key
      this.selectedAlias = null // Clear alias selection when key is selected
    })

    // Listen for alias selection changes
    this.addEventListener('alias-selected', (data) => {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[CommandLibraryService] alias-selected event received. data:`, data, `setting selectedAlias to: ${data.name}`)
      }
      this.selectedAlias = data.name
      this.selectedKey = null // Clear key selection when alias is selected
    })

    // Listen for environment changes (space ↔ ground ↔ alias)
    this.addEventListener('environment:changed', (data) => {
      const env = typeof data === 'string' ? data : data?.environment
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[CommandLibraryService] environment:changed event received. data:`, data, `parsed env: ${env}, current selectedAlias: ${this.selectedAlias}`)
      }
      if (env) {
        this.currentEnvironment = env
        this.cache.currentEnvironment = env
        
        // Only clear selections when switching AWAY from the current environment
        // Don't clear alias selection when switching TO alias mode (let auto-selection work)
        if (env !== 'alias') {
          this.selectedAlias = null
        }
        if (env === 'alias') {
          this.selectedKey = null // Clear key selection when switching to alias mode
        }
        
        // Re-apply environment-based filtering whenever mode changes
        // (UI components may also re-apply text search afterwards)
        this.filterCommandLibrary()
        
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.log(`[CommandLibraryService] after environment change to ${env}. selectedKey: ${this.selectedKey}, selectedAlias: ${this.selectedAlias}`)
        }
      }
    })

    // Listen for language changes and update i18n instance
    this.addEventListener('language:changed', () => {
      // Update the i18n instance to use the latest language
      if (typeof window !== 'undefined' && window.i18next) {
        this.i18n = window.i18next
      }
    })
  }

  /**
   * Update cache from profile data (DataCoordinator integration)
   */
  updateCacheFromProfile(profile) {
    if (!profile) return
    
    // Auto-migrate any legacy rich command objects to plain strings
    this.normalizeKeyArrays(profile)
    
    this.cache.profile = profile
    this.cache.aliases = profile.aliases || {}
    // Preserve metadata for mirroring decisions
    this.cache.profile.keybindMetadata = profile.keybindMetadata || {}
    this.cache.profile.aliasMetadata   = profile.aliasMetadata   || {}
    
    // Update keys for current environment
    const currentBuild = profile.builds?.[this.cache.currentEnvironment]
    this.cache.keys = currentBuild?.keys || {}
  }

  /**
   * Get commands for the currently selected key/alias using cached data
   */
  async getCommandsForSelectedKey() {
    // Use the appropriate cached selection based on current environment
    const selectedKey = this.currentEnvironment === 'alias' ? this.selectedAlias : this.selectedKey
    if (!selectedKey) return []

    const profile = this.getCurrentProfile()
    if (!profile) return []

    if (this.currentEnvironment === 'alias') {
      const alias = profile.aliases && profile.aliases[selectedKey]
      if (!alias || !Array.isArray(alias.commands)) return []
      // Return shallow copy to avoid external mutation
      return [...alias.commands]
    }

    // Keybinds path – keys arrays are already canonical string[]
    const keyCommands = profile.keys && profile.keys[selectedKey] ? profile.keys[selectedKey] : []
    return Array.isArray(keyCommands) ? [...keyCommands] : []
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
      keybindMetadata: profile.keybindMetadata || {},
      aliasMetadata: profile.aliasMetadata || {}
    }
  }

  /**
   * Find command definition and apply i18n translations
   */
  async findCommandDefinition(command) {
    try {
      const hasCommands = await this.request('data:has-commands')
      if (!hasCommands) return null

      const categories = await this.request('data:get-commands')

      // Support rich command objects or canonical strings (arrays already normalized)
      const cmdString = (typeof command === 'string') ? command.trim() : (command?.command || '').trim()
      const cmdDisplay = (typeof command === 'string') ? command.trim() : (command?.text || '').trim()
      
      // First pass: exact matches only
      for (const [categoryId, category] of Object.entries(categories)) {
        for (const [cmdId, cmdData] of Object.entries(category.commands)) {
          if (
            cmdData.command === cmdString ||
            cmdData.name === cmdDisplay
          ) {
            // Apply i18n translation to the command definition
            const translatedDef = this.translateCommandDefinition(cmdData, cmdId)
            return { ...translatedDef, commandId: cmdId, categoryId }
          }
        }
      }
      
      // Second pass: containment matches (only for specific known cases like tray commands)
      for (const [categoryId, category] of Object.entries(categories)) {
        for (const [cmdId, cmdData] of Object.entries(category.commands)) {
          if (cmdString) {
            // Build a base pattern (command keyword only, no parameters)
            const basePatternRaw = cmdData.command.split(/\s+/)[0]  // e.g. '+STOTrayExecByTray'
            // Build relaxed patterns – remove leading '+STO' or '+' so that
            // '+TrayExecByTray', 'TrayExecByTray', '+STOTrayExecByTray' all match
            const basePatternNoPlus     = basePatternRaw.replace(/^\+/, '')
            const basePatternNoStoPlus  = basePatternRaw.replace(/^\+?STO/, '')
            const basePatternPlusNoSto  = basePatternRaw.replace(/^\+?STO/, '+') // keeps leading '+' but drops STO

            const variants = new Set([
              basePatternRaw,
              basePatternNoPlus,
              basePatternNoStoPlus,
              basePatternPlusNoSto,
            ])

            // Escape regex special characters to avoid errors (e.g. leading '+')
            const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

            const wordBoundaryRegexes = Array.from(variants)
              .filter(Boolean)
              .map(v => new RegExp(`^${escapeRegex(v)}(\\s|$)`, 'i'))

            // Also test against cmdString without leading '+' so +Command matches definitions without plus.
            const cmdStringNoPlus = cmdString.replace(/^\+/, '')
            const startsWithBase = wordBoundaryRegexes.some(r => r.test(cmdString) || r.test(cmdStringNoPlus))

            // Only allow partial matching for specific cases:
            // 1. Tray execution commands (contain "TrayExec")
            // 2. Commands that start with the definition command (for parameterized commands)
            const isTrayCommand = /TrayExec/i.test(cmdString)
            
            if ((isTrayCommand && startsWithBase) || startsWithBase) {
              // Apply i18n translation to the command definition
              const translatedDef = this.translateCommandDefinition(cmdData, cmdId)
              return { ...translatedDef, commandId: cmdId, categoryId }
            }
          }
        }
      }

      return null
    } catch (error) {
      // Fallback if DataService not available
      return null
    }
  }

  /**
   * Translate a command definition using i18n
   */
  translateCommandDefinition(cmdData, cmdId) {
    if (!this.i18n) return cmdData

    const translatedDef = { ...cmdData }
    
    // Translate name – fall back to original if no translation available
    const nameKey = `command_definitions.${cmdId}.name`
    translatedDef.name = this.i18n.t(nameKey, { defaultValue: cmdData.name })
    
    // Translate description – fall back to original if no translation available
    const descKey = `command_definitions.${cmdId}.description`
    translatedDef.description = this.i18n.t(descKey, { defaultValue: cmdData.description })
    
    return translatedDef
  }

  /**
   * Format display text from parser, handling i18n-compatible objects
   */
  formatDisplayText(displayText) {
    if (typeof displayText === 'string') {
      return displayText
    }
    
    if (typeof displayText === 'object' && displayText.key) {
      if (!this.i18n) return displayText.fallback
      
      // Get the base translated name
      const baseName = this.i18n.t(displayText.key, { defaultValue: displayText.fallback })
      
      // Add parameters if present
      if (displayText.params) {
        const { tray, slot, backup_tray, backup_slot } = displayText.params
        
        if (backup_tray !== undefined && backup_slot !== undefined) {
          // Tray with backup format
          return `${baseName} (${tray} ${slot} -> ${backup_tray} ${backup_slot})`
        } else if (tray !== undefined && slot !== undefined) {
          // Simple tray format
          return `${baseName} (${tray} ${slot})`
        }
      }
      
      return baseName
    }
    
    return displayText
  }

  /**
   * Get command warning information
   */
  async getCommandWarning(command) {
    try {
      const hasCommands = await this.request('data:has-commands')
      if (!hasCommands) return null

      const categories = await this.request('data:get-commands')

      // Normalize input – support canonical string or rich object
      const cmdStr = typeof command === 'string' ? command.trim() : (command?.command || '').trim()

      // First pass: exact matches only
      for (const [categoryId, category] of Object.entries(categories)) {
        for (const [cmdId, cmdData] of Object.entries(category.commands)) {
          if (
            (cmdStr && cmdData.command === cmdStr) ||
            (typeof command === 'object' && (cmdData.command === command.command || cmdData.name === command.text))
          ) {
            return cmdData.warning || null
          }
        }
      }
      
      // Second pass: containment matches (only for specific known cases like tray commands)
      for (const [categoryId, category] of Object.entries(categories)) {
        for (const [cmdId, cmdData] of Object.entries(category.commands)) {
          const target = cmdStr || command.command
          if (target && target.includes(cmdData.command)) {
            // Only allow partial matching for specific cases:
            // 1. Tray execution commands (contain "TrayExec")
            // 2. Commands that start with the definition command (for parameterized commands)
            const isTrayCommand = target.includes('TrayExec')
            const startsWithDefinition = target.startsWith(cmdData.command)
            
            if (isTrayCommand || startsWithDefinition) {
              return cmdData.warning || null
            }
          }
        }
      }

      return null
    } catch (error) {
      // Fallback if DataService not available
      return null
    }
  }

  /**
   * Generate a unique command ID
   */
  generateCommandId() {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get command categories for the library
   */
  async getCommandCategories() {
    try {
      const hasCommands = await this.request('data:has-commands')
      if (!hasCommands) return {}
      return await this.request('data:get-commands')
    } catch (error) {
      return {}
    }
  }

  /**
   * Filter command library based on current environment
   */
  async filterCommandLibrary() {
    try {
      const hasCommands = await this.request('data:has-commands')
      if (!hasCommands) return

      const commandItems = document.querySelectorAll('.command-item')
      const commands = await this.request('data:get-commands')
      
      commandItems.forEach(item => {
        const commandId = item.dataset.command
        if (!commandId) return

        // Find the command definition
        let commandDef = null
        for (const [catId, catData] of Object.entries(commands)) {
          if (catData.commands[commandId]) {
            commandDef = catData.commands[commandId]
            break
          }
        }

      if (commandDef) {
        let isVisible
        if (this.currentEnvironment === 'alias') {
          // In alias mode, show all commands (env not relevant)
          isVisible = true
        } else {
          // Respect environment property when present
          isVisible = !commandDef.environment || commandDef.environment === this.currentEnvironment
        }

        // Mark whether hidden by env filter for search logic
        item.dataset.envHidden = (!isVisible).toString()

        // Only change style if env filter dictates hiding/showing; don't un-hide items already hidden by search
        if (isVisible) {
          if (item.style.display === '' || item.style.display === 'none') {
            // Use flex to preserve original layout
            item.style.display = 'flex'
          }
        } else {
          item.style.display = 'none'
        }
      }
    })

    // Hide/show categories based on whether they have visible commands
    const categories = document.querySelectorAll('.category')
    categories.forEach((category) => {
      const visibleCommands = category.querySelectorAll(
        '.command-item:not([style*="display: none"])'
      )
      const categoryVisible = visibleCommands.length > 0
      category.style.display = categoryVisible ? 'block' : 'none'
    })
    } catch (error) {
      // Fallback if DataService not available
      console.warn('CommandLibraryService: filterCommandLibrary failed:', error)
    }
  }

  /**
   * Get command chain preview text
   */
  async getCommandChainPreview() {
    // Use the appropriate cached selection based on current environment
    const selectedKey = this.currentEnvironment === 'alias' ? this.selectedAlias : this.selectedKey

    if (!selectedKey) {
      const selectText = this.currentEnvironment === 'alias' ? 
        this.i18n.t('select_an_alias_to_see_the_generated_command') : 
        this.i18n.t('select_a_key_to_see_the_generated_command')
      return selectText
    }

    const commands = await this.getCommandsForSelectedKey()
    
    if (commands.length === 0) {
      if (this.currentEnvironment === 'alias') {
        return formatAliasLine(selectedKey, { commands: '' }).trim()
      } else {
        return `${selectedKey} ""`
      }
    }

    if (this.currentEnvironment === 'alias') {
      // For aliases, mirror when metadata requests it
      const profile = this.getCurrentProfile()
      console.log('[CommandLibraryService] alias : getCommandChainPreview: profile', profile)
      let shouldStabilize = false
      if (profile && profile.aliasMetadata && profile.aliasMetadata[selectedKey] && profile.aliasMetadata[selectedKey].stabilizeExecutionOrder) {
        shouldStabilize = true
      }

      let commandString
      if (shouldStabilize && commands.length > 1) {
        commandString = await this.generateMirroredCommandString(commands)
      } else {
        // Normalize commands before joining
        const normalizedCommands = await this.normalizeCommandsForDisplay(commands)
        commandString = normalizedCommands.join(' $$ ')
      }

      return formatAliasLine(selectedKey, { commands: commandString }).trim()
    } else {
      // For keybinds, determine mirroring based on per-key metadata
      const profile = this.getCurrentProfile()
      console.log('[CommandLibraryService] keybind : getCommandChainPreview: profile', profile)
      let shouldStabilize = false
      if (profile && profile.keybindMetadata && profile.keybindMetadata[this.currentEnvironment] &&
          profile.keybindMetadata[this.currentEnvironment][selectedKey] &&
          profile.keybindMetadata[this.currentEnvironment][selectedKey].stabilizeExecutionOrder) {
        shouldStabilize = true
      }

      let commandString
      if (shouldStabilize && commands.length > 1) {
        commandString = await this.generateMirroredCommandString(commands)
      } else {
        // Normalize commands before joining
        const normalizedCommands = await this.normalizeCommandsForDisplay(commands)
        commandString = normalizedCommands.join(' $$ ')
      }

      return `${selectedKey} "${commandString}"`
    }
  }

  /**
   * Generate mirrored command string for stabilization
   */
  async generateMirroredCommandString(commands) {
    return await this.request('fileops:generate-mirrored-commands', { commands })
  }

  /**
   * Normalize commands for display by applying tray execution normalization
   */
  async normalizeCommandsForDisplay(commands) {
    const normalizedCommands = []

    for (const cmd of commands) {
      // Support both canonical string and rich object formats
      const cmdStr = typeof cmd === 'string' ? cmd : (cmd && cmd.command) || ''
      if (!cmdStr) {
        continue
      }
      try {
        // Parse the command to check if it's a tray execution command
        const parseResult = await this.request('parser:parse-command-string', {
          commandString: cmdStr,
          options: { generateDisplayText: false }
        })

        if (parseResult.commands && parseResult.commands[0]) {
          const parsedCmd = parseResult.commands[0]
          // Check if it's a tray execution command that needs normalization
          if (parsedCmd.signature &&
              (parsedCmd.signature.includes('TrayExecByTray') ||
               parsedCmd.signature.includes('TrayExecByTrayWithBackup')) &&
              parsedCmd.parameters) {
            const params = parsedCmd.parameters
            const active = params.active !== undefined ? params.active : 1
            if (parsedCmd.signature.includes('TrayExecByTrayWithBackup')) {
              // Handle TrayExecByTrayWithBackup normalization
              const baseCommand = params.baseCommand || 'TrayExecByTrayWithBackup'
              const commandType = baseCommand.replace(/^\+/, '')
              if (active === 1) {
                normalizedCommands.push(`+${commandType} ${params.tray} ${params.slot} ${params.backup_tray} ${params.backup_slot}`)
              } else {
                normalizedCommands.push(`${commandType} ${active} ${params.tray} ${params.slot} ${params.backup_tray} ${params.backup_slot}`)
              }
            } else {
              // Regular TrayExecByTray normalization
              const baseCommand = params.baseCommand || 'TrayExecByTray'
              const commandType = baseCommand.replace(/^\+/, '')
              if (active === 1) {
                normalizedCommands.push(`+${commandType} ${params.tray} ${params.slot}`)
              } else {
                normalizedCommands.push(`${commandType} ${active} ${params.tray} ${params.slot}`)
              }
            }
          } else {
            normalizedCommands.push(cmdStr)
          }
        } else {
          normalizedCommands.push(cmdStr)
        }
      } catch (error) {
        console.warn('[CommandLibraryService] Failed to normalize command for display:', cmdStr, error)
        normalizedCommands.push(cmdStr)
      }
    }

    return normalizedCommands
  }

  /**
   * Get empty state information
   */
  async getEmptyStateInfo() {
    // Use the appropriate cached selection based on current environment
    const selectedKey = this.currentEnvironment === 'alias' ? this.selectedAlias : this.selectedKey

    if (!selectedKey) {
      const selectText = this.currentEnvironment === 'alias' ? 
        this.i18n.t('select_an_alias_to_edit') || 'Select an alias to edit' : 
        this.i18n.t('select_a_key_to_edit') || 'Select a key to edit'
      const previewText = this.currentEnvironment === 'alias' ? 
        this.i18n.t('select_an_alias_to_see_the_generated_command') || 'Select an alias to see the generated command' : 
        this.i18n.t('select_a_key_to_see_the_generated_command') || 'Select a key to see the generated command'
      
      const emptyIcon = this.currentEnvironment === 'alias' ? 'fas fa-mask' : 'fas fa-keyboard'
      const emptyTitle = this.currentEnvironment === 'alias' ? 
        this.i18n.t('no_alias_selected') || 'No Alias Selected' : 
        this.i18n.t('no_key_selected') || 'No Key Selected'
      const emptyDesc = this.currentEnvironment === 'alias' ? 
        this.i18n.t('select_alias_from_left_panel') || 'Select an alias from the left panel to view and edit its command chain.' : 
        this.i18n.t('select_key_from_left_panel') || 'Select a key from the left panel to view and edit its command chain.'
      
        return {
        title: selectText,
        preview: previewText,
        icon: emptyIcon,
        emptyTitle,
        emptyDesc,
        commandCount: '0'
      }
    }

    const commands = await this.getCommandsForSelectedKey()
    const chainType = this.currentEnvironment === 'alias' ? 'Alias Chain' : 'Command Chain'

    if (commands.length === 0) {
      const emptyMessage = this.currentEnvironment === 'alias' ? 
        `${this.i18n.t('click_add_command_to_start_building_your_alias_chain') || 'Click "Add Command" to start building your alias chain for'} ${selectedKey}.` :
        `${this.i18n.t('click_add_command_to_start_building_your_command_chain') || 'Click "Add Command" to start building your command chain for'} ${selectedKey}.`
      
      return {
        title: `${chainType} for ${selectedKey}`,
        preview: await this.getCommandChainPreview(),
        icon: 'fas fa-plus-circle',
        emptyTitle: this.i18n.t('no_commands') || 'No Commands',
        emptyDesc: emptyMessage,
        commandCount: '0'
      }
    }

    return {
      title: `${chainType} for ${selectedKey}`,
      preview: await this.getCommandChainPreview(),
      commandCount: commands.length.toString()
    }
  }

  /* ------------------------------------------------------------------
   * ComponentBase late-join support for DataCoordinator integration
   * ------------------------------------------------------------------ */
  getCurrentState() {
    return {
      selectedKey: this.selectedKey,
      selectedAlias: this.selectedAlias,
      currentEnvironment: this.currentEnvironment,
      currentProfile: this.currentProfile
    }
  }

  handleInitialState(sender, state) {
    if (!state) return
    
    // Handle state from DataCoordinator via ComponentBase late-join
    if (sender === 'DataCoordinator' && state.currentProfileData) {
      const profile = state.currentProfileData
      this.currentProfile = profile.id
      this.cache.currentProfile = profile.id
      this.currentEnvironment = profile.environment || 'space'
      this.cache.currentEnvironment = this.currentEnvironment
      
      this.updateCacheFromProfile(profile)
    }
    
    // Handle state from other services
    if (sender === 'KeyService' && state.selectedKey) {
      this.selectedKey = state.selectedKey
    }
    
    if (sender === 'AliasBrowserService' && state.selectedAliasName) {
      this.selectedAlias = state.selectedAliasName
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

  setupRequestResponseEndpoints() {
    // Store detach functions for cleanup
    if (!this._responseDetachFunctions) {
      this._responseDetachFunctions = []
    }

    // Endpoint for getting command library data
    this._responseDetachFunctions.push(
      this.respond('command-library:get-data', () => {
        return {
          commandCategories: this.commandCategories,
          userCommands: this.userCommands
        }
      })
    )
  }

  // New method to normalize key arrays
  normalizeKeyArrays(profile) {
    if (!profile || !profile.builds) return

    ['space', 'ground'].forEach(env => {
      const envBuild = profile.builds[env]
      if (!envBuild || !envBuild.keys) return

      Object.entries(envBuild.keys).forEach(([k, arr]) => {
        if (!Array.isArray(arr)) return
        envBuild.keys[k] = arr
          .map(entry => typeof entry === 'string' ? entry : (entry && entry.command) || '')
          .filter(Boolean)
      })
    })
  }
}
