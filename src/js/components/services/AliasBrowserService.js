import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import i18next from 'i18next'
import { respond, request } from '../../core/requestResponse.js'

/**
 * AliasBrowserService – source-of-truth for alias CRUD & selection.
 * REFACTORED: Now uses DataCoordinator broadcast/cache pattern.
 */
export default class AliasBrowserService extends ComponentBase {
  constructor ({ storage, ui } = {}) {
    super(eventBus)
    this.componentName = 'AliasBrowserService'
    this.storage = storage // Legacy reference (no longer used directly)
    this.ui = ui

    this.currentProfileId = null
    this.currentEnvironment = 'space'
    this.selectedAliasName = null

    // Selection caching for environment switches
    this._cachedAliasSelection = null

    // REFACTORED: Local cache for DataCoordinator integration
    this.cache = {
      currentProfile: null,
      currentEnvironment: 'space',
      aliases: {},
      profile: null
    }

    // ---------------------------------------------------------
    // Register Request/Response endpoints for alias operations
    // ---------------------------------------------------------
    if (this.eventBus) {
      respond(this.eventBus, 'alias:get-all', () => this.getAliases())
      respond(this.eventBus, 'alias:select', ({ name }) => this.selectAlias(name))
    }
  }

  /* ============================================================
   * Lifecycle
   * ============================================================ */
  async init() {
    super.init() // ComponentBase handles late-join automatically
    this.setupEventListeners()
  }

  onInit() {
    // Legacy method - now handled by init()
  }

  /* ============================================================
   * REFACTORED: Event listeners for DataCoordinator integration
   * ============================================================ */
  setupEventListeners() {
    // REFACTORED: Listen to DataCoordinator broadcasts instead of direct storage access

    // Cache profile state from DataCoordinator broadcasts
    this.addEventListener('profile:updated', ({ profileId, profile }) => {
      if (profileId === this.cache.currentProfile) {
        this.updateCacheFromProfile(profile)
        this.emit('aliases-changed', { aliases: this.cache.aliases })
      }
    })

    // Profile switched (DataCoordinator event)
    this.addEventListener('profile:switched', ({ profileId, profile, environment }) => {
      this.currentProfileId = profileId
      this.cache.currentProfile = profileId
      
      if (environment) {
        this.currentEnvironment = environment
        this.cache.currentEnvironment = environment
      }
      
      this.selectedAliasName = null
      // Clear cached selection when profile changes
      this._cachedAliasSelection = null
      
      this.updateCacheFromProfile(profile)
      this.emit('aliases-changed', { aliases: this.cache.aliases })

      // Auto-select first alias if we are in alias mode and none is selected
      if (this.currentEnvironment === 'alias' && !this.selectedAliasName) {
        const names = Object.keys(this.cache.aliases)
        if (names.length) this.selectAlias(names[0])
      }
    })

    // Listen for environment changes
    this.addEventListener('environment:changed', (payload) => {
      const env = typeof payload === 'string' ? payload : payload?.environment
      if (env) {
        // Cache current selection before changing environment (only when leaving alias mode)
        if (this.currentEnvironment === 'alias' && this.selectedAliasName) {
          this._cachedAliasSelection = this.selectedAliasName
        }
        
        this.currentEnvironment = env
        this.cache.currentEnvironment = env
        
        // If switched into alias mode, restore cached or auto-select immediately
        if (env === 'alias') {
          this._restoreOrAutoSelectAlias()
        }
      }
    })

    // Back-compat: also accept legacy topic if emitted elsewhere
    /*this.addEventListener('profile:changed', (profileId) => {
      this.currentProfileId = profileId
      this.cache.currentProfile = profileId
      this.selectedAliasName = null
      // Clear cached selection when profile changes
      this._cachedAliasSelection = null
      this.emit('aliases-changed', { aliases: this.getAliases() })
    })*/
  }

  /**
   * Update local cache from profile data
   */
  updateCacheFromProfile(profile) {
    if (!profile) return
    
    this.cache.profile = profile
    this.cache.aliases = profile.aliases || {}
  }

  /* ============================================================
   * Selection caching and auto-selection
   * ============================================================ */
  
