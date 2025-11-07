import ComponentBase from '../ComponentBase.js'

/**
 * CommandLibraryService - Handles all command library business logic
 * Manages command definitions, command chains, and command operations
 */
export default class CommandLibraryService extends ComponentBase {
  constructor({ eventBus, i18n, ui, modalManager }) {
    super(eventBus)
    this.componentName = 'CommandLibraryService'
    this._instanceId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
    this.i18n           = i18n
    this.ui             = ui
    this.modalManager   = modalManager


    // Store detach functions for cleanup
    this._responseDetachFunctions = []

    // Register Request/Response endpoints for external callers
    if (this.eventBus) {
      this._responseDetachFunctions.push(
        this.respond('command:find-definition', ({ command }) => this.findCommandDefinition(command)),
        this.respond('command:get-warning', ({ command }) => this.getCommandWarning(command)),
        this.respond('command:get-categories',    () => this.getCommandCategories()),
        this.respond('command:generate-id',       () => this.generateCommandId()),
        this.respond('command:get-combined-aliases', async () => await this.getCombinedAliases()),
        this.respond('command:filter-library', () => {
          this.filterCommandLibrary()
          return true
        }),
      )
    }
  }

  onInit() {
    this.setupEventListeners()
  }

  // Event Listeners
  setupEventListeners() {
    // Listen for environment changes (space ↔ ground ↔ alias)
    this.addEventListener('environment:changed', (data) => {
      const env = typeof data === 'string' ? data : data?.environment
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[CommandLibraryService] environment:changed event received. data:`, data, `parsed env: ${env}`)
      }
      if (env) {
        // ComponentBase handles this.cache.currentEnvironment automatically
        
        // REMOVED: Selection clearing now handled by SelectionService
        
        // Re-apply environment-based filtering whenever mode changes
        // (UI components may also re-apply text search afterwards)
        this.filterCommandLibrary()
        
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.log(`[CommandLibraryService] after environment change to ${env}`)
        }
      }
    })

    // Listen for language changes and update i18n instance
    this.addEventListener('language:changed', async () => {
      // Update the i18n instance to use the latest language
      if (typeof window !== 'undefined' && window.i18next) {
        this.i18n = window.i18next
      }
      
      // Clear parser cache to refresh translated display text
      try {
        await this.request('parser:clear-cache')
      } catch (error) {
        console.warn('[CommandLibraryService] Could not clear parser cache:', error)
      }
      
      // Clear cached display names for VFX aliases and regenerate
      await this.updateCombinedAliases()
      this.emit('aliases-changed', { aliases: this.cache.combinedAliases })
    })

    // Listen for VFX settings changes to update virtual aliases
    this.addEventListener('vfx:settings-changed', async () => {
      await this.updateCombinedAliases()
      // Emit event to notify UI components that aliases have changed
      this.emit('aliases-changed', { aliases: this.cache.combinedAliases })
    })
  }

  // Get combined aliases (real profile aliases + virtual VFX aliases)
  async getCombinedAliases() {
    const realAliases = { ...this.cache.aliases }
    
    // Get virtual VFX aliases from VFXManagerService
    try {
      const virtualVFXAliases = await this.request('vfx:get-virtual-aliases') || {}
      return { ...realAliases, ...virtualVFXAliases }
    } catch (error) {
      // VFXManagerService might not be available - just return real aliases
      return realAliases
    }
  }

  // Update the combined aliases cache
  async updateCombinedAliases() {
    // This will be called whenever profile changes or VFX settings change
    this.cache.combinedAliases = await this.getCombinedAliases()
  }

  
  // Find command definition and apply i18n translations
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

  // Translate a command definition using i18n
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


  // Get command warning information
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

  // Generate a unique command ID
  generateCommandId() {
    return `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }

  // Get command categories for the library
  async getCommandCategories() {
    try {
      const hasCommands = await this.request('data:has-commands')
      if (!hasCommands) return {}

      // Deep-clone commands so we do NOT mutate the shared STO_DATA structure
      const baseCategories = await this.request('data:get-commands')
      const categories = (typeof structuredClone === 'function')
        ? structuredClone(baseCategories)
        : JSON.parse(JSON.stringify(baseCategories))



      return categories
    } catch (error) {
      return {}
    }
  }

  // Filter command library based on current environment
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
        if (this.cache.currentEnvironment === 'alias') {
          // In alias mode, show all commands (env not relevant)
          isVisible = true
        } else {
          // Respect environment property when present
          isVisible = !commandDef.environment || commandDef.environment === this.cache.currentEnvironment
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



  // ComponentBase late-join support for DataCoordinator integration
  handleInitialState(sender, state) {
    // Handle VFX state from VFXManagerService
    if (sender === 'VFXManagerService' && state) {
      console.log(`[CommandLibraryService] Received VFX state via late-join:`, state)

      // Update combined aliases when VFX state is received
      this.updateCombinedAliases().then(() => {
        console.log(`[CommandLibraryService] Updated combined aliases after VFX late-join`)
        this.emit('aliases-changed', { aliases: this.cache.combinedAliases })
      }).catch(error => {
        console.error('[CommandLibraryService] Failed to update combined aliases after VFX late-join:', error)
      })
    }
  }

  // Cleanup method to detach all request/response handlers
  onDestroy() {
    if (this._responseDetachFunctions) {
      this._responseDetachFunctions.forEach(detach => {
        if (typeof detach === 'function') {
          detach()
        }
      })
      this._responseDetachFunctions = []
    }
  }
}
