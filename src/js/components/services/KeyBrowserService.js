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
    // REMOVED: Selection state now managed by SelectionService
    // this.selectedKeyName    = null
    // this._cachedSelections = { space: null, ground: null }

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
      this.respond('key:get-all',           () => this.getKeys())
      this.respond('key:get-profile',       () => this.getProfile())
      // REMOVED: key:select now handled by SelectionService
      // this.respond('key:select',            ({ key }) => this.selectKey(key))
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
      
      // REMOVED: Selection clearing now handled by SelectionService
      // this.selectedKeyName = null
      // this._cachedSelections = { space: null, ground: null }
      
      this.updateCacheFromProfile(profile)
      this.emit('key:list-changed', { keys: this.getKeys() })
    })

    // Environment changed – allow either string payload or { environment }
    this.addEventListener('environment:changed', async (payload) => {
      const env = typeof payload === 'string' ? payload : payload?.environment
      if (!env) return
      
      // REMOVED: Selection caching now handled by SelectionService
      // Cache current selection before changing environment (only for key environments)
      // if (this.currentEnvironment !== 'alias' && this.selectedKeyName) {
      //   this._cachedSelections[this.currentEnvironment] = this.selectedKeyName
      // }
      
      this.currentEnvironment = env
      this.cache.currentEnvironment = env
      // REMOVED: Selection clearing now handled by SelectionService
      // this.selectedKeyName = null
      
      // Update keys cache for new environment
      this.cache.keys = this.cache.builds[env]?.keys || {}
      
      // REMOVED: Auto-selection now handled by SelectionService
      // If switching to key environment, try to restore or auto-select
      // if (env !== 'alias') {
      //   await this._restoreOrAutoSelectKey(env)
      // }
      
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
  // TODO: Remove this method - auto-selection handled by SelectionService  
  async _restoreOrAutoSelectKey(environment) {
    // DEPRECATED: SelectionService handles auto-selection
    return
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
    } else {
      // No keys available - emit key-selected with null to indicate no selection
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[KeyBrowserService] No keys available for ${environment}, emitting null selection`)
      }
      this.selectedKeyName = null
      this.emit('key-selected', { key: null, name: null })
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
  // DEPRECATED: Selection logic moved to SelectionService
  // This method kept for legacy UI integration but delegates to SelectionService
  async selectKey (name) {
    // Delegate to SelectionService for actual selection
    const result = await this.request('selection:select-key', { 
      keyName: name, 
      environment: this.currentEnvironment 
    })
    
    // Keep legacy UI integration logic
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
    
    return result
  }

  // REMOVED: Persistence now handled by SelectionService
  /**
   * Persist key selection to profile storage
   */
  // TODO: Remove this method - persistence handled by SelectionService
  async _persistKeySelection(keyName) {
    // DEPRECATED: SelectionService handles persistence
    return // No-op 
    try {
      const profile = this.getProfile()
      if (!profile || !this.currentEnvironment || this.currentEnvironment === 'alias') {
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.log(`[KeyBrowserService] Skipping persistence: profile=${!!profile}, env=${this.currentEnvironment}`)
        }
        return // Don't persist for alias mode or if no profile
      }

      if (!this.currentProfileId) {
        console.error('[KeyBrowserService] Cannot persist selection: currentProfileId is null')
        return
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

      // Update through DataCoordinator using explicit operations API
      const { request } = await import('../../core/requestResponse.js')
      const result = await this.request('data:update-profile', {
        profileId: this.currentProfileId,
        properties: {
          selections: updatedSelections
        }
      })

      // Update local cache immediately to avoid race conditions
      if (result?.success && this.cache.profile) {
        this.cache.profile.selections = updatedSelections
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.log(`[KeyBrowserService] Updated local cache with selections:`, updatedSelections)
        }
      } else if (!result?.success) {
        console.error('[KeyBrowserService] Failed to persist selection, result:', result)
      }
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
      // REMOVED: selectedKeyName and cachedSelections now managed by SelectionService
      // All selection state ownership transferred to SelectionService
      // KeyBrowserService owns only key listing and caching logic
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
      
      // REMOVED: Selection clearing now handled by SelectionService
      // this._cachedSelections = { space: null, ground: null }
      
      this.updateCacheFromProfile(profile)
      this.emit('key:list-changed', { keys: this.getKeys() })
      
      console.log(`[${this.componentName}] Received initial state from DataCoordinator`)
    }
    
    // REMOVED: Selection state handling now delegated to SelectionService
    // Handle state from other KeyBrowserService instances - no selection state to sync
    if (sender === 'KeyBrowserService') {
      // KeyBrowserService no longer owns selection state
    }
  }
} 