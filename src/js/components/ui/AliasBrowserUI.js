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
                document = (typeof window !== 'undefined' ? window.document : undefined),
                i18n } = {}) {
    super(bus)
    this.componentName = 'AliasBrowserUI'
    this.modalManager = modalManager
    this.confirmDialog = confirmDialog || (typeof window !== 'undefined' ? window.confirmDialog : null)
    this.document = document
    this.i18n = i18n
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
    
    const message = this.i18n.t('confirm_delete_alias', { aliasName: aliasName })
    const title = this.i18n.t('confirm_delete')
    
    if (await this.confirmDialog.confirm(message, title, 'danger', 'aliasDelete')) {
      // Call alias service directly and show toast based on result
      const result = await this.request('alias:delete', { name: aliasName })

      if (result?.success) {
        const successMessage = this.i18n.t(result?.message || 'alias_deleted', { name: aliasName })
        this.showToast(successMessage, 'success')
      } else {
        const params = result?.params || { aliasName }
        const reason = params.reason || 'Unknown error'
        const errorMessage = this.i18n.t(result?.error || 'failed_to_delete_alias', { name: aliasName, reason })
        this.showToast(errorMessage, 'error')
      }
    }
  }

  /**
   * Open duplicate alias modal allowing the user to specify the target name.
   */
  async duplicateAlias(aliasName) {
    if (!aliasName || !this.modalManager) return

    // Prefer cached aliases (kept updated via ComponentBase). Fallback to service request.
    let aliasMap = this.cache.aliases
    if (!aliasMap || Object.keys(aliasMap).length === 0) {
      const response = await this.request('alias:get-all') || {}
      aliasMap = response.aliases || response || {}
      this.cache.aliases = aliasMap
    }
    const suggested = generateSuggestedAlias(aliasName, aliasMap)

    // Get modal elements
    const modal = this.document.getElementById('aliasDuplicateModal')
    if (!modal) return

    const input   = modal.querySelector('#duplicateAliasNameInput')
    const okBtn   = modal.querySelector('#confirmDuplicateAliasBtn')
    const warnEl  = modal.querySelector('#duplicateAliasValidation')

    const validate = () => {
      const val = (input.value || '').trim()
      const duplicate = aliasMap[val]
      let errorKey = null
      if (!val) errorKey = 'invalid_alias_name'
      else if (!isAliasNamePatternValid(val)) errorKey = 'invalid_alias_name'
      else if (!isAliasNameAllowed(val)) errorKey = 'reserved_command_name'
      else if (duplicate) errorKey = 'alias_name_in_use'

      warnEl.textContent = errorKey ? this.i18n.t(errorKey) : ''
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
      if (!target || aliasMap[target]) return // should not happen due to validation
      this.modalManager?.hide?.('aliasDuplicateModal')

      // Call alias service directly and show toast based on result
      const result = await this.request('alias:duplicate-with-name', { sourceName: aliasName, newName: target })
      if (result?.success) {
        const successMessage = this.i18n.t(result?.message || 'alias_duplicated', { from: aliasName, to: target })
        this.showToast(successMessage, 'success')
        // Update local cache optimistically so UI reflects the new alias immediately
        this.cache.aliases = {
          ...aliasMap,
          [target]: JSON.parse(JSON.stringify(aliasMap[aliasName]))
        }
        this.render().catch(() => {})
      } else {
        const params = result?.params || { sourceName: aliasName }
        const reason = params.reason || 'Unknown error'
        const errorMessage = this.i18n.t(result?.error || 'failed_to_duplicate_alias', { sourceName: aliasName, reason })
        this.showToast(errorMessage, 'error')
      }
    }

    // Show modal
    this.modalManager.show('aliasDuplicateModal')
    // Initial validation
    validate()
  }

  
  async render () {
    const grid = this.document.getElementById('aliasGrid')
    if (!grid) return

    const aliasResponse = await this.request('alias:get-all')
    const aliases = aliasResponse && aliasResponse.aliases ? aliasResponse.aliases : (aliasResponse || {})
    this.cache.aliases = aliases
    // Use cached selected alias from event listeners instead of polling

    const entries = Object.entries(aliases)

    if (entries.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-mask"></i>
          <h4 data-i18n="no_aliases_defined">${this.i18n.t('no_aliases_defined')}</h4>
          <p data-i18n="create_alias_to_get_started">${this.i18n.t('create_alias_to_get_started')}</p>
        </div>`
      return
    }

    grid.classList.remove('categorized')
    grid.innerHTML = entries.map(([name, alias]) => this.createAliasElement(name, alias)).join('')

    // Use EventBus for automatic cleanup
    if (typeof grid.querySelectorAll === 'function') {
      grid.querySelectorAll('.alias-item').forEach((item) => {
        this.onDom(item, 'click', 'alias-item-click', async () => {
          // Use correct parameter name for SelectionService
          await this.request('alias:select', { aliasName: item.dataset.alias })
          this.emit('alias-browser/alias-clicked', { name: item.dataset.alias })
        })
      })
    }
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
        <div class="alias-command-count">${commandCount} <span data-i18n="${commandCount === 1 ? 'command_singular' : 'commands'}">${this.i18n.t(commandCount === 1 ? 'command_singular' : 'commands')}</span></div>
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

      warnEl.textContent = errorKey ? this.i18n.t(errorKey) : ''
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

      // Use event-driven alias creation to enable auto-selection
      // The service will handle profile and duplicate checks
      const result = await this.request('alias-browser:create', { name, description: '' })
      if (result?.success) {
        const successMessage = this.i18n.t(result?.message || 'alias_created', { name })
        this.showToast(successMessage, 'success')
      } else if (result?.error) {
        const errorMessage = this.i18n.t(result.error, result.params)
        this.showToast(errorMessage, 'error')
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
