import ComponentBase from '../ComponentBase.js'

/**
 * InterfaceModeService - Handles mode switching logic and state management
 * Manages space/ground/alias mode transitions and profile environment updates
 */
export default class InterfaceModeService extends ComponentBase {
  constructor({ eventBus, storage, profileService, app }) {
    super(eventBus)
    this.storage = storage
    this.profileService = profileService
    this.app = app
    
    // Internal state
    this._currentMode = 'space'
    this._modeListenersSetup = false
  }

  /**
   * Initialize the service
   */
  init() {
    super.init()
    this.setupEventListeners()
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

    // Listen for mode switch events
    this.eventBus.on('mode-switched', (data) => {
      this.switchMode(data.mode)
    })

    // Listen for profile switches to update mode
    this.eventBus.on('profile-switched', (data) => {
      if (data.environment) {
        this.switchMode(data.environment)
      }
    })

    this._modeListenersSetup = true
  }

  /**
   * Switch to a new mode
   */
  switchMode(mode) {   
    if (mode === this._currentMode) {
      return
    }

    const oldMode = this._currentMode
    this._currentMode = mode

    // Update profile data
    this.updateProfileMode(mode)

    // Emit mode change event
    this.eventBus.emit('mode-changed', {
      oldMode,
      newMode: mode
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
      this._currentMode = profile.currentEnvironment
    }
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    if (this._modeListenersSetup) {
      this.eventBus.off('mode-switched')
      this.eventBus.off('profile-switched')
      this._modeListenersSetup = false
    }
    super.destroy()
  }
} 