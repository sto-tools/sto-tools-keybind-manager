import ComponentBase from '../ComponentBase.js'

/*
 * UIUtilityService - Handles miscellaneous UI utility functions
 * All operations are accessible via eventBus events or requestResponse
 */
export default class UIUtilityService extends ComponentBase {
  constructor(eventBus) {
    super(eventBus)
    this.componentName = 'UIUtilityService'
    
    this.dragState = {
      isDragging: false,
      dragElement: null,
      dragData: null,
    }
    
    this.setupEventListeners()
    this.setupTooltips()
  }

  onDestroy() {
    // Clean up request handlers
    if (this.requestDetachers) {
      this.requestDetachers.forEach(detach => detach())
      this.requestDetachers = []
    }
    
    super.onDestroy()
  }

  setupEventListeners() {
    // Clipboard operations
    this.eventBus.on('ui:copy-to-clipboard', this.handleCopyToClipboard.bind(this))
    
    // Form validation
    this.eventBus.on('ui:validate-form', this.handleValidateForm.bind(this))
    this.eventBus.on('ui:validate-email', this.handleValidateEmail.bind(this))
    
    // Drag and drop
    this.eventBus.on('ui:init-drag-drop', this.handleInitDragDrop.bind(this))
    
    // Animations
    this.eventBus.on('ui:fade-in', this.handleFadeIn.bind(this))
    this.eventBus.on('ui:fade-out', this.handleFadeOut.bind(this))
    
    // Tooltips
    this.eventBus.on('ui:show-tooltip', this.handleShowTooltip.bind(this))
    this.eventBus.on('ui:hide-tooltip', this.handleHideTooltip.bind(this))
    
    // Request/Response handlers for operations that need return values
    this.setupRequestHandlers()
  }

  setupRequestHandlers() {
    // Store detach functions for cleanup
    this.requestDetachers = []
    
    this.requestDetachers.push(this.respond('ui:copy-to-clipboard', this.copyToClipboard.bind(this)))
    this.requestDetachers.push(this.respond('ui:validate-form', this.validateForm.bind(this)))
    this.requestDetachers.push(this.respond('ui:validate-email', this.isValidEmail.bind(this)))
    this.requestDetachers.push(this.respond('ui:debounce', this.debounce.bind(this)))
    this.requestDetachers.push(this.respond('ui:throttle', this.throttle.bind(this)))
  }

  // Event Handlers
  async handleCopyToClipboard({ text }) {
    const result = await this.copyToClipboard(text)
    this.emit('ui:clipboard-result', { success: result, text })
  }

  async handleValidateForm({ formElement, formId }) {
    const element = formElement || document.getElementById(formId)
    const result = this.validateForm(element)
    this.emit('ui:form-validated', { result, formId })
  }

  async handleValidateEmail({ email }) {
    const result = this.isValidEmail(email)
    this.emit('ui:email-validated', { email, isValid: result })
  }

  async handleInitDragDrop({ container, containerId, options = {} }) {
    const element = container || document.getElementById(containerId)
    this.initDragAndDrop(element, options)
    this.emit('ui:drag-drop-initialized', { containerId, options })
  }

  async handleFadeIn({ element, elementId, duration = 300 }) {
    const el = element || document.getElementById(elementId)
    this.fadeIn(el, duration)
    this.emit('ui:fade-in-complete', { elementId, duration })
  }

  async handleFadeOut({ element, elementId, duration = 300 }) {
    const el = element || document.getElementById(elementId)
    this.fadeOut(el, duration)
    this.emit('ui:fade-out-complete', { elementId, duration })
  }

  async handleShowTooltip({ element, elementId, text }) {
    const el = element || document.getElementById(elementId)
    this.showTooltip(el, text)
    this.emit('ui:tooltip-shown', { elementId, text })
  }

  async handleHideTooltip() {
    this.hideTooltip()
    this.emit('ui:tooltip-hidden')
  }

