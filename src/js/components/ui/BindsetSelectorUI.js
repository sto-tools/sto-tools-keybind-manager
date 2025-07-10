import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'
import i18next from 'i18next'

export default class BindsetSelectorUI extends ComponentBase {
  constructor({ eventBus: bus = eventBus, document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(bus)
    this.componentName = 'BindsetSelectorUI'
    this.document = document
    
    this.containerId = 'bindsetSelectorContainer'
    this.isOpen = false
    this.service = null
    
    // Internal state
    this.selectedKey = null
    this.activeBindset = 'Primary Bindset'
    this.bindsetNames = ['Primary Bindset']
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
    this.addEventListener('bindset-selector:active-changed', ({ bindset }) => {
      this.activeBindset = bindset
      this.render()
    })

    this.addEventListener('bindset-selector:membership-updated', ({ key, membership }) => {
      this.selectedKey = key
      this.keyBindsetMembership = membership
      this.render()
    })

    this.addEventListener('bindset-selector:visibility-changed', ({ visible }) => {
      this.isVisible = visible
      this.render()
    })

    this.addEventListener('bindsets:changed', ({ names }) => {
      console.log('[BindsetSelectorUI] bindsets:changed received:', names)
      this.bindsetNames = names || ['Primary Bindset']
      this.render()
    })

    // Listen for key selection changes
    this.addEventListener('key:selected', ({ key }) => {
      console.log('[BindsetSelectorUI] key:selected received:', key)
      this.selectedKey = key
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
  }

  render() {
    const container = this.document?.getElementById(this.containerId)
    if (!container) {
      console.log('[BindsetSelectorUI] Container not found:', this.containerId)
      return
    }

    console.log('[BindsetSelectorUI] render() called - isVisible:', this.isVisible, 'bindsetNames:', this.bindsetNames)

    if (!this.isVisible) {
      container.style.display = 'none'
      return
    }

    container.style.display = 'block'
    container.innerHTML = this.generateDropdownHTML()
    
    // Create dropdown menu as child of body to avoid overflow issues
    this.createDropdownMenu()
    this.setupDOMEventListeners()
  }

  generateDropdownHTML() {
    const activeBindset = this.activeBindset
    
    // Only return the button HTML - dropdown will be created separately
    let html = `
      <button class="toolbar-btn" id="bindsetSelectorBtn" title="${i18next.t('select_bindset') || 'Select Bindset'}">
        <i class="fas fa-tags"></i>
      </button>
    `
    
    return html
  }

  generateDropdownMenuHTML() {
    const activeBindset = this.activeBindset
    
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
    this.bindsetNames.forEach(bindset => {
      if (bindset === 'Primary Bindset') return
      
      const isActive = activeBindset === bindset
      const hasKey = this.keyBindsetMembership.get(bindset) || false
      const greyedOut = !hasKey ? 'greyed-out' : ''
      
      console.log(`[BindsetSelectorUI] Bindset: ${bindset}, hasKey: ${hasKey}, selectedKey: ${this.selectedKey}`)
      
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

  setupDOMEventListeners() {
    const btn = this.document?.getElementById('bindsetSelectorBtn')
    const menu = this.document?.getElementById('bindsetOptionsMenu')
    const manageLink = this.document?.getElementById('manageBindsetsLink')
    
    if (!btn || !menu) return

    // Toggle dropdown
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.toggleDropdown()
    })
    
    // Bindset selection
    menu.addEventListener('click', (e) => {
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

    // Add key buttons
    menu.addEventListener('click', (e) => {
      const addBtn = e.target.closest('.add-key-btn')
      if (addBtn && !addBtn.disabled) {
        e.preventDefault()
        e.stopPropagation()
        const bindset = addBtn.dataset.bindset
        this.showAddKeyConfirmation(bindset)
      }
    })

    // Remove key buttons
    menu.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.remove-key-btn')
      if (removeBtn && !removeBtn.disabled) {
        e.preventDefault()
        e.stopPropagation()
        const bindset = removeBtn.dataset.bindset
        this.showRemoveKeyConfirmation(bindset)
      }
    })

    // Manage bindsets link
    if (manageLink) {
      manageLink.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.openBindsetManager()
        this.close()
      })
    }

    // Close on outside click
    this.document.addEventListener('click', (e) => {
      if (!e.target.closest(`#${this.containerId}`)) {
        this.close()
      }
    })

    // Close on escape key
    this.document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close()
      }
    })
  }

  showAddKeyConfirmation(bindsetName) {
    const message = i18next.t('add_key_to_bindset_confirm', { 
      key: this.selectedKey, 
      bindset: bindsetName 
    }) || `Add key "${this.selectedKey}" to bindset "${bindsetName}"?`
    
    if (confirm(message)) {
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

  showRemoveKeyConfirmation(bindsetName) {
    const message = i18next.t('remove_key_from_bindset_confirm', { 
      key: this.selectedKey, 
      bindset: bindsetName 
    }) || `Remove key "${this.selectedKey}" from bindset "${bindsetName}"?`
    
    if (confirm(message)) {
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
    
    // Try to use existing toast system if available
    if (this.eventBus) {
      this.emit('toast:show', {
        type: 'error',
        message: message,
        duration: 3000
      })
    } else {
      // Fallback to alert
      alert(message)
    }
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

  /* ------------------------------------------------------------ */
  /* Late-join state handler                                    */
  /* ------------------------------------------------------------ */

  handleInitialState(sender, state) {
    if (sender === 'BindsetSelectorService' && state) {
      console.log('[BindsetSelectorUI] handleInitialState from BindsetSelectorService:', state)
      this.selectedKey = state.selectedKey
      this.activeBindset = state.activeBindset
      this.bindsetNames = state.bindsetNames || ['Primary Bindset']
      this.keyBindsetMembership = state.keyBindsetMembership || new Map()
      this.isVisible = state.shouldDisplay || false
      this.render()
    }
  }
}