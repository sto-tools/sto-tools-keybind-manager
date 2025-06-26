import ComponentBase from '../ComponentBase.js'

/**
 * ToastService – handles creation and life-cycle of toast notifications.
 * This was previously part of STOUIManager and has been extracted so the
 * logic can be reused without pulling in the entire UI manager facade.
 */
export default class ToastService extends ComponentBase {
  /**
   * @param {Object} opts
   * @param {import('../../core/eventBus.js').default} [opts.eventBus]
   * @param {Object} [opts.i18n] – i18next instance or compatible (optional)
   * @param {string} [opts.containerId='toastContainer'] – DOM id for toast container
   */
  constructor({ eventBus = null, i18n = null, containerId = 'toastContainer' } = {}) {
    super(eventBus)
    this.componentName = 'ToastService'
    this.i18n = i18n || (typeof i18next !== 'undefined' ? i18next : null)

    // Currently not used by logic but kept for backward-compatibility
    // as tests verify the property exists on STOUIManager (which will
    // proxy to this value).
    this.toastQueue = []

    this.containerId = containerId
  }

  /**
   * Show a toast message.
   * @param {string} message – Message to display (already translated).
   * @param {'success'|'error'|'warning'|'info'} [type='info'] – Toast style.
   * @param {number} [duration=3000] – How long the toast should remain visible in ms.
   */
  showToast(message, type = 'info', duration = 3000) {
    const toast = this.createToast(message, type, duration)
    const container = document.getElementById(this.containerId)

    if (container) {
      container.appendChild(toast)

      // Trigger the CSS animation frame so the toast slides/fades in
      requestAnimationFrame(() => {
        toast.classList.add('show')
      })

      // Auto-remove after the configured duration
      setTimeout(() => {
        this.removeToast(toast)
      }, duration)
    }
  }

  /**
   * Create the DOM structure for a toast.
   * @private
   */
  createToast(message, type, duration) {
    const toast = document.createElement('div')
    toast.className = `toast toast-${type}`

    const iconMap = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle',
    }

    toast.innerHTML = `
            <div class="toast-content">
                <i class="fas ${iconMap[type] || iconMap.info}"></i>
                <span class="toast-message">${message}</span>
                <button class="toast-close" aria-label="close toast">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `

    // Close button behaviour
    const closeBtn = toast.querySelector('.toast-close')
    closeBtn.addEventListener('click', () => {
      this.removeToast(toast)
    })

    return toast
  }

  /**
   * Public helper to hide a toast immediately.
   * @param {HTMLElement} toast
   */
  hideToast(toast) {
    if (toast && toast.parentNode) {
      this.removeToast(toast)
    }
  }

  /**
   * Internal helper that adds the removal animation and cleans up the DOM.
   * @param {HTMLElement} toast
   * @private
   */
  removeToast(toast) {
    if (!toast) return

    toast.classList.add('removing')
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast)
      }
    }, 300)
  }
} 