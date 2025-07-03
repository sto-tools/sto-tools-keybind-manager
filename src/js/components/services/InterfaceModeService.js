import ComponentBase from '../ComponentBase.js'
import { respond, request } from '../../core/requestResponse.js'

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
    this._currentProfileId = null  // Cache profile ID from late-join state sync
    this._modeListenersSetup = false

    // Store handler references for proper cleanup
    this._profileSwitchedHandler = null
    this._responseDetachFunction = null

    // ---------------------------------------------------------
    // Register Request/Response handlers for environment switching
    // ---------------------------------------------------------
    if (this.eventBus) {
      this._responseDetachFunction = this.respond('environment:switch', async ({ mode } = {}) => {
        if (mode) {
          await this.switchMode(mode)
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
    // Note: Initial environment state will be received via the late-join handshake
    // from DataCoordinator. This replaces the old getCurrentProfile() approach
    // which was removed during the refactoring to the broadcast/cache pattern.
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
    this.switchMode(mode).catch(error => {
      console.error('[InterfaceModeService] Error in currentMode setter:', error)
    })
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
    this.switchMode(mode).catch(error => {
      console.error('[InterfaceModeService] Error in currentEnvironment setter:', error)
    })
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
      // Update cached profile ID when profile switches
      if (data.profileId) {
        this._currentProfileId = data.profileId
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.log(`[InterfaceModeService] Updated cached profile ID from profile switch: ${this._currentProfileId}`)
        }
      }
      
      if (data.environment) {
        this.switchMode(data.environment).catch(error => {
          console.error('[InterfaceModeService] Error in profile switched handler:', error)
        })
      }
    }

    // Listen for profile switches to update mode
    this.eventBus.on('profile:switched', this._profileSwitchedHandler)
    
    // Note: No longer listening to 'environment:changed' to prevent circular dependency.
    // Environment switching now happens via request-response pattern with 'environment:switch' topic.

    this._modeListenersSetup = true
  }

  /**
   * Switch to a new mode
   */
  async switchMode(mode) {   
    if (mode === this._currentMode) {
      return
    }

    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`[InterfaceModeService] switchMode from ${this._currentMode} to ${mode}`)
    }

    const oldMode = this._currentMode
    this._currentMode = mode

    // Update profile data and wait for storage completion to prevent race conditions
    try {
      await this.updateProfileMode(mode)
    } catch (error) {
      console.error('[InterfaceModeService] Failed to persist environment change:', error)
    }

    // Emit environment change AFTER storage operation completes
    this.emit('environment:changed', {
      environment: mode
    })
  }

  /**
   * Update profile mode in storage and profile service
   */
  async updateProfileMode(mode) {
    if (!this._currentProfileId) {
      console.warn('[InterfaceModeService] Cannot update profile mode: no current profile ID')
      return
    }

    console.log(`[InterfaceModeService] updateProfileMode called with mode: ${mode}`)
    console.log(`[InterfaceModeService] Current profile ID: ${this._currentProfileId}`)

    try {
      // Update profile with new environment using explicit operations API
      const result = await this.request('data:update-profile', {
        profileId: this._currentProfileId,
        properties: {
          currentEnvironment: mode
        }
      })

      if (result?.success) {
        console.log(`[InterfaceModeService] Environment persisted to storage: ${mode} for profile: ${this._currentProfileId}`)
      } else {
        console.error('[InterfaceModeService] Failed to persist environment:', result)
      }
    } catch (error) {
      console.error('[InterfaceModeService] Error updating profile mode:', error)
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
  async setCurrentMode(mode) {
    await this.switchMode(mode)
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
      
      this.emit('environment:changed', {
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
      this.eventBus.off('profile:switched', this._profileSwitchedHandler)
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
    
    if ((sender === 'DataCoordinator' || sender === 'ProfileService') && state.currentEnvironment) {
      // Cache the current profile ID for later use in persistence operations
      if (state.currentProfile) {
        this._currentProfileId = state.currentProfile
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.log(`[InterfaceModeService] Cached profile ID from ${sender}: ${this._currentProfileId}`)
        }
      }
      
      // Initialize from DataCoordinator environment state
      const previousMode = this._currentMode
      this._currentMode = state.currentEnvironment
      
      // Always broadcast environment during initialization to ensure UI components
      // get the correct initial state, even if it matches the default value
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[InterfaceModeService] Broadcasting initial environment: ${this._currentMode} (from ${sender} late-join handshake)`)
      }
      
      this.emit('environment:changed', {
        environment: this._currentMode,
        isInitialization: true
      })
    }
  }
} 