import ComponentBase from '../ComponentBase.js'

/**
 * SelectionService - Centralized selection state management
 * 
 * Manages all selection state across the application including:
 * - Key selection (space/ground environments)
 * - Alias selection 
 * - Environment-specific cached selections
 * - Parameter editing context
 * - Auto-selection logic
 * - Selection persistence to profiles
 */
export default class SelectionService extends ComponentBase {
  constructor({ eventBus } = {}) {
    super(eventBus)
    this.componentName = 'SelectionService'
    
    this.editingContext = null
    
    // Environment-specific cached selections for persistence
    this.cachedSelections = {
      space: null,   // Last selected key in space environment
      ground: null,  // Last selected key in ground environment  
      alias: null    // Last selected alias
    }
    // Store detach functions for cleanup
    this._responseDetachFunctions = []
    // Track last-deleted items to avoid re-selecting them during auto-selection
    this._lastDeletedKey = null
    this._lastDeletedAlias = null
    // In test environments, automatically make `emit` a spy
    if (typeof vi !== 'undefined' && typeof vi.fn === 'function' && !vi.isMockFunction?.(this.emit)) {
      const originalEmit = this.emit.bind(this)
      this.emit = vi.fn((...args) => originalEmit(...args))
    }
  }
  
  onInit() {
    this.setupEventListeners()
    this.setupRequestHandlers()
    if (this.cache && !this.cache.cachedSelections) {
      this.cache.cachedSelections = { ...this.cachedSelections }
    }
  }

  setCachedSelection(environment, value) {
    if (!environment) return
    this.cachedSelections[environment] = value
    if (this.cache) {
      if (!this.cache.cachedSelections) {
        this.cache.cachedSelections = { ...this.cachedSelections }
      } else {
        this.cache.cachedSelections[environment] = value
      }
    }
  }

  getCachedSelection(environment) {
    if (!environment) return undefined
    if (Object.prototype.hasOwnProperty.call(this.cachedSelections, environment)) {
      return this.cachedSelections[environment]
    }
    if (this.cache?.cachedSelections && Object.prototype.hasOwnProperty.call(this.cache.cachedSelections, environment)) {
      return this.cache.cachedSelections[environment]
    }
    return undefined
  }
  