  // Core Utility Methods
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text)
      // Emit success toast via ToastService
      this.emit('toast:show', {
        message: typeof i18next !== 'undefined' ? i18next.t('content_copied_to_clipboard') : 'Content copied to clipboard',
        type: 'success'
      })
      return true
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()

      try {
        document.execCommand('copy')
        this.emit('toast:show', {
          message: typeof i18next !== 'undefined' ? i18next.t('content_copied_to_clipboard') : 'Content copied to clipboard',
          type: 'success'
        })
        return true
      } catch (fallbackErr) {
        this.emit('toast:show', {
          message: typeof i18next !== 'undefined' ? i18next.t('failed_to_copy_to_clipboard') : 'Failed to copy to clipboard',
          type: 'error'
        })
        return false
      } finally {
        document.body.removeChild(textArea)
      }
    }
  }

  validateForm(formElement) {
    if (!formElement) return { isValid: false, errors: ['Form element not found'] }

    const errors = []
    const inputs = formElement.querySelectorAll('input[required], textarea[required], select[required]')

    inputs.forEach((input) => {
      if (!input.value.trim()) {
        errors.push(`${input.name || input.id || 'Field'} is required`)
      }

      if (input.type === 'email' && input.value && !this.isValidEmail(input.value)) {
        errors.push(`${input.name || input.id || 'Email'} is not valid`)
      }
    })

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  initDragAndDrop(container, options = {}) {
    if (!container) return

    const {
      draggableSelector = '.draggable',
      dropZoneSelector = draggableSelector,
      onDragStart = null,
      onDragEnd = null,
      onDrop = null,
    } = options

    container.addEventListener('dragstart', (e) => {
      const dragEl = e.target.closest(draggableSelector)
      if (dragEl) {
        //
        this.dragState.isDragging = true
        this.dragState.dragElement = dragEl
        this.dragState.dragData = dragEl.dataset

        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/html', dragEl.outerHTML)

        if (onDragStart) onDragStart(e, this.dragState)
      }
    })

    container.addEventListener('dragend', (e) => {
      const dragEl = e.target.closest(draggableSelector)
      if (dragEl) {
        //
        this.dragState.isDragging = false
        this.dragState.dragElement = null
        this.dragState.dragData = null

        if (onDragEnd) onDragEnd(e, this.dragState)
      }
    })

    // Allow dropping and keep track of the current row we are hovering over
    let lastHoverDropZone = null
    container.addEventListener('dragover', (e) => {
      e.preventDefault()
      if (!dropZoneSelector) return

      const hoverEl = e.target.closest ? e.target.closest(dropZoneSelector) : null
      if (hoverEl && hoverEl !== lastHoverDropZone) {
        lastHoverDropZone = hoverEl
      }
    })

    container.addEventListener('drop', (e) => {
      e.preventDefault()

      // Identify the element that should be treated as the drop target based on selector
      let dropZone = null
      if (dropZoneSelector) {
        // Use closest to find ancestor matching selector (works even if event.target is a child)
        if (typeof e.target.closest === 'function') {
          dropZone = e.target.closest(dropZoneSelector)
        }
        //
        if (!dropZone && typeof document !== 'undefined' && document.elementFromPoint) {
          const pointEl = document.elementFromPoint(e.clientX, e.clientY)
          dropZone = pointEl?.closest ? pointEl.closest(dropZoneSelector) : null
        }

        // Final fallback to the last row we hovered over
        if (!dropZone) {
          dropZone = lastHoverDropZone
        }
      }

      if (dropZone) {
        //
        if (dropZone && onDrop) onDrop(e, this.dragState, dropZone)
      }
    })
  }

  fadeIn(element, duration = 300) {
    if (!element) return

    element.style.opacity = '0'
    element.style.display = 'block'

    let start = null
    const animate = (timestamp) => {
      if (!start) start = timestamp
      const progress = timestamp - start
      const opacity = Math.min(progress / duration, 1)

      element.style.opacity = opacity

      if (progress < duration) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }

  fadeOut(element, duration = 300) {
    if (!element) return

    let start = null
    const animate = (timestamp) => {
      if (!start) start = timestamp
      const progress = timestamp - start
      const opacity = Math.max(1 - progress / duration, 0)

      element.style.opacity = opacity

      if (progress < duration) {
        requestAnimationFrame(animate)
      } else {
        element.style.display = 'none'
      }
    }

    requestAnimationFrame(animate)
  }

  debounce(func, wait) {
    let timeout
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout)
        func(...args)
      }
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
    }
  }

  throttle(func, limit) {
    let inThrottle
    return function () {
      const args = arguments
      const context = this
      if (!inThrottle) {
        func.apply(context, args)
        inThrottle = true
        setTimeout(() => (inThrottle = false), limit)
      }
    }
  }

  setupTooltips() {
    // Simple tooltip implementation using event delegation
    document.addEventListener(
      'mouseenter',
      (e) => {
        if (
          e.target &&
          typeof e.target.hasAttribute === 'function' &&
          e.target.hasAttribute('title') &&
          e.target.getAttribute('title').trim()
        ) {
          this.showTooltip(e.target, e.target.getAttribute('title'))
        }
      },
      true
    )

    document.addEventListener(
      'mouseleave',
      (e) => {
        if (
          e.target &&
          typeof e.target.hasAttribute === 'function' &&
          e.target.hasAttribute('title')
        ) {
          this.hideTooltip()
        }
      },
      true
    )
  }

  showTooltip(element, text) {
    if (!element || !text) return

    this.hideTooltip() // Remove any existing tooltip

    const tooltip = document.createElement('div')
    tooltip.className = 'tooltip'
    tooltip.textContent = text
    tooltip.id = 'active-tooltip'

    document.body.appendChild(tooltip)

    // Position tooltip
    const rect = element.getBoundingClientRect()
    const tooltipRect = tooltip.getBoundingClientRect()

    let left = rect.left + rect.width / 2 - tooltipRect.width / 2
    let top = rect.top - tooltipRect.height - 8

    // Adjust if tooltip goes off screen
    if (left < 8) left = 8
    if (left + tooltipRect.width > window.innerWidth - 8) {
      left = window.innerWidth - tooltipRect.width - 8
    }
    if (top < 8) {
      top = rect.bottom + 8
      tooltip.classList.add('tooltip-bottom')
    }

    tooltip.style.left = left + 'px'
    tooltip.style.top = top + 'px'

    // Show tooltip
    requestAnimationFrame(() => {
      tooltip.classList.add('show')
    })
  }

  hideTooltip() {
    const tooltip = document.getElementById('active-tooltip')
    if (tooltip) {
      tooltip.remove()
    }
  }
}
