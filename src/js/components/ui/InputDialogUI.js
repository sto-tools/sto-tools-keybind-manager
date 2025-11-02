import UIComponentBase from '../UIComponentBase.js'

/**
 * InputDialogUI – responsible for rendering input dialogs and
 * resolving with the user's input or null if cancelled.
 */
export default class InputDialogUI extends UIComponentBase {

  constructor({ modalManager = null, i18n = null } = {}) {
    super()
    this.componentName = 'InputDialogUI'
    this.modalManager = modalManager
    this.i18n = i18n || (typeof i18next !== 'undefined' ? i18next : null)
  }

  /**
   * Show an input dialog and resolve with the user's input or null if cancelled.
   * @param {string} message - The message to display
   * @param {Object} options - Configuration options
   * @param {string} options.title - Dialog title (default: 'Input')
   * @param {string} options.defaultValue - Default input value (default: '')
   * @param {string} options.placeholder - Input placeholder text (default: '')
   * @param {string} options.type - Input type: 'text', 'password', 'email', etc. (default: 'text')
   * @param {Function} options.validate - Validation function that returns true if valid or error message string
   * @param {number} options.maxLength - Maximum input length (default: 255)
   * @returns {Promise<string|null>} User input or null if cancelled
   */
  async prompt(message, options = {}) {
    const {
      title = 'Input',
      defaultValue = '',
      placeholder = '',
      type = 'text',
      validate = null,
      maxLength = 255
    } = options

    return new Promise((resolve) => {
      const inputModal = this.createInputModal(message, title, defaultValue, placeholder, type, validate, maxLength)
      const inputId = 'inputModal'
      inputModal.id = inputId
      document.body.appendChild(inputModal)

      const inputElement = inputModal.querySelector('.input-field')
      const submitBtn = inputModal.querySelector('.input-submit')
      const cancelBtn = inputModal.querySelector('.input-cancel')
      const errorDiv = inputModal.querySelector('.input-error')

      let isValid = true

      const handleSubmit = () => {
        const value = inputElement.value
        
        // Run validation if provided
        if (validate && typeof validate === 'function') {
          const validationResult = validate(value)
          if (validationResult !== true) {
            // Validation failed - show error
            errorDiv.textContent = typeof validationResult === 'string' ? validationResult : 'Invalid input'
            errorDiv.style.display = 'block'
            inputElement.focus()
            isValid = false
            return
          }
        }

        // Valid input - close modal and resolve
        this.closeModal(inputModal, inputId)
        resolve(value)
      }

      const handleCancel = () => {
        this.closeModal(inputModal, inputId)
        resolve(null)
      }

      // Input validation handler
      const inputHandler = () => {
        errorDiv.style.display = 'none'
        isValid = true

        // Enable/disable submit button based on content
        const hasContent = inputElement.value.trim().length > 0
        submitBtn.disabled = !hasContent
      }

      // Keyboard handler
      const keyHandler = (e) => {
        if (e.key === 'Enter' && !submitBtn.disabled) {
          e.preventDefault()
          handleSubmit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          handleCancel()
        }
      }

      // Use EventBus for automatic cleanup
      this.onDom(submitBtn, 'click', 'input-dialog-submit', handleSubmit)
      this.onDom(cancelBtn, 'click', 'input-dialog-cancel', handleCancel)
      this.onDom(inputElement, 'input', 'input-dialog-input', inputHandler)
      this.onDom(inputElement, 'keydown', 'input-dialog-keydown', keyHandler)

      // Initial button state
      const hasInitialContent = defaultValue.trim().length > 0
      submitBtn.disabled = !hasInitialContent

      // Show modal and focus input
      requestAnimationFrame(() => {
        this.modalManager?.show(inputId)
        inputElement.focus()
        inputElement.select() // Select default text for easy replacement
      })
    })
  }

  /**
   * Close the modal and clean up
   * @private
   */
  closeModal(modalElement, modalId) {
    this.modalManager?.hide(modalId)
    if (modalElement && modalElement.parentNode) {
      modalElement.parentNode.removeChild(modalElement)
    }
  }

  /**
   * Internal helper – generates the DOM for the input dialog.
   * @private
   */
  createInputModal(message, title, defaultValue, placeholder, type, validate, maxLength) {
    const modal = document.createElement('div')
    modal.className = 'modal input-modal'

    const submitText = this.i18n ? this.i18n.t('ok') || 'OK' : 'OK'
    const cancelText = this.i18n ? this.i18n.t('cancel') || 'Cancel' : 'Cancel'

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>
            <i class="fas fa-edit"></i>
            ${title}
          </h3>
        </div>
        <div class="modal-body">
          <p>${message}</p>
          <div class="input-group">
            <input 
              type="${type}" 
              class="input-field" 
              value="${defaultValue}" 
              placeholder="${placeholder}"
              maxlength="${maxLength}"
              autocomplete="off"
            />
            <div class="input-error" style="display: none; color: #dc3545; font-size: 0.875em; margin-top: 0.25rem;"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary input-submit">${submitText}</button>
          <button class="btn btn-secondary input-cancel">${cancelText}</button>
        </div>
      </div>
    `

    return modal
  }

  }