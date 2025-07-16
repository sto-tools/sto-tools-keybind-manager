import ComponentBase from '../ComponentBase.js'
import { respond, request } from '../../core/requestResponse.js'

/**
 * ProfileService - Compatibility layer for DataCoordinator
 * 
 * REFACTORED: Now a thin wrapper around DataCoordinator that maintains
 * backward compatibility for existing components while delegating all
 * actual data operations to the DataCoordinator.
 */
export default class ProfileService extends ComponentBase {
  constructor({ storage, eventBus, i18n, dataCoordinator }) {
    super(eventBus)
    this.componentName = 'ProfileService'
    this.i18n = i18n
    this.dataCoordinator = dataCoordinator
    
    // Legacy state tracking for compatibility - will be removed in future
    this.currentProfile = null
    this.currentEnvironment = 'space'
    this.isModified = false

    // Cache for profiles list from DataCoordinator broadcasts
    this.profilesCache = {}

    // Register Request/Response topics for backward compatibility
    // All requests are forwarded to DataCoordinator
    if (this.eventBus) {
      this.respond('profile:switch', ({ id } = {}) => this.switchProfile(id))
      this.respond('profile:create', ({ name, description, mode } = {}) => this.createProfile(name, description, mode))
      this.respond('profile:delete', ({ id } = {}) => this.deleteProfile(id))
      this.respond('profile:list', () => this.getAllProfiles())
      this.respond('profile:clone', ({ sourceId, newName } = {}) => this.cloneProfile(sourceId, newName))
      this.respond('profile:rename', ({ id, newName, description } = {}) => this.renameProfile(id, newName, description))
      this.respond('profile:save', ({ profile } = {}) => this.saveSpecificProfile(profile))
    }
  }

  async init() {
    super.init()
    
    this.setupEventListeners()
  }

  setupEventListeners() {
    // Listen for DataCoordinator state updates to maintain legacy state
    this.addEventListener('profile:switched', ({ profileId, environment }) => {
      this.currentProfile = profileId
      this.currentEnvironment = environment
      this.isModified = false
    })

    this.addEventListener('environment:changed', ({ environment }) => {
      this.currentEnvironment = environment
    })

    // Cache profiles list when DataCoordinator broadcasts updates
    this.addEventListener('profile:created', ({ profile }) => {
      if (profile && profile.id) {
        this.profilesCache[profile.id] = profile
      }
    })

    this.addEventListener('profile:deleted', ({ profileId }) => {
      if (this.profilesCache[profileId]) {
        delete this.profilesCache[profileId]
      }
    })

    this.addEventListener('profile:updated', ({ profile }) => {
      if (profile && profile.id) {
        this.profilesCache[profile.id] = profile
      }
    })
  }

  /**
   * Load profile data - now uses cached state from DataCoordinator broadcasts
   */
  async loadData() {
    try {
      // Maintain backward compatibility by emitting legacy event
      if (this.currentProfile) {
        this.emit('profile-switched', {
          profileId: this.currentProfile,
          profile: this.currentProfile,
          environment: this.currentEnvironment,
        })
      }

      return { 
        currentProfile: this.currentProfile, 
        currentEnvironment: this.currentEnvironment,
        profiles: this.profilesCache
      }
    } catch (error) {
      throw new Error(this.i18n.t('failed_to_load_profile_data') || 'Failed to load profile data')
    }
  }

  /**
   * Save the current profile data - delegated to DataCoordinator
   */
  async saveProfile() {
    try {
      if (!this.currentProfile) {
        throw new Error(this.i18n.t('no_profile_to_save') || 'No profile to save')
      }

      // Delegate entirely to DataCoordinator - it handles the current profile state
      await this.request('data:update-profile', {
        profileId: this.currentProfile,
        properties: {
          currentEnvironment: this.currentEnvironment
        }
      })

      this.isModified = false
      return { success: true, message: this.i18n.t('profile_saved') || 'Profile saved' }
    } catch (error) {
      throw new Error(this.i18n.t('failed_to_save_profile') || 'Failed to save profile')
    }
  }

