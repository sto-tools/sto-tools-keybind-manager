import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'

/**
 * KeyBrowserUI – responsible for rendering the key grid (#keyGrid).
 * For the initial migration it simply delegates to the legacy
 * renderKeyGrid implementation hanging off the global `app` instance.
 */
export default class KeyBrowserUI extends ComponentBase {
  constructor ({ service, app, document = window.document }) {
    super(eventBus)
    this.service  = service
    this.app      = app
    this.document = document
  }

  /* ============================================================
   * Lifecycle
   * ========================================================== */
  onInit () {
    // Determine initial environment for visibility BEFORE any rendering
    const initialEnv = this.service ? (this.service.currentEnvironment || 'space') : 'space'

    // Re-render whenever key list changes or selection updates.
    eventBus.on('key:list-changed', () => this.render())
    eventBus.on('key-selected', () => this.render())

    // Handle environment changes for visibility toggling
    this.addEventListener('environment:changed', (d = {}) => {
      const env = typeof d === 'string' ? d : d.environment || d.newMode || d.mode
      this.toggleVisibility(env)
      if (env !== 'alias') {
        this.render()
      }
    })

    // If starting up in alias mode, postpone initial render until user
    // switches out of alias. Otherwise render immediately.
    const shouldInitialRender = initialEnv !== 'alias'

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

    // Initial paint (only if not in alias mode) and toggle-button state
    if (shouldInitialRender) this.render()
    const initialMode = localStorage.getItem('keyViewMode') || 'key-types'
    this.updateViewToggleButton(initialMode)
  }

  async render () {
    const grid = this.document.getElementById('keyGrid')
    if (!grid) return

    const profile = await request(eventBus, 'key:get-profile')
    if (!profile) {
      grid.innerHTML = `<div class="empty-state"><i class="fas fa-folder-open"></i><h4>${i18next.t('no_profile_selected') || 'No Profile Selected'}</h4></div>`
      return
    }

    const keyMap = await request(eventBus, 'key:get-all')
    const selectedKeyName = await request(eventBus, 'key:get-selected-name')

    // Cache for child helpers
    this._currentKeyMap = keyMap
    this._selectedKeyName = selectedKeyName

    const keys      = Object.keys(keyMap)
    const keysWithCommands = {}
    keys.forEach((k) => {
      const cmds = keyMap[k]
      if (cmds && cmds.length > 0) keysWithCommands[k] = cmds
    })
    const allKeys = [...new Set([...keys, ...Object.keys(keysWithCommands)])]

    // Clear grid
    grid.innerHTML = ''

    const viewMode = localStorage.getItem('keyViewMode') || 'key-types'

    if (viewMode === 'key-types') {
      this.renderKeyTypeView(grid, profile, allKeys)
    } else if (viewMode === 'grid') {
      this.renderSimpleGridView(grid, allKeys)
    } else {
      // command-category
      this.renderCommandCategoryView(grid, keysWithCommands, allKeys)
    }
  }

  /* ============================================================
   * Rendering helpers (migrated from legacy uiRendering)
   * ========================================================== */

  renderSimpleGridView (grid, allKeys) {
    grid.classList.remove('categorized')
    const sortedKeys = allKeys.sort(this.compareKeys.bind(this))
    sortedKeys.forEach((keyName) => {
      const keyElement = this.createKeyElement(keyName)
      grid.appendChild(keyElement)
    })
  }

