/**
 * ComponentBase - Base class for all application components
 * Provides common functionality including event bus access and lifecycle methods
 */
export default class ComponentBase {
  constructor(eventBus = null) {
    this.eventBus = eventBus
    this.initialized = false
    this.destroyed = false
    this.eventListeners = new Map() // Track event listeners for cleanup
    // Set componentName explicitly to avoid minification issues with constructor.name
    this.componentName = this.constructor.name
  }

  /**
   * Initialize the component
   * Override this method in subclasses to implement component-specific initialization
   */
  init() {
    if (this.initialized) {
      return
    }
    
    this.initialized = true
    this.destroyed = false
    
    // ---------------------------------------------------------
    // Late-Join State Registration handshake setup
    // ---------------------------------------------------------
    // 1) Listen for other components registering so we can
    //    respond with our current state.
    this.addEventListener('component:register', this._onComponentRegister.bind(this))

    // 2) Prepare a unique reply topic for this component instance
    this._myReplyTopic = `component:registered:reply:${this.getComponentName()}:${Date.now()}`
    this.addEventListener(this._myReplyTopic, this._onInitialState.bind(this))

    // 3) Announce our readiness so existing components can reply
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`[ComponentBase] ${this.getComponentName()} sending component:register`)
    }
    this.emit('component:register', {
      name: this.getComponentName(),
      replyTopic: this._myReplyTopic
    })

    // 4) Continue with component-specific initialization
    this.onInit()
  }

  /**
   * Destroy the component and clean up resources
   * Override this method in subclasses to implement component-specific cleanup
   */
  destroy() {
    if (this.destroyed) {
      console.warn(`${this.constructor.name} is already destroyed`)
      return
    }

    this.destroyed = true
    this.initialized = false

    // Clean up event listeners
    this.cleanupEventListeners()

    // Component-specific cleanup in subclasses
    this.onDestroy()
  }

  /**
   * Hook for component-specific initialization
   * Override in subclasses
   */
  onInit() {
    // Override in subclasses
  }

  /**
   * Hook for component-specific cleanup
   * Override in subclasses
   */
  onDestroy() {
    // Override in subclasses
  }

  /**
   * Register an event listener and track it for cleanup
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   * @param {Object} context - Context for the event (optional)
   */
  addEventListener(event, handler, context = null) {
    if (!this.eventBus) {
      // Silently ignore if no event bus is available – useful during unit tests
      return
    }

    this.eventBus.on(event, handler, context)
    
    // Track for cleanup
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event).push({ handler, context })
  }

  /**
   * Remove an event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  removeEventListener(event, handler) {
    if (!this.eventBus) {
      // Silently ignore if no event bus is available – useful during unit tests
      return
    }

    this.eventBus.off(event, handler)

    // Remove from tracking
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      const index = listeners.findIndex(l => l.handler === handler)
      if (index !== -1) {
        listeners.splice(index, 1)
      }
    }
  }

  /**
   * Emit an event through the event bus
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data = null) {
    // Emit via event bus if available
    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(event, data)
    } else if (!this.eventBus) {
      // No event bus – skip routing
      return
    }

    // Also call any listeners registered through this component in cases where
    // the provided eventBus is a mock that doesn\'t route events (common in tests)
    const listeners = this.eventListeners.get(event)
    if (listeners && listeners.length > 0) {
      listeners.forEach(({ handler, context }) => {
        try {
          handler.call(context || this, data)
        } catch (err) {
          console.error('ComponentBase emit handler error', err)
        }
      })
    }
  }

  /**
   * Clean up all tracked event listeners
   */
  cleanupEventListeners() {
    if (!this.eventBus) return

    for (const [event, listeners] of this.eventListeners) {
      listeners.forEach(({ handler }) => {
        this.eventBus.off(event, handler)
      })
    }

    this.eventListeners.clear()
  }

  /**
   * Check if component is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.initialized && !this.destroyed
  }

  /**
   * Check if component is destroyed
   * @returns {boolean}
   */
  isDestroyed() {
    return this.destroyed
  }

  /**
   * Get component name for debugging
   * @returns {string}
   */
  getComponentName() {
    return this.componentName || this.constructor.name
  }

  // ---------------------------------------------------------
  // Late-Join State Registration internal handlers
  // ---------------------------------------------------------
  _onComponentRegister({ name, replyTopic } = {}) {
    // Ignore our own registration messages
    if (name === this.getComponentName()) return

    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`[ComponentBase] ${this.getComponentName()} received component:register from ${name} → replying on ${replyTopic}`)
    }

    // If we are active, provide our current state to the requester
    if (this.initialized && !this.destroyed) {
      this.emit(replyTopic, {
        sender: this.getComponentName(),
        state: this.getCurrentState()
      })
    }
  }

  _onInitialState({ sender, state } = {}) {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`[ComponentBase] ${this.getComponentName()} received initial state from ${sender}`, state)
    }

    if (typeof this.handleInitialState === 'function') {
      this.handleInitialState(sender, state)
    }
  }

  /**
   * Retrieve a serialisable snapshot representing the component's current state.
   * Stateful subclasses MUST override this to provide meaningful data.
   * @returns {*}
   */
  getCurrentState() {
    return null // Default: no state – subclasses should override
  }

  /**
   * Optional hook invoked when another component sends its initial state
   * during the late-join handshake. Subclasses can override to merge or
   * process the provided state.
   * @param {string} sender - Name of the component that sent the state
   * @param {*} state - Serializable state snapshot
   */
  /* eslint-disable-next-line */
  handleInitialState(sender, state) {
    // No-op by default. Override in subclasses if needed.
  }
} 