  // Set up event listeners for integration with other services
  setupEventListeners() {
    // ComponentBase automatically handles profile and environment caching
    // We only need to listen for these events to update our specific business logic
    this.addEventListener('profile:updated', ({ profileId, profile }) => {
      if (profileId === this.cache.currentProfile) {
        this.updateCacheFromProfile(profile)
      }
    })

    // Listen for DataCoordinator profile switches (synchronous support)
    this.addEventListener('profile:switched', ({ profileId, profile, environment }) => {
      console.log(`[SelectionService] profile:switched: profileId="${profileId}", env="${environment}"`)

      // ComponentBase handles currentProfile, profile, and currentEnvironment caching
      this.updateCacheFromProfile(profile)

      // Handle null profile gracefully
      if (!profile) {
        this.cachedSelections = { space: null, ground: null, alias: null }
        return
      }

      // Restore cached selections from the new profile
      if (profile.selections) {
        if (profile.selections.space) {
          this.cachedSelections.space = profile.selections.space
          this.setCachedSelection('space', profile.selections.space)
        }
        if (profile.selections.ground) {
          this.cachedSelections.ground = profile.selections.ground
          this.setCachedSelection('ground', profile.selections.ground)
        }
        if (profile.selections.alias) {
          this.cachedSelections.alias = profile.selections.alias
          this.setCachedSelection('alias', profile.selections.alias)
        }

        console.log(`[SelectionService] Restored cached selections from profile:`, this.cachedSelections)
      }

      // Restore selection for current environment
      const cachedSelection = this.cachedSelections[this.cache.currentEnvironment]
      console.log(`[SelectionService] Validating and restoring selection for "${this.cache.currentEnvironment}": "${cachedSelection}"`)

      // Check if this is initial profile loading vs user-triggered changes
      // For initial profile loading, set selection directly and then validate it
      if (cachedSelection) {
        console.log(`[SelectionService] Setting initial selection from profile: "${cachedSelection}" for env "${this.cache.currentEnvironment}"`)

        // Set selection initially, then validate to ensure it exists in current profile
        if (this.cache.currentEnvironment === 'alias') {
          this.cache.selectedAlias = cachedSelection
          this.cache.selectedKey = null
          // Emit selection event synchronously
          this.emit('alias-selected', { name: cachedSelection, source: 'SelectionService' })

          // Validate the selection exists in current profile
          if (!this.validateAliasExists(cachedSelection)) {
            console.log(`[SelectionService] Cached alias "${cachedSelection}" doesn't exist in current profile, clearing and auto-selecting`)
            setTimeout(async () => {
              await this.validateAndRestoreSelection('alias', null)
            }, 0)
          }
        } else {
          this.cache.selectedKey = cachedSelection
          this.cache.selectedAlias = null
          // Emit selection event synchronously
          this.emit('key-selected', {
            key: cachedSelection,
            environment: this.cache.currentEnvironment,
            source: 'SelectionService'
          })

          // Validate the selection exists in current profile
          if (!this.validateKeyExists(cachedSelection, this.cache.currentEnvironment)) {
            console.log(`[SelectionService] Cached key "${cachedSelection}" doesn't exist in current profile, clearing and auto-selecting`)
            setTimeout(async () => {
              await this.validateAndRestoreSelection(this.cache.currentEnvironment, null)
            }, 0)
          }
        }
      } else {
        // No cached selection - validate and restore as fallback
        console.log(`[SelectionService] No cached selection, validating for env "${this.cache.currentEnvironment}"`)
        setTimeout(async () => {
          await this.validateAndRestoreSelection(this.cache.currentEnvironment, cachedSelection)
        }, 0)
      }
    })
    
    // Listen for environment changes
    this.addEventListener('environment:changed', async (data) => {
      const env = typeof data === 'string' ? data : data?.environment
      const previousEnv = typeof data === 'object' && data?.fromEnvironment
        ? data.fromEnvironment
        : this.cache.currentEnvironment

      if (env && env !== previousEnv) {
        await this.switchEnvironment(env, previousEnv)
      }
    })
    
    // Listen for alias deletions to handle auto-selection when selected alias is deleted
    this.addEventListener('alias-deleted', async ({ name }) => {
      this._lastDeletedAlias = name
      if (this.cache.selectedAlias === name) {
        this.cache.selectedAlias = null
        this.setCachedSelection('alias', null)

        // Remove alias from cached data so auto-selection won't pick the deleted one again
        if (this.cache.aliases && this.cache.aliases[name]) {
          delete this.cache.aliases[name]
        }
        if (this.cache.profile?.aliases && this.cache.profile.aliases[name]) {
          delete this.cache.profile.aliases[name]
        }

        // Emit clear event for immediate UI update
        this.emit('alias-selected', { name: null, source: 'SelectionService' })
        
        // Auto-select another alias if we're in alias environment
        if (this.cache.currentEnvironment === 'alias') {
          await this.autoSelectFirst('alias')
        }
      }
    })
    
    // Listen for key deletions to handle auto-selection when selected key is deleted  
    this.addEventListener('key-deleted', async ({ keyName }) => {
      this._lastDeletedKey = keyName
      if (this.cache.selectedKey === keyName) {
        this.cache.selectedKey = null

        // Update cache to remove the deleted key from all locations
        if (this.cache.builds) {
          for (const [env, build] of Object.entries(this.cache.builds)) {
            if (build.keys && build.keys[keyName]) {
              delete build.keys[keyName]
              this.setCachedSelection(env, null)
            }
          }
        }
        if (this.cache.keys && this.cache.keys[keyName]) {
          delete this.cache.keys[keyName]
          this.setCachedSelection(this.cache.currentEnvironment, null)
        }

        // Emit clear event for immediate UI update
        this.emit('key-selected', { key: null, source: 'SelectionService' })

        // Auto-select another key if we're in key environment (space/ground)
        if (this.cache.currentEnvironment !== 'alias') {
          await this.autoSelectFirst(this.cache.currentEnvironment)
        }
      }
    })
  }
  
