import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { respond } from '../../core/requestResponse.js'

/**
 * KeyBrowserService – source-of-truth for the key grid.
 * Keeps track of the active profile/environment and exposes
 * helpers for retrieving keybind data as well as selecting keys
 * in a decoupled, event-driven manner.
 */
export default class KeyBrowserService extends ComponentBase {
  constructor ({ storage, profileService, ui } = {}) {
    super(eventBus)
    this.componentName = 'KeyBrowserService'
    this.storage        = storage
    this.profileService = profileService || null
    this.ui             = ui

    this.currentProfileId   = null
    this.currentEnvironment = 'space'
    this.selectedKeyName    = null

    // Selection caching for environment switches
    this._cachedSelections = {
      space: null,
      ground: null
    }

    // ---------------------------------------------------------
    // Register Request/Response endpoints for external callers
    // ---------------------------------------------------------
    if (this.eventBus) {
      respond(this.eventBus, 'key:get-all',           () => this.getKeys())
      respond(this.eventBus, 'key:get-profile',       () => this.getProfile())
      respond(this.eventBus, 'key:select',            ({ key }) => this.selectKey(key))
    }
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
        
        // Also get the current environment from the profile
        const profile = this.storage.getProfile(data.currentProfile)
        if (profile && profile.currentEnvironment) {
          this.currentEnvironment = profile.currentEnvironment
        }
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
      // Clear cached selections when profile changes
      this._cachedSelections = { space: null, ground: null }
      this.emit('key:list-changed', { keys: this.getKeys() })
    })

    // Environment changed – allow either string payload or { environment }
    this.addEventListener('environment:changed', (payload) => {
      const env = typeof payload === 'string' ? payload : payload?.environment
      if (!env) return
      
      // Cache current selection before changing environment (only for key environments)
      if (this.currentEnvironment !== 'alias' && this.selectedKeyName) {
        this._cachedSelections[this.currentEnvironment] = this.selectedKeyName
      }
      
      this.currentEnvironment = env
      this.selectedKeyName = null
      
      // If switching to key environment, try to restore or auto-select immediately
      if (env !== 'alias') {
        this._restoreOrAutoSelectKey(env)
      }
      
      this.emit('key:list-changed', { keys: this.getKeys() })
    })



    // Data modifications
    this.addEventListener('profile-modified', () => {
      this.emit('key:list-changed', { keys: this.getKeys() })
    })
  }

  /* ============================================================
   * Selection caching and auto-selection
   * ========================================================== */
  
  /**
   * Restore cached selection or auto-select first key for the given environment
   * @param {string} environment - The environment to restore/auto-select for
   */
  _restoreOrAutoSelectKey(environment) {
    // Try to restore cached selection first
    const cachedKey = this._cachedSelections[environment]
    const availableKeys = this.getKeys()
    
    if (cachedKey && availableKeys[cachedKey]) {
      this.selectKey(cachedKey)
      return
    }
    
    // Auto-select first key if none selected and keys exist
    const keyNames = Object.keys(availableKeys)
    if (keyNames.length > 0) {
      // Sort keys to ensure consistent first selection
      keyNames.sort()
      this.selectKey(keyNames[0])
    }
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