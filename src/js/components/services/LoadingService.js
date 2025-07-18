import ComponentBase from '../ComponentBase.js'

/**
 * LoadingService – handles showing/hiding loading indicators on DOM elements.
 */
export default class LoadingService extends ComponentBase {
  // Show a loading spinner on the supplied element (or element id).
  showLoading(element, text = 'Loading...') {
    if (typeof element === 'string') {
      element = document.getElementById(element)
    }

    if (element) {
      element.classList.add('loading')
      const originalContent = element.innerHTML
      element.dataset.originalContent = originalContent
      element.innerHTML = `
                <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span>${text}</span>
                </div>
            `
      // Buttons become disabled when loading to prevent double clicks
      if ('disabled' in element) {
        element.disabled = true
      }
    }
  }

  // Hide the loading spinner and restore original element content.
  hideLoading(element) {
    if (typeof element === 'string') {
      element = document.getElementById(element)
    }

    if (element && element.classList.contains('loading')) {
      element.classList.remove('loading')
      element.innerHTML = element.dataset.originalContent || ''
      if ('disabled' in element) {
        element.disabled = false
      }
      delete element.dataset.originalContent
    }
  }
} 