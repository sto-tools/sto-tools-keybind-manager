import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'
import i18next from 'i18next'

export default class AliasBrowserUI extends ComponentBase {
  constructor ({ eventBus: bus = eventBus, document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(bus)
    this.componentName = 'AliasBrowserUI'
    this.document = document
  }

  async onInit () {
    // Initialize cached selected alias
    this._selectedAliasName = null
    
    this.setupEventListeners()
    
    // React to alias list or selection changes
    this.eventBus.on('aliases-changed', () => this.render())
    this.eventBus.on('alias-selected', (data) => {
      this._selectedAliasName = data.name
      this.render()
    })

    // Listen for profile changes to refresh alias list
    this.addEventListener('profile:switched', ({ profileId, environment } = {}) => {
      this._selectedAliasName = null // Clear selection when switching profiles
      this.render()
    })

    // Toggle visibility based on current environment
    this.eventBus.on('environment:changed', (d = {}) => {
      const env = typeof d === 'string' ? d : d.environment || d.newMode || d.mode
      console.log('[AliasBrowserUI] environment:changed event received:', d, 'parsed env:', env)
      this.toggleVisibility(env)
    })

    // Initial render & visibility - now handled through late-join handshake
    // The late-join handshake will handle environment synchronization
    await this.render()
  }

  setupEventListeners() {
    if (this.eventListenersSetup) {
      return
    }
    this.eventListenersSetup = true

    // Alias management DOM events
    this.eventBus.onDom('addAliasChainBtn', 'click', 'alias-chain-add', () => {
      this.showAliasCreationModal()
    })

    this.eventBus.onDom('deleteAliasChainBtn', 'click', 'alias-chain-delete', () => {
      if (this._selectedAliasName) {
        this.confirmDeleteAlias(this._selectedAliasName)
      }
    })

    this.eventBus.onDom('duplicateAliasChainBtn', 'click', 'alias-chain-duplicate', () => {
      if (this._selectedAliasName) {
        this.duplicateAlias(this._selectedAliasName)
      }
    })

    // Alias options dropdown
    this.eventBus.onDom('aliasOptionsDropdown', 'click', 'alias-options-toggle', (e) => {
      e.stopPropagation()
      this.toggleAliasOptionsDropdown()
    })

    // Handle checkbox changes in alias options
    const aliasCheckboxes = ['aliasStabilizeOption', 'aliasToggleOption', 'aliasCycleOption']
    aliasCheckboxes.forEach(id => {
      this.eventBus.onDom(id, 'change', `alias-option-${id}`, () => {
        this.updateAliasOptionsLabel()
      })
    })
  }

  /**
   * Show alias creation modal
   */
  showAliasCreationModal() {
    this.eventBus.emit('alias:show-create-modal')
  }

  /**
   * Confirm deletion of an alias
   */
  confirmDeleteAlias(aliasName) {
    if (!aliasName) return
    
    const message = i18next.t('confirm_delete_alias', { alias: aliasName }) || `Delete alias ${aliasName}?`
    if (confirm(message)) {
      this.eventBus.emit('alias:delete', { name: aliasName })
    }
  }

  /**
   * Duplicate the selected alias
   */
  duplicateAlias(aliasName) {
    if (!aliasName) return
    this.eventBus.emit('alias:duplicate', { name: aliasName })
  }

  /**
   * Toggle alias options dropdown
   */
  toggleAliasOptionsDropdown() {
    const dropdown = this.document.getElementById('aliasOptionsDropdown')
    if (dropdown) {
      dropdown.classList.toggle('active')
    }
  }

  /**
   * Update alias options label based on selected checkboxes
   */
  updateAliasOptionsLabel() {
    const stabilize = this.document.getElementById('aliasStabilizeOption')?.checked
    const toggle = this.document.getElementById('aliasToggleOption')?.checked
    const cycle = this.document.getElementById('aliasCycleOption')?.checked
    
    this.eventBus.emit('alias:options-changed', { stabilize, toggle, cycle })
  }

  async render () {
    const grid = this.document.getElementById('aliasGrid')
    if (!grid) return

    const aliases = await request(this.eventBus, 'alias:get-all')
    // Use cached selected alias from event listeners instead of polling

    const entries = Object.entries(aliases)

    if (entries.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-mask"></i>
          <h4 data-i18n="no_aliases_defined">${i18next.t('no_aliases_defined')}</h4>
          <p data-i18n="create_alias_to_get_started">${i18next.t('create_alias_to_get_started')}</p>
        </div>`
      return
    }

    grid.classList.remove('categorized')
    grid.innerHTML = entries.map(([name, alias]) => this.createAliasElement(name, alias)).join('')

    grid.querySelectorAll('.alias-chain-item').forEach((item) => {
      item.addEventListener('click', () => {
        request(this.eventBus, 'alias:select', { name: item.dataset.alias })
        this.emit('alias-browser/alias-clicked', { name: item.dataset.alias })
      })
    })
  }

  createAliasElement (name, alias) {
    const commandCount = typeof alias.commands === 'string' && alias.commands.trim() 
      ? alias.commands.trim().split(/\s*\$\$/).length 
      : 0

    const selectedName = this._selectedAliasName || null
    const isSelected   = selectedName === name
    const description  = alias.description || ''
    const lengthClass  = name.length <= 8 ? 'short' : name.length <= 12 ? 'medium' : name.length <= 16 ? 'long' : 'extra-long'

    return `
      <div class="alias-chain-item ${isSelected ? 'selected' : ''}" data-alias="${name}" data-length="${lengthClass}" title="${description}">
        <div class="alias-name">${name}</div>
        <div class="alias-command-count">${commandCount} <span data-i18n="commands">${i18next.t('commands')}</span></div>
      </div>`
  }

  toggleVisibility (env) {
    const container = this.document.getElementById('aliasSelectorContainer') || this.document.getElementById('aliasGrid')?.parentElement?.parentElement
    if (!container) return
    
    const shouldShow = (env === 'alias')
    console.log('[AliasBrowserUI] toggleVisibility called with env:', env, 'shouldShow:', shouldShow, 'container exists:', !!container)
    
    container.style.display = shouldShow ? '' : 'none'
  }

  /* ------------------------------------------------------------
   * Late-join: when other components send us their state snapshot we
   * immediately sync our visibility so that the UI is correct on first
   * paint even if the environment was set long before this UI initialised.
   * ---------------------------------------------------------- */
  handleInitialState (sender, state) {
    if (!state) return
    
    // Handle environment state from InterfaceModeService or other components
    if (state.environment || state.currentEnvironment) {
      const env = state.environment || state.currentEnvironment
      console.log('[AliasBrowserUI] handleInitialState from', sender, 'environment:', env)
      this.toggleVisibility(env)
    }
  }
} 