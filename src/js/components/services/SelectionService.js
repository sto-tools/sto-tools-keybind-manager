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
      this.restoreSelectionsFromProfile(profile)
    })
    
    // Listen for environment changes
    this.addEventListener('environment:changed', (data) => {
      const env = typeof data === 'string' ? data : data?.environment
      if (env && env !== this.currentEnvironment) {
        this.switchEnvironment(env)
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
    this.currentEnvironment = newEnvironment
    
    // Auto-restore cached selection for the new environment
    const cachedSelection = this.cachedSelections[newEnvironment]
    
    if (newEnvironment === 'alias') {
      // Switching to alias mode
      if (cachedSelection) {
        await this.selectAlias(cachedSelection)
      } else {
        // Clear key selection, will auto-select first alias if needed
        this.selectedKey = null
        this.emit('key-selected', { key: null, source: 'SelectionService' })
      }
    } else {
      // Switching to key mode (space/ground)
      if (cachedSelection) {
        await this.selectKey(cachedSelection, newEnvironment)
      } else {
        // Clear alias selection, will auto-select first key if needed
        this.selectedAlias = null
        this.emit('alias-selected', { name: null, source: 'SelectionService' })
      }
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
    
    try {
      if (env === 'alias') {
        // Auto-select first alias
        const aliases = await this.request('data:get-aliases')
        if (aliases && Object.keys(aliases).length > 0) {
          const firstAlias = Object.keys(aliases)[0]
          await this.selectAlias(firstAlias)
          return firstAlias
        }
      } else {
        // Auto-select first key for space/ground
        const keys = await this.request('data:get-keys', { environment: env })
        if (keys && Object.keys(keys).length > 0) {
          const firstKey = Object.keys(keys)[0]
          await this.selectKey(firstKey, env)
          return firstKey
        }
      }
    } catch (error) {
      console.warn(`[SelectionService] Failed to auto-select first item for ${env}:`, error)
    }
    
    return null
  }
  
  /**
   * Update cache from profile data (DataCoordinator integration)
   */
  updateCacheFromProfile(profile) {
    if (!profile) return
    
    this.cache.profile = profile
  }
  
  /**
   * Restore selections from profile data
   */
  restoreSelectionsFromProfile(profile) {
    if (!profile || !profile.selections) return
    
    // Restore cached selections
    if (profile.selections.space) {
      this.cachedSelections.space = profile.selections.space
    }
    if (profile.selections.ground) {
      this.cachedSelections.ground = profile.selections.ground
    }
    if (profile.selections.alias) {
      this.cachedSelections.alias = profile.selections.alias
    }
    
    // Restore active selection based on current environment
    const envSelection = profile.selections[this.currentEnvironment]
    if (envSelection) {
      if (this.currentEnvironment === 'alias') {
        this.selectedAlias = envSelection
        this.selectedKey = null
      } else {
        this.selectedKey = envSelection
        this.selectedAlias = null
      }
    }
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
  handleInitialState(sender, state) {
    if (!state) return
    
    // Handle state from DataCoordinator
    if (sender === 'DataCoordinator' && state.currentProfileData) {
      const profile = state.currentProfileData
      this.cache.currentProfile = profile.id
      this.currentEnvironment = profile.environment || 'space'
      
      this.updateCacheFromProfile(profile)
      this.restoreSelectionsFromProfile(profile)
      
      // Emit events to notify UI components of restored selection
      if (this.currentEnvironment === 'alias') {
        if (this.selectedAlias) {
          this.emit('alias-selected', { 
            name: this.selectedAlias,
            source: 'SelectionService'
          })
        }
      } else {
        if (this.selectedKey) {
          this.emit('key-selected', { 
            key: this.selectedKey, 
            environment: this.currentEnvironment,
            source: 'SelectionService'
          })
        }
      }
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