  // Set up request/response handlers for external API
  setupRequestHandlers() {
    this._responseDetachFunctions.push(
      // Core selection operations
      this.respond('selection:select-key', ({ keyName, environment }) => 
        this.selectKey(keyName, environment)),
      this.respond('selection:select-alias', ({ aliasName }) => 
        this.selectAlias(aliasName)),
      this.respond('selection:clear', ({ type }) => 
        this.clearSelection(type)),
      this.respond('selection:get-selected', ({ environment }) => 
        this.getSelectedItem(environment)),
      
      // State queries
      this.respond('selection:get-state', () => this.getSelectionState()),
      this.respond('selection:get-cached', ({ environment }) => 
        this.getCachedSelection(environment)),
      
      // Auto-selection
      this.respond('selection:auto-select-first', ({ environment }) => 
        this.autoSelectFirst(environment)),
      
      // Editing context
      this.respond('selection:set-editing-context', ({ context }) => 
        this.setEditingContext(context)),
      this.respond('selection:get-editing-context', () => 
        this.editingContext),
        
      // Legacy compatibility handlers
      this.respond('key:get-selected', () => this.cache.selectedKey),
      this.respond('key:select', ({ keyName, environment }) => 
        this.selectKey(keyName, environment)),
      this.respond('alias:select', ({ aliasName }) => 
        this.selectAlias(aliasName))
    )
  }
  
  // Select a key in the specified environment
  async selectKey(keyName, environment = null, options = {}) {
    const env = environment || this.cache.currentEnvironment
    const isAuto = options.isAuto === true
    const skipPersistence = options.skipPersistence === true

    const duplicateSelection = this.cache.selectedKey === keyName && this.cache.currentEnvironment === env
    const shouldEmitDuplicate = options.forceEmit === true || keyName == null || (!isAuto && (this._lastSelectionSource === 'auto' || this._lastSelectionSource == null))

    if (duplicateSelection && !shouldEmitDuplicate) {
      return keyName
    }

    // Update selection state
    this.cache.selectedKey = keyName
    this.cache.selectedAlias = null // Clear alias when selecting key
    this.setCachedSelection(env, keyName)
    if (environment == null) {
      this.cache.currentEnvironment = env
    }

    // Persist selection immediately unless explicitly skipped
    if (!skipPersistence) {
      await this.persistSelectionToProfile(env, keyName)
    }

    // Emit selection event for other services
    this.emit('key-selected', {
      key: keyName,
      environment: env,
      source: 'SelectionService'
    })

    this._lastSelectionSource = isAuto ? 'auto' : 'manual'

    return keyName
  }

  // Select an alias
  async selectAlias(aliasName, options = {}) {
    const isAuto = options.isAuto === true
    const skipPersistence = options.skipPersistence === true
    const duplicateSelection = this.cache.selectedAlias === aliasName
    const shouldEmitDuplicate = options.forceEmit === true || aliasName == null || (!isAuto && (this._lastAliasSelectionSource === 'auto' || this._lastAliasSelectionSource == null))

    // Check if this is the same selection (avoid duplicate events)
    if (duplicateSelection && !shouldEmitDuplicate && this.cache.currentEnvironment === 'alias') {
      return aliasName
    }

    // Update selection state
    this.cache.selectedAlias = aliasName
    this.cache.selectedKey = null // Clear key when selecting alias
    this.setCachedSelection('alias', aliasName)

    // Persist selection immediately unless explicitly skipped
    if (!skipPersistence) {
      await this.persistSelectionToProfile('alias', aliasName)
    }

    // Emit selection event for other services
    this.emit('alias-selected', {
      name: aliasName,
      source: 'SelectionService'
    })

    this._lastAliasSelectionSource = isAuto ? 'auto' : 'manual'

    return aliasName
  }
  
  // Clear selection of specified type or all
  clearSelection(type = 'all') {
    switch (type) {
      case 'key':
        this.cache.selectedKey = null
        break
      case 'alias':
        this.cache.selectedAlias = null
        break
      case 'editing':
        this.editingContext = null
        break
      case 'all':
      default:
        this.cache.selectedKey = null
        this.cache.selectedAlias = null
        this.editingContext = null
        break
    }
    
    // Emit clear events
    if (type === 'all' || type === 'key') {
      this.emit('key-selected', { key: null, source: 'SelectionService' })
    }
    if (type === 'all' || type === 'alias') {
      this.emit('alias-selected', { name: null, source: 'SelectionService' })
    }
  }
  
  // Get the currently selected item for the specified environment
  getSelectedItem(environment = null) {
    const env = environment || this.cache.currentEnvironment
    
    if (env === 'alias') {
      return this.cache.selectedAlias
    } else {
      return this.cache.selectedKey
    }
  }
  
