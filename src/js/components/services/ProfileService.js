import ComponentBase from '../ComponentBase.js'
import { respond } from '../../core/requestResponse.js'

/**
 * ProfileService - Handles all profile data operations
 * Manages profile creation, deletion, switching, and data persistence
 */
export default class ProfileService extends ComponentBase {
  constructor({ storage, eventBus, i18n }) {
    super(eventBus)
    this.componentName = 'ProfileService'
    this.storage = storage
    this.i18n = i18n
    this.currentProfile = null
    this.currentEnvironment = 'space'
    this.isModified = false

    // ---------------------------------------------------------
    // Register Request/Response topics for state management and
    // profile operations. This allows other modules to communicate
    // with the ProfileService without holding a direct reference.
    // ---------------------------------------------------------
    if (this.eventBus) {
      respond(this.eventBus, 'profile:get-current', () => this.getCurrentProfile())
      respond(this.eventBus, 'profile:switch', ({ id } = {}) => this.switchProfile(id))
      respond(this.eventBus, 'profile:create', ({ name, description } = {}) => this.createProfile(name, description))
      respond(this.eventBus, 'profile:delete', ({ id } = {}) => this.deleteProfile(id))
      respond(this.eventBus, 'profile:list', () => {
        const data = this.storage?.getAllData?.()
        return data ? data.profiles : {}
      })

      // Phase-2 decoupling – expose cloning and renaming through
      // request/response so UI components no longer need service refs.
      respond(this.eventBus, 'profile:clone', ({ sourceId, newName } = {}) => this.cloneProfile(sourceId, newName))
      respond(this.eventBus, 'profile:rename', ({ id, newName, description } = {}) => this.renameProfile(id, newName, description))
    }
  }

  /**
   * Load profile data from storage
   */
  async loadData() {
    try {
      const data = this.storage.getAllData()
      this.currentProfile = data.currentProfile

      const profileData = data.profiles[this.currentProfile]
      if (profileData) {
        this.currentEnvironment = profileData.currentEnvironment || 'space'
      } else {
        this.currentEnvironment = 'space'
      }

      if (!data.profiles[this.currentProfile]) {
        this.currentProfile = Object.keys(data.profiles)[0]
        this.saveCurrentProfile()
      }

      // Notify other components that a profile has been set/loaded
      this.emit('profile-switched', {
        profileId: this.currentProfile,
        profile: this.currentProfile,
        environment: this.currentEnvironment,
      })

      return { 
        currentProfile: this.currentProfile, 
        currentEnvironment: this.currentEnvironment,
        profiles: data.profiles
      }
    } catch (error) {
      throw new Error(this.i18n.t('failed_to_load_profile_data') || 'Failed to load profile data')
    }
  }

  /**
   * Save the current profile data
   */
  saveProfile() {
    try {
      const virtualProfile = this.getCurrentProfile()

      if (!virtualProfile) {
        throw new Error(this.i18n.t('no_profile_to_save') || 'No profile to save')
      }

      // Save current build data to the proper structure
      this.saveCurrentBuild()

      // Get the actual stored profile structure AFTER saveCurrentBuild
      const actualProfile = this.storage.getProfile(this.currentProfile)
      if (!actualProfile) {
        throw new Error(this.i18n.t('profile_not_found') || 'Profile not found')
      }

      // Update profile-level data (aliases, metadata, etc.) from virtual profile
      // but preserve the builds structure that was just saved
      const updatedProfile = {
        ...actualProfile, // Keep the actual structure with builds (now includes saved keybinds)
        // Update profile-level fields from virtual profile
        name: virtualProfile.name,
        description: virtualProfile.description || actualProfile.description,
        aliases: virtualProfile.aliases || {},
        keybindMetadata:
          virtualProfile.keybindMetadata || actualProfile.keybindMetadata,
        // Preserve existing profile fields
        created: actualProfile.created,
        lastModified: new Date().toISOString(),
        currentEnvironment: this.currentEnvironment,
      }

      this.storage.saveProfile(this.currentProfile, updatedProfile)
      return { success: true, message: this.i18n.t('profile_saved') || 'Profile saved' }
    } catch (error) {
      throw new Error(this.i18n.t('failed_to_save_profile') || 'Failed to save profile')
    }
  }

