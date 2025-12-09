import ComponentBase from '../ComponentBase.js'
import { UNSAFE_KEYBINDS } from '../../core/constants.js'

/**
 * KeyCaptureService – centralised key-capture logic (keyboard listeners,
 * chord calculation, etc). It contains **no DOM operations** – responsibility
 * for updating UI is delegated to KeyCaptureUI. The service emits a small set
 * of events that UI layers can subscribe to:
 *
 *  • capture-start  – when capturing begins          ({ context })
 *  • capture-stop   – when capturing ends            ({ context })
 *  • update         – whenever pressed key set mutates ({ chord, codes, context })
 *  • chord-captured – when a full chord is captured  ({ chord, context })
 */
export default class KeyCaptureService extends ComponentBase {
  constructor ({ eventBus = null, document = (typeof window !== 'undefined' ? window.document : undefined), i18n } = {}) {
    super(eventBus)
    this.componentName = 'KeyCaptureService'
    this.document = document
    this.i18n = i18n

    // Runtime state
    this.isCapturing          = false
    this.pressedCodes         = new Set()
    this.currentContext       = 'keySelectionModal'
    this.hasCapturedValidKey  = false
    this.locationSpecific     = false

    // Bindings
    this.boundHandleKeyDown = this.handleKeyDown.bind(this)
    this.boundHandleKeyUp   = this.handleKeyUp.bind(this)
    this.boundHandleMouseDown = this.handleMouseDown.bind(this)
    this.boundHandleMouseUp = this.handleMouseUp.bind(this)
    this.boundHandleMouseMove = this.handleMouseMove.bind(this)
    this.boundHandleWheel = this.handleWheel.bind(this)
    this.boundHandleDblClick = this.handleDblClick.bind(this)

    // Mouse state tracking
    this.mouseState = {
      isDown: false,
      button: null,
      startX: 0,
      startY: 0,
      dragThreshold: 5,
      pendingClickTimer: null,      // Timer for delayed click capture
      pendingClickButton: null,     // Which button is pending capture
      pendingClickGesture: null     // Gesture string to capture on timeout
    }
  }

  onInit() {
    this.setupEventListeners()
    this.setupGamepadEventHandling()

    // Register request/response endpoints for other services
    this.respond('keycapture:get-modifiers', this.getModifiers.bind(this))
    this.respond('keycapture:get-pressed-codes', this.getPressedCodes.bind(this))
  }

  setupEventListeners() {
    this.addEventListener('keycapture:start', ({ context } = {}) => this.startCapture(context))
    this.addEventListener('keycapture:stop',  () => this.stopCapture())
    this.addEventListener('keycapture:set-location-specific', ({ value } = {}) => {
      this.setLocationSpecific(value)
    })
  }

  // Start listening for keyboard events.
  startCapture (context = 'keySelectionModal') {
    if (this.isCapturing) return

    this.resetState()
    this.currentContext = context
    this.isCapturing    = true

    // Add keyboard listeners
    this.document.addEventListener('keydown', this.boundHandleKeyDown)
    this.document.addEventListener('keyup',   this.boundHandleKeyUp)

    // Add mouse listeners
    this.document.addEventListener('mousedown', this.boundHandleMouseDown)
    this.document.addEventListener('mouseup', this.boundHandleMouseUp)
    this.document.addEventListener('mousemove', this.boundHandleMouseMove)
    this.document.addEventListener('wheel', this.boundHandleWheel, { passive: false })
    this.document.addEventListener('dblclick', this.boundHandleDblClick)

    // Start gamepad capture coordination
    this.startGamepadCapture()

    this.emit('capture-start', { context })
  }

  // Stop listening and clean internal state.
  stopCapture () {
    if (!this.isCapturing) return

    this.isCapturing = false

    // Remove keyboard listeners
    this.document.removeEventListener('keydown', this.boundHandleKeyDown)
    this.document.removeEventListener('keyup',   this.boundHandleKeyUp)

    // Remove mouse listeners
    this.document.removeEventListener('mousedown', this.boundHandleMouseDown)
    this.document.removeEventListener('mouseup', this.boundHandleMouseUp)
    this.document.removeEventListener('mousemove', this.boundHandleMouseMove)
    this.document.removeEventListener('wheel', this.boundHandleWheel, { passive: false })
    this.document.removeEventListener('dblclick', this.boundHandleDblClick)

    // Stop gamepad capture coordination
    this.stopGamepadCapture()

    this.pressedCodes.clear()
    this.hasCapturedValidKey = false

    // Clear mouse state
    this.resetMouseState()

    this.emit('capture-stop', { context: this.currentContext })
    this.currentContext = 'keySelectionModal'
  }

  // Enable / disable left- vs right-modifier distinction.
  setLocationSpecific (value) {
    this.locationSpecific = !!value
  }

