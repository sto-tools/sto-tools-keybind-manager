import ComponentBase from '../ComponentBase.js'
import { parameterCommands } from './ParameterCommandUI.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'
import i18next from 'i18next'

/**
 * CommandLibraryUI - Handles all command library UI operations
 * Manages command chain rendering, library setup, and user interactions
 */
export default class CommandLibraryUI extends ComponentBase {
  constructor({ service, eventBus, ui, modalManager, document }) {
    super(eventBus)
    this.componentName = 'CommandLibraryUI'
    this.service = service
    this.ui = ui
    this.modalManager = modalManager
    this.document = document || (typeof window !== 'undefined' ? window.document : null)
    this.eventListenersSetup = false

    // DataCoordinator cache for profile state
    this.cache = {
      profile: null,
      aliases: {},
      currentProfile: null
    }

    // Store current state for UI updates
    this._currentEnvironment = 'space'
    this._selectedKey = null
    this._selectedAlias = null
  }

  /**
   * Initialize the CommandLibraryUI component
   */
  onInit() {
    this.setupEventListeners()
    this.setupCommandLibrary()
  }

  /**
   * Set up all event listeners for command library UI
   */
  setupEventListeners() {
    if (this.eventListenersSetup) {
      return // Prevent duplicate event listener setup
    }
    this.eventListenersSetup = true

    // DataCoordinator profile state synchronization
    this.addEventListener('profile:updated', ({ profile }) => {
      this.updateCacheFromProfile(profile)
      this.updateCommandLibrary()
    })

    this.addEventListener('profile:switched', ({ profile }) => {
      this.updateCacheFromProfile(profile)
      this.updateCommandLibrary()
    })

    // Environment and selection changes
    this.addEventListener('environment:changed', ({ environment }) => {
      this._currentEnvironment = environment
    })

    this.addEventListener('key:selected', ({ key }) => {
      this._selectedKey = key
      this._selectedAlias = null
      this.updateChainActions()
    })

    this.addEventListener('alias:selected', ({ alias }) => {
      this._selectedAlias = alias
      this._selectedKey = null
      this.updateChainActions()
    })
    // Listen for language changes to refresh command library with new translations
    this.addEventListener('language:changed', () => {
      this.setupCommandLibrary()
    })

    // Listen for stabilize execution order checkbox changes
    this.eventBus.onDom('stabilizeExecutionOrder', 'change', 'stabilize-order-change', () => {
      // Command chain rendering is now handled by CommandChainUI
    })

    // Command lifecycle events are now handled by CommandChainUI
    // CommandLibraryUI no longer needs to listen to these events
  }

  /**
   * Setup the command library UI
   */
  async setupCommandLibrary() {
    const container = this.document.getElementById('commandCategories')
    if (!container) return

    container.innerHTML = ''

    const categories = await request(eventBus, 'command:get-categories')
    Object.entries(categories).forEach(([categoryId, category]) => {
      const categoryElement = this.createCategoryElement(categoryId, category)
      container.appendChild(categoryElement)
    })

    // Apply environment filtering after creating elements
    this.filterCommandLibrary()
    
    // Re-add aliases after rebuilding the command library
    // This ensures aliases are preserved when the library is rebuilt (e.g., on language change)
    this.updateCommandLibrary()
  }

