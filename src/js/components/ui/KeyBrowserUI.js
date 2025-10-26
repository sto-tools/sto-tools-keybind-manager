import UIComponentBase from '../UIComponentBase.js'

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
                i18n = null,
                document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(eventBus)
    this.componentName = 'KeyBrowserUI'
    this.app      = app || (typeof window.app !== 'undefined' ? window.app : null)
    this.modalManager = modalManager
    this.confirmDialog = confirmDialog || (typeof window !== 'undefined' ? window.confirmDialog : null)
    this.i18n = i18n || (typeof i18next !== 'undefined' ? i18next : null)
    this.document = document
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
    this.eventBus.onDom('addKeyBtn', 'click', 'key-add', () => {
      this.showKeySelectionModal()
    })

    this.eventBus.onDom('deleteKeyBtn', 'click', 'key-delete', () => {
      if (this.cache.selectedKey) {
        this.confirmDeleteKey(this.cache.selectedKey)
      }
    })

    this.eventBus.onDom('duplicateKeyBtn', 'click', 'key-duplicate', () => {
      if (this.cache.selectedKey) {
        this.duplicateKey(this.cache.selectedKey)
      }
    })

    // Debounced key search input via eventBus helper
    this.eventBus.onDomDebounced('keyFilter', 'input', 'key-filter', (e) => {
      this.filterKeys(e.target.value)
    }, 250)

    // Escape / Enter keys within search input
    this.eventBus.onDom('keyFilter', 'keydown', 'key-filter-key', (e) => {
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

    this.eventBus.onDom('showAllKeysBtn', 'click', 'show-all-keys', () => {
      this.showAllKeys()
    })

    this.eventBus.onDom('toggleKeyViewBtn', 'click', 'toggle-key-view', () => {
      this.toggleKeyView()
    })

    // Key search button
    this.eventBus.onDom('keySearchBtn', 'click', 'key-search-toggle', () => {
      this.toggleKeySearch()
    })

    this.eventBus.on('key:list-changed', () => this.render())
    
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
    this.addEventListener('commands:filter',        (d) => {
      const val = (typeof d === 'string') ? d : (d?.value || '')
      this.filterCommands(val)
    })
    this.addEventListener('keys:show-all',          () => this.showAllKeys())

    // Also re-render on explicit mode-changed events.
    this.addEventListener('key-view:mode-changed', () => this.render())
  }

  async render () {
    const grid = this.document.getElementById('keyGrid')
    if (!grid) return

    const profile = await this.request('key:get-profile')
    if (!profile) {
      grid.innerHTML = `<div class="empty-state"><i class="fas fa-folder-open"></i><h4>${i18next.t('no_profile_selected') || 'No Profile Selected'}</h4></div>`
      return
    }

    const keyMap = await this.request('key:get-all')

    // Cache for child helpers
    this._currentKeyMap = keyMap
    // Use cached selected key from event listeners instead of polling

    const keys      = Object.keys(keyMap)
    const keysWithCommands = {}
    keys.forEach((k) => {
      const cmds = keyMap[k]
      if (cmds && cmds.length > 0) keysWithCommands[k] = cmds
    })
    const allKeys = [...new Set([...keys, ...Object.keys(keysWithCommands)])]

    // Build DOM atomically using DocumentFragment
    const fragment = this.document.createDocumentFragment()
    const viewMode = localStorage.getItem('keyViewMode') || 'grid'

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

    // Atomic DOM update - replace all content at once
    grid.innerHTML = ''
    grid.appendChild(fragment)
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

  // Categorization helpers

  async categorizeKeys (keysWithCommands, allKeys) {
    return await this.request('key:categorize-by-command', { keysWithCommands, allKeys })
  }

  async detectKeyTypes (keyName) {
    return await this.request('key:detect-types', { keyName })
  }

  async categorizeKeysByType (keysWithCommands, allKeys) {
    return await this.request('key:categorize-by-type', { keysWithCommands, allKeys })
  }

  async compareKeys (a, b) {
    return await this.request('key:compare', { keyA: a, keyB: b })
  }

  formatKeyName (keyName) {
    return keyName.replace(/\+/g,'<br>+')
  }

  createKeyElement (keyName) {
    const keyMap = this._currentKeyMap || {}
    const commands = (keyMap && keyMap[keyName]) ? keyMap[keyName] : []

    const isSelected = keyName === this.cache.selectedKey

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

    el.addEventListener('click', () => {
      // Fire select request; no need to await
      this.request('key:select', { keyName })
    })
    return el
  }

  async createKeyCategoryElement (categoryId, categoryData, mode='command') {
    const element = this.document.createElement('div')
    element.className = 'category'
    element.dataset.category = categoryId

    // Get collapsed state from service
    const isCollapsed = await this.request('key:get-category-state', { categoryId, mode })

    element.innerHTML = `<h4 class="${isCollapsed?'collapsed':''}" data-category="${categoryId}" data-mode="${mode}"><i class="fas fa-chevron-right category-chevron"></i><i class="${categoryData.icon}"></i>${categoryData.name}<span class="key-count">(${categoryData.keys.length})</span></h4><div class="category-commands ${isCollapsed?'collapsed':''}">${categoryData.keys.map((k)=>this.createKeyElement(k).outerHTML).join('')}</div>`

    // Attach header click to collapse/expand
    const header = element.querySelector('h4')
    header.addEventListener('click', () => this.toggleKeyCategory(categoryId, element, mode))

    // Replace placeholder html strings with actual elements
    const commandsContainer = element.querySelector('.category-commands')
    commandsContainer.innerHTML = ''
    categoryData.keys.forEach((k) => commandsContainer.appendChild(this.createKeyElement(k)))

    return element
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

  // View-management helpers
  updateViewToggleButton (viewMode) {
    const toggleBtn = this.document.getElementById('toggleKeyViewBtn')
    if (!toggleBtn) return

    const icon = toggleBtn.querySelector('i') || toggleBtn

    if (viewMode === 'categorized') {
      icon.className = 'fas fa-sitemap'
      toggleBtn.title = (typeof i18next !== 'undefined' ? i18next.t('switch_to_key_type_view') : 'Switch to key type view')
    } else if (viewMode === 'key-types') {
      icon.className = 'fas fa-th'
      toggleBtn.title = (typeof i18next !== 'undefined' ? i18next.t('switch_to_grid_view') : 'Switch to grid view')
    } else { // grid
      icon.className = 'fas fa-list'
      toggleBtn.title = (typeof i18next !== 'undefined' ? i18next.t('switch_to_command_categories') : 'Switch to command categories')
    }
  }

  toggleKeyView () {
    // Prevent switching in alias environment to maintain UX parity with legacy logic
    if (this.app && this.app.currentEnvironment === 'alias') return

    const currentMode = localStorage.getItem('keyViewMode') || 'grid'
    let newMode
    if (currentMode === 'key-types') {
      newMode = 'grid'
    } else if (currentMode === 'grid') {
      newMode = 'categorized'
    } else {
      newMode = 'key-types'
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

  filterCommands (filter = '') {
    const filterLower = (filter || '').toString().toLowerCase()

    this.document.querySelectorAll('.command-item').forEach((item) => {
      const text = (item.textContent || '').toLowerCase()
      const visible = !filterLower || text.includes(filterLower)
      item.style.display = visible ? 'flex' : 'none'
    })

    this.document.querySelectorAll('.category').forEach((category) => {
      const visibleCommands = category.querySelectorAll('.command-item:not([style*="display: none"])')
      const categoryVisible = !filterLower || visibleCommands.length > 0
      category.style.display = categoryVisible ? 'block' : 'none'
    })
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
    
    const message = this.i18n?.t?.('confirm_delete_key', { keyName: keyName }) || `Delete key ${keyName}?`
    const title = this.i18n?.t?.('confirm_delete') || 'Confirm Delete'
    
    if (await this.confirmDialog.confirm(message, title, 'danger')) {
      try {
        // Use the eventBus to request key deletion from KeyService
        this.emit('key:delete', { key: keyName })
        return true
      } catch (error) {
        console.error('Error deleting key:', error)
        if (this.ui?.showToast) {
          this.ui.showToast('Failed to delete key', 'error')
        }
        return false
      }
    }
    
    return false
  }

  // Duplicate the selected key
  duplicateKey(key) {
    if (!key) return
    this.emit('key:duplicate', { key })
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
} 