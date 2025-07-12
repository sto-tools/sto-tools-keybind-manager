import ComponentBase from '../ComponentBase.js'
import { respond, request } from '../../core/requestResponse.js'

export default class BindsetSelectorService extends ComponentBase {
  constructor ({ eventBus } = {}) {
    super(eventBus)
    this.componentName = 'BindsetSelectorService'
    
    // Internal state
    this.selectedKey = null
    this.activeBindset = 'Primary Bindset'
    this.bindsetNames = ['Primary Bindset']
    this.keyBindsetMembership = new Map() // bindset -> has key boolean
    this.currentEnvironment = 'space'
    
    // Cache for preferences
    this.preferences = {
      bindsetsEnabled: false,
      bindToAliasMode: false
    }

    // Cache for profile data (similar to other services)
    this.cache = {
      currentProfile: null,
      profile: null
    }

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

  /* ------------------------------------------------------------ */
  /* Event Listeners                                             */
  /* ------------------------------------------------------------ */

  setupEventListeners() {
    if (this._listenersSetup) return
    this._listenersSetup = true

    // Listen for bindset changes from BindsetService
    this.addEventListener('bindsets:changed', ({ names }) => {
      console.log('[BindsetSelectorService] bindsets:changed received:', names)
      this.bindsetNames = names || ['Primary Bindset']
      this.updateKeyMembership()
    })

    // Listen for preferences changes
    this.addEventListener('preferences:changed', (data) => {
      // Handle both single-setting changes and bulk changes
      const changes = data.changes || { [data.key]: data.value }
      let needsUpdate = false
      
      for (const [key, value] of Object.entries(changes)) {
        if (key === 'bindsetsEnabled' || key === 'bindToAliasMode') {
          this.preferences[key] = value
          needsUpdate = true
          console.log('[BindsetSelectorService] preference changed:', key, '=', value)
        }
      }
      
      if (needsUpdate) {
        const shouldDisplay = this.shouldDisplay()
        console.log('[BindsetSelectorService] shouldDisplay:', shouldDisplay)
        this.emit('bindset-selector:visibility-changed', { visible: shouldDisplay })
      }
    })

    this.addEventListener('preferences:loaded', ({ settings }) => {
      this.updatePreferences(settings)
    })

    // Listen for profile switches
    this.addEventListener('profile:switched', ({ profileId, profile, environment }) => {
      console.log('[BindsetSelectorService] profile:switched received:', profileId, !!profile)
      this.cache.currentProfile = profileId
      this.cache.profile = profile
      if (environment) {
        this.currentEnvironment = environment
      }
      this.updateKeyMembership()
    })

    // Listen for profile updates
    this.addEventListener('profile:updated', ({ profileId, profile }) => {
      console.log('[BindsetSelectorService] profile:updated received:', profileId, !!profile)
      if (profileId === this.cache.currentProfile) {
        this.cache.profile = profile
        this.updateKeyMembership()
      }
    })

    // Listen for environment changes
    this.addEventListener('environment:changed', (data) => {
      const env = typeof data === 'string' ? data : data?.environment
      if (env) {
        this.currentEnvironment = env
        this.updateKeyMembership()
        // Update visibility based on new environment
        const shouldDisplay = this.shouldDisplay()
        console.log('[BindsetSelectorService] environment changed to:', env, 'shouldDisplay:', shouldDisplay)
        this.emit('bindset-selector:visibility-changed', { visible: shouldDisplay })
      }
    })
  }

  updatePreferences(prefs) {
    console.log('[BindsetSelectorService] updatePreferences:', prefs)
    this.preferences.bindsetsEnabled = prefs?.bindsetsEnabled || false
    this.preferences.bindToAliasMode = prefs?.bindToAliasMode || false
    const shouldDisplay = this.shouldDisplay()
    console.log('[BindsetSelectorService] shouldDisplay:', shouldDisplay, 'bindsetsEnabled:', this.preferences.bindsetsEnabled, 'bindToAliasMode:', this.preferences.bindToAliasMode)
    this.emit('bindset-selector:visibility-changed', { visible: shouldDisplay })
  }

  /* ------------------------------------------------------------ */
  /* State Management                                            */
  /* ------------------------------------------------------------ */


  setSelectedKey(key) {
    this.selectedKey = key
    this.updateKeyMembership()
  }


  setActiveBindset(bindsetName) {
    console.log(`[BindsetSelectorService] setActiveBindset called: ${this.activeBindset} -> ${bindsetName}`)
    this.activeBindset = bindsetName
    console.log(`[BindsetSelectorService] About to emit bindset-selector:active-changed with bindset:`, bindsetName)
    this.emit('bindset-selector:active-changed', { bindset: bindsetName })
    console.log(`[BindsetSelectorService] Successfully emitted bindset-selector:active-changed with bindset:`, bindsetName)
  }

  /* ------------------------------------------------------------ */
  /* Key Membership Management                                   */
  /* ------------------------------------------------------------ */

  async updateKeyMembership() {
    if (!this.selectedKey) return

    this.keyBindsetMembership.clear()
    
    for (const bindsetName of this.bindsetNames) {
      const hasKey = await this.keyExistsInBindset(bindsetName)
      this.keyBindsetMembership.set(bindsetName, hasKey)
      console.log(`[BindsetSelectorService] updateKeyMembership: ${bindsetName} -> ${hasKey} (key: ${this.selectedKey})`)
    }
    
    this.emit('bindset-selector:membership-updated', { 
      key: this.selectedKey, 
      membership: new Map(this.keyBindsetMembership) 
    })
  }

  async keyExistsInBindset(bindsetName) {
    if (!this.selectedKey) {
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
        const commands = this.cache.profile.builds?.[this.currentEnvironment]?.keys?.[this.selectedKey]
        const exists = commands !== undefined && Array.isArray(commands)
        console.log(`[BindsetSelectorService] Primary bindset check: ${this.selectedKey} in ${this.currentEnvironment} -> ${exists}`, commands)
        return exists
      } else {
        // Check user-defined bindset
        const commands = this.cache.profile.bindsets?.[bindsetName]?.[this.currentEnvironment]?.keys?.[this.selectedKey]
        const exists = commands !== undefined && Array.isArray(commands)
        console.log(`[BindsetSelectorService] ${bindsetName} bindset check: ${this.selectedKey} in ${this.currentEnvironment} -> ${exists}`, commands)
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

  /* ------------------------------------------------------------ */
  /* Key Addition/Removal                                       */
  /* ------------------------------------------------------------ */

  async addKeyToBindset(bindsetName) {
    if (!this.selectedKey || bindsetName === 'Primary Bindset') {
      return { success: false, error: 'invalid_operation' }
    }

    try {
      // Set flag to indicate we're performing a bindset operation
      this.emit('bindset-operation:started', { type: 'add-key', bindset: bindsetName, key: this.selectedKey })
      // Add empty command chain to the bindset using cached profile data
      const profile = this.cache.profile
      if (!profile || !profile.id) {
        return { success: false, error: 'no_profile' }
      }

      const updates = {
        modify: {
          bindsets: {
            [bindsetName]: {
              [this.currentEnvironment]: {
                keys: {
                  [this.selectedKey]: []
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
        
        console.log(`[BindsetSelectorService] *** EMITTING bindset-selector:key-added: key=${this.selectedKey}, bindset=${bindsetName} ***`)
        this.emit('bindset-selector:key-added', { 
          key: this.selectedKey, 
          bindset: bindsetName,
          environment: this.currentEnvironment
        })
        console.log(`[BindsetSelectorService] *** bindset-selector:key-added event emitted successfully ***`)
        
        // Clear the operation flag after a short delay
        setTimeout(() => {
          this.emit('bindset-operation:completed', { type: 'add-key', bindset: bindsetName, key: this.selectedKey })
        }, 200)
      }

      return result
    } catch (error) {
      console.error('[BindsetSelectorService] Error adding key to bindset:', error)
      return { success: false, error: 'add_failed' }
    }
  }

  async removeKeyFromBindset(bindsetName) {
    if (!this.selectedKey || bindsetName === 'Primary Bindset') {
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
              [this.currentEnvironment]: {
                keys: {
                  [this.selectedKey]: null
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
          key: this.selectedKey, 
          bindset: bindsetName,
          environment: this.currentEnvironment
        })
      }

      return result
    } catch (error) {
      console.error('[BindsetSelectorService] Error removing key from bindset:', error)
      return { success: false, error: 'remove_failed' }
    }
  }

  /* ------------------------------------------------------------ */
  /* Display Logic                                              */
  /* ------------------------------------------------------------ */

  shouldDisplay() {
    return this.preferences.bindsetsEnabled && this.preferences.bindToAliasMode && this.currentEnvironment !== 'alias'
  }

  /* ------------------------------------------------------------ */
  /* External Actions                                           */
  /* ------------------------------------------------------------ */

  openBindsetManager() {
    this.emit('bindset-manager:open')
  }

  /* ------------------------------------------------------------ */
  /* Late-join state sharing                                    */
  /* ------------------------------------------------------------ */

  /** Return current state for late-join components to sync. */
  getCurrentState() {
    return {
      selectedKey: this.selectedKey,
      activeBindset: this.activeBindset,
      bindsetNames: [...this.bindsetNames],
      keyBindsetMembership: new Map(this.keyBindsetMembership),
      shouldDisplay: this.shouldDisplay(),
      preferences: { ...this.preferences }
      // REMOVED: currentEnvironment - not owned by BindsetSelectorService
      // This will be managed by SelectionService (selection) and DataCoordinator (environment)
    }
  }

  /* ------------------------------------------------------------ */
  /* Late-join state handler                                    */
  /* ------------------------------------------------------------ */

  handleInitialState(sender, state) {
    console.log('[BindsetSelectorService] handleInitialState called:', sender, !!state)
    
    if (sender === 'BindsetService' && state) {
      if (state.bindsets) {
        this.bindsetNames = state.bindsets
      }
    }
    
    if (sender === 'PreferencesService' && state) {
      this.updatePreferences(state.settings || state)
    }

    // Handle DataCoordinator late-join sync
    if (sender === 'DataCoordinator' && state) {
      console.log('[BindsetSelectorService] DataCoordinator late-join sync:', state)
      if (state.currentProfile) {
        this.cache.currentProfile = state.currentProfile
      }
      if (state.currentEnvironment) {
        this.currentEnvironment = state.currentEnvironment
      }
      if (state.currentProfile && state.profiles && state.profiles[state.currentProfile]) {
        this.cache.profile = state.profiles[state.currentProfile]
        console.log('[BindsetSelectorService] Profile loaded from late-join:', this.cache.profile.id)
      } else {
        console.log('[BindsetSelectorService] No profile data in DataCoordinator state')
      }
    }

    // Handle environment from late-join sync
    if (state && (state.environment || state.currentEnvironment)) {
      const env = state.environment || state.currentEnvironment
      this.currentEnvironment = env
    }
  }
}