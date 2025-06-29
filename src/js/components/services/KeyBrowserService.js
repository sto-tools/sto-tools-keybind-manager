import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { respond, request } from '../../core/requestResponse.js'

/**
 * KeyBrowserService – source-of-truth for the key grid.
 * Keeps track of the active profile/environment and exposes
 * helpers for retrieving keybind data as well as selecting keys
 * in a decoupled, event-driven manner.
 * 
 * REFACTORED: Now uses DataCoordinator broadcast/cache pattern
 * - Caches profile state locally from DataCoordinator broadcasts
 * - No direct storage access - all data comes from DataCoordinator
 * - Implements late-join support for dynamic initialization
 * - Maintains all existing selection caching and auto-selection logic
 */
export default class KeyBrowserService extends ComponentBase {
  constructor ({ storage, profileService, ui } = {}) {
    super(eventBus)
    this.componentName = 'KeyBrowserService'
    // Legacy parameters kept for backward compatibility but not used
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

    // REFACTORED: Cache profile state from DataCoordinator broadcasts
    this.cache = {
      currentProfile: null,
      currentEnvironment: 'space',
      keys: {}, // Current environment's keys
      builds: { // Full builds structure for profile
        space: { keys: {} },
        ground: { keys: {} }
      },
      profile: null // Full profile object
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
   * ============================================================ */
  async init() {
    super.init() // ComponentBase handles late-join automatically
    this.setupEventListeners()
  }

  onInit () {
    // Legacy method - now handled by init()
  }

  setupEventListeners () {
    // REFACTORED: Listen to DataCoordinator broadcasts instead of direct storage access
    
    // Cache profile state from DataCoordinator broadcasts
    this.addEventListener('profile:updated', ({ profileId, profile }) => {
      if (profileId === this.cache.currentProfile) {
        this.updateCacheFromProfile(profile)
        this.emit('key:list-changed', { keys: this.getKeys() })
      }
    })

    // Profile switched (new modular event)
    this.addEventListener('profile:switched', ({ profileId, profile, environment }) => {
      this.currentProfileId   = profileId
      this.cache.currentProfile = profileId
      
      if (environment) {
        this.currentEnvironment = environment
        this.cache.currentEnvironment = environment
      }
      
      this.selectedKeyName = null
      // Clear cached selections when profile changes
      this._cachedSelections = { space: null, ground: null }
      
      this.updateCacheFromProfile(profile)
      this.emit('key:list-changed', { keys: this.getKeys() })
    })

    // Environment changed – allow either string payload or { environment }
    this.addEventListener('environment:changed', async (payload) => {
      const env = typeof payload === 'string' ? payload : payload?.environment
      if (!env) return
      
      // Cache current selection before changing environment (only for key environments)
      if (this.currentEnvironment !== 'alias' && this.selectedKeyName) {
        this._cachedSelections[this.currentEnvironment] = this.selectedKeyName
      }
      
      this.currentEnvironment = env
      this.cache.currentEnvironment = env
      this.selectedKeyName = null
      
      // Update keys cache for new environment
      this.cache.keys = this.cache.builds[env]?.keys || {}
      
      // If switching to key environment, try to restore or auto-select
      if (env !== 'alias') {
        await this._restoreOrAutoSelectKey(env)
      }
      
      this.emit('key:list-changed', { keys: this.getKeys() })
    })

    // Late-join support now handled by ComponentBase automatically

    // Legacy event compatibility - data modifications
    this.addEventListener('profile-modified', () => {
      this.emit('key:list-changed', { keys: this.getKeys() })
    })

    // Listen for key changes from KeyService
    this.addEventListener('keys:changed', ({ keys }) => {
      this.cache.keys = keys || {}
      this.emit('key:list-changed', { keys: this.getKeys() })
    })
  }

  /**
   * Update local cache from profile data
   */
  updateCacheFromProfile(profile) {
    if (!profile) return
    
    this.cache.profile = profile
    
    // Ensure builds structure exists
    this.cache.builds = profile.builds || {
      space: { keys: {} },
      ground: { keys: {} }
    }
    
    // Update keys for current environment
    this.cache.keys = this.cache.builds[this.cache.currentEnvironment]?.keys || {}
  }

  /* ============================================================
   * Selection caching and auto-selection
   * ============================================================ */
  
  /**
   * Restore cached selection or auto-select first key for the given environment
   * @param {string} environment - The environment to restore/auto-select for
   */
  async _restoreOrAutoSelectKey(environment) {
    // Try to restore persisted selection first
    const profile = this.getProfile()
    const persistedKey = profile?.selections?.[environment]
    const availableKeys = this.getKeys()
    
    if (persistedKey && availableKeys[persistedKey]) {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[KeyBrowserService] Restoring persisted key selection for ${environment}: ${persistedKey}`)
      }
      this.selectKey(persistedKey)
      return
    }
    
    // Auto-select first key if none selected and keys exist
    const keyNames = Object.keys(availableKeys)
    if (keyNames.length > 0) {
      // Sort keys to ensure consistent first selection
      keyNames.sort()
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[KeyBrowserService] Auto-selecting first key for ${environment}: ${keyNames[0]}`)
      }
      this.selectKey(keyNames[0])
    }
  }

