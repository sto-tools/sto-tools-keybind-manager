import ComponentBase from '../ComponentBase.js'
import { DISPLAY_VERSION } from '../../core/constants.js'

/*
 * AboutModalUI - Handles the about modal display and interactions
 * Responsible for showing application information, version, credits, etc.
 * Manages about-specific content while leaving generic modal behavior to ModalManagerService
 */
export default class AboutModalUI extends ComponentBase {
  constructor({ eventBus, document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(eventBus)
    this.componentName = 'AboutModalUI'
    this.document = document
  }

  onInit() {
    this.setupEventListeners()
    this.populateAboutContent()
  }

  setupEventListeners() {
    if (this.eventListenersSetup) {
      return
    }
    this.eventListenersSetup = true

    // Listen for about:show event from HeaderMenuUI
    this.eventBus.on('about:show', () => {
      this.showAboutModal()
    })

    // Listen for modal regeneration events to update content
    this.eventBus.on('modal:regenerated', ({ modalId }) => {
      if (modalId === 'aboutModal') {
        this.populateAboutContent()
      }
    })
  }

  // Show the about modal
  showAboutModal() {
    // Ensure content is up-to-date before showing
    this.populateAboutContent()
    
    // Use the modal manager service to show the about modal
    this.emit('modal:show', { modalId: 'aboutModal' })
  }

  // Populate about modal with dynamic content (version, etc.)
  // This handles about-specific content while ModalManagerService handles generic behavior
  populateAboutContent() {
    // Update version display
    const aboutVersionElement = this.document.getElementById('aboutVersion')
    if (aboutVersionElement) {
      aboutVersionElement.textContent = ` v${DISPLAY_VERSION}`
    }
  }
} 