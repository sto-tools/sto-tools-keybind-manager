import ComponentBase from '../ComponentBase.js'
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
    this._rebuilding = false
    this._rebuildQueued = false
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

      // Re-apply environment visibility handled by service already.
      // Re-apply current text search filter (if any)
      const searchInput = this.document.getElementById('commandSearch')
      const term = searchInput ? searchInput.value : ''
      this.applySearchFilter(term)
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

    // Listen for alias changes to update command library with new aliases
    this.addEventListener('aliases-changed', ({ aliases }) => {
      if (aliases) {
        this.cache.aliases = aliases
        this.updateCommandLibrary()
      }
    })

    // Stabilize execution order now handled via toolbar button in CommandChainUI

    // Command lifecycle events are now handled by CommandChainUI
    // CommandLibraryUI no longer needs to listen to these events

    // NEW: Listen for search filter events from CommandUI
    this.addEventListener('command:filter', ({ filter = '' }) => {
      this.applySearchFilter(filter)
    })

    // Listen for preferences saved to refresh command library (e.g., bindsets toggled)
    this.addEventListener('preferences:saved', () => {
      // Re-setup the library to reflect new preference-dependent commands
      this.setupCommandLibrary()
    })
  }

  /**
   * Setup the command library UI
   */
  async setupCommandLibrary() {
    // Avoid concurrent rebuilds; queue the latest request.
    if (this._rebuilding) {
      this._rebuildQueued = true
      return
    }
    this._rebuilding = true

    try {
      // Build non-alias command categories into dedicated list container
      const container = this.document.getElementById('commandCategoriesList') || this.document.getElementById('commandCategories')
      if (!container) return

      const fragment = this.document.createDocumentFragment()

      const categories = await this.request('command:get-categories')
      Object.entries(categories).forEach(([categoryId, category]) => {
        const categoryElement = this.createCategoryElement(categoryId, category)
        fragment.appendChild(categoryElement)
      })

      // Atomic replacement
      container.replaceChildren(fragment)

      // Apply environment filtering after replacing elements
      this.filterCommandLibrary()

      // Re-add aliases after rebuilding the command library
      await this.updateCommandLibrary()
    } finally {
      this._rebuilding = false
      if (this._rebuildQueued) {
        this._rebuildQueued = false
        // Run queued rebuild once current completes
        this.setupCommandLibrary()
      }
    }
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
            this.emit('command-add', { categoryId, commandId, commandDef })
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
            this.emit('command-add', { commandDef: fullyHydratedCommand })
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
                        ${itemIcon} ${(alias._displayName || name)}
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
        console.log('[CommandLibraryUI] aliasEntry', aliasEntry)
        const alias = aliasEntry ? aliasEntry[1] : {}

        // Determine if this is a VFX alias or regular alias
        const isVfxAlias = alias.type === 'vfx-alias' 
        
        const fullyHydratedAlias = {
          command: aliasName,
          type: alias.type,
          icon: isVfxAlias ? '👁️' : '🎭',
          text: `${aliasName}`,
          description: alias.description,
          isUserAlias: true,  // Flag to identify this as a user-defined alias
          isVfxAlias: isVfxAlias,
          id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
        }
        console.log('[CommandLibraryUI] emitting command:add [alias]', { commandDef: fullyHydratedAlias })
        this.emit('command-add', { commandDef: fullyHydratedAlias })
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
  async updateCommandLibrary() {
    // Use cached profile data instead of making requests
    const profile = this.cache.profile
    if (!profile) return

    // Alias containers lives inside dedicated list under commandCategories
    const aliasContainer = this.document.getElementById('aliasCategoriesList') || this.document.getElementById('commandCategories')
    if (!aliasContainer) return

    const allAliasesRaw = Object.entries(this.cache.aliases)

    // Resolve display names for VFX aliases async
    const allAliases = await Promise.all(allAliasesRaw.map(async ([name, alias]) => {
      if (alias.type === 'vfx-alias' && !alias._displayName) {
        alias._displayName = await this._getAliasDisplayName(name, alias)
      }
      return [name, alias]
    }))

    const regularAliases = allAliases.filter(([, alias]) => alias.type !== 'vfx-alias')
    const vertigoAliases = allAliases.filter(([, alias]) => alias.type === 'vfx-alias')

    // ---------------- Bindset activation aliases -----------------
    // Only include when preferences allow (bindsetsEnabled && bindToAliasMode)
    let bindsetAliasItems = []
    try {
      const bindsetsEnabled = await this.request('preferences:get-setting', { key: 'bindsetsEnabled' })
      const aliasMode       = await this.request('preferences:get-setting', { key: 'bindToAliasMode' })

      const toBool = (v)=> v===true||v==='true'||v===1||v==='1'
      if (toBool(bindsetsEnabled) && toBool(aliasMode)) {
        const profile = this.cache.profile || {}
        const bindsets = profile.bindsets || {}
        const envs = ['space','ground']

        const sanitizeName = (n='') => {
          let s = n.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'')
          if (/^[0-9]/.test(s)) s = `bs_${s}`
          return s
        }

        for (const env of envs) {
          const allBs = ['Primary Bindset', ...Object.keys(bindsets)]
          allBs.forEach(bsName => {
            const loaderAlias = `bindset_enable_${env}_${sanitizeName(bsName)}`
            bindsetAliasItems.push([
              loaderAlias,
              {
                type: 'bindset-alias',
                description: `Enable ${bsName} (${env})`,
                commands: loaderAlias
              }
            ])
          })
        }
      }
    } catch { /* ignore */ }

    // Build DOM in a detached fragment then atomically replace
    const fragment = this.document.createDocumentFragment()

    if (regularAliases.length > 0) {
      fragment.appendChild(
        this.createAliasCategoryElement(
          regularAliases,
          'aliases',
          'command_aliases',
          'fas fa-mask'
        )
      )
    }

    if (vertigoAliases.length > 0) {
      fragment.appendChild(
        this.createAliasCategoryElement(
          vertigoAliases,
          'vertigo-aliases',
          'vfx_aliases',
          'fas fa-eye-slash'
        )
      )
    }

    if (bindsetAliasItems.length > 0) {
      fragment.appendChild(
        this.createAliasCategoryElement(
          bindsetAliasItems,
          'bindset-aliases',
          'bindsets',
          'fas fa-tags'
        )
      )
    }

    aliasContainer.replaceChildren(fragment)
  }

  /**
   * Filter command library based on current environment
   */
  filterCommandLibrary() {
    // Delegate actual filtering logic to CommandLibraryService via request-response
    request(this.eventBus, 'command:filter-library').catch(()=>{})
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
        const importBtn = doc.getElementById('importFromKeyOrAliasBtn')
        if (importBtn) importBtn.disabled = !hasSelectedKey
        ['deleteKeyBtn', 'duplicateKeyBtn'].forEach((id) => {
          const btn = doc.getElementById(id)
          if (btn) btn.disabled = true
        })
      } else {
        ['addCommandBtn', 'importFromKeyOrAliasBtn', 'deleteKeyBtn', 'duplicateKeyBtn'].forEach((id) => {
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

  /**
   * Apply text search filter to command library items
   * @param {string} filter - Current search term entered by user
   */
  async applySearchFilter(filter) {
    // Normalize filter string
    const term = (filter || '').trim().toLowerCase()

    // Do NOT call filterCommandLibrary() here – it would reset previous search decisions.

    const doc = this.document || (typeof window !== 'undefined' ? window.document : undefined)
    if (!doc) return

    // Restrict search filtering to the Command Library container only so alias/key browsers are untouched
    const libraryContainer = doc.getElementById('commandCategories') || doc.querySelector('.command-categories')
    if (!libraryContainer) return

    // Item-level filtering within library only
    libraryContainer.querySelectorAll('.command-item, .alias-item, .vertigo-alias-item').forEach((item) => {
      // Skip if item already hidden by env filter
      const alreadyHiddenByEnv = item.dataset.envHidden === 'true'

      if (!term) {
        // Reset visibility (if env allows)
        if (!alreadyHiddenByEnv) {
          item.style.display = 'flex'
        }
        return
      }

      const text = (item.textContent || '').toLowerCase()
      const shouldShow = text.includes(term)

      if (shouldShow && !alreadyHiddenByEnv) {
        item.style.display = 'flex'
      } else {
        item.style.display = 'none'
      }
    })

    // ---------------------------------
    // Category-level filtering
    // ---------------------------------
    libraryContainer.querySelectorAll('.category').forEach((category) => {
      const visibleItems = category.querySelectorAll('.command-item:not([style*="display: none"]), .alias-item:not([style*="display: none"]), .vertigo-alias-item:not([style*="display: none"])')
      const categoryVisible = !term || visibleItems.length > 0
      category.style.display = categoryVisible ? 'block' : 'none'
    })

    // Update search button active state for accessibility / UX
    const searchBtn = doc.getElementById('commandSearchBtn')
    if (searchBtn) {
      searchBtn.classList.toggle('active', !!term)
      searchBtn.setAttribute('aria-pressed', !!term)
    }
  }

  /**
   * Derive human-readable display text for an alias item.
   * VFX aliases get prettified ("VFX Alias: Space", etc.).
   */
  async _getAliasDisplayName (name, alias) {
    if (alias.type === 'vfx-alias') {
      try {
        const res = await request(this.eventBus, 'parser:parse-command-string', {
          commandString: name,
          options: { generateDisplayText: true }
        })
        const first = res?.commands?.[0]
        if (first?.displayText) return first.displayText
      } catch {
        /* ignore parse errors */
      }
    }
    return name
  }
}
