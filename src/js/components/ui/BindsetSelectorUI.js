import ComponentBase from '../ComponentBase.js'
import i18next from 'i18next'

/*
 * BindsetSelectorUI - Handles the bindset selector UI
 * Manages the bindset selector UI and its interactions
 */
export default class BindsetSelectorUI extends ComponentBase {
  constructor({ eventBus, confirmDialog = null, document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(eventBus)
    this.componentName = 'BindsetSelectorUI'
    this.document = document
    this.confirmDialog = confirmDialog || (typeof window !== 'undefined' ? window.confirmDialog : null)

    this.containerId = 'bindsetSelectorContainer'
    this.isOpen = false
    this.service = null

    this.keyBindsetMembership = new Map()
    this.isVisible = false
  }

  async onInit() {
    this.setupEventListeners()
    this.render()
  }

  setupEventListeners() {
    if (this.listenersSetup) return
    this.listenersSetup = true

    // Listen for service state changes
    this.addEventListener('bindset-selector:active-changed', () => {
      // ComponentBase automatically updates this.cache.activeBindset
      this.render()
    })

    this.addEventListener('bindset-selector:membership-updated', ({ membership }) => {
      // ComponentBase automatically updates this.cache.selectedKey
      this.keyBindsetMembership = membership
      this.render()
    })

    this.addEventListener('bindset-selector:visibility-changed', ({ visible }) => {
      this.isVisible = visible
      this.render()
    })

    this.addEventListener('bindsets:changed', ({ names }) => {
      console.log('[BindsetSelectorUI] bindsets:changed received:', names)
      // ComponentBase automatically updates this.cache.bindsetNames
      this.render()
    })

    // Listen for key selection changes
    this.addEventListener('key:selected', ({ key }) => {
      console.log('[BindsetSelectorUI] key:selected received:', key)
      // ComponentBase handles this.cache.selectedKey automatically via key-selected events
      this.request('bindset-selector:set-key', { key })
    })

    // Listen for environment changes - service handles this directly
    this.addEventListener('environment:changed', ({ environment }) => {
      console.log('[BindsetSelectorUI] environment:changed received:', environment)
      // Service handles environment changes directly, UI just needs to re-render
      this.render()
    })

    // Listen for bindset manager open requests
    this.addEventListener('bindset-manager:open', () => {
      this.openBindsetManager()
    })

    // DOM Event Listeners using EventBus onDom facility
    // Button events - use element selectors with EventBus delegation
    this.eventBus.onDom('bindsetSelectorBtn', 'click', 'bindset-toggle', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.toggleDropdown()
    })

    // Bindset selection events - use delegation on the dropdown menu
    this.eventBus.onDom('#bindsetOptionsMenu', 'click', 'bindset-option-selected', (e) => {
      const option = e.target.closest('.bindset-option')
      if (option && !e.target.closest('.toolbar-group')) {
        // Don't allow selection of greyed-out bindsets (where key doesn't exist)
        if (option.classList.contains('greyed-out')) {
          return
        }
        const bindset = option.dataset.bindset
        this.request('bindset-selector:set-active-bindset', { bindset })
        this.close()
      }
    })

    // Add key buttons - handle click events on add-key-btn class
    this.eventBus.onDom('#bindsetOptionsMenu', 'click', 'bindset-add-key', (e) => {
      const addBtn = e.target.closest('.add-key-btn')
      if (addBtn && !addBtn.disabled) {
        e.preventDefault()
        e.stopPropagation()
        const bindset = addBtn.dataset.bindset
        this.showAddKeyConfirmation(bindset)
      }
    })

    // Remove key buttons - handle click events on remove-key-btn class
    this.eventBus.onDom('#bindsetOptionsMenu', 'click', 'bindset-remove-key', (e) => {
      const removeBtn = e.target.closest('.remove-key-btn')
      if (removeBtn && !removeBtn.disabled) {
        e.preventDefault()
        e.stopPropagation()
        const bindset = removeBtn.dataset.bindset
        this.showRemoveKeyConfirmation(bindset)
      }
    })

    // Manage bindsets link - use element selector
    this.eventBus.onDom('manageBindsetsLink', 'click', 'bindset-manage', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.openBindsetManager()
      this.close()
    })

