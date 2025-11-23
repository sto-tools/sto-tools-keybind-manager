import UIComponentBase from '../UIComponentBase.js'
import BindsetDeleteConfirmUI from './BindsetDeleteConfirmUI.js'

/**
 * KeyBrowserUI – responsible for rendering the key grid (#keyGrid).
 * For the initial migration it simply delegates to the legacy
 * renderKeyGrid implementation hanging off the global `app` instance.
 */
export default class KeyBrowserUI extends UIComponentBase {
  constructor ({ eventBus,
                app = null,
                modalManager = null,
                confirmDialog = null,
                inputDialog = null,
                i18n,
                document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(eventBus)
    this.componentName = 'KeyBrowserUI'
    this.app      = app || (typeof window.app !== 'undefined' ? window.app : null)
    this.modalManager = modalManager
    this.confirmDialog = confirmDialog || (typeof window !== 'undefined' ? window.confirmDialog : null)
    this.inputDialog = inputDialog || (typeof window !== 'undefined' ? window.inputDialog : null)
    this.i18n = i18n
    this.document = document

    // Initialize bindset delete confirmation modal
    this.bindsetDeleteConfirm = new BindsetDeleteConfirmUI({
      eventBus: this.eventBus,
      modalManager: this.modalManager,
      i18n: this.i18n
    })
  }

  // Lifecycle
  onInit () {
    // Initial paint and toggle-button state (will be handled by handleInitialState)
    const initialMode = localStorage.getItem('keyViewMode') || 'grid'
    this.updateViewToggleButton(initialMode)

    this.setupEventListeners()
  }

  setupEventListeners() {
    if (this.eventListenersSetup) {
      return
    }
    this.eventListenersSetup = true

    // Key management DOM events
    this.onDom('addKeyBtn', 'click', 'key-add', () => {
      this.showKeySelectionModal()
    })

    this.onDom('deleteKeyBtn', 'click', 'key-delete', () => {
      if (this.cache.selectedKey) {
        this.confirmDeleteKey(this.cache.selectedKey)
      }
    })

    this.onDom('duplicateKeyBtn', 'click', 'key-duplicate', () => {
      if (this.cache.selectedKey) {
        this.duplicateKey(this.cache.selectedKey)
      }
    })

    // Debounced key search input via eventBus helper
    this.onDomDebounced('keyFilter', 'input', 'key-filter', (e) => {
      this.filterKeys(e.target.value)
    }, 250)

    // Escape / Enter keys within search input
    this.onDom('keyFilter', 'keydown', 'key-filter-key', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        const input = e.target
        input.value = ''
        input.classList.remove('expanded')
        this.emit('key:filter', { filter: '' })
      } else if (e.key === 'Enter') {
        const input = e.target
        input.classList.remove('expanded')
        // keep current filter; focus out
        input.blur()
      }
    })

    this.onDom('showAllKeysBtn', 'click', 'show-all-keys', () => {
      this.showAllKeys()
    })

    this.onDom('toggleKeyViewBtn', 'click', 'toggle-key-view', () => {
      this.toggleKeyView()
    })

    // Key search button
    this.onDom('keySearchBtn', 'click', 'key-search-toggle', () => {
      this.toggleKeySearch()
    })

    this.eventBus.on('key:list-changed', () => this.render())

    // Initialize view mode based on current bindset settings
    this.ensureCorrectViewMode()

    // Add environment change handler for UI visibility
    this.addEventListener('environment:changed', (d = {}) => {
      const env = typeof d === 'string' ? d : d.environment || d.newMode || d.mode
      if (!env) return
      this.toggleVisibility(env)
      if (env !== 'alias') {
        this.render()
      }
    })
    
    // Add key selection handler for UI updates (single listener, not duplicate)
    this.addEventListener('key-selected', () => {
      this.render()
    })
    
    // Add profile switch handler for UI updates (single listener, not duplicate)
    this.addEventListener('profile:switched', () => {
      this.render()
    })

    // Listen for view mode toggles and update events from other components
    this.addEventListener('key-view:toggle',        () => this.toggleKeyView())
    this.addEventListener('key-view:update-toggle', (d) => this.updateViewToggleButton(d?.viewMode))
    this.addEventListener('keys:filter',            (d) => {
      const val = (typeof d === 'string') ? d : (d?.value || '')
      this.filterKeys(val)
    })
        this.addEventListener('keys:show-all',          () => this.showAllKeys())

    // Also re-render on explicit mode-changed events.
    this.addEventListener('key-view:mode-changed', () => this.render())

    // Listen for language changes and re-render with new translations
    this.addEventListener('language:changed', () => {
      this.render()
    })

    // Listen for preference changes that affect bindset display
    this.addEventListener('preferences:changed', (data) => {
      // Handle both { key, value } and { changes } event formats
      const changes = data.changes || { [data.key]: data.value }

      for (const [key, value] of Object.entries(changes)) {
        if (key === 'theme') {
          this.render()
        } else if (key === 'bindsetsEnabled' || key === 'bindToAliasMode') {
          // When bindsets are enabled/disabled, re-evaluate view mode
          this.ensureCorrectViewMode()
          this.render()
        }
      }
    })

    // Listen for bindset section collapse changes and re-render
    this.addEventListener('bindset-section:collapse-changed', () => {
      this.render()
    })

    // Listen for bindset changes and re-render when bindsets are enabled
    this.addEventListener('bindsets:changed', () => {
      if (this.shouldShowBindsetSections()) {
        this.render()
      }
    })

    // Listen for bindset management events
    this.addEventListener('bindset:created', () => {
      if (this.shouldShowBindsetSections()) {
        this.render()
      }
    })