  // Get complete selection state
  getSelectionState() {
    return {
      selectedKey: this.cache.selectedKey,
      selectedAlias: this.cache.selectedAlias,
      editingContext: this.editingContext,
      cachedSelections: { ...this.cachedSelections },
      currentEnvironment: this.cache.currentEnvironment
    }
  }
  
  // Set parameter editing context
  setEditingContext(context) {
    this.editingContext = context
    this.emit('editing-context-changed', { context })
    return context
  }
  
  // Switch to a different environment
  async switchEnvironment(newEnvironment, previousEnv = null) {
    const previousEnvResolved = previousEnv ?? this.cache.currentEnvironment ?? this.cache.profile?.currentEnvironment ?? 'space'

    // CRITICAL: Cache current selection BEFORE switching environments
    if (previousEnvResolved === 'alias' && this.cache.selectedAlias) {
      this.setCachedSelection('alias', this.cache.selectedAlias)
      console.log(`[SelectionService] Cached alias selection "${this.cache.selectedAlias}" before switching from ${previousEnvResolved} to ${newEnvironment}`)
      // Persist the cached selection to profile so it survives reloads
      await this.persistSelectionToProfile('alias', this.cache.selectedAlias)
    } else if (previousEnvResolved !== 'alias' && this.cache.selectedKey) {
      this.setCachedSelection(previousEnvResolved, this.cache.selectedKey)
      console.log(`[SelectionService] Cached key selection "${this.cache.selectedKey}" for env "${previousEnvResolved}" before switching to ${newEnvironment}`)
      // Persist the cached selection to profile so it survives reloads
      await this.persistSelectionToProfile(previousEnvResolved, this.cache.selectedKey)
    }

    this.cache.currentEnvironment = newEnvironment
    this._refreshKeysForEnvironment(newEnvironment)
    
    // Auto-restore cached selection for the new environment with validation
    let cachedSelection = this.getCachedSelection(newEnvironment)
    if (cachedSelection === undefined) {
      cachedSelection = this.cache.profile?.selections?.[newEnvironment] ?? null
      this.setCachedSelection(newEnvironment, cachedSelection)
    }
    console.log(`[SelectionService] Switching to ${newEnvironment}, cached selection: "${cachedSelection}"`)
      
    if (newEnvironment === 'alias') {
      // Switching to alias mode - clear key selection first
      this.cache.selectedKey = null
      this.cache.selectedAlias = cachedSelection ?? null
      this.emit('key-selected', { key: null, source: 'SelectionService' })
      
      // Validate and restore alias selection
      await this.validateAndRestoreSelection('alias', cachedSelection)
    } else {
      // Switching to key mode (space/ground) - clear alias selection first
      this.cache.selectedAlias = null
      this.cache.selectedKey = cachedSelection ?? null
      this.emit('alias-selected', { name: null, source: 'SelectionService' })
      
      // Validate and restore key selection
      await this.validateAndRestoreSelection(newEnvironment, cachedSelection)
    }

    this.emit('environment:switched', {
      from: previousEnvResolved,
      to: newEnvironment,
      source: 'SelectionService'
    })

    // After environment switch, ensure profile selections reflect cached values
    // This guards against any race where other services might overwrite selections
    setTimeout(async () => {
      try {
        const selectionsToPersist = {}
        if (this.cachedSelections.space) selectionsToPersist.space = this.cachedSelections.space
        if (this.cachedSelections.ground) selectionsToPersist.ground = this.cachedSelections.ground
        if (this.cachedSelections.alias) selectionsToPersist.alias = this.cachedSelections.alias
        if (this.cache.currentProfile && Object.keys(selectionsToPersist).length > 0) {
          await this.request('data:update-profile', {
            profileId: this.cache.currentProfile,
            updates: {
              properties: { selections: selectionsToPersist }
            },
            updateSource: 'SelectionService'
          })
        }
      } catch (err) {
        // Non-fatal; selection state remains in cache
      }
    }, 10)
  }

  _refreshKeysForEnvironment(environment) {
    if (!environment) return
    const builds = this.cache.builds || this.cache.profile?.builds
    if (builds && builds[environment]?.keys) {
      this.cache.keys = builds[environment].keys
      return
    }
    if (this.cache.profile?.keys && environment === this.cache.currentEnvironment) {
      this.cache.keys = this.cache.profile.keys
      return
    }
    this.cache.keys = {}
  }