  /* ============================================================
   * REFACTORED: Data helpers now use cached data
   * ============================================================ */
  getProfile () {
    // Return cached profile instead of accessing storage directly
    return this.cache.profile
  }

  getKeys () {
    // Return cached keys for current environment
    return this.cache.keys || {}
  }

  /* ============================================================
   * Selection helpers
   * ============================================================ */
  async selectKey (name) {
    if (this.selectedKeyName === name) return name
    this.selectedKeyName = name

    // Persist selection to profile storage
    await this._persistKeySelection(name)

    // Emit selection event for UI components to react
    this.emit('key-selected', { key: name, name })
    
    // Trigger UI updates that legacy code expects (moved from KeyService)
    if (typeof window !== 'undefined' && window.app) {
      // Trigger key grid refresh
      if (window.app.renderKeyGrid) {
        window.app.renderKeyGrid()
      }
      // Trigger chain actions update (button state management)
      if (window.app.updateChainActions) {
        window.app.updateChainActions()
      }
    }
    
    return name
  }

  /**
   * Persist key selection to profile storage
   */
  async _persistKeySelection(keyName) {
    try {
      const profile = this.getProfile()
      if (!profile || !this.currentEnvironment || this.currentEnvironment === 'alias') {
        return // Don't persist for alias mode or if no profile
      }

      // Prepare updated selections
      const currentSelections = profile.selections || {}
      const updatedSelections = {
        ...currentSelections,
        [this.currentEnvironment]: keyName
      }

      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[KeyBrowserService] Persisting key selection: ${this.currentEnvironment} -> ${keyName}`)
      }

      // Update through DataCoordinator
      const { request } = await import('../../core/requestResponse.js')
      await request(this.eventBus, 'data:update-profile', {
        profileId: this.currentProfileId,
        updates: { selections: updatedSelections }
      })
    } catch (error) {
      console.error('[KeyBrowserService] Failed to persist key selection:', error)
    }
  }

  /* ============================================================
   * Internal helpers
   * ============================================================ */
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

  /* ============================================================
   * ComponentBase late-join support
   * ============================================================ */
  getCurrentState() {
    return {
      selectedKeyName: this.selectedKeyName,
      currentProfileId: this.currentProfileId,
      currentEnvironment: this.currentEnvironment,
      cachedSelections: { ...this._cachedSelections },
      keys: this.getKeys()
    }
  }

  handleInitialState(sender, state) {
    if (!state) return
    
    // Handle state from DataCoordinator via ComponentBase late-join
    if (sender === 'DataCoordinator' && state.currentProfileData) {
      const profile = state.currentProfileData
      this.currentProfileId = profile.id
      this.cache.currentProfile = profile.id
      this.currentEnvironment = profile.environment || 'space'
      this.cache.currentEnvironment = this.currentEnvironment
      
      // Clear cached selections when profile changes
      this._cachedSelections = { space: null, ground: null }
      
      this.updateCacheFromProfile(profile)
      this.emit('key:list-changed', { keys: this.getKeys() })
      
      console.log(`[${this.componentName}] Received initial state from DataCoordinator`)
    }
    
    // Handle state from other KeyBrowserService instances
    if (sender === 'KeyBrowserService') {
      this.selectedKeyName = state.selectedKeyName ?? this.selectedKeyName
      this._cachedSelections = { ...this._cachedSelections, ...state.cachedSelections }
    }
  }
} 