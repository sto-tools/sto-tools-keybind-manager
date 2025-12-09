import ComponentBase from '../ComponentBase.js'

/**
 * GamepadCaptureService - Service for managing Gamepad API interactions and
 * capturing gamepad inputs for keybind configuration. Extends ComponentBase
 * to integrate with the existing request/response system and event bus.
 *
 * This service provides gamepad detection, input polling, and state management
 * while coordinating with the existing KeyCaptureService for unified input
 * capture across keyboard, mouse, and gamepad devices.
 *
 * Features:
 * - Automatic gamepad detection and connection monitoring
 * - 60Hz requestAnimationFrame polling for responsive input detection
 * - Configurable deadzones and thresholds for analog inputs
 * - Support for standard and non-standard controller mappings
 * - Integration with existing chord-capture event system
 * - Availability guard for secure context and Gamepad API support
 */
export default class GamepadCaptureService extends ComponentBase {
  constructor({ eventBus = null, i18n } = {}) {
    super(eventBus)
    this.componentName = 'GamepadCaptureService'
    this.i18n = i18n

    // Runtime state
    this.isCapturing = false
    this.connectedGamepads = new Map()
    this.activeGamepadIndex = null
    this.pollFrameId = null
    this.deadzone = 0.15
    this.triggerThreshold = 0.1
    this.isAvailable = false

    // Custom button mappings for non-standard controllers
    this.customMappings = new Map()

    // Calibration state
    this.isCalibrating = false
    this.calibrationGamepadIndex = null
    this.calibrationStep = null
    this.calibrationSteps = []
    this.calibrationCallback = null

    // Event handlers bound for proper cleanup
    this.boundGamepadConnected = this.handleGamepadConnected.bind(this)
    this.boundGamepadDisconnected = this.handleGamepadDisconnected.bind(this)
  }

  /**
   * Initialize the service and set up gamepad support
   */
  onInit() {
    this.checkAvailability()
    if (this.isAvailable) {
      this.setupGamepadEventListeners()
      this.scanInitialGamepads()
      this.loadCustomMappings()
    }

    // Register request/response endpoints
    this.respond('gamepad:start-capture', this.startCapture.bind(this))
    this.respond('gamepad:stop-capture', this.stopCapture.bind(this))
    this.respond('gamepad:get-connected', this.getConnectedGamepads.bind(this))
    this.respond('gamepad:select-active', this.selectActiveGamepad.bind(this))
    this.respond('gamepad:set-deadzone', this.setDeadzone.bind(this))
    this.respond('gamepad:start-calibration', this.startCalibration.bind(this))
    this.respond('gamepad:calibrate-button', this.calibrateButton.bind(this))
    this.respond('gamepad:cancel-calibration', this.cancelCalibration.bind(this))
    this.respond('gamepad:get-custom-mapping', this.getCustomMapping.bind(this))
    this.respond('gamepad:clear-custom-mapping', this.clearCustomMapping.bind(this))
    this.respond('gamepad:get-modifiers', this.getModifiers.bind(this))
  }

  /**
   * Check if Gamepad API is available in current context
   * Mirrors the availability guard pattern from other services
   */
  checkAvailability() {
    // Check if we're in a secure context (required for Gamepad API)
    if (typeof window === 'undefined') {
      this.isAvailable = false
      return
    }

    if (window.isSecureContext === false) {
      // Insecure context - Gamepad API not available
      this.isAvailable = false
      this.emit('gamepad-unavailable', { reason: 'insecure_context' })
      this.emitGamepadUnavailableMessage('insecure_context')
      return
    }

    // Check if Gamepad API is supported
    if (!navigator.getGamepads) {
      this.isAvailable = false
      this.emit('gamepad-unavailable', { reason: 'unsupported' })
      this.emitGamepadUnavailableMessage('unsupported')
      return
    }

    this.isAvailable = true
  }

  /**
   * Emit user-facing message about gamepad unavailability
   * @param {string} reason - The reason for unavailability
   */
  emitGamepadUnavailableMessage(reason) {
    let messageKey
    switch (reason) {
      case 'insecure_context':
        messageKey = 'gamepad_unavailable_secure_context'
        break
      case 'unsupported':
        messageKey = 'gamepad_unsupported'
        break
      default:
        messageKey = 'gamepad_unavailable'
    }

    this.emit('toast:show', {
      message: this.i18n.t(messageKey),
      type: 'warning'
    })
  }

