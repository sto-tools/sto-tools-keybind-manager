import ComponentBase from '../ComponentBase.js'
import { request } from '../../core/requestResponse.js'

/**
 * InterfaceModeUI - Handles mode toggle button UI and display updates
 * Owns the space/ground/alias toggle buttons and manages their visual state
 */
export default class InterfaceModeUI extends ComponentBase {
  constructor({ eventBus: bus, ui = null, profileUI = null, document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(bus)
    this.componentName = 'InterfaceModeUI'
    this.ui = ui || (typeof stoUI !== 'undefined' ? stoUI : null)
    this.profileUI = profileUI
    this.document = document
    
    // Internal cached state
    this._currentMode = 'space'
    
    // Internal state
    this._uiListenersSetup = false
    this._modeButtons = {}

    // Store handler references for proper cleanup
    this._modeChangedHandler = null
    this._environmentChangedHandler = null
  }

  /**
   * Initialize the UI component
   */
  init() {
    super.init()
    this.setupEventListeners()
    this.setupModeButtons()

    // NOTE: Do NOT eagerly call updateModeUI here. We need to wait until we
    // receive the first environment state either via
    //  1) environment:changed event that InterfaceModeService emits during
    //     its initialization, or
    //  2) the late-join handshake snapshot delivered through handleInitialState.
    // Triggering an immediate render with the hard-coded default ("space")
    // causes the UI to flash the key browser – and, more critically, can
    // leave the application stuck in an inconsistent key-mode state – when
    // the *actual* starting environment is "alias".  Deferring the initial
    // render ensures the correct selector (keys vs. aliases) is shown from
    // the very first paint.
  }

  /**
   * Setup event listeners for mode changes
   */
  setupEventListeners() {
    if (this._uiListenersSetup) {
      return
    }

    // Create handler functions and store references for cleanup
    this._modeChangedHandler = (data) => {
      const env = typeof data === 'string' ? data : data?.newMode
      if (env) {
        this._currentMode = env
        this.updateModeUI(env)
      }
    }

    this._environmentChangedHandler = (d = {}) => {
      const env = typeof d === 'string' ? d : d.environment || d.newMode || d.mode
      if (env) {
        this._currentMode = env
        this.updateModeUI(env)
      }
    }

    // Listen for mode change events from service
    this.eventBus.on('mode-changed', this._modeChangedHandler)

    // Also respond to generic environment change events that other services
    // emit (InterfaceModeService uses this topic as its primary broadcast).
    this.eventBus.on('environment:changed', this._environmentChangedHandler)

    this._uiListenersSetup = true
  }

  /**
   * Setup mode toggle buttons and their click handlers
   */
  setupModeButtons() {
    // Find mode buttons
    this._modeButtons.space = this.document.querySelector('[data-mode="space"]')
    this._modeButtons.ground = this.document.querySelector('[data-mode="ground"]')
    this._modeButtons.alias = this.document.querySelector('[data-mode="alias"]')

    // Setup click handlers
    Object.entries(this._modeButtons).forEach(([mode, button]) => {
      if (button) {
        button.addEventListener('click', () => {
          this.handleModeButtonClick(mode)
        })
      } else {
        console.warn(`[InterfaceModeUI] Mode button for ${mode} not found`)
      }
    })
  }

  /**
   * Handle mode button clicks
   */
  async handleModeButtonClick(mode) {
    try {
      // Use request-response pattern to switch environment
      const result = await request(this.eventBus, 'environment:switch', { mode })
      if (!result.success) {
        console.error('[InterfaceModeUI] Failed to switch environment:', result.error)
      }
    } catch (error) {
      console.error('[InterfaceModeUI] Error switching environment:', error)
    }
  }

  /**
   * Update mode UI to reflect current mode
   */
  updateModeUI(currentMode) {
    // Update mode buttons
    Object.entries(this._modeButtons).forEach(([mode, button]) => {
      if (button) {
        button.classList.toggle('active', mode === currentMode)
      }
    })

    // Update key grid display
    this.updateKeyGridDisplay(currentMode)
  }

  /**
   * Update key grid display based on current mode
   */
  updateKeyGridDisplay(currentMode) {
    // Toggle visibility between key selector and alias selector depending on mode
    const keySelectorContainer = this.document.querySelector('.key-selector-container')
    const aliasSelectorContainer = this.document.getElementById('aliasSelectorContainer')

    if (currentMode === 'alias') {
      if (keySelectorContainer) keySelectorContainer.style.display = 'none'
      if (aliasSelectorContainer) aliasSelectorContainer.style.display = ''
    } else {
      // For space / ground modes show key selector and hide alias selector
      if (keySelectorContainer) keySelectorContainer.style.display = ''
      if (aliasSelectorContainer) aliasSelectorContainer.style.display = 'none'

      // Update key grid to show the correct environment's keybinds
      if (this.profileUI) {
        this.profileUI.renderKeyGrid()
      }
    }

    // Command chain is common to all modes; re-render every time.
    if (this.profileUI) {
              // Command chain rendering is now handled by CommandChainUI via events
    }
  }

  /**
   * Get current mode from service
   */
  get currentMode() {
    return this._currentMode
  }

  /**
   * Set current mode (delegates to service)
   */
  set currentMode(mode) {
    this._currentMode = mode
    // Use request-response pattern to switch environment
    request(this.eventBus, 'environment:switch', { mode }).catch(error => {
      console.error('[InterfaceModeUI] Error switching environment via setter:', error)
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
    this.currentMode = mode
  }

  /**
   * Get current mode (public method for external calls)
   */
  getCurrentMode() {
    return this.currentMode
  }

  /**
   * Set current mode (public method for external calls)
   */
  async setCurrentMode(mode) {
    try {
      // Use request-response pattern to switch environment
      const result = await request(this.eventBus, 'environment:switch', { mode })
      if (result.success) {
        this._currentMode = result.mode
        this.updateModeUI(result.mode)
      } else {
        console.error('[InterfaceModeUI] Failed to switch environment:', result.error)
      }
    } catch (error) {
      console.error('[InterfaceModeUI] Error switching environment:', error)
    }
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    if (this._uiListenersSetup) {
      // Properly remove event listeners using stored handler references
      this.eventBus.off('mode-changed', this._modeChangedHandler)
      this.eventBus.off('environment:changed', this._environmentChangedHandler)
      this._uiListenersSetup = false
    }

    // Remove click handlers from buttons
    Object.values(this._modeButtons).forEach(button => {
      if (button && button.removeEventListener) {
        button.removeEventListener('click', this.handleModeButtonClick)
      }
    })

    super.destroy()
  }

  /* ------------------------------------------------------------
   * Late-join handshake: keep UI in sync with service state even
   * if the relevant events fired before we registered.
   * ---------------------------------------------------------- */
  handleInitialState (sender, state) {
    if (!state) return
    if ((sender === 'InterfaceModeService' || state.environment) && state.environment) {
      this.updateModeUI(state.environment)
    }
  }
} 