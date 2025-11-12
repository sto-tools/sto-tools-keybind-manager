import UIComponentBase from '../UIComponentBase.js'

/**
 * ConfirmDialogUI – responsible for rendering confirmation dialogs and
 * resolving with the user's choice.
 */
export default class ConfirmDialogUI extends UIComponentBase {
  constructor({ eventBus, modalManager, i18n } = {}) {
    super(eventBus)
    this.componentName = 'ConfirmDialogUI'
    this.modalManager = modalManager
    this.i18n = i18n

    // Store current modal data for regeneration
    this.currentConfirmModal = null
    this.currentInformModal = null
  }

  // Show a confirmation dialog and resolve with the user's choice.
  // Optional prefix parameter for semantic modal IDs (e.g., 'loadDefaultData', 'resetApplication')
  async confirm(message, title = 'Confirm', type = 'warning', prefix = '') {
    return new Promise((resolve) => {
      const confirmModal = this.createConfirmModal(message, title, type)
      const confirmId = prefix ? `${prefix}ConfirmModal` : 'confirmModal'
      confirmModal.id = confirmId
      document.body.appendChild(confirmModal)

      // Store modal data for regeneration
      this.currentConfirmModal = {
        message,
        title,
        type,
        resolve,
        modalElement: confirmModal,
        confirmId, // Store the modal ID for cleanup and regeneration
      }

      // Register regeneration callback for language changes
      this.modalManager?.registerRegenerateCallback(confirmId, () => {
        this.regenerateConfirmModal()
      })

      const handleConfirm = (result) => {
        // Unregister regeneration callback
        this.modalManager?.unregisterRegenerateCallback(confirmId)
        this.currentConfirmModal = null

        this.modalManager?.hide(confirmId)
        // Safe DOM removal - check if modal is still attached before removing
        if (confirmModal && confirmModal.parentNode) {
          confirmModal.parentNode.removeChild(confirmModal)
        }
        resolve(result)
      }

      // Attach listeners directly to button elements for reliable event handling
      // even when modal is removed from DOM
      const yesButton = confirmModal.querySelector('.confirm-yes')
      const noButton = confirmModal.querySelector('.confirm-no')

      // Use EventBus for automatic cleanup - attach directly to elements
      if (yesButton) {
        this.onDom(yesButton, 'click', 'confirm-dialog-yes', () => {
          handleConfirm(true)
        })
      }

      if (noButton) {
        this.onDom(noButton, 'click', 'confirm-dialog-no', () => {
          handleConfirm(false)
        })
      }

      // Delay to next frame so the modal element is in the DOM before show()
      // This is a workaround to ensure the modal element is in the DOM before show()
      requestAnimationFrame(() => {
        this.modalManager?.show(confirmId)
      })
    })
  }

  // Show an informational dialog with just an OK button
  // Optional prefix parameter for semantic modal IDs (e.g., 'syncSuccess', 'syncError')
  async inform(message, title = 'Information', type = 'info', prefix = '') {
    return new Promise((resolve) => {
      const informModal = this.createInformModal(message, title, type)
      const informId = prefix ? `${prefix}InformModal` : 'informModal'
      informModal.id = informId
      document.body.appendChild(informModal)

      // Store modal data for regeneration
      this.currentInformModal = {
        message,
        title,
        type,
        resolve,
        modalElement: informModal,
        informId, // Store the modal ID for cleanup and regeneration
      }

      // Register regeneration callback for language changes
      this.modalManager?.registerRegenerateCallback(informId, () => {
        this.regenerateInformModal()
      })

      const handleClose = () => {
        // Unregister regeneration callback
        this.modalManager?.unregisterRegenerateCallback(informId)
        this.currentInformModal = null

        this.modalManager?.hide(informId)
        // Safe DOM removal - check if modal is still attached before removing
        if (informModal && informModal.parentNode) {
          informModal.parentNode.removeChild(informModal)
        }
        resolve(true)
      }

      // Attach listener directly to button element for reliable event handling
      // even when modal is removed from DOM
      const okButton = informModal.querySelector('.inform-ok')

      // Use EventBus for automatic cleanup - attach directly to element
      if (okButton) {
        this.onDom(okButton, 'click', 'inform-dialog-ok', handleClose)
      }

      // Also allow ESC key to close
      const handleKeyDown = (event) => {
        if (event.key === 'Escape') {
          document.removeEventListener('keydown', handleKeyDown)
          handleClose()
        }
      }
      document.addEventListener('keydown', handleKeyDown)

      requestAnimationFrame(() => {
        this.modalManager?.show(informId)
      })
    })
  }