  /**
   * Set up event listeners for gamepad connection/disconnection
   */
  setupGamepadEventListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', this.boundGamepadConnected)
      window.addEventListener('gamepaddisconnected', this.boundGamepadDisconnected)
    }
  }

  /**
   * Remove gamepad event listeners
   */
  removeGamepadEventListeners() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('gamepadconnected', this.boundGamepadConnected)
      window.removeEventListener('gamepaddisconnected', this.boundGamepadDisconnected)
    }
  }

  /**
   * Scan for initially connected gamepads
   */
  scanInitialGamepads() {
    const gamepads = navigator.getGamepads()
    for (let i = 0; i < gamepads.length; i++) {
      const gamepad = gamepads[i]
      if (gamepad) {
        this.handleGamepadConnection(gamepad)
      }
    }
  }

  /**
   * Handle gamepad connection event
   * @param {GamepadEvent} event - The gamepad connection event
   */
  handleGamepadConnected(event) {
    this.handleGamepadConnection(event.gamepad)
  }

  /**
   * Handle gamepad connection
   * @param {Gamepad} gamepad - The connected gamepad
   */
  handleGamepadConnection(gamepad) {
    const gamepadInfo = {
      id: gamepad.id,
      index: gamepad.index,
      mapping: gamepad.mapping || '',
      connected: gamepad.connected,
      type: this.detectGamepadType(gamepad),
      activeInputs: [],
      lastState: this.cloneGamepadState(gamepad)
    }

    this.connectedGamepads.set(gamepad.index, gamepadInfo)
    this.emit('gamepad:connected', { gamepad: gamepadInfo })

    // Set as active if it's the first gamepad
    if (this.activeGamepadIndex === null) {
      this.activeGamepadIndex = gamepad.index
      this.emit('gamepad:active-changed', { gamepadIndex: gamepad.index })
    }
  }

  /**
   * Handle gamepad disconnection event
   * @param {GamepadEvent} event - The gamepad disconnection event
   */
  handleGamepadDisconnected(event) {
    this.handleGamepadDisconnection(event.gamepad)
  }

  /**
   * Handle gamepad disconnection
   * @param {Gamepad} gamepad - The disconnected gamepad
   */
  handleGamepadDisconnection(gamepad) {
    const gamepadInfo = this.connectedGamepads.get(gamepad.index)
    if (gamepadInfo) {
      this.connectedGamepads.delete(gamepad.index)
      this.emit('gamepad:disconnected', { gamepad: gamepadInfo })

      // Update active gamepad if necessary
      if (this.activeGamepadIndex === gamepad.index) {
        this.activeGamepadIndex = this.connectedGamepads.size > 0
          ? this.connectedGamepads.keys().next().value
          : null

        this.emit('gamepad:active-changed', {
          gamepadIndex: this.activeGamepadIndex,
          gamepadsLeft: this.connectedGamepads.size
        })
      }
    }
  }

  /**
   * Detect gamepad type based on mapping and identifier
   * @param {Gamepad} gamepad - The gamepad to analyze
   * @returns {string} - The detected type ('gamepad', 'joystick', 'generic')
   */
  detectGamepadType(gamepad) {
    const id = gamepad.id.toLowerCase()

    if (gamepad.mapping === 'standard') {
      return 'gamepad'
    }

    // Look for joystick indicators in the name
    if (id.includes('joystick') || id.includes('flight') || id.includes('stick')) {
      return 'joystick'
    }

    return 'generic'
  }

  /**
   * Create a clone of gamepad state for comparison
   * @param {Gamepad} gamepad - The gamepad to clone
   * @returns {Object} - Cloned state
   */
  cloneGamepadState(gamepad) {
    return {
      buttons: gamepad.buttons.map(button => ({ pressed: button.pressed, value: button.value })),
      axes: [...gamepad.axes],
      timestamp: gamepad.timestamp
    }
  }

  /**
   * Load custom button mappings from localStorage
   */
  loadCustomMappings() {
    try {
      const stored = localStorage.getItem('gamepad-custom-mappings')
      if (stored) {
        const mappings = JSON.parse(stored)
        this.customMappings = new Map(Object.entries(mappings))
      }
    } catch (error) {
      console.warn('Failed to load custom gamepad mappings:', error)
    }
  }

  /**
   * Save custom button mappings to localStorage
   */
  saveCustomMappings() {
    try {
      const mappings = Object.fromEntries(this.customMappings)
      localStorage.setItem('gamepad-custom-mappings', JSON.stringify(mappings))
    } catch (error) {
      console.warn('Failed to save custom gamepad mappings:', error)
    }
  }

  /**
   * Start the 60Hz polling loop for gamepad input detection
   * Uses requestAnimationFrame for optimal performance and browser synchronization
   */
  startPolling() {
    // Ensure any existing polling is stopped first
    this.stopPolling()

    // Bound method for requestAnimationFrame callback
    this.boundPollGamepads = this.pollGamepads.bind(this)

    // Start the polling loop
    this.pollFrameId = requestAnimationFrame(this.boundPollGamepads)
    console.log('GamepadCaptureService: Started 60Hz polling loop')
  }

  /**
   * Stop the polling loop and clean up frame tracking
   */
  stopPolling() {
    if (this.pollFrameId) {
      cancelAnimationFrame(this.pollFrameId)
      this.pollFrameId = null
    }

    // Clean up bound method reference
    this.boundPollGamepads = null

    console.log('GamepadCaptureService: Stopped polling loop')
  }

  /**
   * Main polling loop method called via requestAnimationFrame
   * Runs at approximately 60Hz to detect gamepad input changes
   * This method is called continuously during capture to monitor all connected gamepads
   */
  pollGamepads() {
    // Early exit if capture is no longer active
    if (!this.isCapturing) {
      return
    }

    // Get current gamepad states from the browser
    const gamepads = navigator.getGamepads()

    // Process each connected gamepad
    for (let i = 0; i < gamepads.length; i++) {
      const gamepad = gamepads[i]

      // Skip disconnected gamepads
      if (!gamepad) {
        continue
      }

      // Only process the active gamepad for input capture
      if (this.activeGamepadIndex !== null && i === this.activeGamepadIndex) {
        this.processGamepadInput(gamepad)
      }

      // Update gamepad connection state
      this.updateGamepadState(gamepad)
    }

    // Schedule the next frame
    this.pollFrameId = requestAnimationFrame(this.boundPollGamepads)
  }

  /**
   * Process input from a gamepad with deadzone and threshold detection
   * @param {Gamepad} gamepad - The gamepad to process input from
   */
  processGamepadInput(gamepad) {
    const gamepadInfo = this.connectedGamepads.get(gamepad.index)
    if (!gamepadInfo || !gamepadInfo.lastState) {
      return
    }

    const lastState = gamepadInfo.lastState
    const activeInputs = []
    let hasInputChange = false

    // Process buttons - check for state changes with trigger threshold
    gamepad.buttons.forEach((button, index) => {
      const lastButton = lastState.buttons[index]
      const isCurrentlyPressed = button.pressed || button.value >= this.triggerThreshold
      const wasPreviouslyPressed = lastButton.pressed || lastButton.value >= this.triggerThreshold

      // Detect state change
      if (isCurrentlyPressed !== wasPreviouslyPressed) {
        hasInputChange = true

        const input = {
          type: 'button',
          index: index,
          value: button.value,
          pressed: isCurrentlyPressed,
          threshold: this.triggerThreshold,
          name: this.getButtonName(index, gamepad),
          standardMapping: gamepad.mapping === 'standard',
          chordName: this.getButtonChordName(index, gamepad)
        }

        if (isCurrentlyPressed) {
          activeInputs.push(input)
          this.emit('gamepad:button-pressed', {
            gamepadIndex: gamepad.index,
            input: input,
            timestamp: gamepad.timestamp
          })

          // Emit chord-captured event for mixed input support
          this.emitChordCaptured(activeInputs, gamepad)
        } else {
          this.emit('gamepad:button-released', {
            gamepadIndex: gamepad.index,
            input: input,
            timestamp: gamepad.timestamp
          })
        }
      }
    })

    // Process axes - check for changes beyond deadzone
    gamepad.axes.forEach((axisValue, index) => {
      const lastAxisValue = lastState.axes[index] || 0
      const isCurrentlyActive = Math.abs(axisValue) >= this.deadzone
      const wasPreviouslyActive = Math.abs(lastAxisValue) >= this.deadzone

      // Detect significant axis change (beyond deadzone)
      if (isCurrentlyActive !== wasPreviouslyActive ||
          (isCurrentlyActive && Math.abs(axisValue - lastAxisValue) >= 0.01)) {
        hasInputChange = true

        const input = {
          type: 'axis',
          index: index,
          value: axisValue,
          pressed: isCurrentlyActive,
          threshold: this.deadzone,
          name: this.getAxisName(index, gamepad),
          standardMapping: gamepad.mapping === 'standard',
          chordName: this.getAxisChordName(index, axisValue, gamepad)
        }

        if (isCurrentlyActive) {
          activeInputs.push(input)
          this.emit('gamepad:axis-moved', {
            gamepadIndex: gamepad.index,
            input: input,
            timestamp: gamepad.timestamp
          })

          // Emit chord-captured event for mixed input support
          this.emitChordCaptured(activeInputs, gamepad)
        } else {
          this.emit('gamepad:axis-centered', {
            gamepadIndex: gamepad.index,
            input: input,
            timestamp: gamepad.timestamp
          })
        }
      }
    })

    // Update active inputs for this gamepad
    gamepadInfo.activeInputs = activeInputs
    this.connectedGamepads.set(gamepad.index, gamepadInfo)

    // Emit state update for UI synchronization
    if (hasInputChange) {
      this.emit('gamepad:state-update', {
        gamepadIndex: gamepad.index,
        timestamp: gamepad.timestamp,
        connected: gamepad.connected,
        activeInputs: activeInputs
      })
    }
  }

  /**
   * Emit chord-captured event with proper STO key names matching existing KeyCaptureService format
   * Integrates with keyboard modifiers for mixed input chords
   * @param {Array} gamepadInputs - Array of active gamepad inputs
   * @param {Gamepad} gamepad - The gamepad object
   */
  emitChordCaptured(gamepadInputs, gamepad) {
    if (!gamepadInputs || gamepadInputs.length === 0) {
      return
    }

    // Get keyboard modifiers from KeyCaptureService via request/response
    // This enables mixed keyboard+gamepad input combinations
    this.request('keycapture:get-modifiers').then(modifiers => {
      const modifierCodes = modifiers || []

      // Convert gamepad inputs to chord codes using STO key names
      const gamepadCodes = gamepadInputs.map(input => {
        if (input.chordName) {
          return input.chordName
        }
        // Fallback for unmapped inputs
        return input.type === 'button' ? `Joy${input.index + 1}` : `Axis${input.index + 1}`
      })

      // Combine modifiers and gamepad inputs
      const allCodes = [...modifierCodes, ...gamepadCodes]

      // Create chord string following KeyCaptureService pattern
      const chord = this.createChordString(allCodes)

      // Emit chord-captured event matching KeyCaptureService format
      this.emit('chord-captured', {
        chord: chord,
        context: 'keySelectionModal', // Same context as KeyCaptureService
        source: 'gamepad',
        gamepadIndex: gamepad.index,
        gamepadInputs: gamepadInputs,
        timestamp: gamepad.timestamp
      })
    }).catch(error => {
      // If KeyCaptureService is not available, still emit gamepad-only chord
      console.warn('GamepadCaptureService: Could not get keyboard modifiers:', error)

      // Convert gamepad inputs to chord codes using STO key names
      const gamepadCodes = gamepadInputs.map(input => {
        if (input.chordName) {
          return input.chordName
        }
        // Fallback for unmapped inputs
        return input.type === 'button' ? `Joy${input.index + 1}` : `Axis${input.index + 1}`
      })

      // Create chord string following KeyCaptureService pattern
      const chord = this.createChordString(gamepadCodes)

      // Emit chord-captured event matching KeyCaptureService format
      this.emit('chord-captured', {
        chord: chord,
        context: 'keySelectionModal', // Same context as KeyCaptureService
        source: 'gamepad',
        gamepadIndex: gamepad.index,
        gamepadInputs: gamepadInputs,
        timestamp: gamepad.timestamp
      })
    })
  }

  /**
   * Create chord string from array of input codes following KeyCaptureService pattern
   * @param {Array} codes - Array of input codes (modifiers + gamepad inputs)
   * @returns {string} - Formatted chord string
   */
  createChordString(codes) {
    if (!codes || codes.length === 0) {
      return ''
    }

    // Sort codes to ensure consistent ordering
    // Modifiers first, then gamepad inputs
    const sortedCodes = [...codes].sort((a, b) => {
      // Keyboard modifiers come first
      const modifiers = ['Ctrl', 'Alt', 'Shift', 'Meta']
      const aIsModifier = modifiers.some(mod => a.includes(mod))
      const bIsModifier = modifiers.some(mod => b.includes(mod))

      if (aIsModifier && !bIsModifier) return -1
      if (!aIsModifier && bIsModifier) return 1

      // Sort alphabetically within each category
      return a.localeCompare(b)
    })

    return sortedCodes.join('+')
  }

  /**
   * Get display name for a button based on standard mapping or index
   * @param {number} buttonIndex - The button index
   * @param {Gamepad} gamepad - The gamepad object
   * @returns {string} - Display name for the button
   */
  getButtonName(buttonIndex, gamepad) {
    if (gamepad.mapping === 'standard') {
      const standardButtonNames = [
        'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT',
        'Select', 'Start', 'LS', 'RS', 'D-pad Up', 'D-pad Down',
        'D-pad Left', 'D-pad Right'
      ]
      return standardButtonNames[buttonIndex] || `Button ${buttonIndex}`
    }
    return `Button ${buttonIndex}`
  }

  /**
   * Get chord name for a button mapped to STO key names
   * @param {number} buttonIndex - The button index
   * @param {Gamepad} gamepad - The gamepad object
   * @returns {string} - Chord name for the button matching STO_KEY_NAMES
   */
  getButtonChordName(buttonIndex, gamepad) {
    if (gamepad.mapping === 'standard') {
      // Standard gamepad button mapping to STO key names
      // Based on the Gamepad API standard mapping
      const standardButtonMapping = {
        0: 'Joy1',   // A button (bottom face button)
        1: 'Joy2',   // B button (right face button)
        2: 'Joy3',   // X button (left face button)
        3: 'Joy4',   // Y button (top face button)
        4: 'Joy5',   // LB (left bumper/shoulder)
        5: 'Joy6',   // RB (right bumper/shoulder)
        6: 'Joy7',   // LT (left trigger - digital press)
        7: 'Joy8',   // RT (right trigger - digital press)
        8: 'Joy9',   // Select/Back/View button
        9: 'Joy10',  // Start/Forward/Menu button
        10: 'Joy11', // LS (left stick click)
        11: 'Joy12', // RS (right stick click)
        12: 'Joypad_up',    // D-pad Up
        13: 'Joypad_down',  // D-pad Down
        14: 'Joypad_left',  // D-pad Left
        15: 'Joypad_right'  // D-pad Right
      }

      return standardButtonMapping[buttonIndex] || `Joy${buttonIndex + 1}`
    }

    // Non-standard controller fallback - sequential Joy naming
    return `Joy${buttonIndex + 1}`
  }

  /**
   * Get display name for an axis based on standard mapping or index
   * @param {number} axisIndex - The axis index
   * @param {Gamepad} gamepad - The gamepad object
   * @returns {string} - Display name for the axis
   */
  getAxisName(axisIndex, gamepad) {
    if (gamepad.mapping === 'standard') {
      const standardAxisNames = [
        'Left Stick X', 'Left Stick Y', 'Right Stick X', 'Right Stick Y'
      ]
      return standardAxisNames[axisIndex] || `Axis ${axisIndex}`
    }
    return `Axis ${axisIndex}`
  }

  /**
   * Get chord name for an axis input with direction mapped to STO key names
   * @param {number} axisIndex - The axis index
   * @param {number} axisValue - The current axis value (-1 to 1)
   * @param {Gamepad} gamepad - The gamepad object
   * @returns {string} - Chord name for the axis input matching STO_KEY_NAMES
   */
  getAxisChordName(axisIndex, axisValue, gamepad) {
    if (gamepad.mapping === 'standard') {
      // Only return chord name if beyond deadzone
      if (Math.abs(axisValue) < this.deadzone) {
        return null
      }

      // Standard gamepad axis mapping to STO key names
      // Based on the Gamepad API standard mapping
      switch (axisIndex) {
        case 0: // Left Stick X-axis (horizontal)
          return axisValue > 0 ? 'Lstick_right' : 'Lstick_left'
        case 1: // Left Stick Y-axis (vertical)
          // Note: Gamepad API Y-axis is inverted (positive = down)
          return axisValue > 0 ? 'Lstick_down' : 'Lstick_up'
        case 2: // Right Stick X-axis (horizontal)
          return axisValue > 0 ? 'Rstick_right' : 'Rstick_left'
        case 3: // Right Stick Y-axis (vertical)
          // Note: Gamepad API Y-axis is inverted (positive = down)
          return axisValue > 0 ? 'Rstick_down' : 'Rstick_up'
        default:
          // Fallback for additional axes beyond the standard 4
          return `Axis${axisIndex + 1}_${axisValue > 0 ? 'positive' : 'negative'}`
      }
    }

    // Non-standard mapping - generic axis naming
    if (Math.abs(axisValue) >= this.deadzone) {
      return `Axis${axisIndex + 1}_${axisValue > 0 ? 'positive' : 'negative'}`
    }

    return null
  }

  /**
   * Update the stored state for a gamepad
   * @param {Gamepad} gamepad - The gamepad to update state for
   */
  updateGamepadState(gamepad) {
    const gamepadInfo = this.connectedGamepads.get(gamepad.index)
    if (gamepadInfo) {
      gamepadInfo.lastState = this.cloneGamepadState(gamepad)
      this.connectedGamepads.set(gamepad.index, gamepadInfo)
    }
  }

  /**
   * Start gamepad input capture
   * @returns {boolean} True if capture started successfully
   */
  startCapture() {
    if (!this.isAvailable) {
      console.warn('GamepadCaptureService: Cannot start capture - Gamepad API not available')
      return false
    }

    if (this.isCapturing) {
      console.warn('GamepadCaptureService: Capture already in progress')
      return true
    }

    this.isCapturing = true
    console.log('GamepadCaptureService: Started gamepad capture')
    this.emit('gamepad:capture-started', { isCapturing: true })

    // Start the polling loop for 60Hz input detection
    this.startPolling()
    return true
  }

  /**
   * Stop gamepad input capture
   * @returns {boolean} True if capture stopped successfully
   */
  stopCapture() {
    if (!this.isCapturing) {
      return true
    }

    this.isCapturing = false

    // Stop the polling loop
    this.stopPolling()

    console.log('GamepadCaptureService: Stopped gamepad capture')
    this.emit('gamepad:capture-stopped', { isCapturing: false })

    return true
  }

  /**
   * Get list of connected gamepads
   * @returns {Array} Array of connected gamepad information
   */
  getConnectedGamepads() {
    return Array.from(this.connectedGamepads.values()).map(gamepad => ({
      index: gamepad.index,
      id: gamepad.id,
      type: gamepad.type,
      mapping: gamepad.mapping,
      connected: gamepad.connected
    }))
  }

  /**
   * Select the active gamepad for capture
   * @param {Object} params - Parameters containing gamepad index
   * @param {number} params.gamepadIndex - Index of the gamepad to select
   * @returns {boolean} True if selection successful, false if gamepad not found
   */
  selectActiveGamepad({ gamepadIndex }) {
    if (this.connectedGamepads.has(gamepadIndex)) {
      const previousActiveIndex = this.activeGamepadIndex
      this.activeGamepadIndex = gamepadIndex

      console.log(`GamepadCaptureService: Selected active gamepad ${gamepadIndex}`)
      this.emit('gamepad:active-changed', {
        previousIndex: previousActiveIndex,
        activeIndex: gamepadIndex,
        gamepad: this.connectedGamepads.get(gamepadIndex)
      })

      return true
    } else {
      console.warn(`GamepadCaptureService: Gamepad ${gamepadIndex} not found`)
      return false
    }
  }

  /**
   * Set the deadzone and trigger threshold values for input filtering
   * @param {Object} params - Parameters for deadzone configuration
   * @param {number} params.deadzone - Deadzone value for axes (0.0 to 1.0)
   * @param {number} params.triggerThreshold - Threshold for triggers (0.0 to 1.0)
   * @returns {boolean} True if values were set successfully
   */
  setDeadzone({ deadzone = null, triggerThreshold = null }) {
    const oldDeadzone = this.deadzone
    const oldTriggerThreshold = this.triggerThreshold

    // Validate and set deadzone for axes
    if (deadzone !== null && typeof deadzone === 'number') {
      if (deadzone >= 0.0 && deadzone <= 1.0) {
        this.deadzone = deadzone
        console.log(`GamepadCaptureService: Set deadzone to ${deadzone}`)
      } else {
        console.warn(`GamepadCaptureService: Invalid deadzone value ${deadzone}, must be between 0.0 and 1.0`)
        return false
      }
    }

    // Validate and set trigger threshold
    if (triggerThreshold !== null && typeof triggerThreshold === 'number') {
      if (triggerThreshold >= 0.0 && triggerThreshold <= 1.0) {
        this.triggerThreshold = triggerThreshold
        console.log(`GamepadCaptureService: Set trigger threshold to ${triggerThreshold}`)
      } else {
        console.warn(`GamepadCaptureService: Invalid trigger threshold value ${triggerThreshold}, must be between 0.0 and 1.0`)
        return false
      }
    }

    // Emit configuration change event if values changed
    if (this.deadzone !== oldDeadzone || this.triggerThreshold !== oldTriggerThreshold) {
      this.emit('gamepad:deadzone-changed', {
        deadzone: this.deadzone,
        triggerThreshold: this.triggerThreshold,
        oldDeadzone: oldDeadzone,
        oldTriggerThreshold: oldTriggerThreshold
      })
    }

    return true
  }

  /**
   * Start calibration workflow for a non-standard controller
   * @param {Object} params - Calibration parameters
   * @param {number} params.gamepadIndex - Index of the gamepad to calibrate
   * @param {Array} params.steps - Array of calibration steps with button names
   * @param {Function} params.callback - Optional callback function when calibration completes
   * @returns {Object} Calibration session information
   */
  startCalibration({ gamepadIndex, steps = null, callback = null }) {
    if (!this.isAvailable) {
      return {
        success: false,
        error: 'gamepad_unavailable',
        message: this.i18n.t('gamepad_unavailable')
      }
    }

    // Check if gamepad exists and is non-standard
    const gamepadInfo = this.connectedGamepads.get(gamepadIndex)
    if (!gamepadInfo) {
      return {
        success: false,
        error: 'gamepad_not_found',
        message: this.i18n.t('gamepad_not_found')
      }
    }

    // Only allow calibration for non-standard controllers
    if (gamepadInfo.mapping === 'standard') {
      return {
        success: false,
        error: 'standard_controller',
        message: this.i18n.t('gamepad_calibration_standard_not_needed')
      }
    }

    // If no steps provided, use default calibration sequence
    const calibrationSteps = steps || this.getDefaultCalibrationSteps()

    this.isCalibrating = true
    this.calibrationGamepadIndex = gamepadIndex
    this.calibrationSteps = calibrationSteps
    this.calibrationStep = 0
    this.calibrationCallback = callback

    // Create or clear mapping for this gamepad
    const gamepadId = gamepadInfo.id
    if (!this.customMappings.has(gamepadId)) {
      this.customMappings.set(gamepadId, {
        buttons: {},
        axes: {},
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      })
    }

    console.log(`GamepadCaptureService: Started calibration for gamepad ${gamepadIndex}`)
    this.emit('gamepad:calibration-started', {
      gamepadIndex,
      gamepadId: gamepadInfo.id,
      steps: calibrationSteps,
      currentStep: 0
    })

    // Emit the first calibration prompt
    this.emitCalibrationPrompt()

    return {
      success: true,
      gamepadIndex,
      steps: calibrationSteps,
      currentStep: 0
    }
  }

  /**
   * Get default calibration steps for common gamepad buttons
   * @returns {Array} Array of calibration step definitions
   */
  getDefaultCalibrationSteps() {
    return [
      { id: 'button_a', name: 'A Button (bottom face)', type: 'button', chordName: 'Joy1' },
      { id: 'button_b', name: 'B Button (right face)', type: 'button', chordName: 'Joy2' },
      { id: 'button_x', name: 'X Button (left face)', type: 'button', chordName: 'Joy3' },
      { id: 'button_y', name: 'Y Button (top face)', type: 'button', chordName: 'Joy4' },
      { id: 'button_lb', name: 'Left Bumper', type: 'button', chordName: 'Joy5' },
      { id: 'button_rb', name: 'Right Bumper', type: 'button', chordName: 'Joy6' },
      { id: 'button_lt', name: 'Left Trigger', type: 'button', chordName: 'Joy7' },
      { id: 'button_rt', name: 'Right Trigger', type: 'button', chordName: 'Joy8' },
      { id: 'button_select', name: 'Select/Back Button', type: 'button', chordName: 'Joy9' },
      { id: 'button_start', name: 'Start/Forward Button', type: 'button', chordName: 'Joy10' },
      { id: 'button_ls', name: 'Left Stick Click', type: 'button', chordName: 'Joy11' },
      { id: 'button_rs', name: 'Right Stick Click', type: 'button', chordName: 'Joy12' },
      { id: 'dpad_up', name: 'D-Pad Up', type: 'button', chordName: 'Joypad_up' },
      { id: 'dpad_down', name: 'D-Pad Down', type: 'button', chordName: 'Joypad_down' },
      { id: 'dpad_left', name: 'D-Pad Left', type: 'button', chordName: 'Joypad_left' },
      { id: 'dpad_right', name: 'D-Pad Right', type: 'button', chordName: 'Joypad_right' },
      { id: 'left_stick_x', name: 'Left Stick Left/Right', type: 'axis', chordNamePositive: 'Lstick_right', chordNameNegative: 'Lstick_left' },
      { id: 'left_stick_y', name: 'Left Stick Up/Down', type: 'axis', chordNamePositive: 'Lstick_down', chordNameNegative: 'Lstick_up' },
      { id: 'right_stick_x', name: 'Right Stick Left/Right', type: 'axis', chordNamePositive: 'Rstick_right', chordNameNegative: 'Rstick_left' },
      { id: 'right_stick_y', name: 'Right Stick Up/Down', type: 'axis', chordNamePositive: 'Rstick_down', chordNameNegative: 'Rstick_up' }
    ]
  }

  /**
   * Calibrate a specific button/axis during the calibration workflow
   * @param {Object} params - Calibration parameters
   * @param {number} params.gamepadIndex - Index of the gamepad being calibrated
   * @param {number} params.buttonIndex - Button index that was pressed (for buttons)
   * @param {number} params.axisIndex - Axis index that was moved (for axes)
   * @param {number} params.axisValue - Axis value when captured (for axes)
   * @returns {Object} Calibration result
   */
  calibrateButton({ gamepadIndex, buttonIndex = null, axisIndex = null, axisValue = null }) {
    if (!this.isCalibrating || this.calibrationGamepadIndex !== gamepadIndex) {
      return {
        success: false,
        error: 'not_calibrating',
        message: this.i18n.t('gamepad_not_calibrating')
      }
    }

    const currentStep = this.calibrationSteps[this.calibrationStep]
    if (!currentStep) {
      return {
        success: false,
        error: 'invalid_step',
        message: this.i18n.t('gamepad_calibration_invalid_step')
      }
    }

    const gamepadInfo = this.connectedGamepads.get(gamepadIndex)
    const gamepadId = gamepadInfo.id
    const mapping = this.customMappings.get(gamepadId)

    if (currentStep.type === 'button' && buttonIndex !== null) {
      // Map button
      mapping.buttons[currentStep.id] = {
        index: buttonIndex,
        chordName: currentStep.chordName,
        name: currentStep.name
      }

      console.log(`GamepadCaptureService: Mapped ${currentStep.name} to button ${buttonIndex}`)

      this.emit('gamepad:button-calibrated', {
        gamepadIndex,
        stepId: currentStep.id,
        buttonIndex,
        chordName: currentStep.chordName
      })
    } else if (currentStep.type === 'axis' && axisIndex !== null && axisValue !== null) {
      // Map axis
      mapping.axes[currentStep.id] = {
        index: axisIndex,
        chordNamePositive: currentStep.chordNamePositive,
        chordNameNegative: currentStep.chordNameNegative,
        name: currentStep.name,
        polarity: axisValue > 0 ? 'positive' : 'negative'
      }

      console.log(`GamepadCaptureService: Mapped ${currentStep.name} to axis ${axisIndex}`)

      this.emit('gamepad:axis-calibrated', {
        gamepadIndex,
        stepId: currentStep.id,
        axisIndex,
        chordNamePositive: currentStep.chordNamePositive,
        chordNameNegative: currentStep.chordNameNegative,
        polarity: axisValue > 0 ? 'positive' : 'negative'
      })
    } else {
      return {
        success: false,
        error: 'invalid_input',
        message: this.i18n.t('gamepad_calibration_invalid_input')
      }
    }

    // Update mapping timestamp
    mapping.lastUpdated = new Date().toISOString()

    // Move to next step
    this.calibrationStep++

    if (this.calibrationStep >= this.calibrationSteps.length) {
      // Calibration complete
      return this.completeCalibration()
    } else {
      // Continue to next step
      this.emitCalibrationPrompt()

      return {
        success: true,
        stepCompleted: this.calibrationStep - 1,
        nextStep: this.calibrationStep,
        totalSteps: this.calibrationSteps.length
      }
    }
  }

  /**
   * Cancel an active calibration session
   * @param {Object} params - Cancellation parameters
   * @param {number} params.gamepadIndex - Index of the gamepad being calibrated
   * @returns {Object} Cancellation result
   */
  cancelCalibration({ gamepadIndex }) {
    if (!this.isCalibrating || this.calibrationGamepadIndex !== gamepadIndex) {
      return {
        success: false,
        error: 'not_calibrating',
        message: this.i18n.t('gamepad_not_calibrating')
      }
    }

    console.log(`GamepadCaptureService: Cancelled calibration for gamepad ${gamepadIndex}`)

    const result = {
      success: true,
      gamepadIndex,
      stepsCompleted: this.calibrationStep,
      totalSteps: this.calibrationSteps.length
    }

    // Reset calibration state
    this.resetCalibrationState()

    this.emit('gamepad:calibration-cancelled', result)

    return result
  }

  /**
   * Get custom mapping for a specific gamepad
   * @param {Object} params - Query parameters
   * @param {number} params.gamepadIndex - Index of the gamepad
   * @returns {Object} Custom mapping information
   */
  getCustomMapping({ gamepadIndex }) {
    const gamepadInfo = this.connectedGamepads.get(gamepadIndex)
    if (!gamepadInfo) {
      return {
        success: false,
        error: 'gamepad_not_found',
        message: this.i18n.t('gamepad_not_found')
      }
    }

    const gamepadId = gamepadInfo.id
    const mapping = this.customMappings.get(gamepadId)

    return {
      success: true,
      gamepadIndex,
      gamepadId,
      hasCustomMapping: !!mapping,
      mapping: mapping || null,
      isStandard: gamepadInfo.mapping === 'standard'
    }
  }

  /**
   * Clear custom mapping for a specific gamepad
   * @param {Object} params - Clear parameters
   * @param {number} params.gamepadIndex - Index of the gamepad
   * @returns {Object} Clear result
   */
  clearCustomMapping({ gamepadIndex }) {
    const gamepadInfo = this.connectedGamepads.get(gamepadIndex)
    if (!gamepadInfo) {
      return {
        success: false,
        error: 'gamepad_not_found',
        message: this.i18n.t('gamepad_not_found')
      }
    }

    const gamepadId = gamepadInfo.id
    const hadMapping = this.customMappings.has(gamepadId)

    this.customMappings.delete(gamepadId)
    this.saveCustomMappings()

    console.log(`GamepadCaptureService: Cleared custom mapping for gamepad ${gamepadIndex}`)

    this.emit('gamepad:mapping-cleared', {
      gamepadIndex,
      gamepadId,
      hadMapping
    })

    return {
      success: true,
      gamepadIndex,
      gamepadId,
      hadMapping
    }
  }

  /**
   * Complete the calibration process
   * @returns {Object} Completion result
   */
  completeCalibration() {
    const gamepadIndex = this.calibrationGamepadIndex
    const gamepadInfo = this.connectedGamepads.get(gamepadIndex)
    const gamepadId = gamepadInfo.id

    console.log(`GamepadCaptureService: Completed calibration for gamepad ${gamepadIndex}`)

    // Save the completed mapping
    this.saveCustomMappings()

    const result = {
      success: true,
      gamepadIndex,
      gamepadId,
      stepsCompleted: this.calibrationSteps.length
    }

    // Call completion callback if provided
    if (typeof this.calibrationCallback === 'function') {
      try {
        this.calibrationCallback(result)
      } catch (error) {
        console.warn('GamepadCaptureService: Calibration callback error:', error)
      }
    }

    // Reset calibration state
    this.resetCalibrationState()

    this.emit('gamepad:calibration-completed', result)

    return result
  }

  /**
   * Reset calibration state variables
   */
  resetCalibrationState() {
    this.isCalibrating = false
    this.calibrationGamepadIndex = null
    this.calibrationStep = null
    this.calibrationSteps = []
    this.calibrationCallback = null
  }

  /**
   * Emit calibration prompt for current step
   */
  emitCalibrationPrompt() {
    const currentStep = this.calibrationSteps[this.calibrationStep]
    if (!currentStep) return

    const message = this.i18n.t('gamepad_calibrate_prompt', {
      buttonName: currentStep.name,
      stepNumber: this.calibrationStep + 1,
      totalSteps: this.calibrationSteps.length
    })

    this.emit('gamepad:calibration-prompt', {
      gamepadIndex: this.calibrationGamepadIndex,
      step: this.calibrationStep,
      stepId: currentStep.id,
      stepType: currentStep.type,
      stepName: currentStep.name,
      message: message,
      progress: {
        current: this.calibrationStep + 1,
        total: this.calibrationSteps.length,
        percentage: Math.round(((this.calibrationStep + 1) / this.calibrationSteps.length) * 100)
      }
    })
  }

  /**
   * Get button name using custom mapping if available
   * @param {number} buttonIndex - The button index
   * @param {Gamepad} gamepad - The gamepad object
   * @returns {string} - Display name for the button
   */
  getCustomButtonName(buttonIndex, gamepad) {
    if (gamepad.mapping === 'standard') {
      return this.getButtonName(buttonIndex, gamepad) // Use standard mapping
    }

    const gamepadId = gamepad.id
    const mapping = this.customMappings.get(gamepadId)
    if (!mapping) {
      return this.getButtonName(buttonIndex, gamepad) // Fallback to default
    }

    // Find button in custom mapping
    for (const [stepId, buttonMapping] of Object.entries(mapping.buttons)) {
      if (buttonMapping.index === buttonIndex) {
        return buttonMapping.name
      }
    }

    return this.getButtonName(buttonIndex, gamepad) // Fallback to default
  }

  /**
   * Get chord name using custom mapping if available
   * @param {number} buttonIndex - The button index
   * @param {Gamepad} gamepad - The gamepad object
   * @returns {string} - Chord name for the button matching STO_KEY_NAMES
   */
  getCustomButtonChordName(buttonIndex, gamepad) {
    if (gamepad.mapping === 'standard') {
      return this.getButtonChordName(buttonIndex, gamepad) // Use standard mapping
    }

    const gamepadId = gamepad.id
    const mapping = this.customMappings.get(gamepadId)
    if (!mapping) {
      return this.getButtonChordName(buttonIndex, gamepad) // Fallback to default
    }

    // Find button in custom mapping
    for (const [stepId, buttonMapping] of Object.entries(mapping.buttons)) {
      if (buttonMapping.index === buttonIndex) {
        return buttonMapping.chordName
      }
    }

    return this.getButtonChordName(buttonIndex, gamepad) // Fallback to default
  }

  /**
   * Get axis name using custom mapping if available
   * @param {number} axisIndex - The axis index
   * @param {Gamepad} gamepad - The gamepad object
   * @returns {string} - Display name for the axis
   */
  getCustomAxisName(axisIndex, gamepad) {
    if (gamepad.mapping === 'standard') {
      return this.getAxisName(axisIndex, gamepad) // Use standard mapping
    }

    const gamepadId = gamepad.id
    const mapping = this.customMappings.get(gamepadId)
    if (!mapping) {
      return this.getAxisName(axisIndex, gamepad) // Fallback to default
    }

    // Find axis in custom mapping
    for (const [stepId, axisMapping] of Object.entries(mapping.axes)) {
      if (axisMapping.index === axisIndex) {
        return axisMapping.name
      }
    }

    return this.getAxisName(axisIndex, gamepad) // Fallback to default
  }

  /**
   * Get chord name using custom mapping if available
   * @param {number} axisIndex - The axis index
   * @param {number} axisValue - The current axis value (-1 to 1)
   * @param {Gamepad} gamepad - The gamepad object
   * @returns {string} - Chord name for the axis input matching STO_KEY_NAMES
   */
  getCustomAxisChordName(axisIndex, axisValue, gamepad) {
    if (gamepad.mapping === 'standard') {
      return this.getAxisChordName(axisIndex, axisValue, gamepad) // Use standard mapping
    }

    const gamepadId = gamepad.id
    const mapping = this.customMappings.get(gamepadId)
    if (!mapping) {
      return this.getAxisChordName(axisIndex, axisValue, gamepad) // Fallback to default
    }

    // Find axis in custom mapping
    for (const [stepId, axisMapping] of Object.entries(mapping.axes)) {
      if (axisMapping.index === axisIndex) {
        // Return appropriate chord name based on axis value direction
        if (Math.abs(axisValue) >= this.deadzone) {
          return axisValue > 0 ? axisMapping.chordNamePositive : axisMapping.chordNameNegative
        }
      }
    }

    return this.getAxisChordName(axisIndex, axisValue, gamepad) // Fallback to default
  }

  /**
   * Get currently pressed keyboard modifiers for mixed input chords
   * @returns {Array} Array of modifier codes following KeyCaptureService format
   */
  getModifiers() {
    // Request current modifiers from KeyCaptureService
    // This enables mixed keyboard+gamepad input combinations
    return this.request('keycapture:get-modifiers')
      .then(modifiers => {
        return modifiers || []
      })
      .catch(error => {
        console.warn('GamepadCaptureService: Could not get keyboard modifiers:', error)
        return []
      })
  }

  /**
   * Clean up resources when service is destroyed
   */
  onDestroy() {
    this.stopCapture()

    // Always remove event listeners, even if service is unavailable
    this.removeGamepadEventListeners()

    // Cancel any active calibration
    if (this.isCalibrating) {
      this.resetCalibrationState()
    }

    this.saveCustomMappings()

    // Ensure polling is completely stopped
    this.stopPolling()

    this.connectedGamepads.clear()
    this.customMappings.clear()
  }
}