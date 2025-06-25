import ComponentBase from '../ComponentBase.js'

/**
 * CommandLibraryService - Handles all command library business logic
 * Manages command definitions, command chains, and command operations
 */
export default class CommandLibraryService extends ComponentBase {
  constructor({ storage, eventBus, i18n, ui, modalManager, commandService = null }) {
    super(eventBus)
    this.storage = storage
    this.i18n = i18n
    this.ui = ui
    this.modalManager = modalManager
    this.commandService = commandService
    this.selectedKey = null
    this.currentEnvironment = 'space'
    this.currentProfile = null
    this.commandIdCounter = 0

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
    })

    // Listen for alias selection – treat it as a key but force alias env
    this.addEventListener('alias-selected', ({ name }) => {
      if (!name) return
      this.selectedKey = name
      this.currentEnvironment = 'alias'
    })

    // Listen for environment changes (space ↔ ground ↔ alias)
    this.addEventListener('environment-changed', (data) => {
      this.currentEnvironment = data.environment
      this.selectedKey = null
    })

    // Listen for profile service events
    this.eventBus.on('profile-switched', (data) => {
      this.currentProfile = data.profileId
      this.currentEnvironment = data.environment
    })
  
    this.eventBus.on('environment-changed', (data) => {
      this.currentEnvironment = data.environment
      this.selectedKey = null
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

    // Listen for high-level mode changes emitted by InterfaceModeService
    // to cover cases where only `mode-changed` is dispatched.
    this.eventBus.on('mode-changed', ({ newMode }) => {
      this.currentEnvironment = newMode
      this.selectedKey = null
    })
  }

  /**
   * Set the selected key
   */
  setSelectedKey(key) {
    this.selectedKey = key
  }

  /**
   * Set the current environment
   */
  setCurrentEnvironment(environment) {
    this.currentEnvironment = environment
  }

  /**
   * Set the current profile
   */
  setCurrentProfile(profile) {
    this.currentProfile = profile
  }

  /**
   * Get the current profile ID
   */
  getCurrentProfileId() {
    return this.currentProfile
  }

  /**
   * Get commands for the selected key based on current environment
   */
  getCommandsForSelectedKey() {
    if (!this.selectedKey) return []

    let commands = []
    let profile

    if (this.currentEnvironment === 'alias') {
      // For aliases, get the raw profile since aliases are profile-level, not build-specific
      profile = this.storage.getProfile(this.currentProfile)
      if (!profile) return []

      const alias = profile.aliases && profile.aliases[this.selectedKey]
      if (alias && alias.commands) {
        // Convert alias command string to command array format
        const commandStrings = alias.commands.split(/\s*\$\$\s*/).map(cmd => cmd.trim()).filter(cmd => cmd.length > 0)
        commands = commandStrings.map((cmd, index) => {
          // Find the command definition to get the correct icon and name
          const commandDef = this.findCommandDefinition({ command: cmd })
          return {
            command: cmd,
            text: commandDef ? commandDef.name : cmd,
            type: 'alias',
            icon: commandDef ? commandDef.icon : '🎭',
            id: `alias_${index}`
          }
        })
      }
    } else {
      // For keybinds, use the build-specific view
      profile = this.getCurrentProfile()
      if (!profile) return []

      // Filter out blank commands for display in the command chain
      const allCommands = profile.keys[this.selectedKey] || []
      commands = allCommands.filter(cmd => {
        if (!cmd || typeof cmd !== 'object') return false
        if (typeof cmd.command !== 'string') return false
        return cmd.command.trim().length > 0
      })
    }

    return commands
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
      currentCommands.push(command.command)
      
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
  getCommandChainPreview() {
    if (!this.selectedKey) {
      const selectText = this.currentEnvironment === 'alias' ? 
        this.i18n.t('select_an_alias_to_see_the_generated_command') : 
        this.i18n.t('select_a_key_to_see_the_generated_command')
      return selectText
    }

    const commands = this.getCommandsForSelectedKey()
    
    if (commands.length === 0) {
      if (this.currentEnvironment === 'alias') {
        return `alias ${this.selectedKey} <&  &>`
      } else {
        return `${this.selectedKey} ""`
      }
    }

    if (this.currentEnvironment === 'alias') {
      // For aliases, show the alias command format with <& and &> delimiters
      const commandString = commands.map((cmd) => cmd.command).join(' $$ ')
      return `alias ${this.selectedKey} <& ${commandString} &>`
    } else {
      // For keybinds, use the existing logic with optional mirroring
      const stabilizeCheckbox = document.getElementById('stabilizeExecutionOrder')
      const shouldStabilize = stabilizeCheckbox && stabilizeCheckbox.checked

      let commandString
      if (shouldStabilize && commands.length > 1) {
        commandString = this.generateMirroredCommandString(commands)
      } else {
        commandString = commands.map((cmd) => cmd.command).join(' $$ ')
      }

      return `${this.selectedKey} "${commandString}"`
    }
  }

  /**
   * Generate mirrored command string for stabilization
   */
  generateMirroredCommandString(commands) {
    const forwardCommands = commands.map(cmd => cmd.command)
    const reverseCommands = [...commands].slice(0, -1).reverse().map(cmd => cmd.command)
    return `${forwardCommands.join(' $$ ')} $$ ${reverseCommands.join(' $$ ')}`
  }

  /**
   * Get empty state information
   */
  getEmptyStateInfo() {
    if (!this.selectedKey) {
      const selectText = this.currentEnvironment === 'alias' ? 
        this.i18n.t('select_an_alias_to_edit') : 
        this.i18n.t('select_a_key_to_edit')
      const previewText = this.currentEnvironment === 'alias' ? 
        this.i18n.t('select_an_alias_to_see_the_generated_command') : 
        this.i18n.t('select_a_key_to_see_the_generated_command')
      
      const emptyIcon = this.currentEnvironment === 'alias' ? 'fas fa-mask' : 'fas fa-keyboard'
      const emptyTitle = this.currentEnvironment === 'alias' ? this.i18n.t('no_alias_selected') : this.i18n.t('no_key_selected')
      const emptyDesc = this.currentEnvironment === 'alias' ? 
        this.i18n.t('select_alias_from_left_panel') : 
        this.i18n.t('select_key_from_left_panel')
      
      return {
        title: selectText,
        preview: previewText,
        icon: emptyIcon,
        emptyTitle,
        emptyDesc,
        commandCount: '0'
      }
    }

    const commands = this.getCommandsForSelectedKey()
    const chainType = this.currentEnvironment === 'alias' ? 'Alias Chain' : 'Command Chain'
    
    if (commands.length === 0) {
      const emptyMessage = this.currentEnvironment === 'alias' ? 
        `${this.i18n.t('click_add_command_to_start_building_your_alias_chain')} ${this.selectedKey}.` :
        `${this.i18n.t('click_add_command_to_start_building_your_command_chain')} ${this.selectedKey}.`
      
      return {
        title: `${chainType} for ${this.selectedKey}`,
        preview: this.getCommandChainPreview(),
        icon: 'fas fa-plus-circle',
        emptyTitle: this.i18n.t('no_commands'),
        emptyDesc: emptyMessage,
        commandCount: '0'
      }
    }

    return {
      title: `${chainType} for ${this.selectedKey}`,
      preview: this.getCommandChainPreview(),
      commandCount: commands.length.toString()
    }
  }
}
