import ComponentBase from '../ComponentBase.js'

/**
 * ModalManagerService – centralised modal show/hide logic with i18n
 * regeneration support. Migrated from legacy ui/modalManager.js so that it
 * can be injected where needed while still exposing a global fallback
 * (`window.modalManager`) for backwards-compatibility.
 */
export default class ModalManagerService extends ComponentBase {
  constructor (eventBus) {
    super(eventBus)
    this.componentName = 'ModalManagerService'

    this.overlayId = 'modalOverlay'
    this.regenerateCallbacks = {} // modalId -> callback
    this.isInitialized = false
    
    this.registerAllModalCallbacks()
    this.setupEventListeners()

    // Register global instance for legacy code paths
    if (typeof window !== 'undefined') {
      window.modalManager = this
    }

    // Re-translate currently open modal whenever language changes
    if (typeof window !== 'undefined' && window.i18next) {
      window.i18next.on('languageChanged', () => {
        const open = document.querySelector('.modal.active')
        if (!open) return
        const modalId = open.id
        if (this.regenerateCallbacks[modalId]) {
          this.regenerateCallbacks[modalId]()
          // Emit event for components that want to handle their own regeneration
          this.emit('modal:regenerated', { modalId })
        } else if (typeof window.applyTranslations === 'function') {
          window.applyTranslations(open)
        }
      })
    }
  }

  async init() {
    if (this.isInitialized) {
      console.log(`[${this.componentName}] Already initialized`)
      return
    }

    this.isInitialized = true
    console.log(`[${this.componentName}] Initialized`)
  }

  setupEventListeners() {
    // Modal control events
    this.eventBus.on('modal:show', this.handleShowModal.bind(this))
    this.eventBus.on('modal:hide', this.handleHideModal.bind(this))
    this.eventBus.on('modal:toggle', this.handleToggleModal.bind(this))
    this.eventBus.on('modal:register-callback', this.handleRegisterCallback.bind(this))
    this.eventBus.on('modal:unregister-callback', this.handleUnregisterCallback.bind(this))
    
    // Setup global DOM event listeners for modal close buttons
    this.setupGlobalModalEventListeners()
  }

