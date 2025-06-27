import ComponentBase from '../ComponentBase.js'
import { request, respond } from '../../core/requestResponse.js'

/**
 * CommandLibraryService - Handles all command library business logic
 * Manages command definitions, command chains, and command operations
 */
export default class CommandLibraryService extends ComponentBase {
  constructor({ storage, eventBus, i18n, ui, modalManager, commandService = null }) {
    super(eventBus)
    this.componentName = 'CommandLibraryService'
    this._instanceId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.storage        = storage
    this.i18n           = i18n
    this.ui             = ui
    this.modalManager   = modalManager
    this.commandService = commandService

    this.currentProfile = null
    this.currentEnvironment = 'space'
    this.selectedKey = null
    this.selectedAlias = null

    // Store detach functions for cleanup
    this._responseDetachFunctions = []

    // ---------------------------------------------------------
    // Register Request/Response endpoints for external callers
    // ---------------------------------------------------------
    if (this.eventBus) {
      this._responseDetachFunctions.push(
        respond(this.eventBus, 'command:get-for-selected-key', async () => await this.getCommandsForSelectedKey()),
        respond(this.eventBus, 'command:get-empty-state-info', async () => await this.getEmptyStateInfo()),
        respond(this.eventBus, 'command:find-definition', ({ command }) => this.findCommandDefinition(command)),
        respond(this.eventBus, 'command:get-warning', ({ command }) => this.getCommandWarning(command)),
        respond(this.eventBus, 'command:get-categories',    () => this.getCommandCategories()),
        respond(this.eventBus, 'command:generate-id',       () => this.generateCommandId()),
        respond(this.eventBus, 'command:filter-library', () => {
          this.filterCommandLibrary()
          return true
        })
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
  onInit() {
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

    // Listen for profile service events
    this.eventBus.on('profile-switched', (data) => {
      this.currentProfile = data.profileId
      this.currentEnvironment = data.environment
    })
  
    this.eventBus.on('environment:changed', (data) => {
      const env = typeof data === 'string' ? data : data?.environment
      if (env) {
        this.currentEnvironment = env
        this.selectedKey = null  // Clear selection when environment changes
      }
    })

    // Keep selectedKey in sync with UI selections
    if (this.eventBus) {
      this.eventBus.on('key-selected', ({ key, name } = {}) => {
        this.selectedKey = key || name || null
      })

      this.eventBus.on('alias-selected', ({ name } = {}) => {
        if (!name) return
        this.currentEnvironment = 'alias'
        this.selectedKey = name
      })
    }


  }

  /**
   * Get commands for the currently selected key/alias
   */
  async getCommandsForSelectedKey() {
    // Use the appropriate cached selection based on current environment
    const selectedKey = this.currentEnvironment === 'alias' ? this.selectedAlias : this.selectedKey
    if (!selectedKey) return []

    const profile = this.getCurrentProfile()
    if (!profile) return []

    if (this.currentEnvironment === 'alias') {
      // For aliases, parse the command string using FileOperationsService
      const alias = profile.aliases && profile.aliases[selectedKey]
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
      // For keybinds, return the command array
      return profile.keys && profile.keys[selectedKey] ? profile.keys[selectedKey] : []
    }
  }

  /**
   * Get the current profile with build-specific data
   */
  getCurrentProfile() {
    if (!this.currentProfile) return null

    const profile = this.storage.getProfile(this.currentProfile)
    if (!profile) return null

    return this.getCurrentBuild(profile)
  }

  /**
   * Get the current build for a profile
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
   * Find a command definition by command object
   */
  findCommandDefinition(command) {
    if (this.commandService && typeof this.commandService.findCommandDefinition === 'function') {
      return this.commandService.findCommandDefinition(command)
    }
    if (!globalThis.STO_DATA || !globalThis.STO_DATA.commands) return null

    // --------------------------------------------------------------------
    // Special handling for Tray Execution style commands
    // These commands embed tray/slot parameters, so the literal match used
    // for most commands (which compares against a sample command string)
    // will fail (e.g. "+STOTrayExecByTray 1 1" vs sample "+STOTrayExecByTray 0 0").
    // We therefore detect them heuristically and map them back to the
    // correct library entry so that the UI can display the friendly name.
    // --------------------------------------------------------------------
    if (command && typeof command.command === 'string' && command.command.includes('TrayExec')) {
      const trayCategory = globalThis.STO_DATA.commands.tray
      if (trayCategory) {
        const categoryId = 'tray'

        // 1. TrayExecByTrayWithBackup variants --------------------------------
        if (command.command.includes('TrayExecByTrayWithBackup')) {
          // a) Range with backup (multiple commands separated by $$)
          if (command.command.includes('$$')) {
            const def = trayCategory.commands.tray_range_with_backup
            if (def) {
              return { ...def, commandId: 'tray_range_with_backup', categoryId }
            }
          }
          // b) Single tray slot with backup
          const def = trayCategory.commands.tray_with_backup
          if (def) {
            return { ...def, commandId: 'tray_with_backup', categoryId }
          }
        }

        // 2. STOTrayExecByTray / TrayExecByTray variants ----------------------
        if (
          command.command.includes('STOTrayExecByTray') ||
          (command.command.includes('TrayExecByTray') && !command.command.includes('WithBackup'))
        ) {
          // a) Range across many slots (command chain using $$)
          if (command.command.includes('$$')) {
            const def = trayCategory.commands.tray_range
            if (def) {
              return { ...def, commandId: 'tray_range', categoryId }
            }
          }
          // b) Single tray slot (custom tray execution)
          const def = trayCategory.commands.custom_tray
          if (def) {
            return { ...def, commandId: 'custom_tray', categoryId }
          }
        }
      }
    }

    // Generic lookup (exact match or containment) ---------------------------
    for (const [categoryId, category] of Object.entries(globalThis.STO_DATA.commands)) {
      for (const [cmdId, cmdData] of Object.entries(category.commands)) {
        if (
          cmdData.command === command.command ||
          cmdData.name === command.text ||
          (command.command && command.command.includes(cmdData.command))
        ) {
          return { ...cmdData, commandId: cmdId, categoryId }
        }
      }
    }

    return null
  }

  /**
   * Get command warning information
   */
  getCommandWarning(command) {
    if (this.commandService && typeof this.commandService.getCommandWarning === 'function') {
      return this.commandService.getCommandWarning(command)
    }
    if (!globalThis.STO_DATA || !globalThis.STO_DATA.commands) return null

    const categories = globalThis.STO_DATA.commands

    for (const [categoryId, category] of Object.entries(categories)) {
      for (const [cmdId, cmdData] of Object.entries(category.commands)) {
        // Match by command text or actual command
        if (
          cmdData.command === command.command ||
          cmdData.name === command.text ||
          command.command.includes(cmdData.command)
        ) {
          return cmdData.warning || null
        }
      }
    }

    return null
  }

  /**
   * Add a command to the selected key
   */
  addCommand(key, command) {
    if (this.commandService && typeof this.commandService.addCommand === 'function') {
      return this.commandService.addCommand(key, command)
    }
    if (!this.selectedKey) {
      this.ui.showToast(this.i18n.t('please_select_a_key_first'), 'warning')
      return false
    }

    const profile = this.getCurrentProfile()
    if (!profile) {
      this.ui.showToast(this.i18n.t('no_valid_profile'), 'error')
      return false
    }

    if (this.currentEnvironment === 'alias') {
      // For aliases, we need to update the alias command string
      const currentAlias = profile.aliases && profile.aliases[key]
      const currentCommands = currentAlias && currentAlias.commands ? currentAlias.commands.split(/\s*\$\$\s*/).filter(cmd => cmd.trim().length > 0) : []
      
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
      // For keybinds, add to the keys array
      if (!profile.keys[key]) profile.keys[key] = []
      profile.keys[key].push(command)
    }

    this.storage.saveProfile(this.currentProfile, profile)
    this.emit('command-added', { key, command })
    return true
  }

  /**
   * Delete a command from the selected key
   */
  deleteCommand(key, index) {
    if (this.commandService && typeof this.commandService.deleteCommand === 'function') {
      return this.commandService.deleteCommand(key, index)
    }
    const profile = this.getCurrentProfile()
    if (!profile) return false

    // Robustly determine if we're dealing with an alias chain. This covers
    // cases where `currentEnvironment` might have fallen out-of-sync yet the
    // key exists in the profile's `aliases` map (observed bug #ALIAS-DEL-1).
    const isAliasContext = this.currentEnvironment === 'alias' ||
      (profile.aliases && Object.prototype.hasOwnProperty.call(profile.aliases, key))

    console.log('isAliasContext', isAliasContext)
    
    if (isAliasContext) {
      // ----- Alias chain deletion -----
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
      // ----- Key-bind deletion (unchanged) -----
      if (profile.keys[key] && profile.keys[key][index]) {
        profile.keys[key].splice(index, 1)
      }
    }

    this.storage.saveProfile(this.currentProfile, profile)
    this.emit('command-deleted', { key, index })
    return true
  }

  /**
   * Move a command to a new position
   */
  moveCommand(key, fromIndex, toIndex) {
    if (this.commandService && typeof this.commandService.moveCommand === 'function') {
      return this.commandService.moveCommand(key, fromIndex, toIndex)
    }
    const profile = this.getCurrentProfile()
    if (!profile) return false

    if (this.currentEnvironment === 'alias') {
      // For aliases, reorder the command string
      const currentAlias = profile.aliases && profile.aliases[key]
      if (!currentAlias || !currentAlias.commands) return false

      const commands = currentAlias.commands.split(/\s*\$\$\s*/).filter(cmd => cmd.trim().length > 0)
      if (fromIndex >= 0 && fromIndex < commands.length && toIndex >= 0 && toIndex < commands.length) {
        const [movedCommand] = commands.splice(fromIndex, 1)
        commands.splice(toIndex, 0, movedCommand)
        const newCommandString = commands.join(' $$ ')
        profile.aliases[key].commands = newCommandString
      }
    } else {
      // For keybinds, reorder the array
      if (profile.keys[key] && fromIndex >= 0 && fromIndex < profile.keys[key].length && 
          toIndex >= 0 && toIndex < profile.keys[key].length) {
        const [movedCommand] = profile.keys[key].splice(fromIndex, 1)
        profile.keys[key].splice(toIndex, 0, movedCommand)
      }
    }

    this.storage.saveProfile(this.currentProfile, profile)
    this.emit('command-moved', { key, fromIndex, toIndex })
    return true
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
  getCommandCategories() {
    if (!globalThis.STO_DATA || !globalThis.STO_DATA.commands) return {}
    return globalThis.STO_DATA.commands
  }

  /**
   * Filter command library based on current environment
   */
  filterCommandLibrary() {
    if (!globalThis.STO_DATA || !globalThis.STO_DATA.commands) return

    const commandItems = document.querySelectorAll('.command-item')
    commandItems.forEach(item => {
      const commandId = item.dataset.command
      if (!commandId) return

      // Find the command definition
      let commandDef = null
      for (const [catId, catData] of Object.entries(globalThis.STO_DATA.commands)) {
        if (catData.commands[commandId]) {
          commandDef = catData.commands[commandId]
          break
        }
      }

      if (commandDef) {
        let isVisible
        if (this.currentEnvironment === 'alias') {
          // In alias mode, show all commands as alias commands are not environment-specific
          isVisible = true
        } else {
          // Check if command has environment restriction
          if (commandDef.environment) {
            // If command has specific environment, only show it in that environment
            isVisible = commandDef.environment === this.currentEnvironment
          } else {
            // If no environment specified, show in all environments
            isVisible = true
          }
        }
        item.style.display = isVisible ? 'block' : 'none'
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
        return `alias ${selectedKey} <&  &>`
      } else {
        return `${selectedKey} ""`
      }
    }

    if (this.currentEnvironment === 'alias') {
      // For aliases, show the alias command format with <& and &> delimiters
      const commandString = commands.map((cmd) => cmd.command).join(' $$ ')
      return `alias ${selectedKey} <& ${commandString} &>`
    } else {
      // For keybinds, use the existing logic with optional mirroring
      const stabilizeCheckbox = document.getElementById('stabilizeExecutionOrder')
      const shouldStabilize = stabilizeCheckbox && stabilizeCheckbox.checked

      let commandString
      if (shouldStabilize && commands.length > 1) {
        commandString = await this.generateMirroredCommandString(commands)
      } else {
        commandString = commands.map((cmd) => cmd.command).join(' $$ ')
      }

      return `${selectedKey} "${commandString}"`
    }
  }

  /**
   * Generate mirrored command string for stabilization
   */
  async generateMirroredCommandString(commands) {
    return await request(this.eventBus, 'fileops:generate-mirrored-commands', { commands })
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

  handleInitialState(sender, state) {
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
