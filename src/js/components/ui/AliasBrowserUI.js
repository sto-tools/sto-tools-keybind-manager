import UIComponentBase from '../UIComponentBase.js'
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

export default class AliasBrowserUI extends UIComponentBase {
  constructor ({ eventBus: bus = eventBus,
                modalManager = null,
                confirmDialog = null,
                document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(bus)
    this.componentName = 'AliasBrowserUI'
    this.modalManager = modalManager
    this.confirmDialog = confirmDialog || (typeof window !== 'undefined' ? window.confirmDialog : null)
    this.document = document
  }

  async onInit () {
    // Initialize cached selected alias
    this._selectedAliasName = null
    
    this.setupEventListeners()
    
    // React to alias list or selection changes
    this.eventBus.on('aliases-changed', () => {
      // Aliases changed, updating display
      this.render()
    })
    this.eventBus.on('alias-selected', (data) => {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        // Alias selected, updating selection
      }
      this._selectedAliasName = data.name
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        // Rendering after alias selection
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
      // Environment changed, updating visibility
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
    this.onDom('addAliasChainBtn', 'click', 'alias-chain-add', () => {
      this.createAliasModal()
    })

    this.onDom('deleteAliasChainBtn', 'click', 'alias-chain-delete', () => {
      if (this._selectedAliasName) {
        this.confirmDeleteAlias(this._selectedAliasName)
      }
    })

    this.onDom('duplicateAliasChainBtn', 'click', 'alias-chain-duplicate', () => {
      if (this._selectedAliasName) {
        this.duplicateAlias(this._selectedAliasName)
      }
    })

    // Alias options dropdown
    this.onDom('aliasOptionsDropdown', 'click', 'alias-options-toggle', (e) => {
      e.stopPropagation()
      this.toggleAliasOptionsDropdown()
    })

    // Handle checkbox changes in alias options
    const aliasCheckboxes = ['aliasStabilizeOption', 'aliasToggleOption', 'aliasCycleOption']
    aliasCheckboxes.forEach(id => {
      this.onDom(id, 'change', `alias-option-${id}`, () => {
        this.updateAliasOptionsLabel()
      })
    })

    // Debounced alias search input via eventBus helper
    this.onDomDebounced('aliasFilter', 'input', 'alias-filter', (e) => {
      this.filterAliases(e.target.value)
    }, 250)

    // keydown Escape/Enter
    this.onDom('aliasFilter', 'keydown', 'alias-filter-key', (e) => {
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
    this.onDom('showAllAliasesBtn', 'click', 'alias-show-all', () => {
      const input = this.document.getElementById('aliasFilter')
      if (input) input.value = ''
      this.filterAliases('')
    })

    this.onDom('aliasSearchBtn', 'click', 'alias-search-toggle', () => {
      this.toggleAliasSearch()
    })
  }

  /**
   * Confirm deletion of an alias
   */
  async confirmDeleteAlias(aliasName) {
    if (!aliasName || !this.confirmDialog) return
    
    const message = i18next.t('confirm_delete_alias', { aliasName: aliasName }) || `Delete alias ${aliasName}?`
    const title = i18next.t('confirm_delete') || 'Confirm Delete'
    
    if (await this.confirmDialog.confirm(message, title, 'danger')) {
      // Call alias service directly and show toast based on result
      const result = await this.request('alias:delete', { name: aliasName })
      if (result) {
        this.showToast('Alias deleted successfully', 'success')
      } else {
        this.showToast('Failed to delete alias', 'error')
      }
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

    okBtn.onclick = async () => {
      const target = input.value.trim()
      if (!target || aliases[target]) return // should not happen due to validation
      this.modalManager.hide('aliasDuplicateModal')

      // Validate target name first to provide better error messages
      const isValidName = await this.request('alias:validate-name', { name: target })
      if (!isValidName) {
        this.showToast('Invalid alias name', 'error')
        return
      }

      // Check if current profile exists
      const currentProfile = await this.request('profile:get-current')
      if (!currentProfile) {
        this.showToast('No active profile', 'error')
        return
      }

      // Call alias service directly and show toast based on result
      const result = await this.request('alias:duplicate-with-name', { sourceName: aliasName, newName: target })
      if (result?.success) {
        this.showToast('Alias duplicated successfully', 'success')
      } else {
        this.showToast('Failed to duplicate alias', 'error')
      }
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

    // Use EventBus for automatic cleanup
    grid.querySelectorAll('.alias-item').forEach((item) => {
      this.onDom(item, 'click', 'alias-item-click', async () => {
        // Use correct parameter name for SelectionService
        await this.request('alias:select', { aliasName: item.dataset.alias })
        this.emit('alias-browser/alias-clicked', { name: item.dataset.alias })
      })
    })
  }

  createAliasElement (name, alias) {
    // Handle both legacy string format and new canonical string array format
    let commandCount = 0
    if (Array.isArray(alias.commands)) {
      // New canonical array format
      commandCount = alias.commands.filter(cmd => cmd && cmd.trim()).length
    } else if (typeof alias.commands === 'string' && alias.commands.trim()) {
      // Legacy string format - split by $$
      commandCount = alias.commands.trim().split(/\s*\$\$/).length
    }

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
    // Toggling alias browser visibility
    
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

  // Show create alias modal
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

    // Clear any existing onclick handler to prevent stacking
    okBtn.onclick = null
    okBtn.onclick = async () => {
      const name = input.value.trim()
      if (!name) return
      this.modalManager.hide('aliasCreationModal')

      // Validate alias name first to provide better error messages
      const isValidName = await this.request('alias:validate-name', { name })
      if (!isValidName) {
        this.showToast('Invalid alias name', 'error')
        return
      }

      // Check if current profile exists
      const currentProfile = await this.request('profile:get-current')
      if (!currentProfile) {
        this.showToast('No active profile', 'error')
        return
      }

      // Check if alias already exists
      const existingAliases = await this.request('alias:get-all')
      if (existingAliases[name]) {
        this.showToast('Alias already exists', 'warning')
        return
      }

      // Call alias service directly and show toast based on result
      const result = await this.request('alias:add', { name })
      if (result) {
        this.showToast('Alias created successfully', 'success')
      } else {
        this.showToast('Failed to create alias', 'error')
      }
    }

    this.modalManager.show('aliasCreationModal')
    validate()
  }

  // Filter aliases by term
  filterAliases(value='') {
    const filter = (value||'').toString().toLowerCase()
    const grid = this.document.getElementById('aliasGrid')
    if (!grid) return

    const items = grid.querySelectorAll('.alias-item')
    items.forEach(item => {
      const name = (item.dataset.alias||'').toLowerCase()
      const visible = !filter || name.includes(filter)
      item.style.display = visible ? 'flex' : 'none'
    })

    // Update search button active state for accessibility
    const searchBtn = this.document.getElementById('aliasSearchBtn')
    if (searchBtn) {
      const active = !!filter
      searchBtn.classList.toggle('active', active)
      searchBtn.setAttribute('aria-pressed', active)
    }
  }

  // Toggle alias search input
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