  // Internal helpers
  resetState () {
    this.pressedCodes.clear()
    this.hasCapturedValidKey = false
    this.resetMouseState()
  }

  resetMouseState () {
    this.mouseState.isDown = false
    this.mouseState.button = null
    this.mouseState.startX = 0
    this.mouseState.startY = 0

    // Clear pending click state
    if (this.mouseState.pendingClickTimer) {
      clearTimeout(this.mouseState.pendingClickTimer)
      this.mouseState.pendingClickTimer = null
    }
    this.mouseState.pendingClickButton = null
    this.mouseState.pendingClickGesture = null
  }

  // Keyboard down handler – now async so we can await i18n translations when
  // displaying toast notifications. The signature is otherwise unchanged.
  async handleKeyDown (event) {
    if (!this.isCapturing) return

    // Handle modifier keys (all modifiers can be standalone or part of chords)
    if (this.isModifier(event.code)) {
      this.pressedCodes.add(event.code)
      this.emit('update', {
        chord  : this.chordToString(this.pressedCodes),
        codes  : [...this.pressedCodes],
        context: this.currentContext,
      })
      return // Wait for either another key (chord) or release (standalone modifier)
    }

    // Non-modifier key pressed – this creates a chord if modifiers are held
    this.pressedCodes.add(event.code)
    const chord = this.chordToString(this.pressedCodes)

    // Reject unsafe keybind combinations
    if (this.isRejectedChord(chord)) {
      // Get i18n translation directly
      const message = this.i18n.t('unsafe_keybind', { key: chord })

      // Reset state so the rejected chord is not considered captured.
      this.resetState()
      event.preventDefault()
      return // Do not propagate chord-captured event
    }

    // Normal flow – announce captured chord
    this.emit('chord-captured', {
      chord,
      context: this.currentContext,
    })

    this.hasCapturedValidKey = true
    event.preventDefault()
  }

  handleKeyUp (event) {
    if (!this.isCapturing) return

    // If we haven't captured a valid key yet, handle modifier releases
    if (!this.hasCapturedValidKey) {
      // Check if this was a standalone modifier release
      if (this.isModifier(event.code) && this.pressedCodes.has(event.code) && this.pressedCodes.size === 1) {
        // Allow all modifier keys to be used standalone
        const chord = this.chordToString(this.pressedCodes)
        this.emit('chord-captured', {
          chord,
          context: this.currentContext,
        })
        this.hasCapturedValidKey = true
        event.preventDefault()
        return
      }

      // Normal modifier release when other keys are still pressed
      this.pressedCodes.delete(event.code)
      this.emit('update', {
        chord  : this.chordToString(this.pressedCodes),
        codes  : [...this.pressedCodes],
        context: this.currentContext,
      })
    }
  }

  handleMouseDown (event) {
    if (!this.isCapturing) return

    // Prevent default behavior
    event.preventDefault()

    // Check if there's a pending click timer for the same button
    // This indicates the user is starting a double-click
    if (this.mouseState.pendingClickTimer &&
        this.mouseState.pendingClickButton === event.button) {
      // Cancel the pending click timer - user is double-clicking
      clearTimeout(this.mouseState.pendingClickTimer)
      this.mouseState.pendingClickTimer = null
      this.mouseState.pendingClickButton = null
      this.mouseState.pendingClickGesture = null
    }

    this.mouseState.isDown = true
    this.mouseState.button = event.button
    this.mouseState.startX = event.clientX
    this.mouseState.startY = event.clientY
  }

  handleMouseUp (event) {
    if (!this.isCapturing) return

    event.preventDefault()

    if (this.mouseState.isDown && this.mouseState.button === event.button) {
      const deltaX = Math.abs(event.clientX - this.mouseState.startX)
      const deltaY = Math.abs(event.clientY - this.mouseState.startY)
      const hasMoved = deltaX > this.mouseState.dragThreshold || deltaY > this.mouseState.dragThreshold

      if (hasMoved) {
        // This was a drag gesture - capture immediately (drags can't be part of double-clicks)
        const gesture = this.getButtonGesture(event.button, 'drag')
        this.captureMouseGesture(gesture)
      } else {
        // This was a click gesture - delay capture to allow time for double-click detection
        const gesture = this.getButtonGesture(event.button, 'click')

        // Cancel any existing pending click timer
        if (this.mouseState.pendingClickTimer) {
          clearTimeout(this.mouseState.pendingClickTimer)
        }

        // Store the pending click gesture
        this.mouseState.pendingClickButton = event.button
        this.mouseState.pendingClickGesture = gesture

        // Start timer to capture as single click if no double-click occurs
        this.mouseState.pendingClickTimer = setTimeout(() => {
          this.capturePendingClick()
        }, 500) // 500ms delay for double-click detection
      }
    }

    // Reset mouse down state, but don't clear pending click state
    this.mouseState.isDown = false
    this.mouseState.button = null
    this.mouseState.startX = 0
    this.mouseState.startY = 0
  }

