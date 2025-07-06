import ComponentBase from '../ComponentBase.js'

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
  /**
   * @param {Object}   [opts]
   * @param {Object}   [opts.eventBus]  – global event bus for emitting events
   * @param {Document} [opts.document]  – document reference (DI for tests)
   */
  constructor ({ eventBus = null, document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(eventBus)
    this.componentName = 'KeyCaptureService'
    this.document = document

    // Runtime state ---------------------------------------------------------
    this.isCapturing          = false
    this.pressedCodes         = new Set()
    this.currentContext       = 'keySelectionModal'
    this.hasCapturedValidKey  = false
    this.locationSpecific     = false

    // Bindings --------------------------------------------------------------
    this.boundHandleKeyDown = this.handleKeyDown.bind(this)
    this.boundHandleKeyUp   = this.handleKeyUp.bind(this)
    this.boundHandleMouseDown = this.handleMouseDown.bind(this)
    this.boundHandleMouseUp = this.handleMouseUp.bind(this)
    this.boundHandleMouseMove = this.handleMouseMove.bind(this)
    this.boundHandleWheel = this.handleWheel.bind(this)

    // Mouse state tracking
    this.mouseState = {
      isDown: false,
      button: null,
      startX: 0,
      startY: 0,
      pressTimer: null,
      dragThreshold: 5,
      pressTimeout: 200
    }

    // Listen for start/stop requests emitted by UI components
    this.addEventListener('keycapture:start', ({ context } = {}) => this.startCapture(context))
    this.addEventListener('keycapture:stop',  () => this.stopCapture())
    this.addEventListener('keycapture:set-location-specific', ({ value } = {}) => {
      this.setLocationSpecific(value)
    })
  }

  /* ---------------------------------------------------------------------- */
  /* Public API                                                             */
  /* ---------------------------------------------------------------------- */
  /**
   * Start listening for keyboard events.
   * @param {string} [context='keySelectionModal'] – caller-supplied context
   */
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
    this.document.addEventListener('wheel', this.boundHandleWheel)

    this.emit('capture-start', { context })
  }

  /**
   * Stop listening and clean internal state.
   */
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
    this.document.removeEventListener('wheel', this.boundHandleWheel)
    
    this.pressedCodes.clear()
    this.hasCapturedValidKey = false
    
    // Clear mouse state
    this.resetMouseState()

    this.emit('capture-stop', { context: this.currentContext })
    this.currentContext = 'keySelectionModal'
  }

  /**
   * Enable / disable left- vs right-modifier distinction.
   * @param {boolean} value
   */
  setLocationSpecific (value) {
    this.locationSpecific = !!value
  }

  /* ---------------------------------------------------------------------- */
  /* Internal helpers                                                       */
  /* ---------------------------------------------------------------------- */
  resetState () {
    this.pressedCodes.clear()
    this.hasCapturedValidKey = false
    this.resetMouseState()
  }

  resetMouseState () {
    if (this.mouseState.pressTimer) {
      clearTimeout(this.mouseState.pressTimer)
      this.mouseState.pressTimer = null
    }
    this.mouseState.isDown = false
    this.mouseState.button = null
    this.mouseState.startX = 0
    this.mouseState.startY = 0
  }

  /* ----------------------------- event handlers ------------------------- */
  handleKeyDown (event) {
    if (!this.isCapturing) return

    // Ignore pure modifier presses – update UI with current pressed set.
    if (this.isPureModifier(event.code)) {
      this.pressedCodes.add(event.code)
      this.emit('update', {
        chord  : this.chordToString(this.pressedCodes),
        codes  : [...this.pressedCodes],
        context: this.currentContext,
      })
      return
    }

    // Real key pressed – add, announce captured chord.
    this.pressedCodes.add(event.code)
    const chord = this.chordToString(this.pressedCodes)

    this.emit('chord-captured', {
      chord,
      context: this.currentContext,
    })

    this.hasCapturedValidKey = true
    event.preventDefault()
  }

  handleKeyUp (event) {
    if (!this.isCapturing) return

    // Only update when chord not yet finalised.
    if (!this.hasCapturedValidKey) {
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
    
    // Start press timer for press gestures
    this.mouseState.pressTimer = setTimeout(() => {
      if (this.mouseState.isDown) {
        const gesture = this.getButtonGesture(event.button, 'press')
        this.captureMouseGesture(gesture)
      }
    }, this.mouseState.pressTimeout)
  }

  handleMouseUp (event) {
    if (!this.isCapturing) return
    
    event.preventDefault()
    
    if (this.mouseState.pressTimer) {
      clearTimeout(this.mouseState.pressTimer)
      this.mouseState.pressTimer = null
    }
    
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
    
    // Check if we've moved enough to cancel the press timer
    const deltaX = Math.abs(event.clientX - this.mouseState.startX)
    const deltaY = Math.abs(event.clientY - this.mouseState.startY)
    
    if ((deltaX > this.mouseState.dragThreshold || deltaY > this.mouseState.dragThreshold) && this.mouseState.pressTimer) {
      clearTimeout(this.mouseState.pressTimer)
      this.mouseState.pressTimer = null
    }
  }

  handleWheel (event) {
    if (!this.isCapturing) return
    
    event.preventDefault()
    
    const gesture = event.deltaY > 0 ? 'wheeldown' : 'wheelup'
    this.captureMouseGesture(gesture)
  }

  getButtonGesture (button, type) {
    const buttonMap = {
      0: 'l', // Left button
      1: 'm', // Middle button  
      2: 'r'  // Right button
    }
    
    const buttonPrefix = buttonMap[button] || 'l'
    return `${buttonPrefix}${type}`
  }

  captureMouseGesture (gesture) {
    // Combine with any currently pressed keyboard modifiers
    const modifiers = [...this.pressedCodes].filter(code => this.isPureModifier(code))
    const allCodes = [...modifiers, gesture]
    
    const chord = this.chordToString(new Set(allCodes))
    
    this.emit('chord-captured', {
      chord,
      context: this.currentContext,
    })
    
    this.hasCapturedValidKey = true
  }

  /* ----------------------------- utils ---------------------------------- */
  isPureModifier (code) {
    return [
      'ShiftLeft', 'ShiftRight',
      'ControlLeft', 'ControlRight',
      'AltLeft', 'AltRight',
      'MetaLeft', 'MetaRight',
    ].includes(code)
  }

  /**
   * Convert a Set of KeyboardEvent.code values into a user friendly string
   * matching STO keybind notation (Shift+Ctrl+A, etc.).
   * @param {Set<string>} codes
   * @returns {string}
   */
  chordToString (codes) {
    const locationSpecific = this.locationSpecific

    return [...codes]
      .sort()
      .map((code) => {
        // Mouse gestures --------------------------------------------------
        if (typeof code === 'string' && (
          code.startsWith('l') || code.startsWith('r') || code.startsWith('m') ||
          code === 'wheelup' || code === 'wheeldown'
        )) {
          return code
        }

        // Modifiers --------------------------------------------------------
        if (code.startsWith('Control')) {
          if (locationSpecific) return code.endsWith('Left') ? 'LCTRL' : 'RCTRL'
          return 'Ctrl'
        }
        if (code.startsWith('Alt')) {
          if (locationSpecific) return code.endsWith('Left') ? 'LALT' : 'RALT'
          return 'Alt'
        }
        if (code.startsWith('Shift'))   return 'Shift'
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
} 