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
 * 
 * This service replaces distributed selection logic across KeyService,
 * KeyBrowserService, CommandService, AliasBrowserService, etc.
 */
export default class SelectionService extends ComponentBase {
  constructor({ eventBus } = {}) {
    super(eventBus)
    this.componentName = 'SelectionService'
    
    // Core selection state
    this.selectedKey = null
    this.selectedAlias = null
    this.editingContext = null
    
    // Environment-specific cached selections for persistence
    this.cachedSelections = {
      space: null,   // Last selected key in space environment
      ground: null,  // Last selected key in ground environment  
      alias: null    // Last selected alias
    }
    
    // Current environment context
    this.currentEnvironment = 'space'
    
    // Cache for profile data from DataCoordinator
    this.cache = {
      currentProfile: null,
      profile: null
    }
    
    // Store detach functions for cleanup
    this._responseDetachFunctions = []
    
    this.setupEventListeners()
    this.setupRequestHandlers()
    
    // In test environments, automatically make `emit` a spy
    if (typeof vi !== 'undefined' && typeof vi.fn === 'function' && !vi.isMockFunction?.(this.emit)) {
      const originalEmit = this.emit.bind(this)
      this.emit = vi.fn((...args) => originalEmit(...args))
    }
  }
  
  /**
   * Initialize the service
   */
  async init() {
    super.init() // ComponentBase handles late-join automatically
  }
  
  /**
   * Set up event listeners for integration with other services
   */
  setupEventListeners() {
    // Listen for DataCoordinator profile updates  
    this.addEventListener('profile:updated', ({ profileId, profile }) => {
      if (profileId === this.cache.currentProfile) {
        this.updateCacheFromProfile(profile)
      }
    })
    
    // Listen for DataCoordinator profile switches
    this.addEventListener('profile:switched', ({ profileId, profile, environment }) => {
      this.cache.currentProfile = profileId
      this.cache.profile = profile
      this.currentEnvironment = environment || 'space'
      
      this.updateCacheFromProfile(profile)
    })
    
    // Listen for environment changes
    this.addEventListener('environment:changed', (data) => {
      const env = typeof data === 'string' ? data : data?.environment
      if (env && env !== this.currentEnvironment) {
        this.switchEnvironment(env)
      }
    })
    
    // Listen for alias deletions to handle auto-selection when selected alias is deleted
    this.addEventListener('alias-deleted', async ({ name }) => {
      if (this.selectedAlias === name) {
        this.selectedAlias = null
        this.cachedSelections.alias = null
        
        // Emit clear event for immediate UI update
        this.emit('alias-selected', { name: null, source: 'SelectionService' })
        
        // Auto-select another alias if we're in alias environment
        if (this.currentEnvironment === 'alias') {
          await this.autoSelectFirst('alias')
        }
      }
    })
    
    // Listen for key deletions to handle auto-selection when selected key is deleted  
    this.addEventListener('key-deleted', async ({ keyName }) => {
      
      if (this.selectedKey === keyName) {
        this.selectedKey = null
        
        // Update cache to remove the deleted key from all locations
        if (this.cache?.builds) {
          for (const [env, build] of Object.entries(this.cache.builds)) {
            if (build.keys && build.keys[keyName]) {
              delete build.keys[keyName]
              this.cachedSelections[env] = null
            }
          }
        }
        if (this.cache?.keys && this.cache.keys[keyName]) {
          delete this.cache.keys[keyName]
          this.cachedSelections[this.currentEnvironment] = null
        }
        
        
        // Auto-select another key if we're in key environment (space/ground) BEFORE emitting clear event
        if (this.currentEnvironment !== 'alias') {
          const autoSelectedKey = await this.autoSelectFirst(this.currentEnvironment)
        } else {
          // Only emit clear event if we're not doing auto-selection
          this.emit('key-selected', { key: null, source: 'SelectionService' })
        }
      } else {
      }
    })
  }
  