  /**
   * Save a specific profile - delegated to DataCoordinator
   */
  async saveSpecificProfile(profile) {
    try {
      if (!profile) {
        throw new Error(this.i18n.t('no_profile_to_save') || 'No profile to save')
      }

      // Extract the profileId - assume it's current profile if not specified
      const profileId = profile.id || this.currentProfile
      
      await this.request('data:update-profile', { 
        profileId, 
        properties: profile 
      })

      this.setModified(true)
      return { success: true, message: this.i18n.t('profile_saved') || 'Profile saved' }
    } catch (error) {
      console.error('Failed to save specific profile:', error)
      throw new Error(this.i18n.t('failed_to_save_profile') || 'Failed to save profile')
    }
  }

  /**
   * Save all application data - delegated to DataCoordinator
   */
  async saveData() {
    try {
      // In the new architecture, this is handled by DataCoordinator automatically
      // Just mark as not modified for compatibility
      this.setModified(false)
      return { success: true, message: this.i18n.t('data_saved') || 'Data saved' }
    } catch (error) {
      throw error
    }
  }

  /**
   * Save the current profile ID - now handled automatically by DataCoordinator
   */
  async saveCurrentProfile() {
    try {
      // In the new architecture, this is handled automatically by DataCoordinator
      // when switching profiles, so this is a no-op for compatibility
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

  // getCurrentProfile method removed - components should use broadcast/cache pattern instead


  /**
   * Switch to a different profile - delegated to DataCoordinator
   */
  async switchProfile(profileId) {
    try {
      const result = await this.request('data:switch-profile', { profileId })
      
      // Update local state for compatibility
      if (result.success && result.switched) {
        this.currentProfile = profileId
        this.currentEnvironment = result.profile?.environment || 'space'
        this.isModified = false
      }
      
      // Localize the message if needed
      if (result.message && this.i18n) {
        if (result.switched) {
          result.message = this.i18n.t('switched_to_profile', { 
            name: result.profile?.name, 
            environment: this.currentEnvironment 
          }) || result.message
        } else {
          result.message = this.i18n.t('already_on_profile') || result.message
        }
      }

      return result
    } catch (error) {
      // Localize error message if needed
      if (error.message.includes('not found') && this.i18n) {
        throw new Error(this.i18n.t('profile_not_found') || error.message)
      }
      throw error
    }
  }

  /**
   * Create a new profile - delegated to DataCoordinator
   */
  async createProfile(name, description = '', mode = 'space') {
    try {
      const result = await this.request('data:create-profile', { name, description, mode })
      
      // Localize the message if needed
      if (result.message && this.i18n) {
        result.message = this.i18n.t('profile_created', { name }) || result.message
      }
      
      return result
    } catch (error) {
      // Localize error message if needed
      if (this.i18n) {
        if (error.message.includes('already exists')) {
          throw new Error(this.i18n.t('profile_already_exists', { name }) || error.message)
        } else {
          throw new Error(this.i18n.t('failed_to_create_profile') || error.message)
        }
      }
      throw error
    }
  }

  /**
   * Clone an existing profile - delegated to DataCoordinator
   */
  async cloneProfile(sourceProfileId, newName) {
    try {
      const result = await this.request('data:clone-profile', { sourceId: sourceProfileId, newName })
      
      // Localize the message if needed
      if (result.message && this.i18n) {
        result.message = this.i18n.t('profile_created_from', { 
          newName, 
          sourceProfile: sourceProfileId // Use ID instead of name since we don't have cached profile data
        }) || result.message
      }
      
      return result
    } catch (error) {
      // Localize error message if needed
      if (this.i18n) {
        if (error.message.includes('not found')) {
          throw new Error(this.i18n.t('source_profile_not_found') || error.message)
        } else {
          throw new Error(this.i18n.t('failed_to_clone_profile') || error.message)
        }
      }
      throw error
    }
  }

  /**
   * Delete a profile - delegated to DataCoordinator
   */
  async deleteProfile(profileId) {
    try {
      const result = await this.request('data:delete-profile', { profileId })
      
      // Update local state if we switched profiles
      if (result.success && result.switchedProfile) {
        this.currentProfile = result.switchedProfile.id || Object.keys((await this.request('data:get-all-profiles')))[0]
        this.currentEnvironment = result.switchedProfile.environment || 'space'
        this.isModified = false
      }
      
      // Localize the message if needed
      if (result.message && this.i18n) {
        result.message = this.i18n.t('profile_deleted', { 
          profileName: result.deletedProfile?.name || 'Unknown'
        }) || result.message
      }
      
      return result
    } catch (error) {
      // Localize error message if needed
      if (this.i18n) {
        if (error.message.includes('not found')) {
          throw new Error(this.i18n.t('profile_not_found') || error.message)
        } else if (error.message.includes('last profile')) {
          throw new Error(this.i18n.t('cannot_delete_the_last_profile') || error.message)
        } else {
          throw new Error(this.i18n.t('failed_to_delete_profile') || error.message)
        }
      }
      throw error
    }
  }

  /**
   * Save the current build data - delegated to DataCoordinator
   */
  async saveCurrentBuild() {
    try {
      if (!this.currentProfile) {
        throw new Error(this.i18n.t('no_profile_or_build_data') || 'No profile or build data')
      }

      // DataCoordinator handles current build state internally
      // This method is kept for backward compatibility but delegates entirely
      await this.request('data:update-profile', {
        profileId: this.currentProfile,
        properties: {
          currentEnvironment: this.currentEnvironment
        }
      })
      
      return { success: true }
    } catch (error) {
      throw error
    }
  }

  /**
   * Generate a unique profile ID - now delegated to DataCoordinator
   */
  async generateProfileId(name) {
    // DataCoordinator has its own generateProfileId method
    // This is kept for backward compatibility but delegates the logic
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    let id = base
    let counter = 1

    const profiles = await this.request('data:get-all-profiles')
    while (profiles[id]) {
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
    // Note: No longer emitting environment:changed to prevent circular dependency.
    // InterfaceModeService is now the single source of truth for environment changes.
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
  async getCurrentState() {
    return {
      modified: this.isModified
      // REMOVED: currentProfile, currentEnvironment, profiles - not owned by ProfileService
      // These are owned by DataCoordinator and should be accessed through it
    }
  }

  /**
   * ComponentBase late-join support - handle initial state from other instances
   */
  async handleInitialState(state, senderName) {
    // REMOVED: DataCoordinator and SelectionService handling now in ComponentBase._handleInitialState
    // Component-specific initialization can be added here if needed
  }

  /**
   * Return cached profiles instead of making requests
   */
  async getAllProfiles() {
    return { ...this.profilesCache }
  }

  /**
   * Rename a profile - delegated to DataCoordinator
   */
  async renameProfile(profileId, newName, description = '') {
    try {
      const result = await this.request('data:rename-profile', { 
        profileId, 
        newName, 
        description 
      })

      // Localize the message if needed
      if (result.message && this.i18n) {
        result.message = this.i18n.t('profile_renamed', { name: newName }) || result.message
      }

      return result
    } catch (error) {
      // Localize error message if needed
      if (this.i18n) {
        if (error.message.includes('required')) {
          throw new Error(this.i18n.t('profile_id_required') || error.message)
        } else if (error.message.includes('not found')) {
          throw new Error(this.i18n.t('profile_not_found') || error.message)
        } else {
          throw new Error(this.i18n.t('failed_to_rename_profile') || error.message)
        }
      }
      throw error
    }
  }
} 