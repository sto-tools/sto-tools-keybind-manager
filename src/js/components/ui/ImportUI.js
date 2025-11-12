import UIComponentBase from '../UIComponentBase.js'

/**
 * ImportUI – Presents file-open dialogs for the "Import Keybinds / Import Aliases"
 * menu actions and delegates the actual import work to ImportService.
 */
export default class ImportUI extends UIComponentBase {
  constructor({
    eventBus,
    document = typeof window !== 'undefined' ? window.document : undefined,
    i18n,
    modalManager = null,
  } = {}) {
    super(eventBus)
    this.componentName = 'ImportUI'
    this.document = document
    this.i18n = i18n
    this.modalManager = modalManager

    // Store current modal data for regeneration
    this.currentImportModal = null
  }

  onInit() {
    // Listen for menu events dispatched by HeaderMenuUI
    this.addEventListener('keybinds:import', () =>
      this.openFileDialog('keybinds')
    )
    this.addEventListener('aliases:import', () =>
      this.openFileDialog('aliases')
    )
  }

  // Opens a hidden file input, waits for selection and forwards content to ImportService.
  async openFileDialog(type) {
    const input = this.document.createElement('input')
    input.type = 'file'
    input.accept = '.txt'
    input.style.display = 'none'

    // Append to body to ensure click works in all browsers
    this.document.body.appendChild(input)

    input.addEventListener('change', async (e) => {
      if (!e.target.files || e.target.files.length === 0) return
      const file = e.target.files[0]
      const reader = new FileReader()
      reader.onload = async (evt) => {
        try {
          const content = evt.target.result
          const state = await this.request('data:get-current-state')
          const profileId = state.currentProfile
          let result
          if (type === 'keybinds') {
            // Ask user which environment to import into
            const env = await this.promptEnvironment(
              state.currentEnvironment || 'space'
            )
            if (!env) return // user cancelled

            result = await this.request('import:keybind-file', {
              content,
              profileId,
              environment: env,
            })
          } else {
            result = await this.request('import:alias-file', {
              content,
              profileId,
            })
          }

          // Show appropriate toast based on result
          if (result?.success) {
            const message = this.i18n.t(result?.message, {
              count: result.imported?.keys || result.imported?.aliases || 0,
            })
            this.showToast(message, 'success')
          } else {
            const message = this.i18n.t(result?.error, result?.params)
            this.showToast(message, 'error')
          }
        } catch (error) {
          console.error(`[ImportUI] Failed to import file:`, error)
        }
        // Clean up
        this.document.body.removeChild(input)
      }
      reader.readAsText(file)
    })

    // Trigger dialog
    input.click()
  }

  // Show a simple modal asking user whether the import is for Space or Ground.
  // Returns chosen environment string or null if cancelled.
  promptEnvironment(defaultEnv = 'space') {
    return new Promise((resolve) => {
      const modal = this.createImportModal(defaultEnv)
      const modalId = 'importModal'
      modal.id = modalId
      this.document.body.appendChild(modal)

      // Store modal data for regeneration
      this.currentImportModal = { defaultEnv, resolve, modalElement: modal }

      // Register regeneration callback for language changes
      this.modalManager?.registerRegenerateCallback(modalId, () => {
        this.regenerateImportModal()
      })

      const handleChoice = (choice) => {
        // Unregister regeneration callback
        this.modalManager?.unregisterRegenerateCallback(modalId)
        this.currentImportModal = null

        this.modalManager?.hide(modalId)
        if (modal && modal.parentNode) {
          modal.parentNode.removeChild(modal)
        }
        resolve(choice)
      }

      // Use EventBus for automatic cleanup
      this.onDom('.import-space', 'click', 'import-dialog-space', () =>
        handleChoice('space')
      )
      this.onDom('.import-ground', 'click', 'import-dialog-ground', () =>
        handleChoice('ground')
      )
      this.onDom('.import-cancel', 'click', 'import-dialog-cancel', () =>
        handleChoice(null)
      )

      // Show modal
      requestAnimationFrame(() => {
        this.modalManager?.show(modalId)
      })
    })
  }

  // Create a standard modal for environment selection
  createImportModal(defaultEnv) {
    const modal = this.document.createElement('div')
    modal.className = 'modal import-modal'

    const title = this.i18n.t('import_environment')
    const message = this.i18n.t('import_environment_question')
    const spaceText = this.i18n.t('space')
    const groundText = this.i18n.t('ground')
    const cancelText = this.i18n.t('cancel')

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>
            <i class="fas fa-file-import"></i>
            ${title}
          </h3>
        </div>
        <div class="modal-body">
          <p>${message}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary import-space ${defaultEnv === 'space' ? 'btn-primary' : 'btn-secondary'}">${spaceText}</button>
          <button class="btn btn-primary import-ground ${defaultEnv === 'ground' ? 'btn-primary' : 'btn-secondary'}">${groundText}</button>
          <button class="btn btn-secondary import-cancel">${cancelText}</button>
        </div>
      </div>
    `

    return modal
  }

  // Regeneration method for language changes
  regenerateImportModal() {
    if (!this.currentImportModal) return

    const { defaultEnv, modalElement } = this.currentImportModal

    const newModal = this.createImportModal(defaultEnv)
    newModal.id = 'importModal'

    // Replace the old modal with the new one
    modalElement.replaceWith(newModal)
    this.currentImportModal.modalElement = newModal

    // Re-attach event listeners
    const handleChoice = (choice) => {
      const { resolve } = this.currentImportModal
      this.modalManager?.unregisterRegenerateCallback('importModal')
      this.currentImportModal = null
      this.modalManager?.hide('importModal')
      if (newModal && newModal.parentNode) {
        newModal.parentNode.removeChild(newModal)
      }
      resolve(choice)
    }

    // Use EventBus for automatic cleanup
    this.onDom('.import-space', 'click', 'import-dialog-regen-space', () =>
      handleChoice('space')
    )
    this.onDom('.import-ground', 'click', 'import-dialog-regen-ground', () =>
      handleChoice('ground')
    )
    this.onDom('.import-cancel', 'click', 'import-dialog-regen-cancel', () =>
      handleChoice(null)
    )
  }
}