  /**
   * Set up request/response handlers for external API
   */
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
        this.cachedSelections[environment]),
      
      // Auto-selection
      this.respond('selection:auto-select-first', ({ environment }) => 
        this.autoSelectFirst(environment)),
      
      // Editing context
      this.respond('selection:set-editing-context', ({ context }) => 
        this.setEditingContext(context)),
      this.respond('selection:get-editing-context', () => 
        this.editingContext),
        
      // Legacy compatibility handlers
      this.respond('key:get-selected', () => this.selectedKey),
      this.respond('key:select', ({ keyName, environment }) => 
        this.selectKey(keyName, environment)),
      this.respond('alias:select', ({ aliasName }) => 
        this.selectAlias(aliasName))
    )
  }
  
  /**
   * Select a key in the specified environment
   */
  async selectKey(keyName, environment = null) {
    const env = environment || this.currentEnvironment
    
    // Update selection state
    this.selectedKey = keyName
    this.selectedAlias = null // Clear alias when selecting key
    this.cachedSelections[env] = keyName
    
    // Persist to profile if we have one
    await this.persistSelectionToProfile(env, keyName)
    
    // Emit selection event for other services
    this.emit('key-selected', { 
      key: keyName, 
      environment: env,
      source: 'SelectionService'
    })
    
    return keyName
  }
  
  /**
   * Select an alias
   */
  async selectAlias(aliasName) {
    // Update selection state
    this.selectedAlias = aliasName
    this.selectedKey = null // Clear key when selecting alias
    this.cachedSelections.alias = aliasName
    
    // Persist to profile if we have one
    await this.persistSelectionToProfile('alias', aliasName)
    
    // Emit selection event for other services
    this.emit('alias-selected', { 
      name: aliasName,
      source: 'SelectionService'
    })
    
    return aliasName
  }
  
  /**
   * Clear selection of specified type or all
   */
  clearSelection(type = 'all') {
    switch (type) {
      case 'key':
        this.selectedKey = null
        break
      case 'alias':
        this.selectedAlias = null
        break
      case 'editing':
        this.editingContext = null
        break
      case 'all':
      default:
        this.selectedKey = null
        this.selectedAlias = null
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
  
  /**
   * Get the currently selected item for the specified environment
   */
  getSelectedItem(environment = null) {
    const env = environment || this.currentEnvironment
    
    if (env === 'alias') {
      return this.selectedAlias
    } else {
      return this.selectedKey
    }
  }
  
  /**
   * Get complete selection state
   */
  getSelectionState() {
    return {
      selectedKey: this.selectedKey,
      selectedAlias: this.selectedAlias,
      editingContext: this.editingContext,
      cachedSelections: { ...this.cachedSelections },
      currentEnvironment: this.currentEnvironment
    }
  }
  
  /**
   * Set parameter editing context
   */
  setEditingContext(context) {
    this.editingContext = context
    this.emit('editing-context-changed', { context })
    return context
  }
  
  /**
   * Switch to a different environment
   */
  async switchEnvironment(newEnvironment) {
    const previousEnv = this.currentEnvironment
    
    // CRITICAL: Cache current selection BEFORE switching environments
    if (previousEnv === 'alias' && this.selectedAlias) {
      this.cachedSelections.alias = this.selectedAlias
      console.log(`[SelectionService] Cached alias selection "${this.selectedAlias}" before switching from ${previousEnv} to ${newEnvironment}`)
    } else if (previousEnv !== 'alias' && this.selectedKey) {
      this.cachedSelections[previousEnv] = this.selectedKey
      console.log(`[SelectionService] Cached key selection "${this.selectedKey}" for env "${previousEnv}" before switching to ${newEnvironment}`)
    }
    
    this.currentEnvironment = newEnvironment
    
    // Auto-restore cached selection for the new environment with validation
    const cachedSelection = this.cachedSelections[newEnvironment]
    console.log(`[SelectionService] Switching to ${newEnvironment}, cached selection: "${cachedSelection}"`)
    
    if (newEnvironment === 'alias') {
      // Switching to alias mode - clear key selection first
      this.selectedKey = null
      this.emit('key-selected', { key: null, source: 'SelectionService' })
      
      // Validate and restore alias selection
      await this.validateAndRestoreSelection('alias', cachedSelection)
    } else {
      // Switching to key mode (space/ground) - clear alias selection first
      this.selectedAlias = null
      this.emit('alias-selected', { name: null, source: 'SelectionService' })
      
      // Validate and restore key selection
      await this.validateAndRestoreSelection(newEnvironment, cachedSelection)
    }
    
    this.emit('environment:switched', { 
      from: previousEnv, 
      to: newEnvironment,
      source: 'SelectionService'
    })
  }
  
  /**
   * Auto-select the first available item in the specified environment
   */
  async autoSelectFirst(environment = null) {
    const env = environment || this.currentEnvironment
    
    if (env === 'alias') {
      // Try cached aliases first
      let aliases = this.cache?.aliases || {}
      
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
      const userAliases = Object.entries(aliases).filter(([key, value]) => value.type !== 'vfx-alias')
      
      if (userAliases.length > 0) {
        const firstAlias = userAliases[0][0] // Get the key (alias name)
        await this.selectAlias(firstAlias)
        return firstAlias
      }
    } else {
      // Auto-select first key for space/ground using cached data
      
      // Use current environment keys if available, otherwise try to get from builds
      let keys = this.cache?.keys || {}
      
      // If we're switching environments or current keys are empty, look at builds data
      if ((env !== this.currentEnvironment || Object.keys(keys).length === 0) && this.cache?.builds) {
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
      
      const keyNames = Object.keys(keys)
      
      if (keyNames.length > 0) {
        const firstKey = keyNames[0]
        await this.selectKey(firstKey, env)
        return firstKey
      } else {
        return null
      }
    }
    
    return null
  }
  
  /**
   * Validate that a key still exists using cached data
   */
  validateKeyExists(keyName, environment = null) {
    if (!keyName) return false
    
    const env = environment || this.currentEnvironment
    
    // Use the same validation logic as BindsetService - check Primary Bindset
    // This ensures compatibility with bindset-enabled profiles
    const profile = this.cache?.profile
    if (!profile) return false
    
    const keyData = profile.builds?.[env]?.keys?.[keyName]
    const exists = keyData !== undefined && Array.isArray(keyData)
    return exists
  }
  
  /**
   * Validate that an alias still exists using cached data
   * Only considers user-created aliases (filters out VFX Manager system aliases)
   */
  validateAliasExists(aliasName) {
    if (!aliasName) return false
    
    // Use cached data from ComponentBase, filter out VFX aliases like AliasBrowserService does
    const aliases = this.cache?.aliases || {}
    const userAliases = Object.fromEntries(Object.entries(aliases).filter(([key, value]) => value.type !== 'vfx-alias'))
    return userAliases.hasOwnProperty(aliasName)
  }
  
  /**
   * Validate and restore selection, with auto-selection fallback if invalid
   */
  async validateAndRestoreSelection(environment, cachedSelection) {
    console.log(`[SelectionService] validateAndRestoreSelection: env="${environment}", cached="${cachedSelection}"`)
    
    if (!cachedSelection) {
      console.log(`[SelectionService] No cached selection for ${environment}, auto-selecting first available`)
      await this.autoSelectFirst(environment)
      return
    }
    
    let isValid = false
    
    if (environment === 'alias') {
      isValid = this.validateAliasExists(cachedSelection)
      if (isValid) {
        console.log(`[SelectionService] Restoring cached alias: "${cachedSelection}"`)
        await this.selectAlias(cachedSelection)
      } else {
        console.log(`[SelectionService] Cached alias "${cachedSelection}" no longer exists, auto-selecting`)
        this.cachedSelections.alias = null
        await this.autoSelectFirst('alias')
      }
    } else {
      isValid = this.validateKeyExists(cachedSelection, environment)
      if (isValid) {
        console.log(`[SelectionService] Restoring cached key: "${cachedSelection}" for env "${environment}"`)
        await this.selectKey(cachedSelection, environment)
      } else {
        console.log(`[SelectionService] Cached key "${cachedSelection}" no longer exists in ${environment}, auto-selecting`)
        this.cachedSelections[environment] = null
        await this.autoSelectFirst(environment)
      }
    }
  }
  
  /**
   * Update cache from profile data (DataCoordinator integration)
   */
  updateCacheFromProfile(profile) {
    if (!profile) return
    
    this.cache.profile = profile
    this.cache.builds = profile.builds || { space: { keys: {} }, ground: { keys: {} } }
    this.cache.keys = profile.keys || {}
    this.cache.aliases = profile.aliases || {}
  }
  
  
  /**
   * Persist selection to profile via DataCoordinator
   */
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
        properties: {
          selections: updatedSelections
        }
      })
    } catch (error) {
      console.warn(`[SelectionService] Failed to persist selection to profile:`, error)
    }
  }
  
  /* ------------------------------------------------------------------
   * ComponentBase integration for late-join synchronization
   * ------------------------------------------------------------------ */
  
  /**
   * Return owned state for late-join synchronization
   */
  getCurrentState() {
    return {
      selectedKey: this.selectedKey,
      selectedAlias: this.selectedAlias,
      editingContext: this.editingContext,
      cachedSelections: { ...this.cachedSelections },
      currentEnvironment: this.currentEnvironment
    }
  }
  
  /**
   * Handle initial state from other components during late-join
   */
  async handleInitialState(sender, state) {
    if (!state) return
    
    
    // Handle state from DataCoordinator
    if (sender === 'DataCoordinator' && state.currentProfileData) {
      const profile = state.currentProfileData
      
      this.cache.currentProfile = profile.id
      this.currentEnvironment = profile.environment || 'space'
      
      this.updateCacheFromProfile(profile)
      
      // Restore cached selections but NOT active selections (avoid showing invalid state during late-join)
      if (profile.selections) {
        if (profile.selections.space) {
          this.cachedSelections.space = profile.selections.space
        }
        if (profile.selections.ground) {
          this.cachedSelections.ground = profile.selections.ground
        }
        if (profile.selections.alias) {
          this.cachedSelections.alias = profile.selections.alias
        }
      }
      
      // Validate and restore selection for current environment with fallback
      const cachedSelection = this.cachedSelections[this.currentEnvironment]
      
      // Set initial selection state immediately to prevent UI flicker
      if (cachedSelection) {
        if (this.currentEnvironment === 'alias') {
          this.selectedAlias = cachedSelection
          this.selectedKey = null
        } else {
          this.selectedKey = cachedSelection  
          this.selectedAlias = null
        }
      }
      
      // Then validate and properly restore with timeout for cache synchronization
      setTimeout(async () => {
        await this.validateAndRestoreSelection(this.currentEnvironment, cachedSelection)
      }, 0)
    }
  }
  
  /**
   * Cleanup method to detach all request/response handlers
   */
  destroy() {
    if (this._responseDetachFunctions) {
      this._responseDetachFunctions.forEach(detach => {
        if (typeof detach === 'function') {
          detach()
        }
      })
      this._responseDetachFunctions = []
    }
    
    // Call parent destroy if it exists
    if (super.destroy && typeof super.destroy === 'function') {
      super.destroy()
    }
  }
}