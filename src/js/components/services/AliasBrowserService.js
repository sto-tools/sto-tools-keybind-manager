import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import i18next from 'i18next'
import { respond, request } from '../../core/requestResponse.js'
import { isAliasNameAllowed } from '../../lib/aliasNameValidator.js'

/**
 * AliasBrowserService – source-of-truth for alias CRUD & selection.
 * REFACTORED: Now uses DataCoordinator broadcast/cache pattern.
 */
export default class AliasBrowserService extends ComponentBase {
  constructor ({ storage, ui, eventBus } = {}) {
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
      this.respond('alias:get-all', () => this.getAliases())
      // REMOVED: alias:select - SelectionService handles this for centralized selection management
      
      // Use addEventListener for alias:delete since AliasBrowserUI emits it rather than requests it
      this.addEventListener('alias:delete', ({ name } = {}) => this.deleteAlias(name))
      // New: duplicate alias with explicit target name from UI
      this.addEventListener('alias:duplicate', ({ from, to, name } = {}) => {
        // Support old payload shape { name } for backward-compatibility
        if (from && to) return this.duplicateAlias(from, to)
        const source = name || from
        return this.duplicateAlias(source)
      })
      // New: create alias from UI modal
      this.addEventListener('alias:create', ({ name, description='' } = {}) => this.createAlias(name, description))
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
      if (typeof window !== 'undefined') {
        console.log(`[AliasBrowserService] profile:updated received. profileId: ${profileId}, cache.currentProfile: ${this.cache.currentProfile}, match: ${profileId === this.cache.currentProfile}`)
      }
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
      
      // Clear legacy selection state when profile changes
      this.selectedAliasName = null
      this._cachedAliasSelection = null
      
      this.updateCacheFromProfile(profile)
      this.emit('aliases-changed', { aliases: this.cache.aliases })

      // SelectionService now handles all auto-selection logic
    })

    // Listen for environment changes
    this.addEventListener('environment:changed', async (payload) => {
      const env = typeof payload === 'string' ? payload : payload?.environment
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[AliasBrowserService] environment:changed received. payload:`, payload, `parsed env: ${env}`)
      }
      if (env) {
        this.currentEnvironment = env
        this.cache.currentEnvironment = env
        
        // SelectionService now handles all selection caching and restoration
        // AliasBrowserService just needs to track the current environment for data operations
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
    if (!profile) {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[AliasBrowserService] updateCacheFromProfile called with null/undefined profile`)
      }
      return
    }
    
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`[AliasBrowserService] updateCacheFromProfile called with profile:`, profile, 'aliases:', profile.aliases)
    }
    
    this.cache.profile = profile
    this.cache.aliases = profile.aliases || {}
    
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`[AliasBrowserService] cache updated. aliases:`, this.cache.aliases, 'keys:', Object.keys(this.cache.aliases))
    }
  }

  /* ============================================================
   * Selection caching and auto-selection
   * ============================================================ */
  
  // REMOVED: _restoreOrAutoSelectAlias() - SelectionService now handles all selection restoration and auto-selection

  /* ============================================================
   * REFACTORED: Data helpers now use cached data
   * ============================================================ */
  getProfile() {
    // Return cached profile instead of accessing storage directly
    return this.cache.profile
  }

  getAliases() {
    // Return cached aliases
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`[AliasBrowserService] getAliases() called. cache.aliases:`, this.cache.aliases, 'keys:', Object.keys(this.cache.aliases || {}))
    }
    return Object.fromEntries(Object.entries(this.cache.aliases || {}).filter(([key, value]) => value.type !== 'vfx-alias')) 
  }

  async selectAlias(name) {
    // REFACTORED: Delegate to SelectionService for centralized selection management
    const result = await this.request('selection:select-alias', { 
      aliasName: name
    })
    
    return result
  }

  /**
   * DEPRECATED: Persist alias selection to profile storage
   * SelectionService now handles persistence centrally
   */
  async _persistAliasSelection(aliasName) {
    // DEPRECATED: SelectionService handles persistence
    return // No-op
    try {
      const profile = this.getProfile()
      if (!profile) {
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.log(`[AliasBrowserService] Skipping persistence: no profile available`)
        }
        return // Don't persist if no profile
      }

      if (!this.currentProfileId) {
        console.error('[AliasBrowserService] Cannot persist selection: currentProfileId is null')
        return
      }

      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[AliasBrowserService] Persisting alias selection: alias -> ${aliasName}`)
      }

      // Prepare updated selections
      const updatedSelections = {
        ...(profile.selections || {}),
        alias: aliasName
      }

      // Update through DataCoordinator using explicit operations API
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
          console.log(`[AliasBrowserService] Updated local cache with selections:`, updatedSelections)
        }
      } else if (!result?.success) {
        console.error('[AliasBrowserService] Failed to persist selection, result:', result)
      }
    } catch (error) {
      console.error('[AliasBrowserService] Failed to persist alias selection:', error)
    }
  }

  /* ============================================================
   * REFACTORED: CRUD operations now use DataCoordinator
   * ============================================================ */
  async createAlias(name, description = '') {
    // Delegate CRUD operation to AliasService
    const result = await this.request('alias:add', { name, description })
    
    if (result) {
      // Auto-select the newly created alias
      await this.selectAlias(name)
    }
    
    return result
  }

  async deleteAlias(name) {
    if (!this.cache.aliases[name]) return false

    // Clear selection if deleting the currently selected alias
    if (this.selectedAliasName === name) {
      this.selectedAliasName = null
    }

    // Delegate CRUD operation to AliasService
    return await this.request('alias:delete', { name })
  }

  /**
   * Duplicate an alias.
   * @param {string} sourceName - Name of the alias to copy from.
   * @param {string} [targetName] - Destination alias name selected by the user. If omitted the
   *                                legacy auto-suffix logic (_copy, _copy1 …) is applied for
   *                                backward-compatibility with existing tests and API consumers.
   */
  async duplicateAlias(sourceName, targetName = undefined) {
    if (!this.cache.aliases[sourceName]) return false

    let result
    if (targetName) {
      // Delegate to AliasService with explicit target name
      result = await this.request('alias:duplicate-with-name', { sourceName, newName: targetName })
    } else {
      // Delegate to AliasService for auto-generated name
      result = await this.request('alias:duplicate', { sourceName })
    }

    if (result?.success) {
      // Auto-select the newly duplicated alias
      await this.selectAlias(result.newName)
      return true
    }

    return false
  }

  /* ============================================================
   * ComponentBase late-join support
   * ============================================================ */
  getCurrentState() {
    return {
      // REMOVED: All selection state - now managed by SelectionService
      // REMOVED: currentProfileId, currentEnvironment, aliases - not owned by AliasBrowserService
      // These will be managed by SelectionService (selection) and DataCoordinator (profile/environment)
    }
  }

  handleInitialState(sender, state) {
    // REMOVED: DataCoordinator and SelectionService handling now in ComponentBase._handleInitialState
    // REMOVED: Selection state handling - now managed by SelectionService
  }
} 