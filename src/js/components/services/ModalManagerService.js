import ComponentBase from '../ComponentBase.js'

/**
 * ModalManagerService – centralised modal show/hide logic with i18n
 * regeneration support. Migrated from legacy ui/modalManager.js so that it
 * can be injected where needed while still exposing a global fallback
 * (`window.modalManager`) for backwards-compatibility.
 */
export default class ModalManagerService extends ComponentBase {
  constructor () {
    super()
    this.componentName = 'ModalManagerService'

    this.overlayId = 'modalOverlay'
    this.regenerateCallbacks = {} // modalId -> callback
    this.registerAllModalCallbacks()

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
        } else if (typeof window.applyTranslations === 'function') {
          window.applyTranslations(open)
        }
      })
    }
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

    /* Alias creation modal */
    this.registerRegenerateCallback('aliasCreationModal', () => {
      if (window.app?.createAliasCreationModal) {
        const modal    = document.getElementById('aliasCreationModal')
        if (modal) {
          const fresh  = window.app.createAliasCreationModal()
          modal.innerHTML = fresh.innerHTML
          window.applyTranslations?.(modal)
        }
      }
    })

    /* Alias manager modal */
    this.registerRegenerateCallback('aliasManagerModal', () => {
      window.stoAliases?.renderAliasList?.()
    })

    /* Edit alias modal */
    this.registerRegenerateCallback('editAliasModal', () => {
      const modal = document.getElementById('editAliasModal')
      const alias = modal?.getAttribute('data-alias-name')
      if (alias) window.stoAliases?.populateEditForm?.(alias)
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

    /* Vertigo modal */
    this.registerRegenerateCallback('vertigoModal', () => {
      window.app?.populateVertigoModal?.()
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