  // Internal helper – generates the DOM for the inform dialog.
  createInformModal(message, title, type) {
    const modal = document.createElement('div')
    modal.className = 'modal inform-modal'

    const iconMap = {
      warning: 'fa-exclamation-triangle',
      danger: 'fa-exclamation-circle',
      info: 'fa-info-circle',
      success: 'fa-check-circle',
    }

    modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>
                        <i class="fas ${iconMap[type] || iconMap.info}"></i>
                        ${title}
                    </h3>
                </div>
                <div class="modal-body">
                    <p>${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary inform-ok">${this.i18n ? this.i18n.t('ok') : 'OK'}</button>
                </div>
            </div>
        `

    return modal
  }

  // Internal helper – generates the DOM for the confirm dialog.
  createConfirmModal(message, title, type) {
    const modal = document.createElement('div')
    modal.className = 'modal confirm-modal'

    const iconMap = {
      warning: 'fa-exclamation-triangle',
      danger: 'fa-exclamation-circle',
      info: 'fa-info-circle',
    }

    modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>
                        <i class="fas ${iconMap[type] || iconMap.warning}"></i>
                        ${title}
                    </h3>
                </div>
                <div class="modal-body">
                    <p>${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary confirm-yes">${this.i18n ? this.i18n.t('yes') : 'Yes'}</button>
                    <button class="btn btn-secondary confirm-no">${this.i18n ? this.i18n.t('no') : 'No'}</button>
                </div>
            </div>
        `

    return modal
  }

  // Regeneration methods for language changes
  regenerateConfirmModal() {
    if (!this.currentConfirmModal) return

    const { message, title, type, modalElement, confirmId } = this.currentConfirmModal
    const newModal = this.createConfirmModal(message, title, type)
    newModal.id = confirmId

    // Replace the old modal with the new one
    modalElement.replaceWith(newModal)
    this.currentConfirmModal.modalElement = newModal

    // Re-attach event listeners directly to button elements
    const yesButton = newModal.querySelector('.confirm-yes')
    const noButton = newModal.querySelector('.confirm-no')

    if (yesButton) {
      this.onDom(yesButton, 'click', 'confirm-dialog-regen-yes', () => {
        this.handleConfirmAction(true)
      })
    }

    if (noButton) {
      this.onDom(noButton, 'click', 'confirm-dialog-regen-no', () => {
        this.handleConfirmAction(false)
      })
    }
  }

  regenerateInformModal() {
    if (!this.currentInformModal) return

    const { message, title, type, modalElement, informId } = this.currentInformModal
    const newModal = this.createInformModal(message, title, type)
    newModal.id = informId

    // Replace the old modal with the new one
    modalElement.replaceWith(newModal)
    this.currentInformModal.modalElement = newModal

    // Re-attach event listeners
    const handleClose = () => {
      const { resolve, informId } = this.currentInformModal
      this.modalManager?.unregisterRegenerateCallback(informId)
      this.currentInformModal = null
      this.modalManager?.hide(informId)
      if (newModal && newModal.parentNode) {
        newModal.parentNode.removeChild(newModal)
      }
      resolve(true)
    }

    // Attach listener directly to button element
    const okButton = newModal.querySelector('.inform-ok')
    if (okButton) {
      this.onDom(okButton, 'click', 'inform-dialog-regen-ok', handleClose)
    }

    // Re-attach ESC key listener
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        document.removeEventListener('keydown', handleKeyDown)
        handleClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
  }

  // Helper method for confirm action handling
  handleConfirmAction(result) {
    if (!this.currentConfirmModal) return

    const { resolve, modalElement, confirmId } = this.currentConfirmModal

    // Unregister regeneration callback
    this.modalManager?.unregisterRegenerateCallback(confirmId)
    this.currentConfirmModal = null

    this.modalManager?.hide(confirmId)
    if (modalElement && modalElement.parentNode) {
      modalElement.parentNode.removeChild(modalElement)
    }

    resolve(result)
  }
}
