import ComponentBase from '../ComponentBase.js'

/*
 * ToastService – handles creation and life-cycle of toast notifications.
 */
export default class ToastService extends ComponentBase {
  constructor({ eventBus, i18n, containerId = 'toastContainer' } = {}) {
    super(eventBus)
    this.componentName = 'ToastService'
    this.i18n = i18n

    this.containerId = containerId
    
    // Register request/response endpoints
    if (this.eventBus) {
      this.respond('ui:show-toast', ({ message, type = 'info', duration = 3000 }) => {
        this.showToast(message, type, duration)
        return true
      })
      
      // Also listen for toast:show events (used by most components)
      this.addEventListener('toast:show', ({ message, type = 'info', duration = 3000 }) => {
        this.showToast(message, type, duration)
      })
    }
  }

  // Show a toast message.
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
    } else {
      console.warn(`ToastService: Toast container '${this.containerId}' not found in DOM`)
    }
  }

  // Create the DOM structure for a toast.
  createToast(message, type, duration) {
    const toast = document.createElement('div')
    toast.className = `toast toast-${type}`

    const iconMap = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle',
    }

    // Create toast content container
    const toastContent = document.createElement('div')
    toastContent.className = 'toast-content'

    // Create and add icon
    const icon = document.createElement('i')
    icon.className = `fas ${iconMap[type] || iconMap.info}`
    toastContent.appendChild(icon)

    // Create and add message span (safely)
    const messageSpan = document.createElement('span')
    messageSpan.className = 'toast-message'
    messageSpan.textContent = message // Use textContent to prevent XSS
    toastContent.appendChild(messageSpan)

    // Create and add close button
    const closeButton = document.createElement('button')
    closeButton.className = 'toast-close'
    closeButton.setAttribute('aria-label', 'close toast')
    
    const closeIcon = document.createElement('i')
    closeIcon.className = 'fas fa-times'
    closeButton.appendChild(closeIcon)
    
    toastContent.appendChild(closeButton)

    // Add content to toast
    toast.appendChild(toastContent)

    // Close button behaviour
    closeButton.addEventListener('click', () => {
      this.removeToast(toast)
    })

    return toast
  }

  // Internal helper that adds the removal animation and cleans up the DOM.
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