  /**
   * Save all application data
   */
  saveData() {
    try {
      const data = this.storage.getAllData()
      data.currentProfile = this.currentProfile
      data.lastModified = new Date().toISOString()

      if (this.storage.saveAllData(data)) {
        this.setModified(false)
        return { success: true, message: this.i18n.t('data_saved') || 'Data saved' }
      }
      throw new Error(this.i18n.t('failed_to_save_data') || 'Failed to save data')
    } catch (error) {
      throw error
    }
  }

  /**
   * Save the current profile ID
   */
  saveCurrentProfile() {
    try {
      const data = this.storage.getAllData()
      data.currentProfile = this.currentProfile
      const result = this.storage.saveAllData(data)
      if (!result) {
        throw new Error(this.i18n.t('failed_to_save_current_profile') || 'Failed to save current profile')
      }
      return { success: true }
    } catch (error) {
      throw error
    }
  }

  /**
   * Set modified state
   */
  setModified(modified = true) {
    this.isModified = modified
    
    if (modified) {
      this.emit('profile-modified')
    }
    
    return { modified, success: true }
  }

  /**
   * Get the current profile with build-specific data
   */
  getCurrentProfile() {
    const profile = this.storage.getProfile(this.currentProfile)
    if (!profile) return null

    return this.getCurrentBuild(profile)
  }

  /**
   * Get the current build for a profile
   */
  getCurrentBuild(profile) {
    if (!profile) return null

    if (!profile.builds) {
      profile.builds = {
        space: { keys: {} },
        ground: { keys: {} },
      }
    }

    if (!profile.builds[this.currentEnvironment]) {
      profile.builds[this.currentEnvironment] = { keys: {} }
    }

    if (!profile.builds[this.currentEnvironment].keys) {
      profile.builds[this.currentEnvironment].keys = {}
    }

    return {
      ...profile,
      keys: profile.builds[this.currentEnvironment].keys,
      aliases: profile.aliases || {},
    }
  }

  /**
   * Switch to a different profile
   */
  switchProfile(profileId) {
    try {
      if (profileId === this.currentProfile) {
        return { success: true, switched: false, message: this.i18n.t('already_on_profile') || 'Already on this profile' }
      }

      const profile = this.storage.getProfile(profileId)
      if (!profile) {
        throw new Error(this.i18n.t('profile_not_found') || 'Profile not found')
      }

      this.currentProfile = profileId
      this.currentEnvironment = profile.currentEnvironment || 'space'

      this.saveCurrentProfile()

      // Notify other components of the profile change
      this.emit('profile-switched', {
        profileId: this.currentProfile,
        profile: this.currentProfile,
        environment: this.currentEnvironment,
      })

      const currentBuild = this.getCurrentProfile()
      return { 
        success: true, 
        switched: true, 
        profile: currentBuild,
        message: this.i18n.t('switched_to_profile', { name: currentBuild.name, environment: this.currentEnvironment }) || `Switched to ${currentBuild.name} (${this.currentEnvironment})`
      }
    } catch (error) {
      throw error
    }
  }

  /**
   * Create a new profile
   */
  createProfile(name, description = '', mode = 'space') {
    try {
      const profileId = this.generateProfileId(name)
      const profile = {
        name,
        description,
        currentEnvironment: mode,
        builds: {
          space: { keys: {} },
          ground: { keys: {} },
        },
        aliases: {},
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      }

      if (this.storage.saveProfile(profileId, profile)) {
        return { 
          success: true, 
          profileId, 
          profile,
          message: this.i18n.t('profile_created', { name }) || `Profile "${name}" created`
        }
      }

      throw new Error(this.i18n.t('failed_to_create_profile') || 'Failed to create profile')
    } catch (error) {
      throw error
    }
  }

  /**
   * Clone an existing profile
   */
  cloneProfile(sourceProfileId, newName) {
    try {
      const sourceProfile = this.storage.getProfile(sourceProfileId)
      if (!sourceProfile) {
        throw new Error(this.i18n.t('source_profile_not_found') || 'Source profile not found')
      }

      const profileId = this.generateProfileId(newName)
      const clonedProfile = {
        ...JSON.parse(JSON.stringify(sourceProfile)),
        name: newName,
        description: `Copy of ${sourceProfile.name}`,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      }

      if (this.storage.saveProfile(profileId, clonedProfile)) {
        return { 
          success: true, 
          profileId, 
          profile: clonedProfile,
          message: this.i18n.t('profile_created_from', { newName, sourceProfile: sourceProfile.name }) || `Profile "${newName}" created from "${sourceProfile.name}"`
        }
      }

      throw new Error(this.i18n.t('failed_to_clone_profile') || 'Failed to clone profile')
    } catch (error) {
      throw error
    }
  }

