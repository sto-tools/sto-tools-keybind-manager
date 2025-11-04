import ComponentBase from '../ComponentBase.js'

/**
 * InterfaceModeService - Handles mode switching logic and state management
 * Manages space/ground/alias mode transitions and profile environment updates
 */
export default class InterfaceModeService extends ComponentBase {
  constructor({ eventBus, storage, app }) {
    super(eventBus)
    this.componentName = 'InterfaceModeService'
    this.storage = storage
    this.app = app
    
    // Internal state
    this._currentMode = 'space'
    this._modeListenersSetup = false

    // Store handler references for proper cleanup
    this._profileSwitchedHandler = null
    this._responseDetachFunction = null

    // Register Request/Response handlers for environment switching
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

  onInit() {
    this.setupEventListeners()
  }

  // Get current mode
  get currentMode() {
    return this._currentMode
  }

  // Set current mode (triggers mode switch)
  set currentMode(mode) {
    this.switchMode(mode).catch(error => {
      console.error('[InterfaceModeService] Error in currentMode setter:', error)
    })
  }

  // Get current environment (alias for currentMode)
  get currentEnvironment() {
    return this._currentMode
  }

  // Set current environment (alias for currentMode)
  set currentEnvironment(mode) {
    this.switchMode(mode).catch(error => {
      console.error('[InterfaceModeService] Error in currentEnvironment setter:', error)
    })
  }

  // Setup event listeners for mode changes
  setupEventListeners() {
    if (this._modeListenersSetup) {
      return
    }

    // Create handler functions and store references for cleanup
    this._profileSwitchedHandler = (data) => {
      // ComponentBase handles profile ID caching automatically
      if (data.profileId && typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[InterfaceModeService] Profile switched to: ${data.profileId}`)
      }
      
      if (data.environment) {
        this.switchMode(data.environment).catch(error => {
          console.error('[InterfaceModeService] Error in profile switched handler:', error)
        })
      }
    }

    // Listen for profile switches to update mode
    this.eventBus.on('profile:switched', this._profileSwitchedHandler)
    
    this._modeListenersSetup = true
  }

  // Switch to a new mode
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

    // Emit environment change synchronously AFTER storage operation completes
    this.emit('environment:changed', {
      environment: mode,
      toEnvironment: mode,
      fromEnvironment: oldMode
    }, { synchronous: true })
  }

  // Update profile mode in storage and profile service
  async updateProfileMode(mode) {
    if (!this.cache.currentProfile) {
      console.warn('[InterfaceModeService] Cannot update profile mode: no current profile ID')
      return
    }

    console.log(`[InterfaceModeService] updateProfileMode called with mode: ${mode}`)
    console.log(`[InterfaceModeService] Current profile ID: ${this.cache.currentProfile}`)

    try {
      // Update profile with new environment using explicit operations API
      const result = await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        properties: {
          currentEnvironment: mode
        }
      })

      if (result?.success) {
        console.log(`[InterfaceModeService] Environment persisted to storage: ${mode} for profile: ${this.cache.currentProfile}`)
      } else {
        console.error('[InterfaceModeService] Failed to persist environment:', result)
      }
    } catch (error) {
      console.error('[InterfaceModeService] Error updating profile mode:', error)
    }
  }

  // Get current mode
  getCurrentMode() {
    return this._currentMode
  }

  // Set current mode (alias for switchMode)
  async setCurrentMode(mode) {
    await this.switchMode(mode)
  }

  // Initialize mode from profile data
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
      }, { synchronous: true })
    }
  }

  // Cleanup event listeners
  onDestroy() {
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
  }

  // Provide serialisable snapshot representing current mode
  getCurrentState () {
    return {
      currentMode: this._currentMode,
      environment: this._currentMode,
      currentEnvironment: this._currentMode // Add both keys for compatibility
    }
  }

  // Handle initial state from other components during late-join handshake
  handleInitialState(sender, state) {
    if (!state) return
    
    // Initialize mode from DataCoordinator environment data
    if (sender === 'DataCoordinator') {
      // Extract environment from profile data or state
      const env = state.currentEnvironment || (state.currentProfileData && state.currentProfileData.currentEnvironment)
      if (env) {
        const previousMode = this._currentMode
        this._currentMode = env
        
        // Emit environment change synchronously if mode actually changed
        if (previousMode !== this._currentMode) {
          this.emit('environment:changed', {
            environment: this._currentMode,
            isInitialization: true
          }, { synchronous: true })
        }
      }
    }
  }
} 