  /**
   * Create a category element for the command library
   */
  createCategoryElement(categoryId, category) {
    const element = this.document.createElement('div') || {}
    if (!element.dataset) {
      element.dataset = {}
    }
    element.className = 'category'
    element.dataset.category = categoryId

    // Check if category should be collapsed (similar to Keys UI)
    const storageKey = `commandCategory_${categoryId}_collapsed`
    const isCollapsed = localStorage.getItem(storageKey) === 'true'

    element.innerHTML = `
      <h4 class="${isCollapsed ? 'collapsed' : ''}" data-category="${categoryId}">
        <i class="fas fa-chevron-right category-chevron"></i>
        <i class="${category.icon}"></i> 
        ${category.name}
        <span class="command-count">(${Object.keys(category.commands).length})</span>
      </h4>
      <div class="category-commands ${isCollapsed ? 'collapsed' : ''}">
        ${Object.entries(category.commands)
          .map(
            ([cmdId, cmd]) => {
              // Try to get translated name from i18n, fallback to original name
              const translationKey = `command_definitions.${cmdId}.name`
              const translatedName = (typeof i18next !== 'undefined' && i18next.exists(translationKey)) 
                ? i18next.t(translationKey) 
                : cmd.name
              
              // Try to get translated description from i18n, fallback to original description
              const descTranslationKey = `command_definitions.${cmdId}.description`
              const translatedDescription = (typeof i18next !== 'undefined' && i18next.exists(descTranslationKey)) 
                ? i18next.t(descTranslationKey) 
                : cmd.description
              
              return `
            <div class="command-item ${cmd.customizable ? 'customizable' : ''}" data-command="${cmdId}" title="${translatedDescription}${cmd.customizable ? ' (Customizable)' : ''}">
              ${cmd.icon} ${translatedName}${cmd.customizable ? ' <span class="param-indicator">⚙️</span>' : ''}
            </div>
          `
            }
          )
          .join('')}
      </div>
    `

    // Add click handler for category header
    const header = element.querySelector ? element.querySelector('h4') : null
    if (header && header.addEventListener) {
      header.addEventListener('click', () => {
        this.toggleCommandCategory(categoryId, element)
      })
    }

    // Add click handlers for commands
    if (element.addEventListener) {
      element.addEventListener('click', (e) => {
        if (e.target.classList.contains('command-item')) {
          const commandId = e.target.dataset.command
          const categoryId = e.target.closest('.category').dataset.category
          
          // Get the command definition from STO_DATA
          const commandDef = STO_DATA?.commands?.[categoryId]?.commands?.[commandId]
          if (!commandDef) return
          
          if (commandDef.customizable) {
            // For customizable commands, pass category/command info
            console.log('[CommandLibraryUI] emitting command-add [customizable]', { categoryId, commandId, commandDef })
            this.eventBus.emit('command-add', { categoryId, commandId, commandDef })
          } else {
            // For static commands, pass the fully-hydrated definition
            const fullyHydratedCommand = {
              command: commandDef.command,
              type: categoryId,
              icon: commandDef.icon,
              text: commandDef.name,
              id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
            }
            console.log('[CommandLibraryUI] emitting command-add [static]', { commandDef: fullyHydratedCommand })
            this.eventBus.emit('command-add', { commandDef: fullyHydratedCommand })
          }
        }
      })
    }

    return element
  }

  /**
   * Toggle command category collapse state
   */
  toggleCommandCategory(categoryId, element) {
    const header = element.querySelector('h4')
    const commands = element.querySelector('.category-commands')
    const chevron = header.querySelector('.category-chevron')

    const isCollapsed = commands.classList.contains('collapsed')
    const storageKey = `commandCategory_${categoryId}_collapsed`

    if (isCollapsed) {
      commands.classList.remove('collapsed')
      header.classList.remove('collapsed')
      chevron.style.transform = 'rotate(90deg)'
      localStorage.setItem(storageKey, 'false')
    } else {
      commands.classList.add('collapsed')
      header.classList.add('collapsed')
      chevron.style.transform = 'rotate(0deg)'
      localStorage.setItem(storageKey, 'true')
    }
  }

