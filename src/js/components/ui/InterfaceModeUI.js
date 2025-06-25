import ComponentBase from '../ComponentBase.js'

/**
 * InterfaceModeUI - Handles mode toggle button UI and display updates
 * Owns the space/ground/alias toggle buttons and manages their visual state
 */
export default class InterfaceModeUI extends ComponentBase {
  constructor({ service, eventBus, ui, profileUI, document }) {
    super(eventBus)
    this.service = service
    this.ui = ui
    this.profileUI = profileUI
    this.document = document || global.document
    
    // Internal state
    this._uiListenersSetup = false
    this._modeButtons = {}
  }

  /**
   * Initialize the UI component
   */
  init() {
    super.init()
    this.setupEventListeners()
    this.setupModeButtons()
    // Reflect the current mode immediately so the correct
    // selector (key vs alias) is visible on first load.
    this.updateModeUI(this.currentMode)
  }

  /**
   * Setup event listeners for mode changes
   */
  setupEventListeners() {
    if (this._uiListenersSetup) {
      return
    }

    // Listen for mode change events from service
    this.eventBus.on('mode-changed', (data) => {
      this.updateModeUI(data.newMode)
    })

    // Also respond to generic environment change events that other services
    // emit (InterfaceModeService uses this topic as its primary broadcast).
    this.eventBus.on('environment:changed', (d = {}) => {
      const env = typeof d === 'string' ? d : d.environment || d.newMode || d.mode
      if (env) this.updateModeUI(env)
    })

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
  handleModeButtonClick(mode) {
    // Emit mode switch event
    this.eventBus.emit('mode-switched', { mode })
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
      this.profileUI.renderCommandChain()
    }
  }

  /**
   * Get current mode from service
   */
  get currentMode() {
    return this.service?.currentMode || 'space'
  }

  /**
   * Set current mode (delegates to service)
   */
  set currentMode(mode) {
    if (this.service) {
      this.service.currentMode = mode
    }
  }

  /**
   * Get current environment (alias for currentMode)
   */
  get currentEnvironment() {
    return this.currentMode
  }

  /**
   * Set current environment (alias for currentMode)
   */
  set currentEnvironment(mode) {
    this.currentMode = mode
  }

  /**
   * Update mode UI (public method for external calls)
   */
  updateModeUIState() {
    this.updateModeUI(this.currentMode)
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
  setCurrentMode(mode) {
    this.currentMode = mode
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    if (this._uiListenersSetup) {
      this.eventBus.off('mode-changed')
      this.eventBus.off('environment:changed')
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