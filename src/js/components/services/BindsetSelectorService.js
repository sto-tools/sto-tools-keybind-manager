import ComponentBase from '../ComponentBase.js'

export default class BindsetSelectorService extends ComponentBase {
  constructor ({ eventBus } = {}) {
    super(eventBus)
    this.componentName = 'BindsetSelectorService'
    
    this.keyBindsetMembership = new Map() // bindset -> has key boolean
    
    if (this.eventBus) {
      this.respond('bindset-selector:set-key', ({ key }) => this.setSelectedKey(key))
      this.respond('bindset-selector:get-state', () => this.getCurrentState())
      this.respond('bindset-selector:add-key-to-bindset', ({ bindset }) => this.addKeyToBindset(bindset))
      this.respond('bindset-selector:remove-key-from-bindset', ({ bindset }) => this.removeKeyFromBindset(bindset))
      this.respond('bindset-selector:set-active-bindset', ({ bindset }) => this.setActiveBindset(bindset))
    }

    this.setupEventListeners()
  }

  async onInit() {
    console.log('[BindsetSelectorService] onInit called')
    console.log('[BindsetSelectorService] Initial cache state:', this.cache)
    console.log('[BindsetSelectorService] Component name:', this.componentName)
    
    // ComponentBase should automatically trigger late-join sync
    // Let's see if we get any handleInitialState calls
    setTimeout(() => {
      if (!this.cache.profile) {
        console.warn('[BindsetSelectorService] No profile data received after 1 second - late-join sync may have failed')
        console.log('[BindsetSelectorService] Current cache after timeout:', this.cache)
      }
    }, 1000)
  }

  // Event Listeners
  setupEventListeners() {
    if (this._listenersSetup) return
    this._listenersSetup = true

    // Listen for bindset changes from BindsetService
    this.addEventListener('bindsets:changed', ({ names }) => {
      console.log('[BindsetSelectorService] bindsets:changed received:', names)
      // ComponentBase automatically updates this.cache.bindsetNames
      this.updateKeyMembership()
    })

    // Listen for preferences changes - ComponentBase handles caching automatically
    this.addEventListener('preferences:changed', (data) => {
      // Check if bindset-related preferences changed
      const changes = data.changes || { [data.key]: data.value }
      
      if (changes.bindsetsEnabled !== undefined || changes.bindToAliasMode !== undefined) {
        console.log('[BindsetSelectorService] bindset preferences changed, updating visibility')
        const shouldDisplay = this.shouldDisplay()
        this.emit('bindset-selector:visibility-changed', { visible: shouldDisplay })
      }
    })

    // ComponentBase handles profile, environment, and key selection caching automatically
    // We only need to listen for these events to update our specific business logic
    
    this.addEventListener('profile:switched', () => {
      console.log('[BindsetSelectorService] profile:switched - updating key membership')
      this.updateKeyMembership()
    })

    this.addEventListener('profile:updated', ({ profileId }) => {
      console.log('[BindsetSelectorService] profile:updated - updating key membership')
      if (profileId === this.cache.currentProfile) {
        this.updateKeyMembership()
      }
    })

    this.addEventListener('environment:changed', () => {
      console.log('[BindsetSelectorService] environment:changed - updating key membership and visibility')
      this.updateKeyMembership()
      // Update visibility based on new environment
      const shouldDisplay = this.shouldDisplay()
      this.emit('bindset-selector:visibility-changed', { visible: shouldDisplay })
    })

    // Listen for key selection changes - update membership when user selects different key
    this.addEventListener('key-selected', ({ key, name }) => {
      const selectedKey = key || name
      console.log('[BindsetSelectorService] key-selected received:', selectedKey)
      if (selectedKey !== this.cache.selectedKey) {
        // ComponentBase automatically updates this.cache.selectedKey
        // We just need to update the key membership for the new key
        this.updateKeyMembership()
        
        // Reset to Primary Bindset when new key selected
        if (this.cache.activeBindset !== 'Primary Bindset') {
          console.log('[BindsetSelectorService] Resetting active bindset to Primary Bindset for new key selection')
          // ComponentBase will handle this.cache.activeBindset via the event
          // But we need to update it immediately for our business logic
          this.setActiveBindset('Primary Bindset')
        }
      }
    })
  }