  /**
   * Create an alias category element for the command library
   */
  createAliasCategoryElement(
    aliases,
    categoryType = 'aliases',
    titleKey = 'command_aliases',
    iconClass = 'fas fa-mask'
  ) {
    const element = document.createElement('div')
    element.className = 'category'
    element.dataset.category = categoryType

    const storageKey = `commandCategory_${categoryType}_collapsed`
    const isCollapsed = localStorage.getItem(storageKey) === 'true'

    const isVertigo = categoryType === 'vertigo-aliases'
    const itemIcon = isVertigo ? '👁️' : '🎭'
    const itemClass = isVertigo
      ? 'command-item vertigo-alias-item'
      : 'command-item alias-item'

    element.innerHTML = `
            <h4 class="${isCollapsed ? 'collapsed' : ''}" data-category="${categoryType}">
                <i class="fas fa-chevron-right category-chevron"></i>
                <i class="${iconClass}"></i>
                ${typeof i18next !== 'undefined' ? i18next.t(titleKey) : titleKey}
                <span class="command-count">(${aliases.length})</span>
            </h4>
            <div class="category-commands ${isCollapsed ? 'collapsed' : ''}">
                ${aliases
                  .map(
                    ([name, alias]) => `
                    <div class="${itemClass}" data-alias="${name}" title="${alias.description || alias.commands}">
                        ${itemIcon} ${name}
                    </div>
                `
                  )
                  .join('')}
            </div>
        `

    const header = element.querySelector('h4')
    header.addEventListener('click', () => {
      this.toggleAliasCategory(categoryType, element)
    })

    element.addEventListener('click', (e) => {
      if (
        e.target.classList.contains('alias-item') ||
        e.target.classList.contains('vertigo-alias-item')
      ) {
        const aliasName = e.target.dataset.alias

        // Look up alias object from provided aliases list
        const aliasEntry = aliases.find(([n]) => n === aliasName)
        const alias = aliasEntry ? aliasEntry[1] : {}

        const fullyHydratedAlias = {
          command: aliasName,
          type: 'alias',
          icon: '🎭',
          text: `Alias: ${aliasName}`,
          description: alias.description,
          id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
        }
        console.log('[CommandLibraryUI] emitting command:add [alias]', { commandDef: fullyHydratedAlias })
        this.eventBus.emit('command-add', { commandDef: fullyHydratedAlias })
      }
    })

    return element
  }

  /**
   * Toggle alias category collapse state
   */
  toggleAliasCategory(categoryType, element) {
    const header = element.querySelector('h4')
    const commands = element.querySelector('.category-commands')
    const chevron = header.querySelector('.category-chevron')

    const isCollapsed = commands.classList.contains('collapsed')
    const storageKey = `commandCategory_${categoryType}_collapsed`

    if (isCollapsed) {
      commands.classList.remove('collapsed')
      header.classList.remove('collapsed')
      chevron.style.transform = 'rotate(90deg)'
      localStorage.setItem(storageKey, 'false')
    } else {
      commands.classList.add('collapsed')
      header.classList.add('collapsed')
      chevron.style.transform = 'rotate(0deg)'
      localStorage.setItem(storageKey, 'true')
    }
  }

  /**
   * Update the command library using cached profile data
   */
  updateCommandLibrary() {
    // Use cached profile data instead of making requests
    const profile = this.cache.profile
    if (!profile) return

    const categories = this.document.getElementById('commandCategories')
    if (!categories) return

    const existingAliasCategory = categories.querySelector('[data-category="aliases"]')
    if (existingAliasCategory) {
      existingAliasCategory.remove()
    }
    const existingVertigoCategory = categories.querySelector('[data-category="vertigo-aliases"]')
    if (existingVertigoCategory) {
      existingVertigoCategory.remove()
    }

    const allAliases = Object.entries(this.cache.aliases)
    const regularAliases = allAliases.filter(([name]) => !name.startsWith('dynFxSetFXExlusionList_'))
    const vertigoAliases = allAliases.filter(([name]) => name.startsWith('dynFxSetFXExlusionList_'))

    // Only create regular aliases category if there are regular aliases
    if (regularAliases.length > 0) {
      const aliasCategory = this.createAliasCategoryElement(
        regularAliases,
        'aliases',
        'command_aliases',
        'fas fa-mask'
      )
      categories.appendChild(aliasCategory)
    }

    // Only create VERTIGO category if there are VERTIGO aliases
    if (vertigoAliases.length > 0) {
      const vertigoCategory = this.createAliasCategoryElement(
        vertigoAliases,
        'vertigo-aliases',
        'vfx_aliases',
        'fas fa-eye-slash'
      )
      categories.appendChild(vertigoCategory)
    }
  }

