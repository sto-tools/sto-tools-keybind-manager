export default class STOModalManager {
  constructor() {
    this.overlayId = 'modalOverlay'
    this.regenerateCallbacks = {} // modalId -> callback
    this.registerAllModalCallbacks()
    // Register global instance
    window.modalManager = this
    // Register languageChanged event handler
    if (window.i18next) {
      window.i18next.on('languageChanged', () => {
        // Find the currently open modal
        const openModal = document.querySelector('.modal.active')
        if (openModal) {
          const modalId = openModal.id
          // If a regenerate callback is registered, call it
          if (this.regenerateCallbacks && this.regenerateCallbacks[modalId]) {
            this.regenerateCallbacks[modalId]()
          } else {
            // Fallback: just re-apply translations if modalManager is not available
            if (typeof window.applyTranslations === 'function') {
              window.applyTranslations(openModal)
            }
          }
        }
      })
    }
  }

  getOverlay() {
    return document.getElementById(this.overlayId)
  }

  show(id) {
    const modal = typeof id === 'string' ? document.getElementById(id) : id
    const overlay = this.getOverlay()
    if (overlay && modal) {
      overlay.classList.add('active')
      modal.classList.add('active')
      document.body.classList.add('modal-open')

      // Apply translations to the modal content
      if (typeof window.applyTranslations === 'function') {
        window.applyTranslations(modal)
      }

      const firstInput = modal.querySelector('input, textarea, select')
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 100)
      }
      return true
    }
    return false
  }

  hide(id) {
    const modal = typeof id === 'string' ? document.getElementById(id) : id
    const overlay = this.getOverlay()
    if (overlay && modal) {
      modal.classList.remove('active')

      // Hide overlay if no other modals are active
      if (!document.querySelector('.modal.active')) {
        overlay.classList.remove('active')
        document.body.classList.remove('modal-open')
      }
      return true
    }
    return false
  }

  // Register a callback to regenerate modal content for a given modalId
  registerRegenerateCallback(modalId, callback) {
    this.regenerateCallbacks[modalId] = callback
  }

  // Unregister a callback
  unregisterRegenerateCallback(modalId) {
    delete this.regenerateCallbacks[modalId]
  }

  // Register all modal callbacks
  registerAllModalCallbacks() {
    // Command modal - regenerate command builder content
    this.registerRegenerateCallback('addCommandModal', () => {
      if (window.stoCommands && typeof window.stoCommands.regenerateModalContent === 'function') {
        window.stoCommands.regenerateModalContent()
      }
    })

    // Parameter modal - regenerate parameter form
    this.registerRegenerateCallback('parameterModal', () => {
      if (window.app && typeof window.app.populateParameterModal === 'function') {
        // Get the current command definition from the modal
        const modal = document.getElementById('parameterModal')
        if (modal) {
          const commandDef = modal.getAttribute('data-command-def')
          if (commandDef) {
            try {
              const parsedDef = JSON.parse(commandDef)
              window.app.populateParameterModal(parsedDef)
            } catch (e) {
              console.warn('Could not parse command definition for parameter modal regeneration')
            }
          }
        }
      }
    })

    // Alias creation modal - regenerate alias creation form
    this.registerRegenerateCallback('aliasCreationModal', () => {
      if (window.app && typeof window.app.createAliasCreationModal === 'function') {
        const modal = document.getElementById('aliasCreationModal')
        if (modal) {
          const newModal = window.app.createAliasCreationModal()
          modal.innerHTML = newModal.innerHTML
          // Re-apply translations
          if (typeof window.applyTranslations === 'function') {
            window.applyTranslations(modal)
          }
        }
      }
    })

    // Alias manager modal - regenerate alias list
    this.registerRegenerateCallback('aliasManagerModal', () => {
      if (window.stoAliases && typeof window.stoAliases.renderAliasList === 'function') {
        window.stoAliases.renderAliasList()
      }
    })

    // Edit alias modal - regenerate edit form
    this.registerRegenerateCallback('editAliasModal', () => {
      if (window.stoAliases && typeof window.stoAliases.populateEditForm === 'function') {
        const modal = document.getElementById('editAliasModal')
        if (modal) {
          const aliasName = modal.getAttribute('data-alias-name')
          if (aliasName) {
            window.stoAliases.populateEditForm(aliasName)
          }
        }
      }
    })

    // Key selection modal - regenerate key tabs
    this.registerRegenerateCallback('keySelectionModal', () => {
      if (window.app && typeof window.app.populateKeyTab === 'function') {
        // Re-populate the current tab
        const modal = document.getElementById('keySelectionModal')
        if (modal) {
          const activeTab = modal.querySelector('.tab-content .tab-pane.active')
          if (activeTab) {
            const tabName = activeTab.id.replace('Tab', '')
            window.app.populateKeyTab(tabName)
          }
        }
      }
    })

    // Vertigo modal - regenerate effect lists
    this.registerRegenerateCallback('vertigoModal', () => {
      if (window.app && typeof window.app.populateVertigoModal === 'function') {
        window.app.populateVertigoModal()
      }
    })

    // Profile modal - regenerate profile form
    this.registerRegenerateCallback('profileModal', () => {
      if (window.stoProfiles && typeof window.stoProfiles.populateProfileForm === 'function') {
        const modal = document.getElementById('profileModal')
        if (modal) {
          const mode = modal.getAttribute('data-mode') // 'new', 'clone', 'rename'
          window.stoProfiles.populateProfileForm(mode)
        }
      }
    })

    // Preferences modal - regenerate preferences form
    this.registerRegenerateCallback('preferencesModal', () => {
      if (window.app && window.app.preferencesManager && typeof window.app.preferencesManager.populatePreferencesModal === 'function') {
        window.app.preferencesManager.populatePreferencesModal()
      }
    })

    // File explorer modal - regenerate file list
    this.registerRegenerateCallback('fileExplorerModal', () => {
      if (window.stoFileExplorer && typeof window.stoFileExplorer.refreshFileList === 'function') {
        window.stoFileExplorer.refreshFileList()
      }
    })

    // Export modal - regenerate export options
    this.registerRegenerateCallback('exportModal', () => {
      if (window.stoExport && typeof window.stoExport.populateExportModal === 'function') {
        window.stoExport.populateExportModal()
      }
    })

    // About modal - just re-apply translations (static content)
    this.registerRegenerateCallback('aboutModal', () => {
      const modal = document.getElementById('aboutModal')
      if (modal && typeof window.applyTranslations === 'function') {
        window.applyTranslations(modal)
      }
    })

    // Add key modal - regenerate key capture UI
    this.registerRegenerateCallback('addKeyModal', () => {
      if (window.app && typeof window.app.setupKeyCaptureModal === 'function') {
        window.app.setupKeyCaptureModal()
      }
    })
  }
}
