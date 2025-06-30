import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'
import i18next from 'i18next'
import { isAliasNameAllowed, isAliasNamePatternValid } from '../../lib/aliasNameValidator.js'

/** Helper to generate a non-colliding suggested alias name */
function generateSuggestedAlias(original, existingAliases = {}) {
  let base = `${original}_copy`
  let suggestion = base
  let counter = 1
  while (existingAliases[suggestion]) {
    suggestion = `${base}${counter}`
    counter++
  }
  return suggestion
}

export default class AliasBrowserUI extends ComponentBase {
  constructor ({ eventBus: bus = eventBus,
                modalManager = null,
                document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(bus)
    this.componentName = 'AliasBrowserUI'
    this.modalManager = modalManager || (typeof window !== 'undefined' ? window.modalManager : null)
    this.document = document
  }

  async onInit () {
    // Initialize cached selected alias
    this._selectedAliasName = null
    
    this.setupEventListeners()
    
    // React to alias list or selection changes
    this.eventBus.on('aliases-changed', () => {
      console.log('[AliasBrowserUI] aliases-changed event received, calling render()')
      this.render()
    })
    this.eventBus.on('alias-selected', (data) => {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[AliasBrowserUI] alias-selected event received. data:`, data, `setting _selectedAliasName to: ${data.name}`)
      }
      this._selectedAliasName = data.name
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[AliasBrowserUI] calling render() after alias-selected. _selectedAliasName:`, this._selectedAliasName)
      }
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
      this.createAliasModal()
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

    // Debounced alias search input via eventBus helper
    this.eventBus.onDomDebounced('aliasFilter', 'input', 'alias-filter', (e) => {
      this.filterAliases(e.target.value)
    }, 250)

    // keydown Escape/Enter
    this.eventBus.onDom('aliasFilter', 'keydown', 'alias-filter-key', (e) => {
      if (e.key === 'Escape') {
        const input = e.target
        input.value = ''
        input.classList.remove('expanded')
        this.filterAliases('')
      } else if (e.key === 'Enter') {
        const input = e.target
        input.classList.remove('expanded')
        input.blur()
      }
    })

    // show all aliases button
    this.eventBus.onDom('showAllAliasesBtn', 'click', 'alias-show-all', () => {
      const input = this.document.getElementById('aliasFilter')
      if (input) input.value = ''
      this.filterAliases('')
    })

    this.eventBus.onDom('aliasSearchBtn', 'click', 'alias-search-toggle', () => {
      this.toggleAliasSearch()
    })
  }

  /**
   * Confirm deletion of an alias
   */
  confirmDeleteAlias(aliasName) {
    if (!aliasName) return
    
    const message = i18next.t('confirm_delete_alias', { alias: aliasName }) || `Delete alias ${aliasName}?`
    if (confirm(message)) {
      this.emit('alias:delete', { name: aliasName })
    }
  }

  /**
   * Open duplicate alias modal allowing the user to specify the target name.
   */
  async duplicateAlias(aliasName) {
    if (!aliasName || !this.modalManager) return

    const aliases = await this.request('alias:get-all')
    const suggested = generateSuggestedAlias(aliasName, aliases)

    // Get modal elements
    const modal = this.document.getElementById('aliasDuplicateModal')
    if (!modal) return

    const input   = modal.querySelector('#duplicateAliasNameInput')
    const okBtn   = modal.querySelector('#confirmDuplicateAliasBtn')
    const warnEl  = modal.querySelector('#duplicateAliasValidation')

    const validate = () => {
      const val = (input.value || '').trim()
      const duplicate = aliases[val]
      let errorKey = null
      if (!val) errorKey = 'invalid_alias_name'
      else if (!isAliasNamePatternValid(val)) errorKey = 'invalid_alias_name'
      else if (!isAliasNameAllowed(val)) errorKey = 'reserved_command_name'
      else if (duplicate) errorKey = 'alias_name_in_use'

      warnEl.textContent = errorKey ? i18next.t(errorKey) : ''
      const invalid = !!errorKey
      warnEl.style.display = invalid ? '' : 'none'
      okBtn.disabled = invalid
    }

    // Prefill
    input.value = suggested
    warnEl.style.display = 'none'

    // Attach event listeners once
    const inputHandler = () => validate()
    input.removeEventListener('input', inputHandler)
    input.addEventListener('input', inputHandler)

    okBtn.onclick = () => {
      const target = input.value.trim()
      if (!target || aliases[target]) return // should not happen due to validation
      this.modalManager.hide('aliasDuplicateModal')
      this.emit('alias:duplicate', { from: aliasName, to: target })
    }

    // Show modal
    this.modalManager.show('aliasDuplicateModal')
    // Initial validation
    validate()
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
    
    this.emit('alias:options-changed', { stabilize, toggle, cycle })
  }

  async render () {
    const grid = this.document.getElementById('aliasGrid')
    if (!grid) return

    const aliases = await this.request('alias:get-all')
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

    // Use the correct CSS class selector to match what createAliasElement produces
    grid.querySelectorAll('.alias-item').forEach((item) => {
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

    // Use consistent CSS classes: 'alias-item' (to match tests) and 'active' (to match selection pattern)
    return `
      <div class="alias-item ${isSelected ? 'active' : ''}" data-alias="${name}" data-length="${lengthClass}" title="${description}">
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

  /**
   * Show create alias modal
   */
  async createAliasModal() {
    if (!this.modalManager) return

    const aliases = await this.request('alias:get-all')

    const modal = this.document.getElementById('aliasCreationModal')
    if (!modal) return

    const input = modal.querySelector('#newAliasNameInput')
    const okBtn = modal.querySelector('#confirmCreateAliasBtn')
    const warnEl = modal.querySelector('#createAliasValidation')

    const validate = () => {
      const val = (input.value || '').trim()
      let errorKey = null
      if (!val) errorKey = 'invalid_alias_name'
      else if (!isAliasNamePatternValid(val)) errorKey = 'invalid_alias_name'
      else if (!isAliasNameAllowed(val)) errorKey = 'reserved_command_name'
      else if (aliases[val]) errorKey = 'alias_name_in_use'

      warnEl.textContent = errorKey ? i18next.t(errorKey) : ''
      const invalid = !!errorKey
      warnEl.style.display = invalid ? '' : 'none'
      okBtn.disabled = invalid
    }

    input.value = ''
    warnEl.style.display = 'none'
    input.removeEventListener('input', validate)
    input.addEventListener('input', validate)

    okBtn.onclick = () => {
      const name = input.value.trim()
      if (!name) return
      this.modalManager.hide('aliasCreationModal')
      this.emit('alias:create', { name })
    }

    this.modalManager.show('aliasCreationModal')
    validate()
  }

  /**
   * Filter aliases by term
   */
  filterAliases(value='') {
    const filter = (value||'').toString().toLowerCase()
    const items = this.document.querySelectorAll('.alias-item')
    items.forEach(item => {
      const name = (item.dataset.alias||'').toLowerCase()
      const visible = !filter || name.includes(filter)
      item.style.display = visible ? 'flex' : 'none'
    })
  }

  /** Toggle alias search input */
  toggleAliasSearch() {
    const doc = this.document || (typeof window !== 'undefined' ? window.document : undefined)
    if (!doc) return
    const input = doc.getElementById('aliasFilter')
    if (!input) return
    const expanded = input.classList.toggle('expanded')
    if (expanded) {
      input.focus()
    } else {
      input.blur()
    }
  }
} 