  // Auto-select the first available item in the specified environment
  async autoSelectFirst(environment = null) {
    const env = environment || this.cache.currentEnvironment
    
    if (env === 'alias') {
      // Try cached aliases first
      let aliases = this.cache.aliases || {}
      
      // If cache is empty, try to get from DataCoordinator
      if (Object.keys(aliases).length === 0) {
        try {
          aliases = await this.request('data:get-aliases') || {}
        } catch (error) {
          console.warn('[SelectionService] Failed to get aliases for auto-selection:', error)
          return null
        }
      }
      
      // Auto-select first user-created alias (filter out VFX Manager system aliases)
      let userAliases = Object.entries(aliases).filter(([key, value]) => value.type !== 'vfx-alias')
      // Exclude the last deleted alias if present
      if (this._lastDeletedAlias) {
        userAliases = userAliases.filter(([aliasName]) => aliasName !== this._lastDeletedAlias)
      }
      
      if (userAliases.length > 0) {
        const firstAlias = userAliases[0][0] // Get the key (alias name)
        await this.selectAlias(firstAlias, { isAuto: true })
        this._lastDeletedAlias = null
        return firstAlias
      }
    } else {
      // Auto-select first key for space/ground using cached data
      
      // Use current environment keys if available, otherwise try to get from builds
      let keys = this.cache.keys || {}
      
      // If we're switching environments or current keys are empty, look at builds data
      if ((env !== this.cache.currentEnvironment || Object.keys(keys).length === 0) && this.cache.builds) {
        keys = this.cache.builds[env]?.keys || {}
      }
      
      // If cache is still empty, try to get from DataCoordinator
      if (Object.keys(keys).length === 0) {
        try {
          keys = await this.request('data:get-keys', { environment: env }) || {}
        } catch (error) {
          return null
        }
      }
      
      // Exclude last deleted key if present
      let keyNames = Object.keys(keys)
      if (this._lastDeletedKey) {
        keyNames = keyNames.filter((k) => k !== this._lastDeletedKey)
      }
      
      if (keyNames.length > 0) {
        const firstKey = keyNames[0]
        await this.selectKey(firstKey, env, { isAuto: true })
        this._lastDeletedKey = null
        return firstKey
      } else {
        // No keys available in this environment - explicitly clear selection
        // Use current environment to determine what type of selection to clear
        if (this.cache.currentEnvironment === 'alias') {
          await this.selectAlias(null, { isAuto: true })
        } else {
          await this.selectKey(null, this.cache.currentEnvironment, { isAuto: true })
        }
        return null
      }
    }
    
    return null
  }
  
  // Validate that a key still exists using cached data
  validateKeyExists(keyName, environment = null) {
    if (!keyName) return false
    
    const env = environment || this.cache.currentEnvironment
    
    // Use the same validation logic as BindsetService - check Primary Bindset
    // This ensures compatibility with bindset-enabled profiles
    const profile = this.cache.profile
    if (!profile) return false
    
    const keyData = profile.builds?.[env]?.keys?.[keyName]
    const exists = keyData !== undefined && Array.isArray(keyData)
    return exists
  }
  
  // Validate that an alias still exists using cached data
  // Only considers user-created aliases (filters out VFX Manager system aliases)
  validateAliasExists(aliasName) {
    if (!aliasName) return false
    
    // Use cached data from ComponentBase, filter out VFX aliases like AliasBrowserService does
    const aliases = this.cache.aliases || {}
    const userAliases = Object.fromEntries(Object.entries(aliases).filter(([key, value]) => value.type !== 'vfx-alias'))
    return userAliases.hasOwnProperty(aliasName)
  }
  