    this.addEventListener('bindset:deleted', () => {
      if (this.shouldShowBindsetSections()) {
        this.render()
      }
    })
  }

  async render () {
    const grid = this.document.getElementById('keyGrid')
    if (!grid) return

    const profile = this.cache.profile
    if (!profile) {
      grid.innerHTML = `<div class="empty-state"><i class="fas fa-folder-open"></i><h4>${this.i18n.t('no_profile_selected')}</h4></div>`
      return
    }

    // Build DOM atomically using DocumentFragment
    const fragment = this.document.createDocumentFragment()
    const viewMode = this.getCurrentViewMode()

    // Get key data first
    const keyMap = await this.request('key:get-all')
    const keys      = Object.keys(keyMap)
    const keysWithCommands = {}
    keys.forEach((k) => {
      const cmds = keyMap[k]
      if (cmds && cmds.length > 0) keysWithCommands[k] = cmds
    })
    const allKeys = [...new Set([...keys, ...Object.keys(keysWithCommands)])]

    // Cache for child helpers
    this._currentKeyMap = keyMap

    // If bindsets are enabled, render bindset sections for ALL view types
    if (this.shouldShowBindsetSections()) {
      await this.renderBindsetSectionsView(fragment, viewMode, profile, keyMap, keysWithCommands, allKeys)
      grid.classList.add('categorized')
    } else {
      // Original rendering for when bindsets are disabled
      if (viewMode === 'key-types') {
        await this.renderKeyTypeView(fragment, profile, allKeys)
        grid.classList.add('categorized')
      } else if (viewMode === 'grid') {
        await this.renderSimpleGridView(fragment, allKeys)
        grid.classList.remove('categorized')
      } else {
        // command-category
        await this.renderCommandCategoryView(fragment, keysWithCommands, allKeys)
        grid.classList.add('categorized')
      }
    }

    // Atomic DOM update - replace all content at once
    grid.innerHTML = ''
    grid.appendChild(fragment)
  }

  // View mode management helpers

  /**
   * Determines the current view mode based on user preference
   * @returns {string} The view mode to use ('bindset-sections', 'grid', 'categorized', etc.)
   */
  getCurrentViewMode() {
    // Use the user's saved preference or default to grid
    return localStorage.getItem('keyViewMode') || 'grid'
  }

  /**
   * Determines if bindset functionality should be displayed in the current view
   * @returns {boolean} True if bindset functionality should be shown
   */
  shouldShowBindsetSections() {
    const bindsetsEnabled = this.cache.preferences?.bindsetsEnabled || false
    const bindToAliasMode = this.cache.preferences?.bindToAliasMode || false
    const currentEnvironment = this.cache.currentEnvironment || 'space'

    // Show bindset functionality when bindsets are enabled and conditions are met
    return bindsetsEnabled && bindToAliasMode && currentEnvironment !== 'alias'
  }

  /**
   * Ensures the bindset display is updated when preferences change
   */
  ensureCorrectViewMode() {
    // Just emit a view mode changed event to trigger re-render with current bindset settings
    const currentMode = this.getCurrentViewMode()
    this.emit('key-view:mode-changed', { mode: currentMode })
  }

  // Rendering helpers
  async renderSimpleGridView (fragment, allKeys) {
    // Sort keys using the service's sort function
    const sortedKeys = await this.request('key:sort', { keys: allKeys })
    
    sortedKeys.forEach((keyName) => {
      const keyElement = this.createKeyElement(keyName)
      fragment.appendChild(keyElement)
    })
  }

  async renderCommandCategoryView (fragment, keysWithCommands, allKeys) {
    const categories = await this.categorizeKeys(keysWithCommands, allKeys)
    const sorted = Object.entries(categories).sort(([aId,a],[bId,b]) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.name.localeCompare(b.name)
    })
    for (const [catId, catData] of sorted) {
      const el = await this.createKeyCategoryElement(catId, catData)
      fragment.appendChild(el)
    }
  }

  async renderKeyTypeView (fragment, profile, allKeys) {
    const cats = await this.categorizeKeysByType(this._currentKeyMap, allKeys)
    const sorted = Object.entries(cats).sort(([,a],[,b]) => a.priority - b.priority)
    for (const [id, data] of sorted) {
      const el = await this.createKeyCategoryElement(id, data, 'key-type')
      fragment.appendChild(el)
    }
  }

  async renderBindsetSectionView (fragment, profile) {
    // Get sectional keys organized by bindset
    const sectionalKeys = await this.request('key:get-all-sectional')

    // Sort bindsets: Primary Bindset first, then alphabetically
    const sortedBindsets = Object.entries(sectionalKeys).sort(([aName], [bName]) => {
      if (aName === 'Primary Bindset') return -1
      if (bName === 'Primary Bindset') return 1
      return aName.localeCompare(bName)
    })

    // Render each bindset as a collapsible section
    for (const [bindsetName, bindsetData] of sortedBindsets) {
      const sectionElement = await this.createBindsetSectionElement(bindsetName, bindsetData)
      fragment.appendChild(sectionElement)
    }
  }

  /**
   * Renders bindset sections view that works with all view types
   * @param {DocumentFragment} fragment - The fragment to render into
   * @param {string} viewMode - The view mode ('grid', 'key-types', 'command-category')
   */
  async renderBindsetSectionsView (fragment, viewMode, profile, keyMap, keysWithCommands, allKeys) {
    // Get sectional keys organized by bindset
    const sectionalKeys = await this.request('key:get-all-sectional')

    // Sort bindsets: Primary Bindset first, then alphabetically
    const sortedBindsets = Object.entries(sectionalKeys).sort(([aName], [bName]) => {
      if (aName === 'Primary Bindset') return -1
      if (bName === 'Primary Bindset') return 1
      return aName.localeCompare(bName)
    })

    // Store the current view mode for use in createBindsetSectionElement
    this._currentViewMode = viewMode

    // Render each bindset as a section using the working implementation
    for (const [bindsetName, bindsetData] of sortedBindsets) {
      const sectionElement = await this.createBindsetSectionElement(bindsetName, bindsetData, viewMode, profile, keyMap, keysWithCommands, allKeys)
      fragment.appendChild(sectionElement)
    }
  }

  
  toggleBindsetSection(bindsetName, element) {
    const isCollapsed = element.classList.toggle('collapsed')
    localStorage.setItem(`bindset-section-collapsed-${bindsetName}`, isCollapsed.toString())

    const collapseIcon = element.querySelector('[data-action="toggle-collapse"] i')
    if (collapseIcon) {
      collapseIcon.className = isCollapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-down'
    }

    // Emit collapse state change for other components
    this.emit('bindset-section:collapse-changed', { bindsetName, isCollapsed })
  }

  // View-specific rendering methods for bindset sections

  async renderSimpleGridViewForKeys (fragment, keys, bindsetData) {
    // Filter and sort keys for this bindset
    const sortedKeys = keys.sort()

    // Render grid items
    for (const key of sortedKeys) {
      const keyEl = this.createKeyElement(key, bindsetData[key])
      if (keyEl) {
        fragment.appendChild(keyEl)
      }
    }
  }

  async renderKeyTypeViewForKeys (fragment, profile, keys, bindsetData) {
    // Categorize keys for this bindset
    const keyMap = {}
    keys.forEach(key => {
      keyMap[key] = bindsetData[key] || []
    })

    const categorized = await this.request('key:detect-types', { keys: Object.keys(keyMap) })

    // Sort categories: standard, weapon, system, movement, social
    const categoryOrder = ['standard', 'weapon', 'system', 'movement', 'social']
    const sortedCategories = Object.keys(categorized).sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a.toLowerCase())
      const bIndex = categoryOrder.indexOf(b.toLowerCase())
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })

    for (const category of sortedCategories) {
      const categoryData = categorized[category]
      if (categoryData.keys.length === 0) continue

      const el = this.document.createElement('div')
      el.className = 'category-group'

      // Category header
      const header = this.document.createElement('div')
      header.className = 'category-header'
      header.innerHTML = `<i class="fas ${categoryData.icon}"></i> ${categoryData.name}`
      el.appendChild(header)

      // Commands container
      const commandsContainer = this.document.createElement('div')
      commandsContainer.className = 'category-commands'
      categoryData.keys.forEach((k) => {
        const keyEl = this.createKeyElement(k, bindsetData[k])
        if (keyEl) {
          commandsContainer.appendChild(keyEl)
        }
      })

      el.appendChild(commandsContainer)
      fragment.appendChild(el)
    }
  }

  async renderCommandCategoryViewForKeys (fragment, keysWithCommands, allKeys, bindsetData) {
    const categorized = await this.categorizeKeys(keysWithCommands, allKeys)

    // Sort categories alphabetically
    const sortedCategories = Object.keys(categorized).sort()

    for (const category of sortedCategories) {
      const categoryKeys = categorized[category]
      if (categoryKeys.length === 0) continue

      // Filter keys to only include those in this bindset
      const bindsetCategoryKeys = categoryKeys.filter(key => allKeys.includes(key))

      if (bindsetCategoryKeys.length === 0) continue

      const el = this.document.createElement('div')
      el.className = 'category-group'

      // Category header
      const header = this.document.createElement('div')
      header.className = 'category-header'
      header.textContent = category
      el.appendChild(header)

      // Commands container
      const commandsContainer = this.document.createElement('div')
      commandsContainer.className = 'category-commands'
      bindsetCategoryKeys.forEach((k) => {
        const keyEl = this.createKeyElement(k, bindsetData[k])
        if (keyEl) {
          commandsContainer.appendChild(keyEl)
        }
      })

      el.appendChild(commandsContainer)
      fragment.appendChild(el)
    }
  }

  // Categorization helpers

  async categorizeKeys (keysWithCommands, allKeys) {
    return await this.request('key:categorize-by-command', { keysWithCommands, allKeys })
  }

  async categorizeKeysByType (keysWithCommands, allKeys) {
    return await this.request('key:categorize-by-type', { keysWithCommands, allKeys })
  }

  formatKeyName (keyName) {
    return keyName.replace(/\+/g,'<br>+')
  }

  createKeyElement (keyName, bindsetContext = null) {
    const keyMap = this._currentKeyMap || {}
    const commands = (keyMap && keyMap[keyName]) ? keyMap[keyName] : []

    const isSelected = this.isKeySelectedInContext(keyName, bindsetContext)

    // After canonical string refactoring, commands should be an array of strings
    // During transition, handle both legacy rich objects and canonical strings
    const nonBlank = commands.filter((cmd) => {
      if (typeof cmd === 'string') return cmd.trim() !== ''
      // Legacy support: rich objects with command property
      if (cmd && typeof cmd.command === 'string') return cmd.command.trim() !== ''
      return false
    })

    const el = this.document.createElement('div')
    el.className = `key-item ${isSelected ? 'active': ''}`
    el.dataset.key = keyName
    el.title = `${keyName}: ${nonBlank.length} command${nonBlank.length!==1?'s':''}`

    const formatted = this.formatKeyName(keyName)
    const keyLength = keyName.length
    const lengthClass = keyLength<=3?'short':keyLength<=5?'medium':keyLength<=8?'long':'extra-long'
    el.dataset.length = lengthClass

    el.innerHTML = `<div class="key-label">${formatted}</div>${nonBlank.length>0?`<div class="activity-bar" style="width:${Math.min(nonBlank.length*15,100)}%"></div><div class="command-count-badge">${nonBlank.length}</div>`:''}`

    this.onDom(el, 'click', 'key-element-click', (e) => {
      // Check if this key is within a bindset section
      const bindsetSection = el.closest('.bindset-section')
      const bindsetName = bindsetSection?.dataset?.bindset

      // Fire select request; include environment and bindset context.
      // SelectionService will synchronize the active bindset before emitting key-selected.
      console.log(`[KeyBrowserUI] Sending key:select with bindset context: ${bindsetName}`)
      this.request('key:select', {
        keyName,
        environment: this.cache?.currentEnvironment || 'space',
        bindset: bindsetName && bindsetName !== 'Primary Bindset' ? bindsetName : null
      })
    })
    return el
  }

  isKeySelectedInContext (keyName, bindsetContext) {
    // If no bindset context, use global selection (backward compatibility)
    if (!bindsetContext) {
      return keyName === this.cache.selectedKey
    }

    // With bindset context, check if key is selected in that specific bindset
    // Leverages existing this.cache.activeBindset tracking
    return keyName === this.cache.selectedKey &&
           this.cache.activeBindset === bindsetContext
  }

  async createKeyCategoryElement (categoryId, categoryData, mode='command', bindsetContext=null) {
    const element = this.document.createElement('div')
    element.className = 'category'
    element.dataset.category = categoryId

    // Get collapsed state from service
    const isCollapsed = await this.request('key:get-category-state', { categoryId, mode })

    element.innerHTML = `<h4 class="${isCollapsed?'collapsed':''}" data-category="${categoryId}" data-mode="${mode}"><i class="fas fa-chevron-right category-chevron"></i><i class="${categoryData.icon}"></i>${categoryData.name}<span class="key-count">(${categoryData.keys.length})</span></h4><div class="category-commands ${isCollapsed?'collapsed':''}">${categoryData.keys.map((k)=>this.createKeyElement(k, bindsetContext).outerHTML).join('')}</div>`

    // Attach header click to collapse/expand using EventBus
    const header = element.querySelector('h4')
    this.onDom(header, 'click', 'category-header-click', () => {
      this.toggleKeyCategory(categoryId, element, mode)
    })

    // Replace placeholder html strings with actual elements
    const commandsContainer = element.querySelector('.category-commands')
    commandsContainer.innerHTML = ''
    categoryData.keys.forEach((k) => commandsContainer.appendChild(this.createKeyElement(k, bindsetContext)))

    return element
  }

  async createBindsetSectionElement (bindsetName, bindsetData, viewMode, profile, keyMap, keysWithCommands, allKeys) {
    const element = this.document.createElement('div')
    element.className = 'bindset-section'
    element.dataset.bindset = bindsetName

    // Create section header with command group separator styling
    const header = this.document.createElement('div')
    header.className = 'bindset-header command-group-separator'
    header.dataset.bindset = bindsetName
    header.dataset.action = 'bindset-section-header'

    const headerInfo = this.document.createElement('div')
    headerInfo.className = 'bindset-info group-info'

    const twisty = this.document.createElement('i')
    twisty.className = `fas fa-chevron-right twisty ${bindsetData.isCollapsed ? 'collapsed' : ''}`

    const name = this.document.createElement('span')
    name.className = 'bindset-name group-title'
    name.textContent = bindsetName

    const count = this.document.createElement('span')
    count.className = 'bindset-count'
    count.textContent = `(${bindsetData.keyCount})`

    headerInfo.appendChild(twisty)
    headerInfo.appendChild(name)
    headerInfo.appendChild(count)
    header.appendChild(headerInfo)

    // Add bindset management menu
    const actions = this.document.createElement('div')
    actions.className = 'bindset-actions'

    // Create menu button
    const menuBtn = this.document.createElement('button')
    menuBtn.className = 'control-btn bindset-menu-btn'
    menuBtn.dataset.action = 'bindset-menu'
    menuBtn.innerHTML = '<i class="fas fa-ellipsis-v"></i>'
    menuBtn.title = this.i18n.t('bindset_actions')
    actions.appendChild(menuBtn)

    // Create dropdown menu
    const menuDropdown = this.document.createElement('div')
    menuDropdown.className = 'bindset-menu-dropdown'
    menuDropdown.dataset.bindset = bindsetName

    // Add menu items based on bindset type
    if (bindsetName === 'Primary Bindset') {
      // Primary Bindset: Create + Clone actions
      this.addMenuItem(menuDropdown, 'create', 'fas fa-plus', this.i18n.t('create_bindset'), () => this.handleCreateBindset())
      this.addMenuItem(menuDropdown, 'clone', 'fas fa-copy', this.i18n.t('clone_bindset'), () => this.handleCloneBindset(bindsetName))
    } else {
      // User-Defined Bindset: Clone + Rename + Delete actions
      this.addMenuItem(menuDropdown, 'clone', 'fas fa-copy', this.i18n.t('clone_bindset'), () => this.handleCloneBindset(bindsetName))
      this.addMenuItem(menuDropdown, 'rename', 'fas fa-edit', this.i18n.t('rename_bindset'), () => this.handleRenameBindset(bindsetName))
      this.addMenuItem(menuDropdown, 'delete', 'fas fa-trash', this.i18n.t('delete_bindset'), () => this.handleDeleteBindset(bindsetName), true) // dangerous = true
    }

    actions.appendChild(menuDropdown)

    // Attach menu button handler
    this.onDom(menuBtn, 'click', 'bindset-menu-btn', (e) => {
      e.stopPropagation()
      this.toggleBindsetMenu(menuDropdown)
    })

    // Close menu when clicking outside
    this.onDom(this.document, 'click', 'bindset-menu-outside', (e) => {
      if (!e.target.closest('.bindset-actions')) {
        this.closeAllBindsetMenus()
      }
    })

    header.appendChild(actions)

    element.appendChild(header)

    // Create content area for keys
    const content = this.document.createElement('div')
    content.className = `bindset-content ${bindsetData.isCollapsed ? 'collapsed' : ''}`

    // Add keys to content based on current view mode
    console.log(`[KeyBrowserUI] bindsetData.keys for "${bindsetName}":`, bindsetData.keys)
    console.log(`[KeyBrowserUI] bindsetData.keys.length:`, bindsetData.keys.length)

    if (bindsetData.keys.length > 0) {
      // Get appropriate keyMap for this bindset
      let keyMap = {}
      if (bindsetName === 'Primary Bindset') {
        keyMap = await this.request('key:get-all')
      } else {
        // Get bindset keys from profile data
        const environment = this.cache.currentEnvironment || 'space'
        const profile = this.cache.profile

        console.log(`[KeyBrowserUI] Profile bindsets for "${bindsetName}":`, profile?.bindsets?.[bindsetName])
        console.log(`[KeyBrowserUI] Environment: "${environment}"`)

        keyMap = {}
        if (profile?.bindsets?.[bindsetName]?.[environment]?.keys) {
          keyMap = profile.bindsets[bindsetName][environment].keys
          console.log(`[KeyBrowserUI] Created keyMap for bindset "${bindsetName}" with ${Object.keys(keyMap).length} keys:`, Object.keys(keyMap))
        } else {
          console.log(`[KeyBrowserUI] No keys found - profile.bindsets.${bindsetName}?:`, !!profile?.bindsets?.[bindsetName])
          console.log(`[KeyBrowserUI] No keys found - profile.bindsets.${bindsetName}.${environment}?:`, !!profile?.bindsets?.[bindsetName]?.[environment])
          console.log(`[KeyBrowserUI] Available bindsets:`, Object.keys(profile?.bindsets || {}))
        }
      }

      // Cache keyMap for key element creation
      this._currentKeyMap = keyMap

      const currentViewMode = viewMode || 'grid'

      if (currentViewMode === 'key-types') {
        // Render key-types view for this bindset
        await this.renderKeyTypeViewForBindset(content, bindsetData.keys, keyMap, bindsetName, keysWithCommands, allKeys)
      } else if (currentViewMode === 'categorized') {
        // Render command-category view for this bindset
        await this.renderCommandCategoryViewForBindset(content, bindsetData.keys, keyMap, bindsetName, keysWithCommands)
      } else {
        // Default: grid view
        const keyGrid = this.document.createElement('div')
        keyGrid.className = 'key-grid-subsection'

        bindsetData.keys.forEach((keyName) => {
          const keyElement = this.createKeyElement(keyName, bindsetName)
          keyGrid.appendChild(keyElement)
        })

        content.appendChild(keyGrid)
      }
    } else {
      console.log(`[KeyBrowserUI] Showing empty message for bindset "${bindsetName}" - no keys found`)
      const emptyMessage = this.document.createElement('div')
      emptyMessage.className = 'empty-section'
      emptyMessage.textContent = this.i18n.t('no_keys_in_bindset')
      content.appendChild(emptyMessage)
    }

    element.appendChild(content)

    // Attach header click handler for collapse/expand
    this.onDom(header, 'click', 'bindset-section-header-click', () => {
      this.toggleBindsetSection(bindsetName, element)
    })

    
    return element
  }

  // Helper methods for rendering different view types within bindset sections

  async renderKeyTypeViewForBindset (content, keys, keyMap, bindsetName, keysWithCommands, allKeys) {
    const categorized = await this.categorizeKeysByType(keysWithCommands, keys)

    // Sort categories: standard, weapon, system, movement, social
    const categoryOrder = ['standard', 'weapon', 'system', 'movement', 'social']
    const sortedCategories = Object.keys(categorized).sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a.toLowerCase())
      const bIndex = categoryOrder.indexOf(b.toLowerCase())
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })

    for (const category of sortedCategories) {
      const categoryData = categorized[category]
      if (categoryData.keys.length === 0) continue

      // Use the same createKeyCategoryElement method as non-bindset views
      const el = await this.createKeyCategoryElement(category, categoryData, 'type', bindsetName)
      content.appendChild(el)
    }
  }

  async renderCommandCategoryViewForBindset (content, keys, keyMap, bindsetName, keysWithCommands) {
    const categorized = await this.categorizeKeys(keysWithCommands, keys)

    // Sort categories alphabetically
    const sortedCategories = Object.keys(categorized).sort()

    for (const category of sortedCategories) {
      const categoryData = categorized[category]
      if (categoryData.keys.length === 0) continue

      // Transform the data to match createKeyCategoryElement expectations
      // The categorized data has a different structure, so we need to adapt it
      const adaptedCategoryData = {
        name: this.i18n.t(category),
        icon: 'fas fa-folder', // Default icon for command categories
        keys: categoryData.keys
      }

      // Use the same createKeyCategoryElement method as non-bindset views
      const el = await this.createKeyCategoryElement(category, adaptedCategoryData, 'command', bindsetName)
      content.appendChild(el)
    }
  }

  async toggleKeyCategory (categoryId, element, mode='command') {
    // Use service to handle business logic
    const isCollapsed = await this.request('key:toggle-category', { categoryId, mode })

    // Update DOM to reflect new state
    const header = element.querySelector('h4')
    const commands = element.querySelector('.category-commands')

    if (isCollapsed) {
      header.classList.add('collapsed')
      commands.classList.add('collapsed')
    } else {
      header.classList.remove('collapsed')
      commands.classList.remove('collapsed')
    }
  }

  async toggleBindsetSection (bindsetName, element) {
    // Use service to handle business logic
    const isCollapsed = await this.request('bindset:toggle-collapse', { bindsetName })

    // Update DOM to reflect new state
    const header = element.querySelector('.bindset-header')
    const content = element.querySelector('.bindset-content')
    const twisty = element.querySelector('.twisty')

    if (isCollapsed) {
      header?.classList.add('collapsed')
      content?.classList.add('collapsed')
      if (twisty) {
        twisty.classList.add('collapsed')
      }
    } else {
      header?.classList.remove('collapsed')
      content?.classList.remove('collapsed')
      if (twisty) {
        twisty.classList.remove('collapsed')
      }
    }
  }

  // Helper method to count keys in a bindset
  async countBindsetKeys(bindsetName) {
    try {
      // Use the same data access pattern as BindsetService for consistency
      const profile = this.cache.profile || this.cache.currentProfile
      console.log(`[KeyBrowserUI] countBindsetKeys for "${bindsetName}":`, {
        profile: !!profile,
        profileBindsets: !!profile?.bindsets,
        bindsetKeys: Object.keys(profile?.bindsets || {}),
        targetBindset: profile?.bindsets?.[bindsetName]
      })

      const bindset = profile?.bindsets?.[bindsetName]
      if (!bindset) {
        console.log(`[KeyBrowserUI] countBindsetKeys: bindset "${bindsetName}" not found`)
        return 0
      }

      let keyCount = 0
      const hasKeys = (env) => {
        const envData = bindset?.[env]?.keys
        const hasEnvKeys = envData && Object.keys(envData).length > 0
        console.log(`[KeyBrowserUI] countBindsetKeys: env "${env}" has keys: ${hasEnvKeys}, key count: ${hasEnvKeys ? Object.keys(envData).length : 0}`)
        return hasEnvKeys
      }

      // Use the same logic as BindsetService.deleteBindset for consistency
      if (hasKeys('space')) keyCount += Object.keys(bindset.space.keys).length
      if (hasKeys('ground')) keyCount += Object.keys(bindset.ground.keys).length

      console.log(`[KeyBrowserUI] countBindsetKeys: final count for "${bindsetName}" = ${keyCount}`)

      // Fallback validation: if cache returns 0, try service verification
      if (keyCount === 0) {
        console.log(`[KeyBrowserUI] countBindsetKeys: cache reports 0 keys, checking with service...`)
        try {
          // Use the bindset:delete endpoint (without force) to check if bindset is truly empty
          const serviceCheck = await this.request('bindset:delete', { name: bindsetName })
          console.log(`[KeyBrowserUI] countBindsetKeys: service check result:`, serviceCheck)

          // If service says bindset is not empty, use a conservative estimate
          if (serviceCheck?.success === false && serviceCheck?.error === 'not_empty') {
            console.log(`[KeyBrowserUI] countBindsetKeys: service indicates bindset has keys, using fallback count`)
            return 1 // Fallback count - any positive number will trigger multi-step confirmation
          }
        } catch (serviceError) {
          console.warn(`[KeyBrowserUI] countBindsetKeys: service check failed:`, serviceError)
          // Stick with cache result if service check fails
        }
      }

      return keyCount
    } catch (error) {
      console.error('Error counting bindset keys:', error)
      return 0
    }
  }

  // Confirm deletion of a bindset
  async confirmDeleteBindset(bindsetName) {
    if (!bindsetName || !this.confirmDialog) return false

    // Check if bindset contains keys
    const keyCount = await this.countBindsetKeys(bindsetName)

    if (keyCount > 0) {
      // Use multi-step confirmation for bindsets with keys
      const confirmed = await this.bindsetDeleteConfirm.confirm(bindsetName, keyCount, 'bindsetDelete')
      if (confirmed) {
        const result = await this.request('bindset:delete-with-keys', { name: bindsetName })
        if (result?.success) {
          const successMessage = this.i18n.t('bindset_deleted', { name: bindsetName })
          this.showToast(successMessage, 'success')
          return true
        } else {
          const errorMessage = this.i18n.t(result?.error, result?.params)
          this.showToast(errorMessage, 'error')
          return false
        }
      }
      return false
    } else {
      // Use simple confirmation for empty bindsets
      const message = this.i18n.t('confirm_delete_bindset', { name: bindsetName })
      const title = this.i18n.t('confirm_delete')

      if (await this.confirmDialog.confirm(message, title, 'danger', 'bindsetDelete')) {
        const result = await this.request('bindset:delete', { name: bindsetName })
        if (result?.success) {
          const successMessage = this.i18n.t('bindset_deleted', { name: bindsetName })
          this.showToast(successMessage, 'success')
          return true
        } else {
          const errorMessage = this.i18n.t(result?.error, result?.params)
          this.showToast(errorMessage, 'error')
          return false
        }
      }

      return false
    }
  }

  // View-management helpers
  updateViewToggleButton (viewMode) {
    const toggleBtn = this.document.getElementById('toggleKeyViewBtn')
    if (!toggleBtn) return

    const icon = toggleBtn.querySelector('i') || toggleBtn

    // Only cycle between the 3 main view types: grid, categorized, key-types
    // Bindset sections is an overlay, not a separate view mode
    if (viewMode === 'categorized') {
      icon.className = 'fas fa-sitemap'
      toggleBtn.title = this.i18n.t('switch_to_key_type_view')
    } else if (viewMode === 'key-types') {
      icon.className = 'fas fa-th'
      toggleBtn.title = this.i18n.t('switch_to_grid_view')
    } else { // grid
      icon.className = 'fas fa-list'
      toggleBtn.title = this.i18n.t('switch_to_categorized_view')
    }
  }

  toggleKeyView () {
    // Prevent switching in alias environment to maintain UX parity with legacy logic
    if (this.app && this.app.currentEnvironment === 'alias') return

    const currentMode = localStorage.getItem('keyViewMode') || 'grid'
    let newMode

    // Only cycle between the 3 main view types: grid → categorized → key-types → grid
    if (currentMode === 'grid') {
      newMode = 'categorized'
    } else if (currentMode === 'categorized') {
      newMode = 'key-types'
    } else { // key-types or any other
      newMode = 'grid'
    }

    localStorage.setItem('keyViewMode', newMode)
    this.render()
    this.updateViewToggleButton(newMode)

    // Notify other interested parties (e.g., tests, services)
    this.emit('key-view:mode-changed', { mode: newMode })
  }

  filterKeys (filter = '') {
    const filterLower = (filter || '').toString().toLowerCase()

    const grid = this.document.getElementById('keyGrid')
    if (!grid) return

    // Use service for business logic - determine which keys should be visible
    const allKeys = Array.from(grid.querySelectorAll('.key-item')).map(item => item.dataset.key)
    const visibleKeys = new Set()
    
    allKeys.forEach(keyName => {
      const shouldShow = !filterLower || keyName.toLowerCase().includes(filterLower)
      if (shouldShow) visibleKeys.add(keyName)
    })

    // Apply visibility to DOM elements
    grid.querySelectorAll('.key-item').forEach((item) => {
      const keyName = item.dataset.key
      const visible = visibleKeys.has(keyName)
      item.style.display = visible ? 'flex' : 'none'
    })

    grid.querySelectorAll('.command-item[data-key]').forEach((item) => {
      const keyName = item.dataset.key
      const visible = visibleKeys.has(keyName)
      item.style.display = visible ? 'flex' : 'none'
    })

    grid.querySelectorAll('.category').forEach((category) => {
      const visibleKeys = category.querySelectorAll('.command-item[data-key]:not([style*="display: none"])')
      const categoryVisible = !filterLower || visibleKeys.length > 0
      category.style.display = categoryVisible ? 'block' : 'none'
    })

    // After category display update, update search button active state
    const searchBtn = this.document.getElementById('keySearchBtn')
    if (searchBtn) {
      const active = !!filterLower
      searchBtn.classList.toggle('active', active)
      searchBtn.setAttribute('aria-pressed', active)
    }
  }

  
  showAllKeys () {
    const grid = this.document.getElementById('keyGrid')
    if (!grid) return

    // Show all elements (no filtering)
    grid.querySelectorAll('.key-item').forEach((item) => { item.style.display = 'flex' })
    grid.querySelectorAll('.command-item[data-key]').forEach((item) => { item.style.display = 'flex' })
    grid.querySelectorAll('.category').forEach((category) => { category.style.display = 'block' })

    const filterInput = this.document.getElementById('keyFilter')
    if (filterInput) filterInput.value = ''

    // Ensure search button no longer active
    const searchBtn = this.document.getElementById('keySearchBtn')
    if (searchBtn) {
      searchBtn.classList.remove('active')
      searchBtn.setAttribute('aria-pressed', 'false')
    }
  }

  toggleVisibility (env) {
    // Ensure DOM is ready before trying to manipulate elements
    const applyVisibility = () => {
      const container = this.document.querySelector('.key-selector-container')
      if (!container) {
        // Container doesn't exist yet - DOM may not be ready
        console.warn('[KeyBrowserUI] Key selector container not found in DOM')
        return
      }
      
      const shouldShow = env !== 'alias'
      if (shouldShow) {
        // Show the container by removing display property
        container.style.removeProperty('display')
      } else {
        // Hide the container with important flag to ensure it takes precedence
        container.style.setProperty('display', 'none', 'important')
      }
    }
    
    // Use requestAnimationFrame to ensure DOM is rendered
    requestAnimationFrame(applyVisibility)
  }

  // Late-join: sync visibility when initial state snapshot is received.
  handleInitialState (sender, state) {
    if (!state) return
    
    // Restore selection from SelectionService late-join
    if (sender === 'SelectionService') {
      if (state.selectedKey) {
        // Call the same logic as the key-selected event handler
        // Selected key now tracked by ComponentBase in this.cache.selectedKey
        this.render()
      }
      // Optionally handle selectedAlias if needed for future alias mode
      return
    }
    // Handle environment state from various sources
    const env = state.environment || state.currentEnvironment
    if (env) {
      // Environment now tracked by ComponentBase in this.cache.currentEnvironment
      this.toggleVisibility(env)
      // Render if not in alias mode
      if (env !== 'alias') {
        this.render()
      }
    }
    // Service state is now managed internally via events - no direct access needed
  }

  // Show key selection modal for adding new keys
  showKeySelectionModal() {
    if (this.modalManager) {
      this.modalManager.show('keySelectionModal')
    }
  }

  // Confirm deletion of a key
  async confirmDeleteKey(keyName) {
    if (!keyName || !this.confirmDialog) return false
    
    const message = this.i18n.t('confirm_delete_key', { keyName: keyName })
    const title = this.i18n.t('confirm_delete')
    
    if (await this.confirmDialog.confirm(message, title, 'danger', 'keyDelete')) {
      // Use the request/response pattern to delete key from KeyService
      const result = await this.request('key:delete', { key: keyName })
      if (result?.success) {
        const successMessage = this.i18n.t('key_deleted', { keyName })
        this.showToast(successMessage, 'success')
        return true
      } else {
        const errorMessage = this.i18n.t(result?.error, result?.params)
        this.showToast(errorMessage, 'error')
        return false
      }
    }
    
    return false
  }

  // Duplicate the selected key
  async duplicateKey(key) {
    if (!key) return false

    // Defer to KeyCaptureUI so the user can choose the target key name.
    this.emit('key:duplicate', { key })
    return true
  }

  // Toggle key search functionality
  toggleKeySearch() {
    const doc = this.document || (typeof window !== 'undefined' ? window.document : undefined)
    if (!doc) return
    const searchInput = doc.getElementById('keyFilter')
    if (!searchInput) return

    const expanded = searchInput.classList.toggle('expanded')
    if (expanded) {
      searchInput.focus()
    } else {
      searchInput.blur()
    }
  }

  // UIComponentBase: Check if component has required data for rendering
  // KeyBrowserUI needs profile and environment data to render the key grid
  hasRequiredData() {
    // We need both profile and environment data to render keys properly
    return this.cache && 
           this.cache.currentProfile && 
           this.cache.currentEnvironment &&
           this.cache.keys !== undefined
  }

  // UIComponentBase: Perform initial render when data dependencies are ready
  // This replaces the setTimeout retry pattern for DOM availability
  performInitialRender() {
    // Render the key grid when data is available
    this.render().catch((error) => {
      console.error('[KeyBrowserUI] Initial render failed:', error)
    })
  }

  // Bindset menu helper methods
  addMenuItem(menu, action, icon, text, handler, dangerous = false) {
    const item = this.document.createElement('div')
    item.className = `bindset-menu-item ${dangerous ? 'dangerous' : ''}`
    item.dataset.action = action
    item.innerHTML = `<i class="${icon}"></i><span>${text}</span>`

    this.onDom(item, 'click', `bindset-menu-${action}`, (e) => {
      e.stopPropagation()
      handler()
      this.closeAllBindsetMenus()
    })

    menu.appendChild(item)
  }

  toggleBindsetMenu(menuDropdown) {
    const isOpen = menuDropdown.classList.contains('open')
    this.closeAllBindsetMenus()

    if (!isOpen) {
      menuDropdown.classList.add('open')
    }
  }

  closeAllBindsetMenus() {
    this.document.querySelectorAll('.bindset-menu-dropdown.open').forEach(menu => {
      menu.classList.remove('open')
    })
  }

  // Bindset action handlers
  async handleCreateBindset() {
    if (!this.inputDialog) return

    const title = this.i18n.t('create_bindset')
    const message = this.i18n.t('enter_bindset_name')

    const name = await this.inputDialog.prompt(message, {
      title,
      placeholder: this.i18n.t('bindset_name'),
      validate: (value) => {
        const trimmed = value.trim()
        if (!trimmed) return this.i18n.t('name_required')
        if (this.cache.bindsetNames.includes(trimmed)) return this.i18n.t('name_exists')
        return true
      }
    })

    if (!name?.trim()) return
    const res = await this.request('bindset:create', { name: name.trim() })
    if (!res?.success) this.showError(res.error)
  }

  async handleCloneBindset(bindsetName) {
    if (!this.inputDialog) return

    const title = this.i18n.t('clone_bindset')
    const message = this.i18n.t('enter_bindset_name')
    const suggestedName = bindsetName === 'Primary Bindset' ?
      this.i18n.t('primary_bindset_copy_default') :
      `${bindsetName} ${this.i18n.t('copy_suffix')}`

    const name = await this.inputDialog.prompt(message, {
      title,
      defaultValue: suggestedName,
      placeholder: this.i18n.t('bindset_name'),
      validate: (value) => {
        const trimmed = value.trim()
        if (!trimmed) return this.i18n.t('name_required')
        if (trimmed === bindsetName) return this.i18n.t('name_unchanged')
        if (this.cache.bindsetNames.includes(trimmed)) return this.i18n.t('name_exists')
        return true
      }
    })

    if (!name?.trim() || name.trim() === bindsetName) return
    const res = await this.request('bindset:clone', {
      sourceBindset: bindsetName,
      targetBindset: name.trim()
    })
    if (!res?.success) this.showError(res.error)
  }

  async handleRenameBindset(bindsetName) {
    if (!this.inputDialog) return

    const title = this.i18n.t('rename_bindset')
    const message = this.i18n.t('enter_bindset_name')

    const name = await this.inputDialog.prompt(message, {
      title,
      defaultValue: bindsetName,
      placeholder: this.i18n.t('bindset_name'),
      validate: (value) => {
        const trimmed = value.trim()
        if (!trimmed) return this.i18n.t('name_required')
        if (trimmed === bindsetName) return this.i18n.t('name_unchanged')
        if (this.cache.bindsetNames.includes(trimmed)) return this.i18n.t('name_exists')
        return true
      }
    })

    if (!name?.trim() || name.trim() === bindsetName) return
    const res = await this.request('bindset:rename', {
      oldName: bindsetName,
      newName: name.trim()
    })
    if (!res?.success) this.showError(res.error)
  }

  handleDeleteBindset(bindsetName) {
    this.confirmDeleteBindset(bindsetName)
  }

  } 
