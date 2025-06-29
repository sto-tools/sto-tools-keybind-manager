import ComponentBase from '../ComponentBase.js'
import { respond, request } from '../../core/requestResponse.js'

/**
 * DataCoordinator - Single source of truth for all data operations
 * 
 * Implements the broadcast/cache pattern:
 * - Services request data changes through this coordinator
 * - State changes are broadcast to all subscribers
 * - Late-join components get current state automatically
 * - No direct storage access from feature services
 */
export default class DataCoordinator extends ComponentBase {
  constructor({ eventBus, storage }) {
    super(eventBus)
    this.componentName = 'DataCoordinator'
    this.storage = storage
    
    // Cache current state
    this.state = {
      currentProfile: null,
      currentEnvironment: 'space',
      profiles: {},
      settings: {},
      metadata: {
        lastModified: null,
        version: '1.0.0'
      }
    }
    
    // Late-join support is handled by ComponentBase automatically
    
    this.setupRequestHandlers()
  }

  async init() {
    super.init()
    
    console.log(`[${this.componentName}] Initializing...`)
    
    // Load initial state from storage
    await this.loadInitialState()
    
    console.log(`[${this.componentName}] Initialization complete`)
  }

  setupRequestHandlers() {
    // Register request/response handlers
    respond(this.eventBus, 'data:get-all-profiles', () => this.getAllProfiles())
    respond(this.eventBus, 'data:switch-profile', ({ profileId }) => this.switchProfile(profileId))
    respond(this.eventBus, 'data:create-profile', ({ name, description, mode }) => this.createProfile(name, description, mode))
    respond(this.eventBus, 'data:clone-profile', ({ sourceId, newName }) => this.cloneProfile(sourceId, newName))
    respond(this.eventBus, 'data:delete-profile', ({ profileId }) => this.deleteProfile(profileId))
    respond(this.eventBus, 'data:rename-profile', ({ profileId, newName, description }) => this.renameProfile(profileId, newName, description))
    respond(this.eventBus, 'data:update-profile', ({ profileId, updates }) => this.updateProfile(profileId, updates))
    
    // Environment operations
    respond(this.eventBus, 'data:set-environment', ({ environment }) => this.setEnvironment(environment))
    
    // Settings operations
    respond(this.eventBus, 'data:get-settings', () => this.getSettings())
    respond(this.eventBus, 'data:update-settings', ({ settings }) => this.updateSettings(settings))
    
    // Default data operations
    respond(this.eventBus, 'data:load-default-data', () => this.loadDefaultData())
    
    // Late join support is handled by ComponentBase automatically
  }

  /**
   * Load initial state from storage
   */
  async loadInitialState() {
    try {
      const data = this.storage.getAllData()
      
      this.state.currentProfile = data.currentProfile
      this.state.profiles = data.profiles || {}
      this.state.settings = data.settings || {}
      
      // If no profiles exist, we need to create default profiles
      if (Object.keys(this.state.profiles).length === 0) {
        this.needsDefaultProfiles = true
        console.log(`[${this.componentName}] No profiles found, will create defaults when DataService is available`)
        
        // Try to create default profiles immediately if DataService is available
        this.tryCreateDefaultProfiles()
      }
      
      // If no current profile set, set to first available
      if (!this.state.currentProfile && Object.keys(this.state.profiles).length > 0) {
        this.state.currentProfile = Object.keys(this.state.profiles)[0]
        
        // Save current profile to storage
        const updatedData = this.storage.getAllData()
        updatedData.currentProfile = this.state.currentProfile
        await this.storage.saveAllData(updatedData)
      }
      
      // Get current environment from profile
      if (this.state.currentProfile && this.state.profiles[this.state.currentProfile]) {
        this.state.currentEnvironment = this.state.profiles[this.state.currentProfile].currentEnvironment || 'space'
      }
      
      this.state.metadata = {
        lastModified: data.lastModified,
        version: data.version || '1.0.0'
      }
      
      console.log(`[${this.componentName}] Loaded initial state:`, {
        currentProfile: this.state.currentProfile,
        environment: this.state.currentEnvironment,
        profileCount: Object.keys(this.state.profiles).length
      })
      
    } catch (error) {
      console.error(`[${this.componentName}] Failed to load initial state:`, error)
      throw error
    }
  }

