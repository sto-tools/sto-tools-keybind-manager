import ComponentBase from '../ComponentBase.js'

/**
 * AliasService – the authoritative service for creating, deleting and duplicating
 * alias rows in a profile. This service mirrors KeyService but focuses
 * exclusively on alias level operations so other components (AliasBrowser,
 * UI components, etc.) can delegate all alias data mutations here.
 * 
 * Uses DataCoordinator broadcast/cache pattern.
 */
export default class AliasService extends ComponentBase {
  constructor ({ eventBus, i18n, ui } = {}) {
    super(eventBus)
    this.componentName = 'AliasService'
    this.i18n = i18n
    this.ui = ui

    if (this.eventBus) {
      // Register request/response endpoints for alias operations
      this.respond('alias:add', ({ name, description } = {}) => this.addAlias(name, description))
      this.respond('alias:delete', ({ name } = {}) => this.deleteAlias(name))
      this.respond('alias:duplicate-with-name', ({ sourceName, newName } = {}) => this.duplicateAliasWithName(sourceName, newName))
      this.respond('alias:validate-name', ({ name } = {}) => this.isValidAliasName(name))
      this.respond('alias:import-file', ({ content } = {}) => this.importAliasFile(content))
    }
  }

  onInit() {
    this.setupEventListeners()
  }

  
  // Event listeners for DataCoordinator integration
  setupEventListeners () {
    if (!this.eventBus) return

    // Listen for profile updates
    this.addEventListener('profile:updated', ({ profileId, profile }) => {
      if (profileId === this.cache.currentProfile) {
        this.updateCacheFromProfile(profile)
      }
    })

    this.addEventListener('profile:switched', ({ profileId, profile, environment }) => {
      this.cache.currentProfile = profileId
      this.cache.currentEnvironment = environment || 'space'
      
      this.updateCacheFromProfile(profile)
    })

    // Listen for environment changes
    this.addEventListener('environment:changed', ({ environment }) => {
      if (environment) {
        this.cache.currentEnvironment = environment || 'space'
      }
    })

    
  }

  // Update local cache from profile data
  updateCacheFromProfile(profile) {
    if (!profile) return
    
    this.cache.aliases = profile.aliases || {}
    this.cache.profile = profile
  }

  
  // Core alias operations now use DataCoordinator
  async addAlias (name, description = '') {
    if (!await this.isValidAliasName(name)) {
      return { success: false, error: 'invalid_alias_name', params: { name } }
    }

    if (!this.cache.currentProfile) {
      return { success: false, error: 'no_profile_selected' }
    }

    // Check if alias already exists in cache
    if (this.cache.aliases[name]) {
      return { success: false, error: 'alias_already_exists', params: { name } }
    }

    try {
      // Add new alias using explicit operations API
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        add: {
          aliases: {
            [name]: {
              description,
              commands: [], // Use array format for commands
              type: 'alias' // Set proper type
            }
          }
        }
      })

      this.emit('alias-created', { name })
      return { success: true, message: 'alias_created', data: { name } }
    } catch (error) {
      console.error('[AliasService] Failed to add alias:', error)
      return { success: false, error: 'failed_to_add_alias' }
    }
  }

  // Delete an alias from the current profile
  async deleteAlias (name) {
    if (!this.cache.currentProfile) {
      return { success: false, error: 'no_profile_selected' }
    }

    if (!this.cache.aliases[name]) {
      return { success: false, error: 'alias_not_found', params: { name } }
    }

    try {
      // Delete alias using explicit operations API
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        delete: {
          aliases: [name]
        }
      })

      this.emit('alias-deleted', { name })
      return { success: true, message: 'alias_deleted', data: { name } }
    } catch (error) {
      console.error('[AliasService] Failed to delete alias:', error)
      return { success: false, error: 'failed_to_delete_alias' }
    }
  }

  
  // Duplicate an existing alias to an explicit new alias name
  async duplicateAliasWithName (sourceName, newName) {
    if (!sourceName || !newName) {
      return { success: false, error: 'invalid_alias_name' }
    }

    // Validate source exists
    if (!this.cache.aliases[sourceName]) {
      return { success: false, error: 'alias_not_found', params: { name: sourceName } }
    }

    // Validate new alias name and not duplicate
    if (!await this.isValidAliasName(newName)) {
      return { success: false, error: 'invalid_alias_name', params: { name: newName } }
    }
    if (this.cache.aliases[newName]) {
      return { success: false, error: 'alias_already_exists', params: { name: newName } }
    }

    const original = this.cache.aliases[sourceName]

    try {
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        add: {
          aliases: {
            [newName]: {
              description: original.description,
              commands: original.commands,
              type: original.type || 'alias' // Preserve type or default to 'alias'
            }
          }
        }
      })

      // Update local cache
      this.cache.aliases[newName] = {
        description: original.description,
        commands: original.commands,
        type: original.type || 'alias'
      }

      this.emit('alias-created', { name: newName })
      this.emit('alias-duplicated', { from: sourceName, to: newName })
      return { success: true, message: 'alias_duplicated', data: { from: sourceName, to: newName } }
    } catch (error) {
      console.error('[AliasService] Failed to duplicate alias with name:', error)
      return { success: false, error: 'failed_to_duplicate_alias' }
    }
  }

  // Validation helpers
  async isValidAliasName (name) {
    if (!name || typeof name !== 'string') return false
    
    try {
      // Use the comprehensive alias validation library
      const { isAliasNameAllowed } = await import('../../lib/aliasNameValidator.js')
      return isAliasNameAllowed(name)
    } catch (error) {
      // Fallback to basic pattern validation if library not available
      const pattern = /^[A-Za-z][A-Za-z0-9_]*$/
      return pattern.test(name) && name.length <= 50
    }
  }

  // Import operations
  importAliasFile (content) {
    const profileId = this.cache.currentProfile

    // Delegate to ImportService for complete import handling
    return request(this.eventBus, 'import:alias-file', {
      content,
      profileId
    })
  }
}