  renderCommandCategoryView (grid, keysWithCommands, allKeys) {
    grid.classList.add('categorized')
    const categories = this.categorizeKeys(keysWithCommands, allKeys)
    const sorted = Object.entries(categories).sort(([aId,a],[bId,b]) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.name.localeCompare(b.name)
    })
    sorted.forEach(([catId,catData]) => {
      const el = this.createKeyCategoryElement(catId, catData)
      grid.appendChild(el)
    })
  }

  renderKeyTypeView (grid, profile, allKeys) {
    grid.classList.add('categorized')
    const cats = this.categorizeKeysByType(profile.keys, allKeys)
    const sorted = Object.entries(cats).sort(([,a],[,b]) => a.priority - b.priority)
    sorted.forEach(([id,data]) => {
      const el = this.createKeyCategoryElement(id, data, 'key-type')
      grid.appendChild(el)
    })
  }

  /* ------ Categorization helpers ------ */

  categorizeKeys (keysWithCommands, allKeys) {
    const categories = {
      unknown: { name: 'Unknown', icon: 'fas fa-question-circle', keys: new Set(), priority: 0 },
    }

    Object.entries(STO_DATA.commands).forEach(([catId,catData]) => {
      categories[catId] = { name: catData.name, icon: catData.icon, keys: new Set(), priority: 1 }
    })

    allKeys.forEach((keyName) => {
      const commands = keysWithCommands[keyName] || []

      if (!commands || commands.length === 0) {
        categories.unknown.keys.add(keyName)
        return
      }

      const keyCats = new Set()
      commands.forEach((command) => {
        if (command.type && categories[command.type]) keyCats.add(command.type)
        else if (window.stoCommands) {
          const detected = window.stoCommands.detectCommandType(command.command)
          if (categories[detected]) keyCats.add(detected)
        }
      })

      if (keyCats.size > 0) {
        keyCats.forEach((cid) => categories[cid].keys.add(keyName))
      } else {
        if (!categories.custom) categories.custom = { name: 'Custom Commands', icon: 'fas fa-cog', keys: new Set(), priority: 2 }
        categories.custom.keys.add(keyName)
      }
    })

    Object.values(categories).forEach((cat) => { cat.keys = Array.from(cat.keys).sort(this.compareKeys.bind(this)) })
    return categories
  }

  detectKeyTypes (keyName) {
    const types = []
    if (/^F[0-9]+$/.test(keyName)) types.push('function')
    if (/^[A-Z0-9]$/.test(keyName)) types.push('alphanumeric')
    if (/^NUMPAD/.test(keyName)) types.push('numberpad')
    if (/(Ctrl|Alt|Shift)/.test(keyName)) types.push('modifiers')
    if (/(UP|DOWN|LEFT|RIGHT|HOME|END|PGUP|PGDN)/.test(keyName)) types.push('navigation')
    if (/ESC|TAB|CAPS|PRINT|SCROLL|PAUSE/.test(keyName)) types.push('system')
    if (/MOUSE|WHEEL/.test(keyName)) types.push('mouse')
    if (/[^A-Z0-9]/.test(keyName)) types.push('symbols')
    if (types.length === 0) types.push('other')
    return types
  }

  categorizeKeysByType (keysWithCommands, allKeys) {
    const categories = {
      function:   { name: 'Function Keys',        icon: 'fas fa-keyboard',     keys: new Set(), priority: 1 },
      alphanumeric:{ name: 'Letters & Numbers',   icon: 'fas fa-font',         keys: new Set(), priority: 2 },
      numberpad:  { name: 'Numberpad',            icon: 'fas fa-calculator',   keys: new Set(), priority: 3 },
      modifiers:  { name: 'Modifier Keys',        icon: 'fas fa-hand-paper',   keys: new Set(), priority: 4 },
      navigation: { name: 'Navigation',           icon: 'fas fa-arrows-alt',   keys: new Set(), priority: 5 },
      system:     { name: 'System Keys',          icon: 'fas fa-cogs',         keys: new Set(), priority: 6 },
      mouse:      { name: 'Mouse & Wheel',        icon: 'fas fa-mouse',        keys: new Set(), priority: 7 },
      symbols:    { name: 'Symbols & Punctuation',icon: 'fas fa-at',           keys: new Set(), priority: 8 },
      other:      { name: 'Other Keys',           icon: 'fas fa-question-circle',keys: new Set(),priority: 9 },
    }

    allKeys.forEach((keyName) => {
      const types = this.detectKeyTypes(keyName)
      types.forEach((t) => (categories[t] || categories.other).keys.add(keyName))
    })

    Object.values(categories).forEach((c) => { c.keys = Array.from(c.keys).sort(this.compareKeys.bind(this)) })
    return categories
  }

  compareKeys (a,b) {
    const getPriority = (k) => {
      if (k==='Space') return 0
      if (/^[0-9]$/.test(k)) return 1
      if (/^F[0-9]+$/.test(k)) return 2
      if (k.includes('Ctrl+')) return 3
      if (k.includes('Alt+')) return 4
      if (k.includes('Shift+')) return 5
      return 6
    }
    const pa=getPriority(a), pb=getPriority(b)
    if (pa!==pb) return pa-pb
    return a.localeCompare(b)
  }

  formatKeyName (keyName) {
    return keyName.replace(/\+/g,'<br>+')
  }

  createKeyElement (keyName) {
    const keyMap = this._currentKeyMap || {}
    const commands = (keyMap && keyMap[keyName]) ? keyMap[keyName] : []

    const isSelected = keyName === this._selectedKeyName

    const nonBlank = commands.filter((cmd) => {
      if (typeof cmd === 'string') return cmd.trim() !== ''
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
      request(eventBus, 'key:select', { key: keyName })
    })
    return el
  }

  createKeyCategoryElement (categoryId, categoryData, mode='command') {
    const element = this.document.createElement('div')
    element.className = 'category'
    element.dataset.category = categoryId

    const storageKey = mode==='key-type'?`keyTypeCategory_${categoryId}_collapsed`:`keyCategory_${categoryId}_collapsed`
    const isCollapsed = localStorage.getItem(storageKey)==='true'

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

  toggleKeyCategory (categoryId, element, mode='command') {
    const storageKey = mode==='key-type'?`keyTypeCategory_${categoryId}_collapsed`:`keyCategory_${categoryId}_collapsed`
    const isCollapsed = element.querySelector('h4').classList.toggle('collapsed')
    element.querySelector('.category-commands').classList.toggle('collapsed')
    localStorage.setItem(storageKey, isCollapsed)
  }

  /* ============================================================
   * View-management helpers (migrated from legacy viewManagement)
   * ========================================================== */

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

    const currentMode = localStorage.getItem('keyViewMode') || 'key-types'
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

    this.document.querySelectorAll('.key-item').forEach((item) => {
      const keyName = (item.dataset.key || '').toLowerCase()
      const visible = !filterLower || keyName.includes(filterLower)
      item.style.display = visible ? 'flex' : 'none'
    })

    this.document.querySelectorAll('.command-item[data-key]').forEach((item) => {
      const keyName = (item.dataset.key || '').toLowerCase()
      const visible = !filterLower || keyName.includes(filterLower)
      item.style.display = visible ? 'flex' : 'none'
    })

    this.document.querySelectorAll('.category').forEach((category) => {
      const visibleKeys = category.querySelectorAll('.command-item[data-key]:not([style*="display: none"])')
      const categoryVisible = !filterLower || visibleKeys.length > 0
      category.style.display = categoryVisible ? 'block' : 'none'
    })
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
    this.document.querySelectorAll('.key-item').forEach((item) => { item.style.display = 'flex' })
    this.document.querySelectorAll('.command-item[data-key]').forEach((item) => { item.style.display = 'flex' })
    this.document.querySelectorAll('.category').forEach((category) => { category.style.display = 'block' })

    const filterInput = this.document.getElementById('keyFilter')
    if (filterInput) filterInput.value = ''
  }

  toggleVisibility (env) {
    // Key selector container
    const container = this.document.querySelector('.key-selector-container') || this.document.getElementById('keyGrid')?.parentElement?.parentElement?.parentElement
    if (!container) return
    container.style.display = (env === 'alias') ? 'none' : ''
  }

  /* ------------------------------------------------------------
   * Late-join: sync visibility when initial state snapshot is received.
   * ---------------------------------------------------------- */
  handleInitialState (sender, state) {
    if (!state || !state.environment) return
    this.toggleVisibility(state.environment)
    if (this.service && typeof this.service.currentEnvironment !== 'undefined') {
      this.service.currentEnvironment = state.environment
    }
  }
} 