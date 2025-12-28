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
      dragThreshold: 5
    }
  }

  onInit() {
    this.setupEventListeners()
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
        // This was a drag gesture
        const gesture = this.getButtonGesture(event.button, 'drag')
        this.captureMouseGesture(gesture)
      } else {
        // This was a click gesture
        const gesture = this.getButtonGesture(event.button, 'click')
        this.captureMouseGesture(gesture)
      }
    }

    this.resetMouseState()
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

    const gesture = this.getButtonGesture(event.button, 'doubleclick')
    this.captureMouseGesture(gesture)
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

  // Check chord string against UNSAFE_KEYBINDS list.
  isRejectedChord (chord) {
    if (!chord) return false
    return UNSAFE_KEYBINDS.some(k => k.toUpperCase() === chord.toUpperCase())
  }
} 