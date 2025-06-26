import ComponentBase from '../ComponentBase.js'
import { respond } from '../../core/requestResponse.js'

/**
 * InterfaceModeService - Handles mode switching logic and state management
 * Manages space/ground/alias mode transitions and profile environment updates
 */
export default class InterfaceModeService extends ComponentBase {
  constructor({ eventBus, storage, profileService, app }) {
    super(eventBus)
    this.componentName = 'InterfaceModeService'
    this.storage = storage
    this.profileService = profileService
    this.app = app
    
    // Internal state
    this._currentMode = 'space'
    this._modeListenersSetup = false

    // Store handler references for proper cleanup
    this._profileSwitchedHandler = null
    this._responseDetachFunction = null

    // ---------------------------------------------------------
    // Register Request/Response handlers for environment switching
    // ---------------------------------------------------------
    if (this.eventBus) {
      this._responseDetachFunction = respond(this.eventBus, 'environment:switch', ({ mode } = {}) => {
        if (mode) {
          this.switchMode(mode)
          return { success: true, mode: this._currentMode }
        }
        return { success: false, error: 'No mode provided' }
      })
    }
  }

  /**
   * Initialize the service
   */
  init() {
    super.init()
    this.setupEventListeners()
    // Immediately sync current environment from profile so components get
    // the correct mode before first render. This covers initial page loads
    // where the profile starts in 'alias' (or any non-default) mode.
    if (this.profileService && typeof this.profileService.getCurrentProfile === 'function') {
      const profile = this.profileService.getCurrentProfile()
      if (profile) this.initializeFromProfile(profile)
    }
  }

  /**
   * Get current mode
   */
  get currentMode() {
    return this._currentMode
  }

  /**
   * Set current mode (triggers mode switch)
   */
  set currentMode(mode) {
    this.switchMode(mode)
  }

  /**
   * Get current environment (alias for currentMode)
   */
  get currentEnvironment() {
    return this._currentMode
  }

  /**
   * Set current environment (alias for currentMode)
   */
  set currentEnvironment(mode) {
    this.switchMode(mode)
  }

  /**
   * Setup event listeners for mode changes
   */
  setupEventListeners() {
    if (this._modeListenersSetup) {
      return
    }

    // Create handler functions and store references for cleanup
    this._profileSwitchedHandler = (data) => {
      if (data.environment) {
        this.switchMode(data.environment)
      }
    }

    // Listen for profile switches to update mode
    this.eventBus.on('profile-switched', this._profileSwitchedHandler)
    
    // Note: No longer listening to 'environment:changed' to prevent circular dependency.
    // Environment switching now happens via request-response pattern with 'environment:switch' topic.

    this._modeListenersSetup = true
  }

  /**
   * Switch to a new mode
   */
  switchMode(mode) {   
    if (mode === this._currentMode) {
      return
    }

    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`[InterfaceModeService] switchMode from ${this._currentMode} to ${mode}`)
    }

    const oldMode = this._currentMode
    this._currentMode = mode

    // Update profile data
    this.updateProfileMode(mode)

    // Emit plain events for state change and legacy compatibility
    this.eventBus.emit('environment:changed', {
      environment: mode
    })
  }

  /**
   * Update profile mode in storage and profile service
   */
  updateProfileMode(mode) {
    try {
      // Update profile service if available
      if (this.profileService) {
        this.profileService.setCurrentEnvironment(mode)
      }

      // Update profile data if we have a current profile
      if (this.app?.currentProfile && this.storage) {
        const profile = this.storage.getProfile(this.app.currentProfile)
        if (profile) {
          profile.currentEnvironment = mode
          this.storage.saveProfile(this.app.currentProfile, profile)
        }
      }
    } catch (error) {
      console.error('[InterfaceModeService] Failed to update profile mode:', error)
    }
  }

  /**
   * Get current mode
   */
  getCurrentMode() {
    return this._currentMode
  }

  /**
   * Set current mode (alias for switchMode)
   */
  setCurrentMode(mode) {
    this.switchMode(mode)
  }

  /**
   * Initialize mode from profile data
   */
  initializeFromProfile(profile) {
    if (profile?.currentEnvironment) {
      const prev = this._currentMode
      this._currentMode = profile.currentEnvironment

      // Always broadcast environment during initialization to ensure UI components
      // get the correct initial state, even if it matches the default value
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[InterfaceModeService] Broadcasting initial environment: ${this._currentMode} (from profile initialization)`)
      }
      
      this.eventBus.emit('environment:changed', {
        environment: this._currentMode,
        isInitialization: true
      })
    }
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    if (this._modeListenersSetup) {
      // Properly remove event listeners using stored handler references
      this.eventBus.off('profile-switched', this._profileSwitchedHandler)
      this._modeListenersSetup = false
    }

    // Clean up request/response handler
    if (this._responseDetachFunction) {
      this._responseDetachFunction()
      this._responseDetachFunction = null
    }

    super.destroy()
  }

  /**
   * Provide serialisable snapshot representing current mode
   */
  getCurrentState () {
    return {
      currentMode: this._currentMode,
      environment: this._currentMode,
      currentEnvironment: this._currentMode // Add both keys for compatibility
    }
  }

  /**
   * Handle initial state from other components during late-join handshake
   */
  handleInitialState(sender, state) {
    if (!state) return
    
    if (sender === 'ProfileService' && state.currentEnvironment) {
      // Initialize from ProfileService environment without triggering events
      this._currentMode = state.currentEnvironment
    }
  }
} 