  /**
   * Filter command library based on current environment
   */
  filterCommandLibrary() {
    // Delegate actual filtering logic to CommandLibraryService via request-response
    request(this.eventBus, 'command:filter-library').catch(()=>{})
  }  
  /**
   * Setup drag and drop for command reordering
   */
  setupDragAndDrop() {
    if (window.commandChainUI && typeof window.commandChainUI.setupDragAndDrop === 'function') {
      window.commandChainUI.setupDragAndDrop()
      return
    }

    // Fallback (test environment)
    const commandList = this.document.getElementById('commandList')
    if (!commandList || !this.ui || typeof this.ui.initDragAndDrop !== 'function') return

    this.ui.initDragAndDrop(commandList, {
      dragSelector: '.command-item-row',
      dropZoneSelector: '.command-item-row',
      onDrop: async (e, dragState, dropZone) => {
        // Use cached state from event listeners
        const selectedKey = this._currentEnvironment === 'alias' ? this._selectedAlias : this._selectedKey
        if (!selectedKey) return

        const fromIndex = parseInt(dragState.dragElement.dataset.index)
        const toIndex   = parseInt(dropZone.dataset.index)

        if (fromIndex !== toIndex) {
          // Delegate move via commandchain event so CommandChainService handles persistence
          this.eventBus.emit('commandchain:move', { fromIndex, toIndex })
        }
      },
    })
  }

  /**
   * Update chain action buttons state
   */
  updateChainActions() {
    if (window.commandChainUI && typeof window.commandChainUI.updateChainActions === 'function') {
      window.commandChainUI.updateChainActions()
      return
    }

    // Use cached state from event listeners
    const selectedKey = this._currentEnvironment === 'alias' ? this._selectedAlias : this._selectedKey
    const hasSelectedKey = !!selectedKey
    const doc = this.document

    if (this._currentEnvironment === 'alias') {
        ['deleteAliasChainBtn', 'duplicateAliasChainBtn'].forEach((id) => {
          const btn = doc.getElementById(id)
          if (btn) btn.disabled = !hasSelectedKey
        })
        const addCmdBtn = doc.getElementById('addCommandBtn')
        if (addCmdBtn) addCmdBtn.disabled = !hasSelectedKey
        ['importFromKeyBtn', 'deleteKeyBtn', 'duplicateKeyBtn'].forEach((id) => {
          const btn = doc.getElementById(id)
          if (btn) btn.disabled = true
        })
      } else {
        ['addCommandBtn', 'importFromKeyBtn', 'deleteKeyBtn', 'duplicateKeyBtn'].forEach((id) => {
          const btn = doc.getElementById(id)
          if (btn) btn.disabled = !hasSelectedKey
        })
        ['deleteAliasChainBtn', 'duplicateAliasChainBtn'].forEach((id) => {
          const btn = doc.getElementById(id)
          if (btn) btn.disabled = true
        })
      }
  }

  /**
   * Toggle library visibility
   */
  toggleLibrary() {
    const content = this.document.getElementById('libraryContent')
    const btn = this.document.getElementById('toggleLibraryBtn')

    if (content && btn) {
      const isCollapsed = content.style.display === 'none'
      content.style.display = isCollapsed ? 'block' : 'none'

      const icon = btn.querySelector('i')
      if (icon) {
        icon.className = isCollapsed ? 'fas fa-chevron-up' : 'fas fa-chevron-down'
      }
    }
  }

  /**
   * Show template modal
   */
  showTemplateModal() {
    this.ui?.showToast?.(i18next.t('template_system_coming_soon'))
  }

  /**
   * Update local cache from profile data received from DataCoordinator
   */
  updateCacheFromProfile(profile) {
    if (!profile) return

    this.cache.profile = profile
    this.cache.currentProfile = profile.id
    this.cache.aliases = profile.aliases || {}
  }

  /**
   * ComponentBase late-join support - provide current state
   */
  getCurrentState() {
    return {
      aliases: this.cache.aliases,
      currentProfile: this.cache.currentProfile,
      currentEnvironment: this._currentEnvironment,
      selectedKey: this._selectedKey,
      selectedAlias: this._selectedAlias
    }
  }

  /**
   * ComponentBase late-join support - handle initial state from other instances
   */
  handleInitialState(state, senderName) {
    if (senderName === 'DataCoordinator' && state.currentProfileData) {
      this.updateCacheFromProfile(state.currentProfileData)
      this.updateCommandLibrary()
    }
  }
}