  /**
   * Get current complete state (ComponentBase late-join method)
   */
  getCurrentState() {
    // Build current profile data for late-join
    let currentProfile = null
    if (this.state.currentProfile && this.state.profiles[this.state.currentProfile]) {
      const profile = this.state.profiles[this.state.currentProfile]
      currentProfile = this.buildVirtualProfile(profile, this.state.currentEnvironment)
      currentProfile.id = this.state.currentProfile
    }

    return {
      currentProfile: this.state.currentProfile,
      currentEnvironment: this.state.currentEnvironment,
      profiles: { ...this.state.profiles },
      settings: { ...this.state.settings },
      metadata: { ...this.state.metadata },
      // For late-join: provide the built profile data
      currentProfileData: currentProfile
    }
  }

  // getCurrentProfile method removed - components should use broadcast/cache pattern instead

  /**
   * Get all profiles
   */
  async getAllProfiles() {
    return { ...this.state.profiles }
  }

  /**
   * Build virtual profile with current build data
   */
  buildVirtualProfile(profile, environment) {
    if (!profile) return null
    
    // Ensure builds structure exists
    if (!profile.builds) {
      profile.builds = {
        space: { keys: {} },
        ground: { keys: {} }
      }
    }
    
    if (!profile.builds[environment]) {
      profile.builds[environment] = { keys: {} }
    }
    
    // Return virtual profile with flattened keys for current environment
    return {
      ...profile,
      keys: profile.builds[environment].keys || {},
      aliases: profile.aliases || {},
      environment: environment
    }
  }

  /**
   * Switch to a different profile
   */
  async switchProfile(profileId) {
    if (profileId === this.state.currentProfile) {
      // Build current profile data manually since getCurrentProfile() was removed
      let currentProfile = null
      if (this.state.currentProfile && this.state.profiles[this.state.currentProfile]) {
        const profile = this.state.profiles[this.state.currentProfile]
        currentProfile = this.buildVirtualProfile(profile, this.state.currentEnvironment)
      }
      
      return { 
        success: true, 
        switched: false, 
        message: 'Already on this profile',
        profile: currentProfile
      }
    }

    const profile = this.state.profiles[profileId]
    if (!profile) {
      throw new Error(`Profile ${profileId} not found`)
    }

    const oldProfileId = this.state.currentProfile
    this.state.currentProfile = profileId
    this.state.currentEnvironment = profile.currentEnvironment || 'space'
    
    // Persist current profile change
    const data = this.storage.getAllData()
    data.currentProfile = profileId
    await this.storage.saveAllData(data)
    
    // Update metadata
    this.state.metadata.lastModified = new Date().toISOString()
    
    // Build virtual profile for response
    const virtualProfile = this.buildVirtualProfile(profile, this.state.currentEnvironment)
    
    // Broadcast profile switch
    this.emit('profile:switched', {
      fromProfile: oldProfileId,
      toProfile: profileId,
      profileId: profileId,
      profile: virtualProfile,
      environment: this.state.currentEnvironment,
      timestamp: Date.now()
    })

    return { 
      success: true, 
      switched: true,
      profile: virtualProfile,
      message: `Switched to ${profile.name} (${this.state.currentEnvironment})`
    }
  }

  /**
   * Create a new profile
   */
  async createProfile(name, description = '', mode = 'space') {
    if (!name || !name.trim()) {
      throw new Error('Profile name is required')
    }

    const profileId = this.generateProfileId(name)
    
    // Check if profile already exists
    if (this.state.profiles[profileId]) {
      throw new Error(`Profile with name "${name}" already exists`)
    }

    const profile = {
      name: name.trim(),
      description: description.trim(),
      currentEnvironment: mode,
      builds: {
        space: { keys: {} },
        ground: { keys: {} }
      },
      aliases: {},
      created: new Date().toISOString(),
      lastModified: new Date().toISOString()
    }

    // Save to storage
    await this.storage.saveProfile(profileId, profile)
    
    // Update cache
    this.state.profiles[profileId] = profile
    this.state.metadata.lastModified = new Date().toISOString()
    
    // Broadcast profile creation
    this.emit('profile:created', {
      profileId,
      profile,
      timestamp: Date.now()
    })

    return { 
      success: true, 
      profileId, 
      profile,
      message: `Profile "${name}" created`
    }
  }