    // Document events - use document with proper cleanup and unique bus events
    this.eventBus.onDom(this.document, 'click', 'bindset-outside-click', (e) => {
      // Close if click is outside both the container and the dropdown menu
      if (!e.target.closest(`#${this.containerId}`) && !e.target.closest('#bindsetOptionsMenu')) {
        this.close()
      }
    })

    this.eventBus.onDom(this.document, 'keydown', 'bindset-escape', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close()
      }
    })
  }

  render() {
    const container = this.document?.getElementById(this.containerId)
    if (!container) {
      console.log('[BindsetSelectorUI] Container not found:', this.containerId)
      return
    }

    console.log('[BindsetSelectorUI] render() called - isVisible:', this.isVisible, 'bindsetNames:', this.cache.bindsetNames)

    if (!this.isVisible) {
      container.style.display = 'none'
      return
    }

    container.style.display = 'block'
    container.innerHTML = this.generateDropdownHTML()

    // Create dropdown menu as child of body to avoid overflow issues
    this.createDropdownMenu()
  }

  generateDropdownHTML() {
    const activeBindset = this.cache.activeBindset
    
    // Only return the button HTML - dropdown will be created separately
    let html = `
      <button class="toolbar-btn" id="bindsetSelectorBtn" title="${i18next.t('select_bindset') || 'Select Bindset'}">
        <i class="fas fa-tags"></i>
      </button>
    `
    
    return html
  }

  generateDropdownMenuHTML() {
    const activeBindset = this.cache.activeBindset
    
    let html = `
      <div id="bindsetOptionsMenu" class="bindset-dropdown-menu" style="display: none;">
    `

    // Primary Bindset (no toolbar)
    const isPrimaryActive = activeBindset === 'Primary Bindset'
    html += `
      <div class="bindset-option ${isPrimaryActive ? 'active' : ''}" data-bindset="Primary Bindset">
        <span class="bindset-name">${i18next.t('primary_bindset') || 'Primary Bindset'}</span>
      </div>
    `

    // Other bindsets with toolbar
    this.cache.bindsetNames.forEach(bindset => {
      if (bindset === 'Primary Bindset') return
      
      const isActive = activeBindset === bindset
      const hasKey = this.keyBindsetMembership.get(bindset) || false
      const greyedOut = !hasKey ? 'greyed-out' : ''
      
      console.log(`[BindsetSelectorUI] Bindset: ${bindset}, hasKey: ${hasKey}, selectedKey: ${this.cache.selectedKey}`)
      
      html += `
        <div class="bindset-option ${isActive ? 'active' : ''} ${greyedOut}" data-bindset="${bindset}">
          <span class="bindset-name">${this.escapeHtml(bindset)}</span>
          <div class="toolbar-group">
            <button class="toolbar-btn-small add-key-btn" 
                    data-bindset="${this.escapeHtml(bindset)}" 
                    title="${i18next.t('add_key_to_bindset') || 'Add key to bindset'}"
                    ${hasKey ? 'disabled' : ''}>
              <i class="fas fa-plus"></i>
            </button>
            <button class="toolbar-btn-small remove-key-btn" 
                    data-bindset="${this.escapeHtml(bindset)}" 
                    title="${i18next.t('remove_key_from_bindset') || 'Remove key from bindset'}"
                    ${!hasKey ? 'disabled' : ''}>
              <i class="fas fa-minus"></i>
            </button>
          </div>
        </div>
      `
    })

    html += `
        <div class="bindset-dropdown-footer">
          <a href="#" id="manageBindsetsLink" class="text-link">[${i18next.t('manage_bindsets') || 'Manage Bindsets'}]</a>
        </div>
      </div>
    `

    return html
  }

  createDropdownMenu() {
    // Remove existing dropdown menu if it exists
    const existingMenu = this.document?.getElementById('bindsetOptionsMenu')
    if (existingMenu) {
      existingMenu.remove()
    }
    
    // Create new dropdown menu and append to body
    const menuHTML = this.generateDropdownMenuHTML()
    const tempDiv = this.document?.createElement('div')
    if (tempDiv) {
      tempDiv.innerHTML = menuHTML
      const menu = tempDiv.firstElementChild
      if (menu) {
        this.document.body.appendChild(menu)
      }
    }
  }

  
  async showAddKeyConfirmation(bindsetName) {
    const message = i18next.t('add_key_to_bindset_confirm', { 
      key: this.cache.selectedKey, 
      bindset: bindsetName 
    }) || `Add key "${this.cache.selectedKey}" to bindset "${bindsetName}"?`
    
    let confirmed = false
    
    if (this.confirmDialog) {
      const title = i18next.t('confirm_add') || 'Confirm Add'
      confirmed = await this.confirmDialog.confirm(message, title, 'info')
    } else {
      // Fallback to window.confirm when confirmDialog is not available
      confirmed = window.confirm(message)
    }
    
    if (confirmed) {
      this.request('bindset-selector:add-key-to-bindset', { bindset: bindsetName })
        .then(result => {
          if (!result?.success) {
            this.showError(result?.error || 'add_failed')
          }
        })
        .catch(error => {
          console.error('[BindsetSelectorUI] Add key error:', error)
          this.showError('add_failed')
        })
    }
    this.close()
  }

  async showRemoveKeyConfirmation(bindsetName) {
    const message = i18next.t('remove_key_from_bindset_confirm', { 
      key: this.cache.selectedKey, 
      bindset: bindsetName 
    }) || `Remove key "${this.cache.selectedKey}" from bindset "${bindsetName}"?`
    
    let confirmed = false
    
    if (this.confirmDialog) {
      const title = i18next.t('confirm_remove') || 'Confirm Remove'
      confirmed = await this.confirmDialog.confirm(message, title, 'warning')
    } else {
      // Fallback to window.confirm when confirmDialog is not available
      confirmed = window.confirm(message)
    }
    
    if (confirmed) {
      this.request('bindset-selector:remove-key-from-bindset', { bindset: bindsetName })
        .then(result => {
          if (!result?.success) {
            this.showError(result?.error || 'remove_failed')
          }
        })
        .catch(error => {
          console.error('[BindsetSelectorUI] Remove key error:', error)
          this.showError('remove_failed')
        })
    }
    this.close()
  }

  showError(errorKey) {
    const message = i18next.t(`error_${errorKey}`) || `Error: ${errorKey}`
    
    // Use toast system (ComponentBase always has eventBus)
    this.emit('toast:show', {
      type: 'error',
      message: message,
      duration: 3000
    })
  }

  openBindsetManager() {
    this.emit('modal:show', { modalId: 'bindsetManagerModal' })
  }

  toggleDropdown() {
    this.isOpen ? this.close() : this.open()
  }

  open() {
    const menu = this.document?.getElementById('bindsetOptionsMenu')
    const btn = this.document?.getElementById('bindsetSelectorBtn')
    if (menu && btn) {
      // Position the dropdown relative to the button
      const rect = btn.getBoundingClientRect()
      menu.style.left = `${rect.left}px`
      menu.style.top = `${rect.bottom + 4}px`
      menu.style.display = 'block'
      this.isOpen = true
    }
  }

  close() {
    const menu = this.document?.getElementById('bindsetOptionsMenu')
    if (menu) {
      menu.style.display = 'none'
      this.isOpen = false
    }
  }

  escapeHtml(text) {
    const div = this.document?.createElement('div')
    if (div) {
      div.textContent = text
      return div.innerHTML
    }
    return String(text).replace(/[&<>"']/g, (match) => {
      const escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }
      return escapeMap[match]
    })
  }

  // Late-join state handler
  handleInitialState(sender, state) {
    if (sender === 'BindsetSelectorService' && state) {
      console.log('[BindsetSelectorUI] handleInitialState from BindsetSelectorService:', state)
      // ComponentBase automatically handles selectedKey and activeBindset
      // Only update UI-specific state
      this.keyBindsetMembership = state.keyBindsetMembership || new Map()
      this.isVisible = state.shouldDisplay || false
      this.render()
    }
  }
}