  /**
   * Restore cached selection or auto-select first alias
   */
  _restoreOrAutoSelectAlias() {
    // Try to restore cached selection first
    if (this._cachedAliasSelection) {
      const aliases = this.getAliases()
      if (aliases[this._cachedAliasSelection]) {
        this.selectAlias(this._cachedAliasSelection)
        return
      }
    }
    
    // Auto-select first alias if none selected and aliases exist
    if (!this.selectedAliasName) {
      const names = Object.keys(this.getAliases())
      if (names.length > 0) {
        // Sort names to ensure consistent first selection
        names.sort()
        this.selectAlias(names[0])
      }
    }
  }

  /* ============================================================
   * REFACTORED: Data helpers now use cached data
   * ============================================================ */
  getProfile() {
    // Return cached profile instead of accessing storage directly
    return this.cache.profile
  }

  getAliases() {
    // Return cached aliases
    return this.cache.aliases || {}
  }

  selectAlias(name) {
    this.selectedAliasName = name
    this.emit('alias-selected', { name })
  }

  /* ============================================================
   * REFACTORED: CRUD operations now use DataCoordinator
   * ============================================================ */
  async createAlias(name, description = '') {
    const profile = this.getProfile()
    if (!profile) return false

    if (this.cache.aliases[name]) {
      this.ui && this.ui.showToast(i18next.t('alias_already_exists', { name }), 'error')
      return false
    }

    try {
      // Prepare updated aliases
      const updatedAliases = {
        ...this.cache.aliases,
        [name]: { description, commands: '' }
      }

      // Update through DataCoordinator
      await request(this.eventBus, 'data:update-profile', {
        profileId: this.cache.currentProfile,
        updates: { aliases: updatedAliases }
      })

      this.selectAlias(name)
      this.emit('alias-created', { name })
      return true
    } catch (error) {
      console.error('[AliasBrowserService] Failed to create alias:', error)
      this.ui && this.ui.showToast('Failed to create alias', 'error')
      return false
    }
  }

  async deleteAlias(name) {
    if (!this.cache.aliases[name]) return false

    try {
      // Prepare updated aliases
      const updatedAliases = { ...this.cache.aliases }
      delete updatedAliases[name]

      // Update through DataCoordinator
      await request(this.eventBus, 'data:update-profile', {
        profileId: this.cache.currentProfile,
        updates: { aliases: updatedAliases }
      })

      if (this.selectedAliasName === name) this.selectedAliasName = null
      this.emit('alias-deleted', { name })
      return true
    } catch (error) {
      console.error('[AliasBrowserService] Failed to delete alias:', error)
      this.ui && this.ui.showToast('Failed to delete alias', 'error')
      return false
    }
  }

  async duplicateAlias(name) {
    const original = this.cache.aliases[name]
    if (!original) return false

    try {
      let newName = name + '_copy'
      let counter = 1
      while (this.cache.aliases[newName]) {
        newName = `${name}_copy${counter++}`
      }

      // Prepare updated aliases
      const updatedAliases = {
        ...this.cache.aliases,
        [newName]: {
          description: original.description + ' (copy)',
          commands: original.commands,
        }
      }

      // Update through DataCoordinator
      await request(this.eventBus, 'data:update-profile', {
        profileId: this.cache.currentProfile,
        updates: { aliases: updatedAliases }
      })

      this.selectAlias(newName)
      this.emit('alias-duplicated', { from: name, to: newName })
      return true
    } catch (error) {
      console.error('[AliasBrowserService] Failed to duplicate alias:', error)
      this.ui && this.ui.showToast('Failed to duplicate alias', 'error')
      return false
    }
  }

  /* ============================================================
   * ComponentBase late-join support
   * ============================================================ */
  getCurrentState() {
    return {
      selectedAliasName: this.selectedAliasName,
      currentProfileId: this.currentProfileId,
      currentEnvironment: this.currentEnvironment,
      cachedAliasSelection: this._cachedAliasSelection,
      aliases: this.getAliases()
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
      
      // Clear cached selection when profile changes
      this._cachedAliasSelection = null
      
      this.updateCacheFromProfile(profile)
      this.emit('aliases-changed', { aliases: this.cache.aliases })
      
      console.log(`[${this.componentName}] Received initial state from DataCoordinator`)
    }
    
    // Handle state from other AliasBrowserService instances
    if (sender === 'AliasBrowserService') {
      this.selectedAliasName = state.selectedAliasName ?? this.selectedAliasName
      this._cachedAliasSelection = state.cachedAliasSelection ?? this._cachedAliasSelection
    }
  }
} 