  /**
   * Clone an existing profile
   */
  async cloneProfile(sourceId, newName) {
    if (!sourceId || !newName || !newName.trim()) {
      throw new Error('Source profile ID and new name are required')
    }

    const sourceProfile = this.state.profiles[sourceId]
    if (!sourceProfile) {
      throw new Error('Source profile not found')
    }

    const profileId = this.generateProfileId(newName)
    
    // Check if profile already exists
    if (this.state.profiles[profileId]) {
      throw new Error(`Profile with name "${newName}" already exists`)
    }

    const clonedProfile = {
      ...JSON.parse(JSON.stringify(sourceProfile)),
      name: newName.trim(),
      description: `Copy of ${sourceProfile.name}`,
      created: new Date().toISOString(),
      lastModified: new Date().toISOString()
    }

    // Save to storage
    await this.storage.saveProfile(profileId, clonedProfile)
    
    // Update cache
    this.state.profiles[profileId] = clonedProfile
    this.state.metadata.lastModified = new Date().toISOString()
    
    // Broadcast profile creation
    this.emit('profile:created', {
      profileId,
      profile: clonedProfile,
      clonedFrom: sourceId,
      timestamp: Date.now()
    })

    return { 
      success: true, 
      profileId, 
      profile: clonedProfile,
      message: `Profile "${newName}" created from "${sourceProfile.name}"`
    }
  }

  /**
   * Rename a profile
   */
  async renameProfile(profileId, newName, description = '') {
    if (!profileId || !newName || !newName.trim()) {
      throw new Error('Profile ID and new name are required')
    }

    const profile = this.state.profiles[profileId]
    if (!profile) {
      throw new Error('Profile not found')
    }

    const updatedProfile = {
      ...profile,
      name: newName.trim(),
      description: description.trim(),
      lastModified: new Date().toISOString()
    }

    // Save to storage
    await this.storage.saveProfile(profileId, updatedProfile)
    
    // Update cache
    this.state.profiles[profileId] = updatedProfile
    this.state.metadata.lastModified = new Date().toISOString()
    
    // Broadcast profile update
    this.emit('profile:updated', {
      profileId,
      profile: updatedProfile,
      changes: { name: newName, description },
      timestamp: Date.now()
    })

    return { 
      success: true, 
      profile: updatedProfile,
      message: `Profile renamed to "${newName}"`
    }
  }

  /**
   * Delete a profile
   */
  async deleteProfile(profileId) {
    if (!profileId) {
      throw new Error('Profile ID is required')
    }

    const profile = this.state.profiles[profileId]
    if (!profile) {
      throw new Error('Profile not found')
    }

    const profileCount = Object.keys(this.state.profiles).length
    if (profileCount <= 1) {
      throw new Error('Cannot delete the last profile')
    }

    // Delete from storage
    await this.storage.deleteProfile(profileId)
    
    // Remove from cache
    delete this.state.profiles[profileId]
    
    let switchedProfile = null
    
    // If this was the current profile, switch to another
    if (this.state.currentProfile === profileId) {
      const remaining = Object.keys(this.state.profiles)
      this.state.currentProfile = remaining[0]
      
      const newProfile = this.state.profiles[this.state.currentProfile]
      this.state.currentEnvironment = newProfile.currentEnvironment || 'space'
      
      // Save new current profile
      const data = this.storage.getAllData()
      data.currentProfile = this.state.currentProfile
      await this.storage.saveAllData(data)
      
      switchedProfile = this.buildVirtualProfile(newProfile, this.state.currentEnvironment)
      
      // Broadcast profile switch
      this.emit('profile:switched', {
        fromProfile: profileId,
        toProfile: this.state.currentProfile,
        profileId: this.state.currentProfile,
        profile: switchedProfile,
        environment: this.state.currentEnvironment,
        timestamp: Date.now()
      })

    }
    
    this.state.metadata.lastModified = new Date().toISOString()
    
    // Broadcast profile deletion
    this.emit('profile:deleted', {
      profileId,
      profile,
      switchedProfile,
      timestamp: Date.now()
    })

    return { 
      success: true, 
      deletedProfile: profile,
      switchedProfile,
      message: `Profile "${profile.name}" deleted`
    }
  }