  handleMouseMove (event) {
    if (!this.isCapturing || !this.mouseState.isDown) return

    // Mouse movement is tracked for drag detection
    // No special handling needed here - drag detection happens in handleMouseUp
  }

  handleWheel (event) {
    if (!this.isCapturing) return

    event.preventDefault()

    const gesture = event.deltaY > 0 ? 'Wheelminus' : 'Wheelplus'
    this.captureMouseGesture(gesture)
  }

  handleDblClick (event) {
    if (!this.isCapturing) return

    event.preventDefault()

    // Cancel any pending click timer (safety check - should already be cancelled by second mousedown)
    if (this.mouseState.pendingClickTimer) {
      clearTimeout(this.mouseState.pendingClickTimer)
      this.mouseState.pendingClickTimer = null
    }

    // Clear pending click state
    this.mouseState.pendingClickButton = null
    this.mouseState.pendingClickGesture = null

    // Capture the double-click gesture immediately
    const gesture = this.getButtonGesture(event.button, 'doubleclick')
    this.captureMouseGesture(gesture)
  }

  capturePendingClick () {
    // Check if there's a pending click gesture to capture
    if (this.mouseState.pendingClickGesture) {
      this.captureMouseGesture(this.mouseState.pendingClickGesture)

      // Clear pending click state
      this.mouseState.pendingClickTimer = null
      this.mouseState.pendingClickButton = null
      this.mouseState.pendingClickGesture = null
    }
  }

  getButtonGesture (button, type) {
    // Standard buttons use l/m/r prefixes
    const stdMap = {
      0: 'L', // Left
      1: 'M', // Middle
      2: 'R', // Right
    }

    if (button <= 2) {
      const prefix = stdMap[button] || 'L'
      if (type === 'click') return `${prefix}click`
      if (type === 'doubleclick') return `${prefix}dblclick`
      if (type === 'drag')  return `${prefix}drag`
      return `${prefix}click`
    }

    // Extended buttons (Button4+)
    const btnLabel = `Button${button + 1}`
    if (type === 'click') return btnLabel
    if (type === 'doubleclick') return `${btnLabel}dblclick`
    //if (type === 'drag')  return `${btnLabel}drag`
    return btnLabel
  }

  captureMouseGesture (gesture) {
    // Combine with any currently pressed keyboard modifiers
    const modifiers = [...this.pressedCodes].filter(code => this.isModifier(code))
    const allCodes = [...modifiers, gesture]
    
    const chord = this.chordToString(new Set(allCodes))
    
    this.emit('chord-captured', {
      chord,
      context: this.currentContext,
    })
    
    this.hasCapturedValidKey = true
  }

  /* ----------------------------- utils ---------------------------------- */

  isModifier (code) {
    // All modifier keys including Shift
    return [
      'ShiftLeft', 'ShiftRight',
      'ControlLeft', 'ControlRight',
      'AltLeft', 'AltRight',
      'MetaLeft', 'MetaRight',
    ].includes(code)
  }

