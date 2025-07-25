import ComponentBase from '../ComponentBase.js'

/**
 * ConfirmDialogUI – responsible for rendering confirmation dialogs and
 * resolving with the user's choice.
 */
export default class ConfirmDialogUI extends ComponentBase {

  constructor({ modalManager = null, i18n = null } = {}) {
    super()
    this.componentName = 'ConfirmDialogUI'
    this.modalManager = modalManager || (typeof window !== 'undefined' ? window.modalManager : null)
    this.i18n = i18n || (typeof i18next !== 'undefined' ? i18next : null)
  }

  // Show a confirmation dialog and resolve with the user's choice.
  async confirm(message, title = 'Confirm', type = 'warning') {
    return new Promise((resolve) => {
      const confirmModal = this.createConfirmModal(message, title, type)
      const confirmId = 'confirmModal'
      confirmModal.id = confirmId
      document.body.appendChild(confirmModal)

      const handleConfirm = (result) => {
        this.modalManager?.hide(confirmId)
        document.body.removeChild(confirmModal)
        resolve(result)
      }

      confirmModal.querySelector('.confirm-yes').addEventListener('click', () => {
        handleConfirm(true)
      })

      confirmModal.querySelector('.confirm-no').addEventListener('click', () => {
        handleConfirm(false)
      })

      // Delay to next frame so the modal element is in the DOM before show()
      // This is a workaround to ensure the modal element is in the DOM before show()
      requestAnimationFrame(() => {
        this.modalManager?.show(confirmId)
      })
    })
  }

  // Show an informational dialog with just an OK button
  async inform(message, title = 'Information', type = 'info') {
    return new Promise((resolve) => {
      const informModal = this.createInformModal(message, title, type)
      const informId = 'informModal'
      informModal.id = informId
      document.body.appendChild(informModal)

      const handleClose = () => {
        this.modalManager?.hide(informId)
        document.body.removeChild(informModal)
        resolve(true)
      }

      informModal.querySelector('.inform-ok').addEventListener('click', handleClose)

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
      success: 'fa-check-circle'
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
} 