/**
 * UIComponentBase - Base class for UI components that need data dependency management
 * Extends ComponentBase with UI-specific initialization handling for components
 * that need to wait for data dependencies before rendering
 */
import ComponentBase from "./ComponentBase.js";

export default class UIComponentBase extends ComponentBase {
  /**
   * @param {import('./ui/uiTypes.js').EventBus | null | undefined} eventBus
   */
  constructor(eventBus = null) {
    super(eventBus);
    this.pendingInitialRender = false;
  }

  // UI component initialization with data dependency checking
  // This method is called automatically by ComponentBase.init() after framework setup
  uiInit() {
    if (this.hasRequiredData()) {
      this.performInitialRender();
    } else {
      // Mark that we need to render once data is available
      this.pendingInitialRender = true;
    }
  }

  // Component-specific initialization hook
  // Override this to handle component-specific initialization in UI components
  onInit() {
    // Override in subclasses for component-specific initialization
  }

  // Handle initial state from late-join handshake
  // Checks if pending render can now proceed with available data
  /**
   * @param {import('../types/events/component-state.js').ComponentStateReply} reply
   */
  handleInitialState(reply) {
    // Call parent to handle common state caching (DataCoordinator, SelectionService)
    super.handleInitialState(reply);

    // Check if we can now render with the received data
    if (this.pendingInitialRender && this.hasRequiredData()) {
      this.pendingInitialRender = false;
      this.performInitialRender();
    }
  }

  // Check if the component has all required data for rendering
  // Override this in subclasses to implement specific data requirements
  // @returns {boolean} True if all required data is available
  hasRequiredData() {
    // Safe default - assumes no specific data requirements
    // Override in subclasses that need specific data before rendering
    return true;
  }

  // Perform the initial render when data dependencies are satisfied
  // Override this in subclasses to implement the actual rendering logic
  performInitialRender() {
    // Default implementation - override in subclasses
    // This replaces the setTimeout pattern for UI components
  }

  // Show toast notification using the event system
  /**
   * @param {string} message - The message to display
   * @param {'info' | 'success' | 'warning' | 'error'} [type] - The toast type
   */
  showToast(message, type = "info") {
    this.emit("toast:show", { message, type });
  }
}
