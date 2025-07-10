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
      this.respond('alias:select', async ({ name }) => await this.selectAlias(name))
      
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
    this.addEventListener('environment:changed', async (payload) => {
      const env = typeof payload === 'string' ? payload : payload?.environment
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[AliasBrowserService] environment:changed received. payload:`, payload, `parsed env: ${env}`)
      }
      if (env) {
        // Cache current selection before changing environment (only when leaving alias mode)
        if (this.currentEnvironment === 'alias' && this.selectedAliasName) {
          this._cachedAliasSelection = this.selectedAliasName
          if (typeof window !== 'undefined') {
            // eslint-disable-next-line no-console
            console.log(`[AliasBrowserService] Cached alias selection before leaving alias mode: ${this.selectedAliasName}`)
          }
        }
        
        this.currentEnvironment = env
        this.cache.currentEnvironment = env
        
        // If switching to alias mode, restore or auto-select immediately
        if (env === 'alias') {
          if (typeof window !== 'undefined') {
            // eslint-disable-next-line no-console
            console.log(`[AliasBrowserService] Switching to alias mode, calling _restoreOrAutoSelectAlias() immediately`)
          }
          await this._restoreOrAutoSelectAlias()
        } else {
          // Clear selection when switching away from alias mode
          this.selectedAliasName = null
          if (typeof window !== 'undefined') {
            // eslint-disable-next-line no-console
            console.log(`[AliasBrowserService] Switching away from alias mode, cleared selectedAliasName`)
          }
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
  
  /**
   * Restore cached selection or auto-select first alias
   */
  async _restoreOrAutoSelectAlias() {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`[AliasBrowserService] _restoreOrAutoSelectAlias called. selectedAliasName: ${this.selectedAliasName}`)
    }
    
    // Try to restore persisted selection first
    const profile = this.getProfile()
    const persistedAlias = profile?.selections?.alias
    const aliases = this.getAliases()
    
    if (persistedAlias && aliases[persistedAlias]) {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[AliasBrowserService] Restoring persisted alias selection: ${persistedAlias}`)
      }
      await this.selectAlias(persistedAlias)
      return
    } else if (persistedAlias) {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[AliasBrowserService] Persisted alias ${persistedAlias} no longer exists`)
      }
    }
    
    // Auto-select first alias if none selected and aliases exist
    if (!this.selectedAliasName) {
      const names = Object.keys(aliases)
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[AliasBrowserService] Auto-selecting first alias. Available aliases: [${names.join(', ')}]`)
      }
      if (names.length > 0) {
        // Sort names to ensure consistent first selection
        names.sort()
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.log(`[AliasBrowserService] Auto-selecting first alias: ${names[0]}`)
        }
        await this.selectAlias(names[0])
      } else {
        // No aliases available - emit alias-selected with null to indicate no selection
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.log(`[AliasBrowserService] No aliases available, emitting null selection`)
        }
        this.selectedAliasName = null
        this.emit('alias-selected', { name: null })
      }
    } else {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[AliasBrowserService] Alias already selected: ${this.selectedAliasName}`)
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
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`[AliasBrowserService] getAliases() called. cache.aliases:`, this.cache.aliases, 'keys:', Object.keys(this.cache.aliases || {}))
    }
    return Object.fromEntries(Object.entries(this.cache.aliases || {}).filter(([key, value]) => value.type !== 'vfx-alias')) 
  }

  async selectAlias(name) {
    this.selectedAliasName = name
    
    // Persist selection to profile storage
    await this._persistAliasSelection(name)
    
    this.emit('alias-selected', { name })
  }

  /**
   * Persist alias selection to profile storage
   */
  async _persistAliasSelection(aliasName) {
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
    const profile = this.getProfile()
    if (!profile) return false

    if (this.cache.aliases[name]) {
      this.ui && this.ui.showToast(i18next.t('alias_already_exists', { name }), 'error')
      return false
    }

    try {
      // Add new alias using explicit operations API
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        add: {
          aliases: {
            [name]: { description, commands: '' }
          }
        }
      })

      this.emit('alias-created', { name })
      await this.selectAlias(name)
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
      if (typeof window !== 'undefined') {
        console.log(`[AliasBrowserService] deleteAlias: Deleting '${name}' from aliases`)
        console.log(`[AliasBrowserService] deleteAlias: Original aliases:`, Object.keys(this.cache.aliases))
        console.log(`[AliasBrowserService] deleteAlias: Sending delete request to DataCoordinator with profileId:`, this.cache.currentProfile)
      }

      // Delete alias using explicit operations API
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        delete: {
          aliases: [name]
        }
      })

      if (this.selectedAliasName === name) this.selectedAliasName = null
      this.emit('alias-deleted', { name })
      // Note: aliases-changed will be emitted by profile:updated handler after cache is updated
      return true
    } catch (error) {
      console.error('[AliasBrowserService] Failed to delete alias:', error)
      this.ui && this.ui.showToast('Failed to delete alias', 'error')
      return false
    }
  }

  /**
   * Duplicate an alias.
   * @param {string} sourceName - Name of the alias to copy from.
   * @param {string} [targetName] - Destination alias name selected by the user. If omitted the
   *                                legacy auto-suffix logic (_copy, _copy1 …) is applied for
   *                                backward-compatibility with existing tests and API consumers.
   */
  async duplicateAlias(sourceName, targetName = undefined) {
    const original = this.cache.aliases[sourceName]
    if (!original) return false

    try {
      // ------------------------------------------------------
      // Determine new name
      // ------------------------------------------------------
      let newName = targetName?.trim()

      if (!newName) {
        // Legacy fallback – keeps older tests passing until they are updated.
        let counter = 0
        do {
          newName = `${sourceName}_copy${counter || ''}`
          counter++
        } while (this.cache.aliases[newName])
      } else {
        // Validate uniqueness when target provided
        if (this.cache.aliases[newName]) {
          this.ui && this.ui.showToast(i18next.t('alias_name_in_use') || 'Alias already exists', 'error')
          return false
        }
        // Basic pattern validation (alphanumeric + underscores)
        if (!/^[A-Za-z0-9_]+$/.test(newName)) {
          this.ui && this.ui.showToast(i18next.t('invalid_alias_name') || 'Invalid alias name', 'error')
          return false
        }
      }

      // Check reserved command names
      if (!isAliasNameAllowed(newName)) {
        this.ui && this.ui.showToast(i18next.t('reserved_command_name') || 'Reserved command name', 'error')
        return false
      }

      // ------------------------------------------------------
      // Persist duplicate via DataCoordinator
      // ------------------------------------------------------
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        add: {
          aliases: {
            [newName]: {
              description: original.description + ' (copy)',
              commands: original.commands,
            }
          }
        }
      })

      // Emit alias-created first, then select so alias-selected fires afterwards
      this.emit('alias-created', { name: newName })
      await this.selectAlias(newName)
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
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(`[AliasBrowserService] handleInitialState called. sender: ${sender}, state:`, state)
    }
    
    if (!state) return
    
    // Handle state from DataCoordinator via ComponentBase late-join
    if (sender === 'DataCoordinator' && state.currentProfileData) {
      const profile = state.currentProfileData
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[AliasBrowserService] Processing DataCoordinator state. profile:`, profile)
      }
      
      this.currentProfileId = profile.id
      this.cache.currentProfile = profile.id
      this.currentEnvironment = profile.currentEnvironment || profile.environment || 'space'
      this.cache.currentEnvironment = this.currentEnvironment
      
      // Clear cached selection when profile changes
      this._cachedAliasSelection = null
      
      this.updateCacheFromProfile(profile)
      this.emit('aliases-changed', { aliases: this.cache.aliases })
      
      // Auto-select alias if we're in alias environment during initialization
      if (this.currentEnvironment === 'alias' && !this.selectedAliasName) {
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.log(`[AliasBrowserService] Initial state: environment is 'alias', calling _restoreOrAutoSelectAlias()`)
        }
        // Use setTimeout to ensure this runs after the current event loop
        setTimeout(() => this._restoreOrAutoSelectAlias(), 0)
      }
      
      console.log(`[${this.componentName}] Received initial state from DataCoordinator`)
    }
    
    // Handle state from other AliasBrowserService instances
    if (sender === 'AliasBrowserService') {
      this.selectedAliasName = state.selectedAliasName ?? this.selectedAliasName
      this._cachedAliasSelection = state.cachedAliasSelection ?? this._cachedAliasSelection
    }
  }
} 