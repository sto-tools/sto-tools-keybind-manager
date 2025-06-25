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

    this.document = document

    // Runtime state ---------------------------------------------------------
    this.isCapturing          = false
    this.pressedCodes         = new Set()
    this.currentContext       = 'keySelectionModal'
    this.hasCapturedValidKey  = false

    // Bindings --------------------------------------------------------------
    this.boundHandleKeyDown = this.handleKeyDown.bind(this)
    this.boundHandleKeyUp   = this.handleKeyUp.bind(this)
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

    this.document.addEventListener('keydown', this.boundHandleKeyDown)
    this.document.addEventListener('keyup',   this.boundHandleKeyUp)

    this.emit('capture-start', { context })
  }

  /**
   * Stop listening and clean internal state.
   */
  stopCapture () {
    if (!this.isCapturing) return

    this.isCapturing = false
    this.document.removeEventListener('keydown', this.boundHandleKeyDown)
    this.document.removeEventListener('keyup',   this.boundHandleKeyUp)
    this.pressedCodes.clear()
    this.hasCapturedValidKey = false

    this.emit('capture-stop', { context: this.currentContext })
    this.currentContext = 'keySelectionModal'
  }

  /* ---------------------------------------------------------------------- */
  /* Internal helpers                                                       */
  /* ---------------------------------------------------------------------- */
  resetState () {
    this.pressedCodes.clear()
    this.hasCapturedValidKey = false
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
    return [...codes]
      .sort()
      .map((code) => {
        // Modifiers --------------------------------------------------------
        if (code.startsWith('Control')) return 'Ctrl'
        if (code.startsWith('Alt'))     return 'Alt'
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