  updatePreferences(prefs) {
    console.log('[BindsetSelectorService] updatePreferences (deprecated - using ComponentBase cache):', prefs)
    // ComponentBase now handles preferences caching automatically
    const shouldDisplay = this.shouldDisplay()
    console.log('[BindsetSelectorService] shouldDisplay:', shouldDisplay, 'bindsetsEnabled:', this.cache.preferences.bindsetsEnabled, 'bindToAliasMode:', this.cache.preferences.bindToAliasMode)
    this.emit('bindset-selector:visibility-changed', { visible: shouldDisplay })
  }

  // State Management - ComponentBase handles selectedKey caching
  setSelectedKey(key) {
    // ComponentBase will handle this.cache.selectedKey automatically via events
    // We just need to update the key membership
    this.updateKeyMembership()
  }


  setActiveBindset(bindsetName) {
    console.log(`[BindsetSelectorService] setActiveBindset called: ${this.cache.activeBindset} -> ${bindsetName}`)
    // ComponentBase handles this.cache.activeBindset automatically via the event
    console.log(`[BindsetSelectorService] About to emit bindset-selector:active-changed with bindset:`, bindsetName)
    this.emit('bindset-selector:active-changed', { bindset: bindsetName }, { synchronous: true })
    console.log(`[BindsetSelectorService] Successfully emitted bindset-selector:active-changed with bindset:`, bindsetName)
  }

  // Key Membership Management
  async updateKeyMembership() {
    if (!this.cache.selectedKey) return

    this.keyBindsetMembership.clear()
    
    for (const bindsetName of this.cache.bindsetNames) {
      const hasKey = await this.keyExistsInBindset(bindsetName)
      this.keyBindsetMembership.set(bindsetName, hasKey)
      console.log(`[BindsetSelectorService] updateKeyMembership: ${bindsetName} -> ${hasKey} (key: ${this.cache.selectedKey})`)
    }
    
    this.emit('bindset-selector:membership-updated', { 
      key: this.cache.selectedKey, 
      membership: new Map(this.keyBindsetMembership) 
    })
  }

  async keyExistsInBindset(bindsetName) {
    if (!this.cache.selectedKey) {
      console.log(`[BindsetSelectorService] keyExistsInBindset early return: no selectedKey`)
      return false
    }
    
    if (!this.cache.profile) {
      console.log(`[BindsetSelectorService] keyExistsInBindset early return: no profile data - cache:`, this.cache)
      return false
    }
    
    try {
      if (bindsetName === 'Primary Bindset') {
        // Check primary bindset (builds)
        const commands = this.cache.profile.builds?.[this.cache.currentEnvironment]?.keys?.[this.cache.selectedKey]
        const exists = commands !== undefined && Array.isArray(commands)
        console.log(`[BindsetSelectorService] Primary bindset check: ${this.cache.selectedKey} in ${this.cache.currentEnvironment} -> ${exists}`, commands)
        return exists
      } else {
        // Check user-defined bindset
        const commands = this.cache.profile.bindsets?.[bindsetName]?.[this.cache.currentEnvironment]?.keys?.[this.cache.selectedKey]
        const exists = commands !== undefined && Array.isArray(commands)
        console.log(`[BindsetSelectorService] ${bindsetName} bindset check: ${this.cache.selectedKey} in ${this.cache.currentEnvironment} -> ${exists}`, commands)
        return exists
      }
    } catch (error) {
      console.error('[BindsetSelectorService] Error checking key existence:', error)
      return false
    }
  }

  isKeyInBindset(bindsetName) {
    return this.keyBindsetMembership.get(bindsetName) || false
  }