  // Validate and restore selection, with auto-selection fallback if invalid
  async validateAndRestoreSelection(environment, cachedSelection, options = {}) {
    const { skipPersistence = false } = options
    console.log(`[SelectionService] validateAndRestoreSelection: env="${environment}", cached="${cachedSelection}", skipPersistence=${skipPersistence}`)

    if (!cachedSelection) {
      await this.autoSelectFirst(environment)
      return
    }

    let isValid = false

    if (environment === 'alias') {
      isValid = this.validateAliasExists(cachedSelection)
      if (isValid) {
        console.log(`[SelectionService] Restoring cached alias: "${cachedSelection}"`)
        await this.selectAlias(cachedSelection, { isAuto: true, skipPersistence })
      } else {
        console.log(`[SelectionService] Cached alias "${cachedSelection}" no longer exists, auto-selecting`)
        this.setCachedSelection('alias', null)
        await this.autoSelectFirst('alias')
      }
    } else {
      isValid = this.validateKeyExists(cachedSelection, environment)
      if (isValid) {
        console.log(`[SelectionService] Restoring cached key: "${cachedSelection}" for env "${environment}"`)
        await this.selectKey(cachedSelection, environment, { isAuto: true, skipPersistence })
      } else {
        console.log(`[SelectionService] Cached key "${cachedSelection}" no longer exists in ${environment}, auto-selecting`)
        this.setCachedSelection(environment, null)
        await this.autoSelectFirst(environment)
      }
    }
  }
  
  // Update cache from profile data (DataCoordinator integration)
  updateCacheFromProfile(profile) {
    if (!profile) return
    
    this.cache.profile = profile
    this.cache.builds = profile.builds || { space: { keys: {} }, ground: { keys: {} } }
    this.cache.keys = profile.keys || {}
    this.cache.aliases = profile.aliases || {}
  }
  
  
  // Persist selection to profile via DataCoordinator
  async persistSelectionToProfile(environment, selection) {
    if (!this.cache.currentProfile || !selection) return
    
    try {
      // Get current profile to merge with existing selections
      const currentSelections = this.cache.profile?.selections || {}
      const updatedSelections = {
        ...currentSelections,
        [environment]: selection
      }
      
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        updates: {
          properties: {
            selections: updatedSelections
          }
        },
        updateSource: 'SelectionService'
      })
    } catch (error) {
      console.warn(`[SelectionService] Failed to persist selection to profile:`, error)
    }
  }
  
  // Return owned state for late-join synchronization
  getCurrentState() {
    return {
      selectedKey: this.cache.selectedKey,
      selectedAlias: this.cache.selectedAlias,
      editingContext: this.editingContext,
      cachedSelections: { ...this.cachedSelections },
      currentEnvironment: this.cache.currentEnvironment
    }
  }
  
  // Handle initial state from other components during late-join
  async handleInitialState(sender, state) {
    if (!state) return
    
    
    // Handle state from DataCoordinator
    if (sender === 'DataCoordinator' && state.hasOwnProperty('currentProfileData')) {
      const profile = state.currentProfileData

      if (!profile) {
        this.cache.currentProfile = null
        this.cachedSelections = { space: null, ground: null, alias: null }
        return
      }

      this.cache.currentProfile = profile.id
      this.cache.currentEnvironment = profile.environment || 'space'

      this.updateCacheFromProfile(profile)

      // Restore cached selections but NOT active selections (avoid showing invalid state during late-join)
      if (profile.selections) {
        if (profile.selections.space) {
          this.cachedSelections.space = profile.selections.space
          this.setCachedSelection('space', profile.selections.space)
        }
        if (profile.selections.ground) {
          this.cachedSelections.ground = profile.selections.ground
          this.setCachedSelection('ground', profile.selections.ground)
        }
        if (profile.selections.alias) {
          this.cachedSelections.alias = profile.selections.alias
          this.setCachedSelection('alias', profile.selections.alias)
        }
      }
      
      // Validate and restore selection for current environment with fallback
      const cachedSelection = this.getCachedSelection(this.cache.currentEnvironment)

      // Set initial selection state immediately to prevent UI flicker
      if (cachedSelection) {
        if (this.cache.currentEnvironment === 'alias') {
          this.cache.selectedAlias = cachedSelection
          this.cache.selectedKey = null
        } else {
          this.cache.selectedKey = cachedSelection
          this.cache.selectedAlias = null
        }
      }

      // Note: No need for delayed validation here - the profile:switched event will handle restoration
      // when DataCoordinator emits it synchronously
    }
  }
  
  // Cleanup method to detach all request/response handlers
  onDestroy() {
    if (this._responseDetachFunctions) {
      this._responseDetachFunctions.forEach(detach => {
        if (typeof detach === 'function') {
          detach()
        }
      })
      this._responseDetachFunctions = []
    }
  }
}
