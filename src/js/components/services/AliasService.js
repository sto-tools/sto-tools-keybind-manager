import ComponentBase from '../ComponentBase.js'
import { respond, request } from '../../core/requestResponse.js'

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

    this.currentEnvironment = 'space'
    this.currentProfile = null

    // Local cache for DataCoordinator integration
    this.cache = {
      currentProfile: null,
      currentEnvironment: 'space',
      aliases: {}, 
      profile: null
    }

 
    if (this.eventBus) {
      // Register request/response endpoints for alias operations
      this.respond('alias:add', ({ name, description } = {}) => this.addAlias(name, description))
      this.respond('alias:duplicate-with-name', ({ sourceName, newName } = {}) => this.duplicateAliasWithName(sourceName, newName))
      this.respond('alias:duplicate', ({ sourceName } = {}) => this.duplicateAlias(sourceName))
      this.respond('alias:validate-name', ({ name } = {}) => this.isValidAliasName(name))      
      this.respond('alias:import-file', ({ content } = {}) => this.importAliasFile(content))
    }
  }

  async init() {
    super.init() 
    this.setupEventListeners()
  }

  // State setters - Updated to use cached state
  setCurrentEnvironment (environment) {
    this.currentEnvironment = environment
    this.cache.currentEnvironment = environment
  }

  setCurrentProfile (profileId) {
    this.currentProfile = profileId
    this.cache.currentProfile = profileId
  }

  // Convenience getter
  getCurrentProfileId () {
    return this.currentProfile
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
      this.currentProfile = profileId
      this.cache.currentEnvironment = environment || 'space'
      this.currentEnvironment = this.cache.currentEnvironment
      
      this.updateCacheFromProfile(profile)
    })

    // Listen for environment changes
    this.addEventListener('environment:changed', ({ environment }) => {
      if (environment) {
        this.cache.currentEnvironment = environment
        this.currentEnvironment = environment
      }
    })

    // Listen for alias operations
    this.addEventListener('alias:delete', ({ name } = {}) => this.deleteAlias(name))

  }

  // Update local cache from profile data
  updateCacheFromProfile(profile) {
    if (!profile) return
    
    this.cache.aliases = profile.aliases || {}
    this.cache.profile = profile
  }

  // Profile access now uses cached state
  getCurrentProfile () {
    if (!this.cache.currentProfile) return null
    
    // Return virtual profile with current aliases
    return {
      id: this.cache.currentProfile,
      aliases: this.cache.aliases,
      environment: this.cache.currentEnvironment
    }
  }

  // Core alias operations now use DataCoordinator
  async addAlias (name, description = '') {
    if (!await this.isValidAliasName(name)) {
      this.ui?.showToast?.(this.i18n?.t?.('invalid_alias_name') || 'Invalid alias name', 'error')
      return false
    }

    if (!this.cache.currentProfile) {
      this.ui?.showToast?.(this.i18n?.t?.('no_profile_selected') || 'No active profile', 'error')
      return false
    }

    // Check if alias already exists in cache
    if (this.cache.aliases[name]) {
      this.ui?.showToast?.(this.i18n?.t?.('alias_already_exists', { name }) || 'Alias already exists', 'warning')
      return false
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
      
      // Show success toast
      this.ui?.showToast?.(this.i18n?.t?.('alias_added') || 'Alias added', 'success')
      
      return true
    } catch (error) {
      console.error('[AliasService] Failed to add alias:', error)
      this.ui?.showToast?.(this.i18n?.t?.('failed_to_add_alias') || 'Failed to add alias', 'error')
      return false
    }
  }

  // Delete an alias from the current profile
  async deleteAlias (name) {
    if (!this.cache.currentProfile || !this.cache.aliases[name]) {
      return false
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
      return true
    } catch (error) {
      console.error('[AliasService] Failed to delete alias:', error)
      return false
    }
  }

  // Duplicate an existing alias (clone with new auto-generated name)
  async duplicateAlias (sourceName) {
    if (!this.cache.currentProfile || !this.cache.aliases[sourceName]) {
      return false
    }

    const original = this.cache.aliases[sourceName]

    try {
      // Generate unique new alias name
      let newName = `${sourceName}_copy`
      let counter = 1
      while (this.cache.aliases[newName]) {
        newName = `${sourceName}_copy${counter}`
        counter++
      }

      // Add duplicated alias using explicit operations API
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        add: {
          aliases: {
            [newName]: {
              description: original.description + ' (copy)',
              commands: original.commands,
              type: original.type || 'alias' // Preserve type or default to 'alias'
            }
          }
        }
      })

      this.emit('alias-created', { name: newName })
      this.emit('alias-duplicated', { from: sourceName, to: newName })
      return { success: true, newName }
    } catch (error) {
      console.error('[AliasService] Failed to duplicate alias:', error)
      return { success: false }
    }
  }

  // Duplicate an existing alias to an explicit new alias name
  async duplicateAliasWithName (sourceName, newName) {
    if (!sourceName || !newName) return false

    // Validate source exists
    if (!this.cache.aliases[sourceName]) return false

    // Validate new alias name and not duplicate
    if (!await this.isValidAliasName(newName)) return false
    if (this.cache.aliases[newName]) return false

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
      return { success: true, newName }
    } catch (error) {
      console.error('[AliasService] Failed to duplicate alias with name:', error)
      return { success: false }
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
    const profileId = this.currentProfile

    // Delegate to ImportService for complete import handling
    return request(this.eventBus, 'import:alias-file', { 
      content, 
      profileId 
    })
  }

  // Utility helpers
  generateAliasId () {
    return `alias_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}