  // Convert a Set of KeyboardEvent.code values into a user friendly string
  // matching STO keybind notation (Shift+Ctrl+A, etc.).
  chordToString (codes) {
    const locationSpecific = this.locationSpecific

    return [...codes]
      .sort()
      .map((code) => {
        // Raw ButtonX strings should pass through unchanged
        if (/^Button\d+/.test(code)) {
          return code
        }

        // Mouse gestures --------------------------------------------------
        if (typeof code === 'string' && (
          code.startsWith('l') || code.startsWith('r') || code.startsWith('m') ||
          code === 'Wheelplus' || code === 'Wheelminus'
        )) {
          return code
        }

        // Modifiers --------------------------------------------------------
        if (code.startsWith('Control')) {
          if (locationSpecific) return code.endsWith('Left') ? 'LCTRL' : 'RCTRL'
          return 'Control'
        }
        if (code.startsWith('Alt')) {
          if (locationSpecific) return code.endsWith('Left') ? 'LALT' : 'RALT'
          return 'Alt'
        }
        if (code.startsWith('Shift')) {
          if (locationSpecific) return code.endsWith('Left') ? 'LSHIFT' : 'RSHIFT'
          return 'Shift'
        }
        if (code.startsWith('Meta'))    return 'Meta'

        // Digits: DigitX → X ---------------------------------------------
        const digit = code.match(/^Digit(\d)$/)
        if (digit) return digit[1]

        // Letters: KeyX → X ----------------------------------------------
        const letter = code.match(/^Key([A-Z])$/)
        if (letter) return letter[1]

        // Function keys ---------------------------------------------------
        if (code.startsWith('F') && /^F\d+$/.test(code)) {
          return code
        }

        // Numpad digits ----------------------------------------------------
        const numpadDigit = code.match(/^Numpad(\d)$/)
        if (numpadDigit) return `numpad${numpadDigit[1]}`

        // Numpad operations / misc ----------------------------------------
        const numpadMap = {
          NumpadAdd     : 'Add',
          NumpadSubtract: 'Subtract',
          NumpadMultiply: 'Multiply',
          NumpadDivide  : 'Divide',
          NumpadDecimal : 'Decimal',
          NumpadEnter   : 'numpadenter'
        }
        if (numpadMap[code]) return numpadMap[code]

        // Special keys ----------------------------------------------------
        const specialMap = {
          Space       : 'Space',
          Enter       : 'Enter',
          Tab         : 'Tab',
          Escape      : 'Escape',
          Backspace   : 'Backspace',
          Delete      : 'Delete',
          Home        : 'Home',
          End         : 'End',
          PageUp      : 'PageUp',
          PageDown    : 'PageDown',
          ArrowUp     : 'Up',
          ArrowDown   : 'Down',
          ArrowLeft   : 'Left',
          ArrowRight  : 'Right',
          BracketLeft : '[',
          BracketRight: ']',
          Semicolon   : ';',
          Quote       : "'",
          Comma       : ',',
          Period      : '.',
          Slash       : '/',
          Backslash   : '\\',
          Minus       : '-',
          Equal       : '=',
          Backquote   : '`',
          IntlBackslash: '\\',
        }
        if (specialMap[code]) return specialMap[code]

        // Fallback – strip leading "Key"
        return code.replace(/^Key/, '')
      })
      .join('+')
  }

  // Get currently pressed modifier keys for other services
  getModifiers() {
    if (!this.isCapturing) {
      return []
    }

    // Filter pressed codes to only return modifiers
    const modifierCodes = [...this.pressedCodes].filter(code => this.isModifier(code))

    // Convert modifier codes to standard format for chord creation
    return modifierCodes.map(code => {
      if (code.startsWith('Control')) return 'Ctrl'
      if (code.startsWith('Alt')) return 'Alt'
      if (code.startsWith('Shift')) return 'Shift'
      if (code.startsWith('Meta')) return 'Meta'
      return code
    })
  }

  // Get all currently pressed key codes for other services
  getPressedCodes() {
    if (!this.isCapturing) {
      return []
    }

    // Return all currently pressed codes
    return [...this.pressedCodes]
  }

  // Check chord string against UNSAFE_KEYBINDS list.
  isRejectedChord (chord) {
    if (!chord) return false
    return UNSAFE_KEYBINDS.some(k => k.toUpperCase() === chord.toUpperCase())
  }

  /* ------------------------ Gamepad Coordination ----------------------- */

  // Start gamepad capture coordination with GamepadCaptureService
  async startGamepadCapture() {
    try {
      // Request gamepad capture to start via the service interface
      const result = await this.request('gamepad:start-capture')
      console.log('KeyCaptureService: Gamepad capture coordination started', result)
    } catch (error) {
      // GamepadCaptureService may not be available or may fail
      console.warn('KeyCaptureService: Failed to start gamepad capture coordination:', error)
    }
  }

  // Stop gamepad capture coordination with GamepadCaptureService
  async stopGamepadCapture() {
    try {
      // Request gamepad capture to stop via the service interface
      const result = await this.request('gamepad:stop-capture')
      console.log('KeyCaptureService: Gamepad capture coordination stopped', result)
    } catch (error) {
      // GamepadCaptureService may not be available
      console.warn('KeyCaptureService: Failed to stop gamepad capture coordination:', error)
    }
  }

  // Handle chord-captured events from gamepad service (coordinated with keyboard/mouse chords)
  setupGamepadEventHandling() {
    // Listen for chord-captured events from GamepadCaptureService
    this.addEventListener('chord-captured', (event) => {
      // Check if event has detail property (some events may not have it)
      if (!event.detail) return

      const { chord, context, source, gamepadIndex, gamepadInputs } = event.detail

      // Only process gamepad-sourced chords if we're currently capturing
      if (source === 'gamepad' && this.isCapturing) {
        console.log('KeyCaptureService: Received gamepad chord:', {
          chord,
          context,
          gamepadIndex,
          gamepadInputs,
          currentContext: this.currentContext
        })

        // Emit the gamepad chord to maintain the same event format as keyboard/mouse
        this.emit('chord-captured', {
          chord,
          context: this.currentContext, // Use our context for consistency
          source: 'gamepad',
          gamepadIndex,
          gamepadInputs
        })

        // Mark that we've captured a valid input to handle the capture session lifecycle
        this.hasCapturedValidKey = true
      }
    })
  }
} 