  setupGlobalModalEventListeners() {
    // Global event delegation for modal close buttons
    document.addEventListener('click', (e) => {
      // Handle data-modal attribute clicks (close buttons)
      const modalTarget = e.target.closest('[data-modal]')
      if (modalTarget) {
        const modalId = modalTarget.getAttribute('data-modal')
        if (modalId) {
          this.hide(modalId)
          e.preventDefault()
          e.stopPropagation()
        }
      }
    })

    // Escape key to close modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const activeModal = document.querySelector('.modal.active')
        if (activeModal) {
          this.hide(activeModal.id)
        }
      }
    })

    // Click outside modal to close (modal overlay)
    document.addEventListener('click', (e) => {
      if (e.target.id === this.overlayId || e.target.classList.contains('modal-overlay')) {
        const activeModal = document.querySelector('.modal.active')
        if (activeModal) {
          this.hide(activeModal.id)
        }
      }
    })
  }

  async handleShowModal({ modalId }) {
    const result = this.show(modalId)
    this.emit('modal:shown', { modalId, success: result })
    return result
  }

  async handleHideModal({ modalId }) {
    const result = this.hide(modalId)
    this.emit('modal:hidden', { modalId, success: result })
    return result
  }

  async handleToggleModal({ modalId }) {
    const modal = (typeof modalId === 'string') ? document.getElementById(modalId) : modalId
    if (!modal) return false

    const isActive = modal.classList.contains('active')
    const result = isActive ? this.hide(modalId) : this.show(modalId)
    this.emit('modal:toggled', { modalId, isActive: !isActive, success: result })
    return result
  }

  async handleRegisterCallback({ modalId, callback }) {
    this.registerRegenerateCallback(modalId, callback)
    console.log(`[${this.componentName}] Registered callback for modal: ${modalId}`)
  }

  async handleUnregisterCallback({ modalId }) {
    this.unregisterRegenerateCallback(modalId)
    console.log(`[${this.componentName}] Unregistered callback for modal: ${modalId}`)
  }

  /* ----------------------------------------------------------- utilities */
  getOverlay () {
    return document.getElementById(this.overlayId)
  }

  show (id) {
    const modal   = (typeof id === 'string') ? document.getElementById(id) : id
    const overlay = this.getOverlay()
    if (!overlay || !modal) return false

    overlay.classList.add('active')
    modal.classList.add('active')
    document.body.classList.add('modal-open')

    if (typeof window.applyTranslations === 'function') {
      window.applyTranslations(modal)
    }

    const firstInput = modal.querySelector('input, textarea, select')
    if (firstInput) setTimeout(() => firstInput.focus(), 100)
    
    // Emit modal:shown event for components that need to respond to modal opening
    const modalId = typeof id === 'string' ? id : modal.id
    this.emit('modal:shown', { modalId, success: true })
    
    return true
  }

  hide (id) {
    const modal   = (typeof id === 'string') ? document.getElementById(id) : id
    const overlay = this.getOverlay()
    if (!overlay || !modal) return false

    modal.classList.remove('active')

    // If no other modals active, hide overlay
    if (!document.querySelector('.modal.active')) {
      overlay.classList.remove('active')
      document.body.classList.remove('modal-open')
    }
    return true
  }

  /* -------------------------- regeneration callbacks ------------------- */
  registerRegenerateCallback (modalId, cb) {
    this.regenerateCallbacks[modalId] = cb
  }
  unregisterRegenerateCallback (modalId) {
    delete this.regenerateCallbacks[modalId]
  }

  registerAllModalCallbacks () {
    // (Full callback list ported as-is from legacy implementation)

    /* Command modal – regenerate command builder content */
    this.registerRegenerateCallback('addCommandModal', () => {
      if (window.stoCommands?.regenerateModalContent) {
        window.stoCommands.regenerateModalContent()
      }
    })

    /* Parameter modal */
    this.registerRegenerateCallback('parameterModal', () => {
      if (window.app?.populateParameterModal) {
        const modal = document.getElementById('parameterModal')
        const def   = modal?.getAttribute('data-command-def')
        if (def) {
          try {
            window.app.populateParameterModal(JSON.parse(def))
          } catch (_) {}
        }
      }
    })

    /* Key selection modal */
    this.registerRegenerateCallback('keySelectionModal', () => {
      const modal = document.getElementById('keySelectionModal')
      const active = modal?.querySelector('.tab-content .tab-pane.active')
      if (active) {
        const tab = active.id.replace('Tab', '')
        window.app?.populateKeyTab?.(tab)
      }
    })

    /* VFX/Vertigo modal - updated to use new VFX system */
    this.registerRegenerateCallback('vertigoModal', () => {
      // Emit event for VFX UI to handle regeneration
      if (this.eventBus) {
        this.emit('vfx:modal-regenerate-requested')
      } else {
        // Fallback to legacy method
        window.app?.populateVertigoModal?.()
      }
    })

    /* Profile modal */
    this.registerRegenerateCallback('profileModal', () => {
      const modal = document.getElementById('profileModal')
      window.applyTranslations?.(modal)
    })

    /* Preferences modal */
    this.registerRegenerateCallback('preferencesModal', () => {
      window.app?.preferencesManager?.populatePreferencesModal?.()
    })

    /* File explorer modal */
    this.registerRegenerateCallback('fileExplorerModal', () => {
      window.stoFileExplorer?.refreshFileList?.()
    })

    /* Export modal */
    this.registerRegenerateCallback('exportModal', () => {
      window.stoExport?.populateExportModal?.()
    })

    /* About modal */
    this.registerRegenerateCallback('aboutModal', () => {
      const modal = document.getElementById('aboutModal')
      window.applyTranslations?.(modal)
    })

    /* Add key modal */
    this.registerRegenerateCallback('addKeyModal', () => {
      window.app?.setupKeyCaptureModal?.()
    })
  }
} 