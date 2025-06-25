import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'

/**
 * KeyBrowserService – source-of-truth for the key grid.
 * Keeps track of the active profile/environment and exposes
 * helpers for retrieving keybind data as well as selecting keys
 * in a decoupled, event-driven manner.
 */
export default class KeyBrowserService extends ComponentBase {
  constructor ({ storage, profileService, ui } = {}) {
    super(eventBus)
    this.storage        = storage
    this.profileService = profileService || null
    this.ui             = ui

    this.currentProfileId   = null
    this.currentEnvironment = 'space'
    this.selectedKeyName    = null
  }

  /* ============================================================
   * Lifecycle
   * ========================================================== */
  onInit () {
    // Determine initial profile/environment.
    if (this.profileService) {
      this.currentProfileId   = this.profileService.getCurrentProfileId?.() || null
      this.currentEnvironment = this.profileService.getCurrentEnvironment?.() || 'space'
    } else if (this.storage) {
      const data = this.storage.getAllData?.()
      if (data) {
        this.currentProfileId = data.currentProfile
      }
    }

    // Listen for profile/environment changes
    this.setupEventListeners()
  }

  setupEventListeners () {
    // Profile switched (new modular event)
    this.addEventListener('profile-switched', ({ profileId, environment }) => {
      this.currentProfileId   = profileId
      if (environment) this.currentEnvironment = environment
      this.selectedKeyName = null
      this.emit('keys-changed', { keys: this.getKeys() })
    })

    // Environment changed – allow either string payload or { environment }
    this.addEventListener('environment-changed', (payload) => {
      const env = typeof payload === 'string' ? payload : payload?.environment
      if (!env) return
      this.currentEnvironment = env
      // Clear any prior key selection – key context is environment specific
      this.selectedKeyName = null
      this.emit('keys-changed', { keys: this.getKeys() })
    })

    // Also respond to global mode changes emitted by InterfaceModeService
    this.eventBus.on('mode-changed', ({ newMode }) => {
      this.currentEnvironment = newMode
      this.selectedKeyName = null
      this.emit('keys-changed', { keys: this.getKeys() })
    })

    // Data modifications
    this.addEventListener('profile-modified', () => {
      this.emit('keys-changed', { keys: this.getKeys() })
    })
  }

  /* ============================================================
   * Data helpers
   * ========================================================== */
  getProfile () {
    if (!this.currentProfileId) return null
    return this.storage.getProfile(this.currentProfileId)
  }

  getKeys () {
    const profile = this.getProfile()
    if (!profile) return {}

    const builds = profile.builds || {}
    const build  = builds[this.currentEnvironment] || {}
    return build.keys || {}
  }

  /* ============================================================
   * Selection helpers
   * ========================================================== */
  selectKey (name) {
    if (this.selectedKeyName === name) return
    this.selectedKeyName = name

    // Forward to legacy keySelection mechanism if available
    if (typeof window.keyHandling?.selectKey === 'function') {
      window.keyHandling.selectKey(name)
    }

    this.emit('key-selected', { key: name, name })
  }

  /* ============================================================
   * Internal helpers
   * ========================================================== */
  // Returns a cached list of all valid key names used across the app. This
  // mirrors the logic from STOFileHandler.generateValidKeys() but lets the key
  // browser remain independent of that heavier module.
  getValidKeys () {
    if (this._validKeys) return this._validKeys
    const keys = new Set()
    for (let i = 1; i <= 12; i++) keys.add(`F${i}`)
    for (let i = 0; i <= 9; i++) keys.add(i.toString())
    for (let i = 65; i <= 90; i++) keys.add(String.fromCharCode(i)) // A-Z

    const special = [
      'Space','Tab','Enter','Escape','Backspace','Delete','Insert','Home','End',
      'PageUp','PageDown','Up','Down','Left','Right','NumPad0','NumPad1','NumPad2',
      'NumPad3','NumPad4','NumPad5','NumPad6','NumPad7','NumPad8','NumPad9',
      'NumPadEnter','NumPadPlus','NumPadMinus','NumPadMultiply','NumPadDivide',
      'Button4','Button5','Button6','Button7','Button8','Lbutton','Rbutton','Mbutton',
      'Leftdrag','Rightdrag','Middleclick','Mousechord','Wheelplus','Wheelminus',
      'Semicolon','Equals','Comma','Minus','Period','Slash','Grave','LeftBracket',
      'Backslash','RightBracket','Quote','[',']'
    ]
    special.forEach(k => keys.add(k))

    const modifiers = ['Ctrl','Alt','Shift','Control']
    const base = Array.from(keys)
    modifiers.forEach(m => base.forEach(k => keys.add(`${m}+${k}`)))

    this._validKeys = Array.from(keys).sort()
    return this._validKeys
  }
} 