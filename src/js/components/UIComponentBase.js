/**
 * UIComponentBase - Base class for UI components that need data dependency management
 * Extends ComponentBase with UI-specific initialization handling for components
 * that need to wait for data dependencies before rendering
 */
import ComponentBase from './ComponentBase.js'

export default class UIComponentBase extends ComponentBase {
  constructor(eventBus = null) {
    super(eventBus)
    this.pendingInitialRender = false
  }

  // UI component initialization with data dependency checking
  // Override this to handle component-specific initialization
  onInit() {
    if (this.hasRequiredData()) {
      this.performInitialRender()
    } else {
      // Mark that we need to render once data is available
      this.pendingInitialRender = true
    }
  }

  // Handle initial state from late-join handshake
  // Checks if pending render can now proceed with available data
  handleInitialState(sender, state) {
    // Call parent to handle common state caching (DataCoordinator, SelectionService)
    super.handleInitialState(sender, state)
    
    // Check if we can now render with the received data
    if (this.pendingInitialRender && this.hasRequiredData()) {
      this.pendingInitialRender = false
      this.performInitialRender()
    }
  }

  // Check if the component has all required data for rendering
  // Override this in subclasses to implement specific data requirements
  // @returns {boolean} True if all required data is available
  hasRequiredData() {
    // Safe default - assumes no specific data requirements
    // Override in subclasses that need specific data before rendering
    return true
  }

  // Perform the initial render when data dependencies are satisfied
  // Override this in subclasses to implement the actual rendering logic
  performInitialRender() {
    // Default implementation - override in subclasses
    // This replaces the setTimeout pattern for UI components
  }

  // Force render regardless of data availability (fallback method)
  // Useful for error states or when data requirements change
  forceRender() {
    this.pendingInitialRender = false
    this.performInitialRender()
  }

  // Check if component is waiting for data dependencies
  // @returns {boolean} True if waiting for initial render
  isPendingRender() {
    return this.pendingInitialRender
  }
}