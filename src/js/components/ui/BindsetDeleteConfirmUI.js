import UIComponentBase from '../UIComponentBase.js'

/**
 * BindsetDeleteConfirmUI – Multi-step confirmation modal for deleting bindsets containing keys.
 * Provides checkbox acknowledgment and text input validation for dangerous operations.
 */
export default class BindsetDeleteConfirmUI extends UIComponentBase {
  constructor({ eventBus, modalManager, i18n } = {}) {
    super(eventBus)
    this.componentName = 'BindsetDeleteConfirmUI'
    this.modalManager = modalManager
    this.i18n = i18n

    // Store current modal data for regeneration
    this.currentModal = null
  }

  /**
   * Show a multi-step confirmation dialog for bindset deletion.
   * @param {string} bindsetName - Name of the bindset to delete
   * @param {number} keyCount - Number of keys in the bindset
   * @param {string} prefix - Optional prefix for modal ID
   * @returns {Promise<boolean>} - Resolves to true if confirmed, false otherwise
   */
  async confirm(bindsetName, keyCount, prefix = '') {
    return new Promise((resolve) => {
      const modal = this.createModal(bindsetName, keyCount)
      const modalId = prefix ? `${prefix}BindsetDeleteConfirmModal` : 'bindsetDeleteConfirmModal'
      modal.id = modalId
      document.body.appendChild(modal)

      // Get form elements
      const checkbox = modal.querySelector('#bindset-delete-confirm-checkbox')
      const textInput = modal.querySelector('#bindset-delete-confirm-input')
      const deleteBtn = modal.querySelector('.bindset-delete-confirm-btn')
      const cancelBtn = modal.querySelector('.bindset-delete-cancel-btn')

      // Store modal data for regeneration
      this.currentModal = {
        bindsetName,
        keyCount,
        resolve,
        modalElement: modal,
        modalId,
      }

      // Register regeneration callback for language changes
      this.modalManager?.registerRegenerateCallback(modalId, () => {
        this.regenerateModal()
      })

      // Form validation logic
      const validateForm = () => {
        const checkboxChecked = checkbox.checked
        const textValue = textInput.value.trim().toUpperCase()
        const deleteConfirmed = checkboxChecked && textValue === 'DELETE'

        deleteBtn.disabled = !deleteConfirmed

        // Enable/disable text input based on checkbox
        textInput.disabled = !checkboxChecked

        return deleteConfirmed
      }

      // Event listeners
      checkbox.addEventListener('change', validateForm)
      textInput.addEventListener('input', validateForm)

      const handleConfirm = () => {
        // Unregister regeneration callback
        this.modalManager?.unregisterRegenerateCallback(modalId)
        this.currentModal = null

        this.modalManager?.hide(modalId)
        // Safe DOM removal - check if modal is still attached before removing
        if (modal && modal.parentNode) {
          modal.parentNode.removeChild(modal)
        }

        resolve(true)
      }

      const handleCancel = () => {
        // Unregister regeneration callback
        this.modalManager?.unregisterRegenerateCallback(modalId)
        this.currentModal = null

        this.modalManager?.hide(modalId)
        // Safe DOM removal - check if modal is still attached before removing
        if (modal && modal.parentNode) {
          modal.parentNode.removeChild(modal)
        }

        resolve(false)
      }

      deleteBtn.addEventListener('click', handleConfirm)
      cancelBtn.addEventListener('click', handleCancel)

      // Close on escape key
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', handleEscape)
          handleCancel()
        }
      }
      document.addEventListener('keydown', handleEscape)

      // Show the modal
      this.modalManager?.show(modalId)

      // Initialize form state
      validateForm()
    })
  }

  /**
   * Creates the modal DOM element.
   * @param {string} bindsetName - Name of the bindset
   * @param {number} keyCount - Number of keys in the bindset
   * @returns {HTMLElement} - Modal DOM element
   */
  createModal(bindsetName, keyCount) {
    const modal = document.createElement('div')
    modal.className = 'modal bindset-delete-confirm-modal'

    const warningTitle = this.i18n ? this.i18n.t('confirm_delete_bindset_with_keys') : 'Delete Bindset with Keys'
    const warningMessage = this.i18n ? this.i18n.t('bindset_delete_warning', {
      name: bindsetName,
      count: keyCount
    }) : `This bindset "${bindsetName}" contains ${keyCount} keys and will be permanently deleted.`
    const confirmationText = this.i18n ? this.i18n.t('bindset_delete_confirmation_text') : 'I understand this will permanently delete all keys in this bindset'
    const instructionText = this.i18n ? this.i18n.t('bindset_delete_type_confirm') : 'Type DELETE to confirm'
    const deleteBtnText = this.i18n ? this.i18n.t('delete') : 'Delete'
    const cancelBtnText = this.i18n ? this.i18n.t('cancel') : 'Cancel'

    modal.innerHTML = `
      <div class="modal-content bindset-delete-confirm-content">
        <div class="modal-header">
          <h3>
            <i class="fas fa-exclamation-triangle"></i>
            ${warningTitle}
          </h3>
        </div>
        <div class="modal-body">
          <div class="bindset-delete-warning">
            <p><strong>${warningMessage}</strong></p>
            <p>${this.i18n ? this.i18n.t('bindset_delete_consequences') : 'All keybinds in this bindset will be permanently lost and cannot be recovered.'}</p>
          </div>

          <div class="bindset-delete-steps">
            <div class="bindset-delete-step">
              <label class="checkbox-label">
                <input type="checkbox" id="bindset-delete-confirm-checkbox">
                <span class="checkmark"></span>
                ${confirmationText}
              </label>
            </div>

            <div class="bindset-delete-step">
              <label for="bindset-delete-confirm-input" class="input-label">
                ${instructionText}
              </label>
              <input
                type="text"
                id="bindset-delete-confirm-input"
                class="form-control"
                placeholder="DELETE"
                disabled
                autocomplete="off"
                spellcheck="false"
              >
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary bindset-delete-cancel-btn">
            ${cancelBtnText}
          </button>
          <button class="btn btn-danger bindset-delete-confirm-btn" disabled>
            ${deleteBtnText}
          </button>
        </div>
      </div>
    `

    return modal
  }

  /**
   * Regenerate the modal content for language changes.
   */
  regenerateModal() {
    if (!this.currentModal) return

    const { bindsetName, keyCount, modalElement, modalId } = this.currentModal

    // Store current form state
    const checkbox = modalElement.querySelector('#bindset-delete-confirm-checkbox')
    const textInput = modalElement.querySelector('#bindset-delete-confirm-input')
    const checkboxChecked = checkbox.checked
    const textValue = textInput.value

    const newModal = this.createModal(bindsetName, keyCount)
    newModal.id = modalId

    // Replace the old modal with the new one
    modalElement.replaceWith(newModal)
    this.currentModal.modalElement = newModal

    // Restore form state
    const newCheckbox = newModal.querySelector('#bindset-delete-confirm-checkbox')
    const newTextInput = newModal.querySelector('#bindset-delete-confirm-input')
    const newDeleteBtn = newModal.querySelector('.bindset-delete-confirm-btn')
    const newCancelBtn = newModal.querySelector('.bindset-delete-cancel-btn')

    newCheckbox.checked = checkboxChecked
    newTextInput.value = textValue

    // Re-attach event listeners
    const validateForm = () => {
      const checkboxChecked = newCheckbox.checked
      const textValue = newTextInput.value.trim().toUpperCase()
      const deleteConfirmed = checkboxChecked && textValue === 'DELETE'

      newDeleteBtn.disabled = !deleteConfirmed
      newTextInput.disabled = !checkboxChecked

      return deleteConfirmed
    }

    newCheckbox.addEventListener('change', validateForm)
    newTextInput.addEventListener('input', validateForm)

    const handleConfirm = () => {
      this.modalManager?.unregisterRegenerateCallback(modalId)
      this.currentModal = null
      this.modalManager?.hide(modalId)
      if (newModal.parentNode) {
        newModal.parentNode.removeChild(newModal)
      }
      this.currentModal.resolve(true)
    }

    const handleCancel = () => {
      this.modalManager?.unregisterRegenerateCallback(modalId)
      this.currentModal = null
      this.modalManager?.hide(modalId)
      if (newModal.parentNode) {
        newModal.parentNode.removeChild(newModal)
      }
      this.currentModal.resolve(false)
    }

    newDeleteBtn.addEventListener('click', handleConfirm)
    newCancelBtn.addEventListener('click', handleCancel)

    // Initialize form state
    validateForm()
  }
}