  /**
   * Update profile data
   */
  /**
   * Deep merge helper for profile updates
   * Handles nested objects like aliases and builds properly
   */
  deepMergeProfileUpdates(current, updates) {
    const result = { ...current }
    
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'aliases' && typeof value === 'object' && value !== null) {
        // Deep merge aliases - individual aliases should be merged, not replaced
        result.aliases = {
          ...(current.aliases || {}),
          ...value
        }
      } else if (key === 'builds' && typeof value === 'object' && value !== null) {
        // Deep merge builds - environments and keys should be merged, not replaced
        result.builds = { ...(current.builds || {}) }
        
        for (const [env, envData] of Object.entries(value)) {
          if (typeof envData === 'object' && envData !== null) {
            // Initialize the environment if it doesn't exist
            if (!result.builds[env]) {
              result.builds[env] = {}
            }
            
            // Deep merge each property of the environment
            for (const [envProp, envPropValue] of Object.entries(envData)) {
              if (envProp === 'keys' && typeof envPropValue === 'object' && envPropValue !== null) {
                // Special deep merge for keys - preserve existing keys
                result.builds[env].keys = {
                  ...(result.builds[env].keys || {}),
                  ...envPropValue
                }
              } else {
                // Regular property assignment for non-keys properties
                result.builds[env][envProp] = envPropValue
              }
            }
          } else {
            result.builds[env] = envData
          }
        }
      } else {
        // Regular shallow merge for other properties
        result[key] = value
      }
    }
    
    return result
  }

  async updateProfile(profileId, updates) {
    if (!profileId || !updates) {
      throw new Error('Profile ID and updates are required')
    }

    const currentProfile = this.state.profiles[profileId]
    if (!currentProfile) {
      throw new Error(`Profile ${profileId} not found`)
    }

    // Use deep merge for nested objects like aliases and builds
    const updatedProfile = this.deepMergeProfileUpdates(currentProfile, {
      ...updates,
      lastModified: new Date().toISOString()
    })
    
    // Save to storage
    await this.storage.saveProfile(profileId, updatedProfile)
    
    // Update cache
    this.state.profiles[profileId] = updatedProfile
    this.state.metadata.lastModified = new Date().toISOString()
    
    // Broadcast profile update
    this.emit('profile:updated', { 
      profileId, 
      profile: updatedProfile,
      updates,
      timestamp: Date.now()
    })

    return { success: true, profile: updatedProfile }
  }

  /**
   * Set current environment
   */
  async setEnvironment(environment) {
    if (!environment || !['space', 'ground', 'alias'].includes(environment)) {
      throw new Error('Invalid environment')
    }

    const oldEnvironment = this.state.currentEnvironment
    this.state.currentEnvironment = environment
    
    // Update profile's current environment if we have one
    if (this.state.currentProfile) {
      const updates = { currentEnvironment: environment }
      await this.updateProfile(this.state.currentProfile, updates)
    }
    
    // Broadcast environment change
    this.emit('environment:changed', {
      fromEnvironment: oldEnvironment,
      toEnvironment: environment,
      environment: environment,
      timestamp: Date.now()
    })

    return { success: true, environment }
  }

  /**
   * Get application settings
   */
  async getSettings() {
    return { ...this.state.settings }
  }

  /**
   * Update application settings
   */
  async updateSettings(settings) {
    if (!settings) {
      throw new Error('Settings are required')
    }

    this.state.settings = { ...this.state.settings, ...settings }
    
    // Save to storage
    await this.storage.saveSettings(this.state.settings)
    
    this.state.metadata.lastModified = new Date().toISOString()
    
    // Broadcast settings change
    this.emit('settings:changed', {
      settings: this.state.settings,
      updates: settings,
      timestamp: Date.now()
    })

    return { success: true, settings: this.state.settings }
  }

  /**
   * Load default data (called explicitly by user via "Load Default Data" button)
   */
  async loadDefaultData() {
    console.log(`[${this.componentName}] Explicitly loading default data...`)
    
    try {
      // Get default profiles from DataService
      const defaultProfilesData = await request(this.eventBus, 'data:get-default-profiles')
      
      if (!defaultProfilesData || Object.keys(defaultProfilesData).length === 0) {
        console.warn(`[${this.componentName}] No default profiles available from DataService`)
        return { success: false, error: 'No default profiles available' }
      }
      
      // Create default profiles (this will overwrite existing if any)
      await this.createDefaultProfilesFromData(defaultProfilesData)
      
      console.log(`[${this.componentName}] Successfully loaded default data`)
      
      return { 
        success: true, 
        profilesCreated: Object.keys(defaultProfilesData).length,
        currentProfile: this.state.currentProfile
      }
      
    } catch (error) {
      console.error(`[${this.componentName}] Failed to load default data:`, error)
      return { success: false, error: error.message }
    }
  }

  // registerSubscriber method removed - ComponentBase handles late-join automatically

  /**
   * Try to create default profiles using DataService
   */
  async tryCreateDefaultProfiles() {
    if (!this.needsDefaultProfiles) {
      return
    }
    
    try {
      console.log(`[${this.componentName}] Attempting to get default profiles from DataService...`)
      
      // Use request/response to get default profiles from DataService
      const defaultProfilesData = await request(this.eventBus, 'data:get-default-profiles')
      
      if (defaultProfilesData && Object.keys(defaultProfilesData).length > 0) {
        console.log(`[${this.componentName}] Got default profiles from DataService, creating...`)
        await this.createDefaultProfilesFromData(defaultProfilesData)
        this.needsDefaultProfiles = false
      } else {
        console.log(`[${this.componentName}] No default profiles from DataService, will try again later`)
      }
    } catch (error) {
      console.log(`[${this.componentName}] DataService not ready yet, will try again later:`, error.message)
      
      // Schedule retry in 100ms
      setTimeout(() => this.tryCreateDefaultProfiles(), 100)
    }
  }

  /**
   * Handle initial state from other components during late-join handshake
   */
  async handleInitialState(sender, state) {
    console.log(`[${this.componentName}] handleInitialState called - sender: "${sender}", needsDefaultProfiles: ${this.needsDefaultProfiles}`)
    console.log(`[${this.componentName}] Received state from ${sender}:`, state)
    
    // If DataService is providing state and we need default profiles, try creating them
    if (sender === 'DataService' && this.needsDefaultProfiles) {
      console.log(`[${this.componentName}] DataService is now available, trying to create default profiles...`)
      await this.tryCreateDefaultProfiles()
    }
  }

  /**
   * Create default profiles from DataService data
   */
  async createDefaultProfilesFromData(defaultProfilesData) {
    if (!defaultProfilesData || Object.keys(defaultProfilesData).length === 0) {
      console.warn(`[${this.componentName}] No default profiles data available, creating minimal fallback`)
      await this.createFallbackProfiles()
      return
    }
    
    // Convert STO_DATA format to our storage format
    const profiles = {}
    for (const [profileId, sourceProfile] of Object.entries(defaultProfilesData)) {
      profiles[profileId] = {
        name: sourceProfile.name,
        description: sourceProfile.description || '',
        currentEnvironment: sourceProfile.currentEnvironment || 'space',
        builds: sourceProfile.builds || {
          space: { keys: {} },
          ground: { keys: {} }
        },
        aliases: sourceProfile.aliases || {},
        created: new Date().toISOString(),
        lastModified: new Date().toISOString()
      }
    }
    
    // Save each profile to storage and cache
    for (const [profileId, profile] of Object.entries(profiles)) {
      await this.storage.saveProfile(profileId, profile)
      this.state.profiles[profileId] = profile
    }
    
    // Set current profile to first one if none set
    let profileActivated = false
    if (!this.state.currentProfile && Object.keys(profiles).length > 0) {
      this.state.currentProfile = Object.keys(profiles)[0]
      profileActivated = true
      
      // Save current profile to storage
      const updatedData = this.storage.getAllData()
      updatedData.currentProfile = this.state.currentProfile
      await this.storage.saveAllData(updatedData)
      
      // Set current environment from the activated profile
      const activatedProfile = this.state.profiles[this.state.currentProfile]
      this.state.currentEnvironment = activatedProfile.currentEnvironment || 'space'
    }
    
    // Update metadata
    this.state.metadata.lastModified = new Date().toISOString()
    
    console.log(`[${this.componentName}] Created ${Object.keys(profiles).length} default profiles from DataService`)
    
    // Broadcast that profiles are now available
    this.emit('profiles:initialized', {
      profiles: this.state.profiles,
      currentProfile: this.state.currentProfile,
      timestamp: Date.now()
    })
    
    // If we activated a profile for the first time, emit profile:switched event
    if (profileActivated && this.state.currentProfile) {
      const activatedProfile = this.state.profiles[this.state.currentProfile]
      const virtualProfile = this.buildVirtualProfile(activatedProfile, this.state.currentEnvironment)
      
      console.log(`[${this.componentName}] Emitting profile:switched for initial profile activation: ${this.state.currentProfile}`)
      
      this.emit('profile:switched', {
        fromProfile: null,
        toProfile: this.state.currentProfile,
        profileId: this.state.currentProfile,
        profile: virtualProfile,
        environment: this.state.currentEnvironment,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Create minimal fallback profiles when DataService is not available
   */
  async createFallbackProfiles() {
    const fallbackProfiles = {
      'default_space': {
        name: 'Default Space',
        description: 'Basic space build profile',
        currentEnvironment: 'space',
        builds: {
          space: { keys: {} },
          ground: { keys: {} }
        },
        aliases: {},
        created: new Date().toISOString(),
        lastModified: new Date().toISOString()
      }
    }
    
    // Save fallback profile to storage and cache
    for (const [profileId, profile] of Object.entries(fallbackProfiles)) {
      await this.storage.saveProfile(profileId, profile)
      this.state.profiles[profileId] = profile
    }
    
    // Set current profile
    let profileActivated = false
    if (!this.state.currentProfile) {
      this.state.currentProfile = 'default_space'
      profileActivated = true
      
      // Save current profile to storage
      const updatedData = this.storage.getAllData()
      updatedData.currentProfile = this.state.currentProfile
      await this.storage.saveAllData(updatedData)
      
      // Set current environment from the activated profile
      const activatedProfile = this.state.profiles[this.state.currentProfile]
      this.state.currentEnvironment = activatedProfile.currentEnvironment || 'space'
    }
    
    // Update metadata
    this.state.metadata.lastModified = new Date().toISOString()
    
    console.log(`[${this.componentName}] Created ${Object.keys(fallbackProfiles).length} fallback profiles`)
    
    // Broadcast that profiles are now available
    this.emit('profiles:initialized', {
      profiles: this.state.profiles,
      currentProfile: this.state.currentProfile,
      timestamp: Date.now()
    })
    
    // If we activated a profile for the first time, emit profile:switched event
    if (profileActivated && this.state.currentProfile) {
      const activatedProfile = this.state.profiles[this.state.currentProfile]
      const virtualProfile = this.buildVirtualProfile(activatedProfile, this.state.currentEnvironment)
      
      console.log(`[${this.componentName}] Emitting profile:switched for initial fallback profile activation: ${this.state.currentProfile}`)
      
      this.emit('profile:switched', {
        fromProfile: null,
        toProfile: this.state.currentProfile,
        profileId: this.state.currentProfile,
        profile: virtualProfile,
        environment: this.state.currentEnvironment,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Generate profile ID from name
   */
  generateProfileId(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50)
  }
} 