  // Key Addition/Removal
  async addKeyToBindset(bindsetName) {
    if (!this.cache.selectedKey || bindsetName === 'Primary Bindset') {
      return { success: false, error: 'invalid_operation' }
    }

    try {
      // Set flag to indicate we're performing a bindset operation
      this.emit('bindset-operation:started', { type: 'add-key', bindset: bindsetName, key: this.cache.selectedKey })
      // Add empty command chain to the bindset using cached profile data
      const profile = this.cache.profile
      if (!profile || !profile.id) {
        return { success: false, error: 'no_profile' }
      }

      const updates = {
        modify: {
          bindsets: {
            [bindsetName]: {
              [this.cache.currentEnvironment]: {
                keys: {
                  [this.cache.selectedKey]: []
                }
              }
            }
          }
        }
      }

      const result = await this.request('data:update-profile', { 
        profileId: profile.id, 
        updates 
      })

      if (result?.success) {
        this.keyBindsetMembership.set(bindsetName, true)
        
        // CRITICAL FIX: Switch to the bindset IMMEDIATELY before any events can fire
        console.log(`[BindsetSelectorService] *** Switching to bindset ${bindsetName} immediately ***`)
        this.setActiveBindset(bindsetName)
        
        console.log(`[BindsetSelectorService] *** EMITTING bindset-selector:key-added: key=${this.cache.selectedKey}, bindset=${bindsetName} ***`)
        this.emit('bindset-selector:key-added', { 
          key: this.cache.selectedKey, 
          bindset: bindsetName,
          environment: this.cache.currentEnvironment
        })
        console.log(`[BindsetSelectorService] *** bindset-selector:key-added event emitted successfully ***`)
        
        // Clear the operation flag synchronously
        this.emit('bindset-operation:completed', { type: 'add-key', bindset: bindsetName, key: this.cache.selectedKey }, { synchronous: true })
      }

      return result
    } catch (error) {
      console.error('[BindsetSelectorService] Error adding key to bindset:', error)
      return { success: false, error: 'add_failed' }
    }
  }

  async removeKeyFromBindset(bindsetName) {
    if (!this.cache.selectedKey || bindsetName === 'Primary Bindset') {
      return { success: false, error: 'invalid_operation' }
    }

    try {
      // Remove key from bindset using cached profile data
      const profile = this.cache.profile
      if (!profile || !profile.id) {
        return { success: false, error: 'no_profile' }
      }

      const updates = {
        modify: {
          bindsets: {
            [bindsetName]: {
              [this.cache.currentEnvironment]: {
                keys: {
                  [this.cache.selectedKey]: null
                }
              }
            }
          }
        }
      }

      const result = await this.request('data:update-profile', { 
        profileId: profile.id, 
        updates 
      })

      if (result?.success) {
        this.keyBindsetMembership.set(bindsetName, false)
        
        this.emit('bindset-selector:key-removed', { 
          key: this.cache.selectedKey, 
          bindset: bindsetName,
          environment: this.cache.currentEnvironment
        })
      }

      return result
    } catch (error) {
      console.error('[BindsetSelectorService] Error removing key from bindset:', error)
      return { success: false, error: 'remove_failed' }
    }
  }

  // Display Logic
  shouldDisplay() {
    return this.cache.preferences.bindsetsEnabled && this.cache.preferences.bindToAliasMode && this.cache.currentEnvironment !== 'alias'
  }

  // External Actions
  openBindsetManager() {
    this.emit('bindset-manager:open')
  }

  // Late-join state sharing
  getCurrentState() {
    return {
      selectedKey: this.cache.selectedKey,
      activeBindset: this.cache.activeBindset,
      bindsetNames: [...this.cache.bindsetNames],
      keyBindsetMembership: new Map(this.keyBindsetMembership),
      shouldDisplay: this.shouldDisplay(),
      preferences: { ...this.cache.preferences }
    }
  }

  // Late-join state handler
  handleInitialState(sender, state) {
    console.log('[BindsetSelectorService] handleInitialState called:', sender, !!state)
    
    if (sender === 'BindsetService' && state) {
      if (state.bindsets) {
        this.cache.bindsetNames = state.bindsets
        console.log('[BindsetSelectorService] Updated bindsetNames from BindsetService:', this.cache.bindsetNames)
        // Update key membership after getting bindset names
        this.updateKeyMembership()
      }
    }
    
    if (sender === 'PreferencesService' && this.cache.preferences) {
      console.log('[BindsetSelectorService] Preferences received via ComponentBase')
      // Update display state based on new preferences
      const shouldDisplay = this.shouldDisplay()
      this.emit('bindset-selector:visibility-changed', { visible: shouldDisplay })
    }

    // ComponentBase automatically handles DataCoordinator and SelectionService state
    // We just need to update our business logic when that state arrives
    if (sender === 'SelectionService' || sender === 'DataCoordinator') {
      console.log('[BindsetSelectorService] Received state from', sender, '- updating key membership')
      this.updateKeyMembership()
    }
  }
}