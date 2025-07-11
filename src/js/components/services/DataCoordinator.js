import ComponentBase from '../ComponentBase.js'
import { respond, request } from '../../core/requestResponse.js'
import { normalizeProfile, needsNormalization } from '../../lib/profileNormalizer.js'

/**
 * DataCoordinator - Single source of truth for all data operations
 * 
 * Implements the broadcast/cache pattern:
 * - Services request data changes through this coordinator
 * - State changes are broadcast to all subscribers
 * - Late-join components get current state automatically
 * - No direct storage access from feature services
 * 
 * NEW: Explicit Operations API
 * ===========================
 * 
 * Instead of requiring services to reconstruct entire objects, the DataCoordinator
 * now supports explicit add/delete/modify operations:
 * 
 * Examples:
 * 
 * // Add new aliases without affecting existing ones
 * await this.request('data:update-profile', {
 *   profileId: 'my_profile',
 *   add: {
 *     aliases: {
 *       'new_alias': { commands: 'say "hello"', description: 'Greeting alias' }
 *     }
 *   }
 * })
 * 
 * // Delete specific aliases by name
 * await this.request('data:update-profile', {
 *   profileId: 'my_profile', 
 *   delete: {
 *     aliases: ['old_alias', 'unused_alias']
 *   }
 * })
 * 
 * // Modify existing alias commands without affecting others
 * await this.request('data:update-profile', {
 *   profileId: 'my_profile',
 *   modify: {
 *     aliases: {
 *       'existing_alias': { commands: 'updated_command_chain' }
 *     }
 *   }
 * })
 * 
 * // Add new keybinds to specific environments
 * await this.request('data:update-profile', {
 *   profileId: 'my_profile',
 *   add: {
 *     builds: {
 *       space: {
 *         keys: {
 *           'F5': [{ command: 'new_space_command' }]
 *         }
 *       }
 *     }
 *   }
 * })
 * 
 * // Delete specific keys
 * await this.request('data:update-profile', {
 *   profileId: 'my_profile',
 *   delete: {
 *     builds: {
 *       space: { keys: ['F5'] },
 *       ground: { keys: ['F6', 'F7'] }
 *     }
 *   }
 * })
 * 
 * // Combined operations in a single atomic update
 * await this.request('data:update-profile', {
 *   profileId: 'my_profile',
 *   add: {
 *     aliases: { 'new_alias': { commands: 'new_command' } }
 *   },
 *   delete: {
 *     aliases: ['old_alias']
 *   },
 *   modify: {
 *     aliases: { 'existing_alias': { description: 'Updated description' } }
 *   },
 *   properties: {
 *     description: 'Profile updated via explicit operations'
 *   }
 * })
 * 
 * // Legacy format still supported for backward compatibility
 * await this.request('data:update-profile', {
 *   profileId: 'my_profile',
 *   description: 'Updated description',
 *   aliases: { complete_aliases_object_here... }  // Complete replacement
 * })
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
    this.respond('data:get-current-state', () => this.getCurrentState())
    this.respond('data:get-all-profiles', () => this.getAllProfiles())
    this.respond('data:get-current-profile', () => this.getCurrentProfile())
    this.respond('data:switch-profile', ({ profileId }) => this.switchProfile(profileId))
    this.respond('data:create-profile', ({ name, description, mode }) => this.createProfile(name, description, mode))
    this.respond('data:clone-profile', ({ sourceId, newName }) => this.cloneProfile(sourceId, newName))
    this.respond('data:rename-profile', ({ profileId, newName, description }) => this.renameProfile(profileId, newName, description))
    this.respond('data:delete-profile', ({ profileId }) => this.deleteProfile(profileId))
    this.respond('data:update-profile', (payload = {}) => {
      const { profileId, updates } = payload || {}

      // If caller used legacy shape without "updates" wrapper, treat the remaining
      // keys (add/delete/modify/properties) as the updates object.
      let normalizedUpdates = updates
      if (!normalizedUpdates) {
        const { add, delete: del, modify, properties } = payload
        if (add || del || modify || properties) {
          normalizedUpdates = { add, delete: del, modify, properties }
        }
      }

      // Forward updateSource if caller included it (used for loop-suppression in some services)
      if (payload.updateSource && (!normalizedUpdates || !normalizedUpdates.updateSource)) {
        if (!normalizedUpdates) normalizedUpdates = {}
        normalizedUpdates.updateSource = payload.updateSource
      }

      return this.updateProfile(profileId, normalizedUpdates)
    })
    this.respond('data:set-environment', ({ environment }) => this.setEnvironment(environment))
    this.respond('data:get-settings', () => this.getSettings())
    this.respond('data:update-settings', ({ settings }) => this.updateSettings(settings))
    this.respond('data:load-default-data', () => this.loadDefaultData())
    this.respond('data:reload-state', () => this.reloadState())
    this.respond('data:get-keys', ({ environment } = {}) => this.getKeys(environment))
    this.respond('data:get-key-commands', ({ environment, key } = {}) => this.getKeyCommands(environment, key))
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
      
      // Normalize all profiles to use canonical string commands
      await this.normalizeAllProfiles()
      
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
    
    // Just return the primary build keys - UI components will handle bindset overlaying
    let mergedKeys = { ...(profile.builds[environment].keys || {}) }
    
    // Return virtual profile with flattened keys for current environment
    return {
      ...profile,
      keys: mergedKeys,
      aliases: profile.aliases || {},
      keybindMetadata: profile.keybindMetadata || {},
      aliasMetadata: profile.aliasMetadata || {},
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
   * Process explicit update operations (add/delete/modify)
   * Handle delete before add/modify to avoid conflicts
   */
  processUpdateOperations(currentProfile, operations) {
    const result = JSON.parse(JSON.stringify(currentProfile)) // Deep clone
    
    if (operations.delete) {
      // Delete operations - remove specified items
      if (operations.delete.aliases) {
        operations.delete.aliases.forEach(aliasName => {
          if (result.aliases) {
            delete result.aliases[aliasName]
          }
        })
      }
      
      if (operations.delete.builds) {
        for (const [env, envData] of Object.entries(operations.delete.builds)) {
          if (result.builds?.[env]?.keys && envData.keys) {
            envData.keys.forEach(keyName => {
              delete result.builds[env].keys[keyName]
            })
          }
        }
      }

      // Delete bindsets
      if (operations.delete.bindsets && Array.isArray(operations.delete.bindsets)) {
        operations.delete.bindsets.forEach(bsName => {
          if (result.bindsets) {
            delete result.bindsets[bsName]
          }
        })
      }
    }

    if (operations.add) {
      // Add operations - merge new items into existing collections
      if (operations.add.aliases) {
        result.aliases = { ...(result.aliases || {}), ...operations.add.aliases }
      }
      
      if (operations.add.builds) {
        result.builds = result.builds || { space: { keys: {} }, ground: { keys: {} } }
        for (const [env, envData] of Object.entries(operations.add.builds)) {
          result.builds[env] = result.builds[env] || { keys: {} }
          if (envData.keys) {
            result.builds[env].keys = { ...(result.builds[env].keys || {}), ...envData.keys }
          }
        }
      }

      if (operations.add.bindsets) {
        result.bindsets = { ...(result.bindsets || {}), ...operations.add.bindsets }
      }
    }
        
    if (operations.modify) {
      // Modify operations - update existing items
      if (operations.modify.aliases) {
        result.aliases = result.aliases || {}
        for (const [aliasName, aliasData] of Object.entries(operations.modify.aliases)) {
          if (result.aliases[aliasName]) {
            result.aliases[aliasName] = { ...result.aliases[aliasName], ...aliasData }
          }
        }
      }

      if (operations.modify.keybindMetadata) {
        result.keybindMetadata = result.keybindMetadata || {}
        for (const [env, envData] of Object.entries(operations.modify.keybindMetadata)) {
          result.keybindMetadata[env] = result.keybindMetadata[env] || {}
          for (const [keyName, keyData] of Object.entries(envData)) {
            // If empty object is sent, it means clear this key metadata
            if (Object.keys(keyData).length === 0) {
              delete result.keybindMetadata[env][keyName]
            } else {
              result.keybindMetadata[env][keyName] = keyData
            }
          }
        }
      }

      if (operations.modify.aliasMetadata) {
        result.aliasMetadata = result.aliasMetadata || {}
        for (const [aliasName, aliasData] of Object.entries(operations.modify.aliasMetadata)) {
          // If empty object is sent, it means clear this alias metadata
          if (Object.keys(aliasData).length === 0) {
            delete result.aliasMetadata[aliasName]
          } else {
            // Alias metadata is flat - aliasData IS the metadata object
            result.aliasMetadata[aliasName] = aliasData
          }
        }
      }

      if (operations.modify.builds) {
        result.builds = result.builds || { space: { keys: {} }, ground: { keys: {} } }
        for (const [env, envData] of Object.entries(operations.modify.builds)) {
          result.builds[env] = result.builds[env] || { keys: {} }
          if (envData.keys) {
            result.builds[env].keys = result.builds[env].keys || {}
            for (const [keyName, keyData] of Object.entries(envData.keys)) {
              if (result.builds[env].keys[keyName]) {
                result.builds[env].keys[keyName] = keyData
              }
            }
          }
        }
      }

      // ---------------- Bindsets (modify) ------------------
      if (operations.modify.bindsets) {
        result.bindsets = result.bindsets || {}
        for (const [bsName, bsData] of Object.entries(operations.modify.bindsets)) {
          // Ensure existing bindset structure
          result.bindsets[bsName] = result.bindsets[bsName] || { space: { keys: {} }, ground: { keys: {} } }

          for (const [env, envData] of Object.entries(bsData)) {
            result.bindsets[bsName][env] = result.bindsets[bsName][env] || { keys: {} }

            if (envData.keys) {
              result.bindsets[bsName][env].keys = result.bindsets[bsName][env].keys || {}
              console.log('[DataCoordinator] Incoming envData.keys for bindset', bsName, env, JSON.stringify(envData.keys));
              for (const [keyName, keyData] of Object.entries(envData.keys)) {
                if (keyData === null) {
                  // Delete the key if value is null
                  delete result.bindsets[bsName][env].keys[keyName]
                } else {
                  // Merge: set/replace the key with the provided value (including empty array)
                  result.bindsets[bsName][env].keys[keyName] = keyData
                }
              }
              console.log('[DataCoordinator] Resulting keys for bindset', bsName, env, JSON.stringify(result.bindsets[bsName][env].keys));
            }
          }
        }
      }

      // ----------- Bindset key metadata (stabilization etc.) ------------
      if (operations.modify.bindsetMetadata) {
        result.bindsetMetadata = result.bindsetMetadata || {}
        for (const [bsName, bsData] of Object.entries(operations.modify.bindsetMetadata)) {
          result.bindsetMetadata[bsName] = result.bindsetMetadata[bsName] || {}
          for (const [env, envData] of Object.entries(bsData)) {
            result.bindsetMetadata[bsName][env] = result.bindsetMetadata[bsName][env] || {}
            for (const [keyName, keyMeta] of Object.entries(envData)) {
              if (Object.keys(keyMeta).length === 0) {
                // Clear metadata entry
                delete result.bindsetMetadata[bsName][env][keyName]
              } else {
                result.bindsetMetadata[bsName][env][keyName] = {
                  ...(result.bindsetMetadata[bsName][env][keyName] || {}),
                  ...keyMeta,
                }
              }
            }
          }
        }
      }
    }
    
    // Handle regular property updates (non-collection fields)
    if (operations.properties) {
      Object.assign(result, operations.properties)
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

    // Extract updateSource for broadcast but don't persist it
    const { updateSource, ...persistableUpdates } = updates

    if (!(persistableUpdates.add || persistableUpdates.delete || persistableUpdates.modify || persistableUpdates.properties)) {
      throw new Error('Explicit operations (add/delete/modify/properties) required')
    }

      const updatedProfile = this.processUpdateOperations(currentProfile, {
        ...persistableUpdates,
        properties: {
          ...(persistableUpdates.properties || {}),
          lastModified: new Date().toISOString()
        }
      })
      
      // Persist to storage first (without updateSource)
      console.log(`[${this.componentName}] Saving profile ${profileId} to storage:`, updatedProfile)
      await this.storage.saveProfile(profileId, updatedProfile)

      // Update in-memory cache regardless of what changed
      this.state.profiles[profileId] = updatedProfile
      this.state.metadata.lastModified = new Date().toISOString()

      // Determine if any structural collections were touched
      const touchedCollections = !!(persistableUpdates.add || persistableUpdates.delete || persistableUpdates.modify)

      if (touchedCollections) { // || updates.properties?.currentEnvironment || updates.properties?.currentProfile) {
        // Notify other services when aliases / builds changed // or environment/profile properties changed
        // Include updateSource in broadcast but it was not persisted
        this.emit('profile:updated', {
          profileId,
          profile: updatedProfile,
          updates: persistableUpdates,
          updateSource, // Include for event filtering but not persisted
          timestamp: Date.now()
        })
      }

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
      const updates = { properties: { currentEnvironment: environment } }
      await this.updateProfile(this.state.currentProfile, updates)
    }
    
    // Broadcast environment change after storage operation completes
    this.emit('environment:changed', {
      fromEnvironment: oldEnvironment,
      toEnvironment: environment,
      environment: environment,
      timestamp: Date.now()
    })

    return { success: true, environment }
  }

  /**
   * Get keys for a specific environment from the current profile
   */
  getKeys(environment) {
    if (!this.state.currentProfile) {
      return {}
    }
    
    const profile = this.state.profiles[this.state.currentProfile]
    if (!profile || !profile.builds || !profile.builds[environment]) {
      return {}
    }
    
    const primaryKeys = profile.builds[environment].keys || {}

    // Overlay active bindset keys
    const activeBindset = this.state.currentBindset || 'Primary Bindset'
    if (activeBindset === 'Primary Bindset') {
      return primaryKeys
    }

    const bsKeys = profile.bindsets?.[activeBindset]?.[environment]?.keys || {}
    return { ...primaryKeys, ...bsKeys }
  }

  /**
   * Get commands for a specific key in a specific environment
   */
  getKeyCommands(environment, key) {
    const keys = this.getKeys(environment)
    const cmds = keys[key] || []
    // Return shallow copy to avoid accidental mutation of state
    return Array.isArray(cmds) ? [...cmds] : cmds
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
      const defaultProfilesData = await this.request('data:get-default-profiles')
      
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
      const defaultProfilesData = await this.request('data:get-default-profiles')
      
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
      const rawProfile = {
        name: sourceProfile.name,
        description: sourceProfile.description || '',
        currentEnvironment: sourceProfile.currentEnvironment || 'space',
        builds: sourceProfile.builds || {
          space: { keys: {} },
          ground: { keys: {} }
        },
        aliases: sourceProfile.aliases || {},
        // Preserve metadata fields for stabilizeExecutionOrder and other settings
        keybindMetadata: sourceProfile.keybindMetadata || {},
        aliasMetadata: sourceProfile.aliasMetadata || {},
        bindsetMetadata: sourceProfile.bindsetMetadata || {},
        created: new Date().toISOString(),
        lastModified: new Date().toISOString()
      }
      // Normalize to canonical command arrays (keys and aliases)
      normalizeProfile(rawProfile)
      profiles[profileId] = rawProfile
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
      'default': {
        name: 'Default',
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
      normalizeProfile(profile)
      await this.storage.saveProfile(profileId, profile)
      this.state.profiles[profileId] = profile
    }
    
    // Set current profile
    let profileActivated = false
    if (!this.state.currentProfile) {
      this.state.currentProfile = 'default'
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

  /**
   * Normalize all profiles to use canonical string commands
   */
  async normalizeAllProfiles() {
    let profilesNormalized = 0
    
    for (const [profileId, profile] of Object.entries(this.state.profiles)) {
      if (needsNormalization(profile)) {
        console.log(`[${this.componentName}] Normalizing profile: ${profileId}`)
        normalizeProfile(profile)
        
        // Save normalized profile back to storage
        await this.storage.saveProfile(profileId, profile)
        profilesNormalized++
      }
    }
    
    if (profilesNormalized > 0) {
      console.log(`[${this.componentName}] Normalized ${profilesNormalized} profiles to use canonical string commands`)
    }
  }

  /**
   * Reload state from storage (used after data import/restore)
   */
  async reloadState() {
    console.log(`[${this.componentName}] Reloading state from storage...`)
    
    try {
      // Get fresh data from storage
      const allData = this.storage.getAllData()
      
      // Update our state
      this.state.profiles = allData.profiles || {}
      this.state.currentProfile = allData.currentProfile || null
      this.state.settings = allData.settings || {}
      
      // Normalize any newly imported profiles
      await this.normalizeAllProfiles()
      
      // Set current environment from current profile if available
      if (this.state.currentProfile && this.state.profiles[this.state.currentProfile]) {
        const currentProfile = this.state.profiles[this.state.currentProfile]
        this.state.currentEnvironment = currentProfile.currentEnvironment || 'space'
      } else {
        this.state.currentEnvironment = 'space'
      }
      
      // Update metadata
      this.state.metadata.lastModified = new Date().toISOString()
      
      console.log(`[${this.componentName}] State reloaded. Current profile: ${this.state.currentProfile}, Environment: ${this.state.currentEnvironment}`)
      
      // Emit events to refresh UI components
      
      // 1. Emit profiles:initialized to refresh profile lists
      this.emit('profiles:initialized', {
        profiles: this.state.profiles,
        currentProfile: this.state.currentProfile,
        timestamp: Date.now()
      })
      
      // 2. If we have a current profile, emit profile:switched to refresh profile-specific UI
      if (this.state.currentProfile && this.state.profiles[this.state.currentProfile]) {
        const currentProfile = this.state.profiles[this.state.currentProfile]
        const virtualProfile = this.buildVirtualProfile(currentProfile, this.state.currentEnvironment)
        
        this.emit('profile:switched', {
          fromProfile: null, // We don't know the previous profile after reload
          toProfile: this.state.currentProfile,
          profileId: this.state.currentProfile,
          profile: virtualProfile,
          environment: this.state.currentEnvironment,
          timestamp: Date.now()
        })
      }
      
      // 3. Emit environment change to refresh environment-specific UI
      this.emit('environment:changed', {
        fromEnvironment: null, // We don't know the previous environment after reload
        toEnvironment: this.state.currentEnvironment,
        environment: this.state.currentEnvironment,
        timestamp: Date.now()
      })
      
      // 4. Emit settings change to refresh settings UI
      this.emit('settings:changed', {
        settings: this.state.settings,
        updates: this.state.settings, // All settings are "new" after reload
        timestamp: Date.now()
      })
      
      console.log(`[${this.componentName}] Emitted refresh events after state reload`)
      
      return {
        success: true,
        profiles: Object.keys(this.state.profiles).length,
        currentProfile: this.state.currentProfile,
        environment: this.state.currentEnvironment
      }
      
    } catch (error) {
      console.error(`[${this.componentName}] Failed to reload state:`, error)
      return { success: false, error: error.message }
    }
  }
} 