  /**
   * Delete a profile
   */
  deleteProfile(profileId) {
    try {
      const profile = this.storage.getProfile(profileId)
      if (!profile) {
        throw new Error(this.i18n.t('profile_not_found') || 'Profile not found')
      }

      const data = this.storage.getAllData()
      const profileCount = Object.keys(data.profiles).length

      if (profileCount <= 1) {
        throw new Error(this.i18n.t('cannot_delete_the_last_profile') || 'Cannot delete the last profile')
      }

      if (this.storage.deleteProfile(profileId)) {
        let switchedProfile = null
        if (this.currentProfile === profileId) {
          const remaining = Object.keys(this.storage.getAllData().profiles)
          this.currentProfile = remaining[0]
          this.saveCurrentProfile()
          switchedProfile = this.getCurrentProfile()
        }

        return { 
          success: true, 
          deletedProfile: profile,
          switchedProfile,
          message: this.i18n.t('profile_deleted', { profileName: profile.name }) || `Profile "${profile.name}" deleted`
        }
      }

      throw new Error(this.i18n.t('failed_to_delete_profile') || 'Failed to delete profile')
    } catch (error) {
      throw error
    }
  }

  /**
   * Save the current build data
   */
  saveCurrentBuild() {
    try {
      const profile = this.storage.getProfile(this.currentProfile)
      const currentBuild = this.getCurrentProfile()

      if (profile && currentBuild) {
        if (!profile.builds) {
          profile.builds = {
            space: { keys: {} },
            ground: { keys: {} },
          }
        }

        profile.builds[this.currentEnvironment] = {
          keys: currentBuild.keys || {},
        }

        this.storage.saveProfile(this.currentProfile, profile)
        return { success: true }
      }

      throw new Error(this.i18n.t('no_profile_or_build_data') || 'No profile or build data')
    } catch (error) {
      throw error
    }
  }

  /**
   * Generate a unique profile ID
   */
  generateProfileId(name) {
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    let id = base
    let counter = 1

    const data = this.storage.getAllData()
    while (data.profiles[id]) {
      id = `${base}_${counter}`
      counter++
    }

    return id
  }

  /**
   * Get current profile ID
   */
  getCurrentProfileId() {
    return this.currentProfile
  }

  /**
   * Get current environment
   */
  getCurrentEnvironment() {
    return this.currentEnvironment
  }

  /**
   * Set current environment
   */
  setCurrentEnvironment(environment) {
    this.currentEnvironment = environment
    // Notify other components of environment change
    this.emit('environment:changed', { environment })
  }

  /**
   * Get modified state
   */
  getModified() {
    return this.isModified
  }

  /**
   * Provide serialisable snapshot for late-join handshake
   */
  getCurrentState() {
    return {
      currentProfile: this.currentProfile,
      currentEnvironment: this.currentEnvironment,
      profiles: this.getAllProfiles(),
      modified: this.isModified,
    }
  }

  /**
   * Return a shallow copy of all profiles from storage.
   */
  getAllProfiles () {
    const data = this.storage?.getAllData?.()
    return data ? { ...data.profiles } : {}
  }

  /**
   * Rename a profile – updates its name (and optional description).
   * If the renamed profile is currently active, emit profile-modified so UIs
   * can refresh.
   */
  renameProfile (profileId, newName, description = '') {
    try {
      if (!profileId) {
        throw new Error(this.i18n?.t?.('profile_id_required') || 'Profile ID is required')
      }

      const profile = this.storage.getProfile(profileId)
      if (!profile) {
        throw new Error(this.i18n?.t?.('profile_not_found') || 'Profile not found')
      }

      profile.name = newName
      if (description !== undefined && description !== null) {
        profile.description = description
      }
      profile.lastModified = new Date().toISOString()

      const saved = this.storage.saveProfile(profileId, profile)
      if (saved) {
        // If this is the active profile, consider it modified so UI updates.
        if (profileId === this.currentProfile) {
          this.emit('profile-modified', { profileId })
        }

        return {
          success: true,
          profileId,
          profile,
          message: this.i18n?.t?.('profile_renamed', { name: newName }) || `Profile renamed to "${newName}"`
        }
      }

      throw new Error(this.i18n?.t?.('failed_to_rename_profile') || 'Failed to rename profile')
    } catch (error) {
      throw error
    }
  }
} 