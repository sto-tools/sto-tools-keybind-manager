/**
 * ComponentBase - Base class for all application components
 * Provides common functionality including event bus access and lifecycle methods
 */
import { request as _cbRequest, respond as _cbRespond } from '../core/requestResponse.js'

export default class ComponentBase {
  constructor(eventBus = null) {
    this.eventBus = eventBus
    this.initialized = false
    this.destroyed = false
    this.eventListeners = new Map() // Track event listeners for cleanup
    this.domEventListeners = [] // Track DOM event listeners for cleanup
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
    
    // Initialize cache early to ensure it's available for event listeners
    this.initializeCache()
    
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
      //console.log(`[ComponentBase] ${this.getComponentName()} sending component:register`)
    }
    this.emit('component:register', {
      name: this.getComponentName(),
      replyTopic: this._myReplyTopic
    })

    // 4) Set up standardized event listeners for common state
    this._setupStandardizedEventListeners()

    // 5) Continue with component-specific initialization
    this.onInit()
  }

  // Initialize cache in constructor if needed
  initializeCache(additionalCacheData = {}) {
    if (!this.cache) {
      this.cache = {
        selectedKey: null,
        selectedAlias: null,
        currentEnvironment: 'space',
        currentProfile: null,
        profile: null,
        keys: {},
        aliases: {},
        builds: {},
        preferences: {},
        activeBindset: 'Primary Bindset',
        bindsetNames: ['Primary Bindset'],
        ...additionalCacheData
      }
    }
  }

  // Extend cache with additional properties after initialization
  extendCache(additionalCacheData = {}) {
    if (this.cache) {
      Object.assign(this.cache, additionalCacheData)
    } else {
      this.initializeCache(additionalCacheData)
    }
  }

  /**
   * Set up standardized event listeners for common state changes
   * This eliminates repetitive event listener setup in individual components
   */
  _setupStandardizedEventListeners() {
    // Initialize cache
    this.initializeCache()

    // Cache selection state from SelectionService broadcasts
    this.addEventListener('key-selected', (data) => {
      this.cache.selectedKey = data.key
      this.cache.selectedAlias = null // Clear alias when key selected
    })

    this.addEventListener('alias-selected', (data) => {
      this.cache.selectedAlias = data.name
      this.cache.selectedKey = null // Clear key when alias selected
    })

    // Cache environment changes
    this.addEventListener('environment:changed', (data) => {
      const env = typeof data === 'string' ? data : data?.environment
      if (env) {
        this.cache.currentEnvironment = env
        // Update keys cache for new environment if we have builds data
        if (this.cache.builds && this.cache.builds[env]) {
          this.cache.keys = this.cache.builds[env].keys || {}
        }
      }
    })

    // Cache profile updates from DataCoordinator
    this.addEventListener('profile:updated', ({ profileId, profile }) => {
      if (this.cache && profileId === this.cache.currentProfile) {
        this.cache.profile = profile
        // Update keys for current environment
        if (profile.builds) {
          this.cache.builds = profile.builds
          const currentBuild = profile.builds[this.cache.currentEnvironment]
          this.cache.keys = currentBuild?.keys || {}
        } else if (profile.keys) {
          this.cache.keys = profile.keys
        }
        // Update aliases
        this.cache.aliases = profile.aliases || {}
      }
    })

    // Handle profile switches
    this.addEventListener('profile:switched', ({ profileId, profile, environment }) => {
      this.cache.currentProfile = profileId
      this.cache.profile = profile
      this.cache.currentEnvironment = environment || 'space'
      // Backward compatibility for components expecting underscore names
      this._currentEnvironment = this.cache.currentEnvironment
      this._currentProfileId = profileId
      
      // Update cached data
      if (profile.builds) {
        this.cache.builds = profile.builds
        const currentBuild = profile.builds[this.cache.currentEnvironment]
        this.cache.keys = currentBuild?.keys || {}
      } else if (profile.keys) {
        this.cache.keys = profile.keys
      }
      this.cache.aliases = profile.aliases || {}
    })

    // Cache preference changes
    this.addEventListener('preferences:changed', (data) => {
      if (data.changes) {
        // Update cached preferences with the changes
        Object.assign(this.cache.preferences, data.changes)
      } else if (data.key && data.value !== undefined) {
        // Handle legacy single preference change format
        this.cache.preferences[data.key] = data.value
      }
    })

    // Listen for initial preferences loading
    this.addEventListener('preferences:loaded', (data) => {
      console.log(`[${this.componentName}] preferences:loaded received:`, data)
      if (data.settings) {
        Object.assign(this.cache.preferences, data.settings)
        console.log(`[${this.componentName}] Updated preferences cache from preferences:loaded`)
      }
    })

    // Cache bindset state changes
    this.addEventListener('bindset-selector:active-changed', (data) => {
      this.cache.activeBindset = data.bindset
    })

    // Cache bindset list changes
    this.addEventListener('bindsets:changed', (data) => {
      if (data.names && Array.isArray(data.names)) {
        this.cache.bindsetNames = data.names
      }
    })

    // Also listen for preferences:saved events which contain full settings
    this.addEventListener('preferences:saved', (data) => {
      console.log(`[${this.componentName}] preferences:saved received:`, data)
      if (data.settings) {
        Object.assign(this.cache.preferences, data.settings)
        console.log(`[${this.componentName}] Updated preferences cache from preferences:saved`)
      }
    })

    // Load initial preferences asynchronously
    this._loadInitialPreferences()
  }

  /**
   * Load initial preferences into cache
   * Called during component initialization
   */
  async _loadInitialPreferences() {
/*    try {
      const preferences = await this.request('preferences:get-settings')
      if (preferences && typeof preferences === 'object') {
        Object.assign(this.cache.preferences, preferences)
      }
    } catch (error) {
      // Preferences service might not be available yet, that's okay
      // The cache will be updated when preferences:changed events are received
    }*/
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
   * Register a DOM event listener and track it for cleanup
   * @param {Function} detachFn - The cleanup function returned by eventBus.onDom
   */
  addDomEventListener(detachFn) {
    if (typeof detachFn === 'function') {
      this.domEventListeners.push(detachFn)
    }
  }

  /**
   * Wrapper for eventBus.onDom that automatically tracks the cleanup function
   * @param {string|Element} target - DOM element or selector
   * @param {string} domEvent - DOM event name
   * @param {string|Function} busEventOrHandler - Bus event name or handler function
   * @param {Function} handler - Optional handler function
   * @returns {Function} The cleanup function from eventBus.onDom
   */
  onDom(target, domEvent, busEventOrHandler, handler) {
    if (!this.eventBus) {
      // Silently ignore if no event bus is available – useful during unit tests
      return () => {}
    }

    // Call eventBus.onDom and get the cleanup function
    const cleanupFn = this.eventBus.onDom(target, domEvent, busEventOrHandler, handler)
    
    // Track the cleanup function for automatic cleanup
    this.addDomEventListener(cleanupFn)
    
    return cleanupFn
  }

  /**
   * Wrapper for eventBus.onDomDebounced that automatically tracks the cleanup function
   * @param {string|Element} target - DOM element or selector
   * @param {string} domEvent - DOM event name
   * @param {string|Function} busEventOrHandler - Bus event name or handler function
   * @param {Function|number} handlerOrDelay - Optional handler function or delay
   * @param {number} delay - Optional delay in milliseconds
   * @returns {Function} The cleanup function from eventBus.onDomDebounced
   */
  onDomDebounced(target, domEvent, busEventOrHandler, handlerOrDelay, delay) {
    if (!this.eventBus) {
      // Silently ignore if no event bus is available – useful during unit tests
      return () => {}
    }

    // Call eventBus.onDomDebounced and get the cleanup function
    const cleanupFn = this.eventBus.onDomDebounced(target, domEvent, busEventOrHandler, handlerOrDelay, delay)
    
    // Track the cleanup function for automatic cleanup
    this.addDomEventListener(cleanupFn)
    
    return cleanupFn
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
   * @param {Object} options - Options object { synchronous: boolean }
   * @returns {Promise} - Promise that resolves when all listeners complete (if synchronous)
   */
  emit(event, data = null, options = {}) {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`[${this.getComponentName()}] emit → ${event} (options: ${JSON.stringify(options)})`, data)
    }
    
    // Emit via event bus if available
    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      return this.eventBus.emit(event, data, options)
    } else if (!this.eventBus) {
      // No event bus – skip routing
      return Promise.resolve()
    }

    return Promise.resolve()
  }

  /**
   * Clean up all tracked event listeners
   */
  cleanupEventListeners() {
    if (!this.eventBus) return

    // Clean up regular event listeners
    for (const [event, listeners] of this.eventListeners) {
      listeners.forEach(({ handler }) => {
        this.eventBus.off(event, handler)
      })
    }
    this.eventListeners.clear()

    // Clean up DOM event listeners
    this.domEventListeners.forEach(detachFn => {
      try {
        detachFn()
      } catch (error) {
        console.error('Error cleaning up DOM event listener:', error)
      }
    })
    this.domEventListeners = []
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
     //console.log(`[ComponentBase] ${this.getComponentName()} received component:register from ${name} → replying on ${replyTopic}`)
    }

    // If we are active, provide our current state to the requester
    if (this.initialized && !this.destroyed) {
      this.emit(replyTopic, {
        sender: this.getComponentName(),
        state: this.getCurrentState()
      })
    }
  }

  /**
   * Centralized handling of common state from DataCoordinator and SelectionService
   * This eliminates repetitive caching code in individual components
   */
  _handleInitialState(sender, state) {
    if (!state) return

    // Initialize cache if it doesn't exist
    if (!this.cache) {
      this.cache = {}
    }

    // Handle DataCoordinator state
    if (sender === 'DataCoordinator') {
      // Handle profile ID from both sources
      const profileId = state.currentProfile || (state.currentProfileData && state.currentProfileData.id)
      const profile = state.currentProfileData
      
      if (profileId) {
        // Cache profile ID
        this.cache.currentProfile = profileId
      }
      
      if (profile) {
        // Cache profile data
        this.cache.profile = profile
        this.cache.currentEnvironment = profile.environment || 'space'
      } else if (state.currentEnvironment) {
        // Handle environment without profile data
        this.cache.currentEnvironment = state.currentEnvironment
      }
      
      // Cache build-specific data if profile exists
      if (profile) {
        if (profile.builds) {
          this.cache.builds = profile.builds
          // Cache keys for current environment
          const currentBuild = profile.builds[this.cache.currentEnvironment]
          this.cache.keys = currentBuild?.keys || {}
        } else if (profile.keys) {
          // Legacy format support
          this.cache.keys = profile.keys
        }
        
        // Cache aliases
        this.cache.aliases = profile.aliases || {}
      }
      
      console.log(`[ComponentBase] ${this.getComponentName()} cached DataCoordinator state:`, {
        currentProfile: this.cache.currentProfile,
        currentEnvironment: this.cache.currentEnvironment
      })
    }

    // Handle SelectionService state
    if (sender === 'SelectionService' && state) {
      // Cache selection properties
      if (state.selectedKey !== undefined) {
        this.cache.selectedKey = state.selectedKey
      }
      if (state.selectedAlias !== undefined) {
        this.cache.selectedAlias = state.selectedAlias
      }
      if (state.currentEnvironment !== undefined) {
        this.cache.currentEnvironment = state.currentEnvironment
      }
      if (state.editingContext !== undefined) {
        this.cache.editingContext = state.editingContext
      }
      if (state.cachedSelections !== undefined) {
        this.cache.cachedSelections = state.cachedSelections
      }
      
      console.log(`[ComponentBase] ${this.getComponentName()} cached SelectionService state:`, {
        selectedKey: this.cache.selectedKey,
        selectedAlias: this.cache.selectedAlias,
        currentEnvironment: this.cache.currentEnvironment
      })
    }

    // Handle PreferencesService state
    if (sender === 'PreferencesService' && state) {
      // Cache preferences settings
      if (state.settings && typeof state.settings === 'object') {
        Object.assign(this.cache.preferences, state.settings)
        console.log(`[ComponentBase] ${this.getComponentName()} cached PreferencesService state:`, {
          bindToAliasMode: this.cache.preferences.bindToAliasMode,
          bindsetsEnabled: this.cache.preferences.bindsetsEnabled,
          settingsCount: Object.keys(state.settings).length
        })
      }
    }

    // Handle BindsetService state
    if (sender === 'BindsetService' && state) {
      // Cache bindset names
      if (state.bindsets && Array.isArray(state.bindsets)) {
        this.cache.bindsetNames = state.bindsets
        console.log(`[ComponentBase] ${this.getComponentName()} cached BindsetService state:`, {
          bindsetNames: this.cache.bindsetNames
        })
      }
    }
  }

  _onInitialState({ sender, state } = {}) {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`[ComponentBase] ${this.getComponentName()} received initial state from ${sender}`, state)
    }

    // Handle common state first
    this._handleInitialState(sender, state)

    // Then call component-specific handler
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

  /**
   * Wrapper around requestResponse.request with component name debug logging
   * @param {string} topic
   * @param {*} payload
   */
  async request(topic, payload = {}) {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`[${this.getComponentName()}] request → ${topic}`, payload)
    }
    return await _cbRequest(this.eventBus, topic, payload)
  }

  /**
   * Wrapper around requestResponse.respond that prefixes logs with component name
   * Returns the detach function from respond().
   * @param {string} topic
   * @param {Function} handler
   */
  respond(topic, handler) {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      //console.log(`[${this.getComponentName()}] respond ← ${topic} (handler registered)`)
    }
    return _cbRespond(this.eventBus, topic, async (payload) => {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[${this.getComponentName()}] respond handler → ${topic}`, payload)
      }
      return await handler(payload)
    })
  }
} 