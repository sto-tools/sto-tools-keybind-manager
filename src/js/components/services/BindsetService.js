import ComponentBase from '../ComponentBase.js'

export default class BindsetService extends ComponentBase {
  constructor ({ eventBus } = {}) {
    super(eventBus)
    this.componentName = 'BindsetService'

    if (this.eventBus) {
      this.respond('bindset:list',          () => this.listBindsets())
      this.respond('bindset:create', ({ name }) => this.createBindset(name))
      this.respond('bindset:rename', ({ oldName, newName }) => this.renameBindset(oldName, newName))
      this.respond('bindset:delete', ({ name }) => this.deleteBindset(name))
      this.respond('bindset:get-key-commands', ({ bindset, environment, key }) => this.getKeyCommands(bindset, environment, key))
    }

    // ComponentBase handles bindset names caching via this.cache.bindsetNames

    // Set up listeners for DataCoordinator broadcasts to maintain cache
    this.setupEventListeners()
  }

  // Late-join state sharing
  getCurrentState () {
    return {
      bindsets: [...this.cache.bindsetNames]
    }
  }

  // Initialize service and register with ComponentBase system
  async init() {
    console.log('[BindsetService] Initializing...')
    
    // Register with ComponentBase for late-join state synchronization
    super.init()
    
    console.log('[BindsetService] Initialized successfully')
  }

  // Handle initial state from DataCoordinator
  handleInitialState(sender, state) {
    console.log('[BindsetService] handleInitialState called:', sender, !!state)

    if (sender === 'DataCoordinator' && state?.currentProfileData) {
      console.log('[BindsetService] Received initial profile data from DataCoordinator')
      // ComponentBase handles currentProfile caching automatically
      this.updateCacheFromProfile(state.currentProfileData)
    }
  }

  // Broadcast / Cache integration
  setupEventListeners() {
    // Prevent double registration in case constructor called twice in tests
    if (this._listenersSetup) return
    this._listenersSetup = true

    // ComponentBase automatically handles profile and environment caching
    // We only need to listen for these events to update our specific business logic
    this.addEventListener('profile:updated', ({ profileId, profile }) => {
      if (profileId === this.cache.currentProfile) {
        this.updateCacheFromProfile(profile)
      }
    })

    // When profile switch happens
    this.addEventListener('profile:switched', ({ profile }) => {
      // ComponentBase handles currentProfile and currentEnvironment caching
      this.updateCacheFromProfile(profile)
    })
  }

  updateCacheFromProfile(profile) {
    console.log('[BindsetService] updateCacheFromProfile: profile =', profile, 'id =', profile && profile.id)
    if (!profile) return
    if (!profile.id && this.cache.currentProfile) {
      profile.id = this.cache.currentProfile
    }
    // ComponentBase handles profile caching automatically
    this.cache.bindsetNames = ['Primary Bindset', ...Object.keys(profile.bindsets || {})]
    this.emit('bindsets:changed', { names: [...this.cache.bindsetNames] })
  }

  // Return cached profile when available; fallback to request on first call
  async getProfile() {
    if (this.cache.profile) return this.cache.profile
    // Fallback: ask DataCoordinator for current state (includes profile data)
    const state = await this.request('data:get-current-state').catch(()=>null)
    const prof = state?.currentProfileData || null
    if (prof) {
      // ComponentBase handles currentProfile caching automatically
      this.updateCacheFromProfile(prof)
    }
    return prof
  }

  // Helpers
  async listBindsets () {
    const profile = await this.getProfile()
    //const bindsets = profile?.bindsets || {}
    //this.cache.bindsetNames = ['Primary Bindset', ...Object.keys(bindsets)]
    return [...this.cache.bindsetNames]
  }

  async createBindset (name) {
    if (!name || name === 'Primary Bindset') return { success: false, error: 'invalid_name' }
    const profile = await this.getProfile()
    console.log('[BindsetService] createBindset: profile =', profile, 'id =', profile && profile.id)
    if (!profile || !profile.id) {
      console.error('[BindsetService] createBindset: no_profile error, profile:', profile)
      return { success: false, error: 'no_profile' }
    }
    if (profile.bindsets && profile.bindsets[name]) {
      return { success: false, error: 'name_exists' }
    }

    const updates = {
      add: {
        bindsets: {
          [name]: {
            space: { keys: {} },
            ground: { keys: {} },
          },
        },
      },
    }
    const res = await this.request('data:update-profile', { profileId: profile.id, updates })
    if (res?.success) {
      // Update cached names and broadcast
      await this.listBindsets()
      this.emit('bindsets:changed', { names: [...this.cache.bindsetNames] })
    }
    return res
  }

  async renameBindset (oldName, newName) {
    if (!oldName || !newName || oldName === 'Primary Bindset' || newName === 'Primary Bindset') {
      return { success: false, error: 'invalid_name' }
    }
    const profile = await this.getProfile()
    if (!profile.bindsets || !profile.bindsets[oldName]) {
      return { success: false, error: 'not_found' }
    }
    if (profile.bindsets[newName]) {
      return { success: false, error: 'name_exists' }
    }
    // Add new then delete old
    const insert = profile.bindsets[oldName]
    const updates = {
      add: {
        bindsets: { [newName]: insert },
      },
      delete: {
        bindsets: [oldName],
      },
    }
    const res = await this.request('data:update-profile', { profileId: profile.id, updates })
    if (res?.success) {
      // Update cached names and broadcast
      await this.listBindsets()
      this.emit('bindsets:changed', { names: [...this.cache.bindsetNames] })
    }
    return res
  }

  async deleteBindset (name) {
    if (!name || name === 'Primary Bindset') return { success: false, error: 'invalid_name' }
    const profile = await this.getProfile()
    const target = profile.bindsets?.[name]
    if (!target) return { success: false, error: 'not_found' }

    // Ensure bindset is empty
    const hasKeys = (env) => target?.[env]?.keys && Object.keys(target[env].keys).length > 0
    if (hasKeys('space') || hasKeys('ground')) {
      return { success: false, error: 'not_empty' }
    }

    const updates = {
      delete: {
        bindsets: [name],
      },
    }
    const res = await this.request('data:update-profile', { profileId: profile.id, updates })
    if (res?.success) {
      // Update cached names and broadcast
      await this.listBindsets()
      this.emit('bindsets:changed', { names: [...this.cache.bindsetNames] })
    }
    return res
  }

  async getKeyCommands(bindset, environment = 'space', key) {
    console.log(`[BindsetService] *** getKeyCommands called: bindset=${bindset}, environment=${environment}, key=${key} ***`)
    
    if (!key) {
      console.log(`[BindsetService] *** No key provided, returning empty array ***`)
      return []
    }

    // Always fetch the latest profile snapshot from DataCoordinator to avoid
    // stale cache issues when bindsets are modified by other services.
    console.log(`[BindsetService] *** Requesting data:get-current-state ***`)
    const state = await this.request('data:get-current-state').catch((error) => {
      console.error(`[BindsetService] *** Failed to get current state: ***`, error)
      return null
    })
    
    const profileId = state?.currentProfile
    const profile   = profileId && state?.profiles ? state.profiles[profileId] : null
    
    console.log(`[BindsetService] *** Profile data retrieved: profileId=${profileId}, hasProfile=${!!profile} ***`)
    
    if (!profile) {
      console.log(`[BindsetService] *** No profile data, returning empty array ***`)
      return []
    }

    if (!bindset || bindset === 'Primary Bindset') {
      const cmds = profile.builds?.[environment]?.keys?.[key] || []
      console.log(`[BindsetService] *** Primary bindset commands for key ${key}:`, cmds)
      return Array.isArray(cmds) ? [...cmds] : []
    }

    const cmds = profile.bindsets?.[bindset]?.[environment]?.keys?.[key] || []
    console.log(`[BindsetService] *** Bindset "${bindset}" commands for key ${key}:`, cmds)
    return Array.isArray(cmds) ? [...cmds] : []
  }
} 