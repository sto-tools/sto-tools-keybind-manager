import ComponentBase from '../ComponentBase.js'

/**
 * AnalyticsService – the authoritative service for generating profile
 * statistics and analytics. This service extracts statistics generation
 * from KeyService to create a focused analytics service that can analyze
 * both keys and aliases comprehensively.
 */
export default class AnalyticsService extends ComponentBase {
  constructor ({ eventBus } = {}) {
    super(eventBus)
    this.componentName = 'AnalyticsService'

    // Local cache for DataCoordinator integration
    this.initializeCache()

    if (this.eventBus) {
      // Register request/response endpoints for analytics operations
      this.respond('analytics:get-profile-stats', ({ profileId } = {}) => this.getProfileStats(profileId))
      this.respond('analytics:get-key-stats', ({ profileId } = {}) => this.getKeyStats(profileId))
      this.respond('analytics:get-alias-stats', ({ profileId } = {}) => this.getAliasStats(profileId))
    }
  }

  async init() {
    super.init() 
    this.setupEventListeners()
  }

  // State setters - Updated to use cached state
  setCurrentProfile (profileId) {
    this.cache.currentProfile = profileId
  }

  // Convenience getter
  getCurrentProfileId () {
    return this.cache.currentProfile
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

    this.addEventListener('profile:switched', ({ profileId, profile }) => {
      this.cache.currentProfile = profileId
      
      this.updateCacheFromProfile(profile)
    })
  }

  // Update local cache from profile data
  updateCacheFromProfile(profile) {
    if (!profile) return
    
    this.cache.profile = profile
  }

  // Profile access now uses cached state or DataCoordinator
  async getCurrentProfile () {
    if (this.cache.profile) {
      return this.cache.profile
    }
    
    if (!this.cache.currentProfile) return null
    
    // Fetch from DataCoordinator if not in cache
    try {
      const profile = await this.request('data:get-profile', { profileId: this.cache.currentProfile })
      this.updateCacheFromProfile(profile)
      return profile
    } catch (error) {
      console.error('[AnalyticsService] Failed to get current profile:', error)
      return null
    }
  }

  // Analytics operations for comprehensive profile statistics
  async getProfileStats (profileId = null) {
    let profile
    
    if (profileId) {
      // Get specific profile
      try {
        profile = await this.request('data:get-profile', { profileId })
      } catch (error) {
        console.error('[AnalyticsService] Failed to get profile for stats:', error)
        return null
      }
    } else {
      // Use current profile
      profile = await this.getCurrentProfile()
    }
    
    if (!profile) return null

    const keyStats = this.calculateKeyStats(profile)
    const aliasStats = this.calculateAliasStats(profile)
    
    return this.combineStats(keyStats, aliasStats)
  }

  // Get key-specific statistics
  async getKeyStats (profileId = null) {
    let profile
    
    if (profileId) {
      try {
        profile = await this.request('data:get-profile', { profileId })
      } catch (error) {
        console.error('[AnalyticsService] Failed to get profile for key stats:', error)
        return null
      }
    } else {
      profile = await this.getCurrentProfile()
    }
    
    if (!profile) return null

    return this.calculateKeyStats(profile)
  }

  // Get alias-specific statistics
  async getAliasStats (profileId = null) {
    let profile
    
    if (profileId) {
      try {
        profile = await this.request('data:get-profile', { profileId })
      } catch (error) {
        console.error('[AnalyticsService] Failed to get profile for alias stats:', error)
        return null
      }
    } else {
      profile = await this.getCurrentProfile()
    }
    
    if (!profile) return null

    return this.calculateAliasStats(profile)
  }

  // Statistics calculation methods
  calculateKeyStats(profile = {}) {
    // Handle both legacy format (profile.keys) and new format (profile.builds)
    let keys = {}
    let spaceKeyCount = 0
    let groundKeyCount = 0
    
    if (profile.builds) {
      // New format: extract keys from all environments
      const spaceKeys = profile.builds.space?.keys || {}
      const groundKeys = profile.builds.ground?.keys || {}
      spaceKeyCount = Object.keys(spaceKeys).length
      groundKeyCount = Object.keys(groundKeys).length
      // For command analysis, merge all keys (duplicates will overwrite)
      keys = { ...spaceKeys, ...groundKeys }
    } else {
      // Legacy format - assume space environment
      keys = profile.keys || {}
      spaceKeyCount = Object.keys(keys).length
    }

    const stats = {
      totalKeys: spaceKeyCount + groundKeyCount, // Sum of environment keys
      totalCommands: 0,
      commandTypes: {},
      mostUsedCommands: {},
      environmentBreakdown: {
        space: spaceKeyCount,
        ground: groundKeyCount
      }
    }

    Object.values(keys).forEach(cmdArray => {
      if (!Array.isArray(cmdArray)) return
      cmdArray.forEach(cmdObj => {
        // Skip null/undefined entries that can occur from partially edited keybinds
        if (!cmdObj) return
        stats.totalCommands += 1 // Count only valid commands
        const cmdStr = cmdObj.command || ''
        const category = cmdObj.category || cmdObj.type || 'unknown' // Support both new and legacy format
        // Count by category
        stats.commandTypes[category] = (stats.commandTypes[category] || 0) + 1
        // Count by command string
        if (cmdStr) {
          stats.mostUsedCommands[cmdStr] = (stats.mostUsedCommands[cmdStr] || 0) + 1
        }
      })
    })

    return stats
  }

  // Calculate alias-related statistics from profile data
  calculateAliasStats(profile = {}) {
    const aliases = profile.aliases || {}

    const stats = {
      totalAliases: Object.keys(aliases).length,
      aliasTypes: {
        'alias': 0,
        'vfx-alias': 0,
        'unknown': 0
      },
      averageCommandsPerAlias: 0,
      aliasesWithCommands: 0
    }

    let totalAliasCommands = 0

    Object.values(aliases).forEach(aliasObj => {
      let type, commands
      
      if (!aliasObj) {
        // Handle null/undefined aliases
        type = 'unknown'
        commands = ''
      } else {
        type = aliasObj.type || 'unknown'
        commands = aliasObj.commands || ''
      }
      
      stats.aliasTypes[type] = (stats.aliasTypes[type] || 0) + 1
      
      // Count commands in alias - only array format used internally
      if (commands && Array.isArray(commands)) {
        const commandCount = commands.filter(cmd => cmd && cmd.trim()).length
        if (commandCount > 0) {
          stats.aliasesWithCommands++
          totalAliasCommands += commandCount
        }
      }
    })

    if (stats.totalAliases > 0) {
      stats.averageCommandsPerAlias = Math.round((totalAliasCommands / stats.totalAliases) * 100) / 100
    }

    return stats
  }

  // Combine key and alias statistics into comprehensive profile stats
  combineStats(keyStats, aliasStats) {
    return {
      // Key statistics
      totalKeys: keyStats.totalKeys,
      totalCommands: keyStats.totalCommands,
      commandTypes: keyStats.commandTypes,
      mostUsedCommands: keyStats.mostUsedCommands,
      environmentBreakdown: keyStats.environmentBreakdown,
      
      // Alias statistics
      totalAliases: aliasStats.totalAliases,
      aliasTypes: aliasStats.aliasTypes,
      averageCommandsPerAlias: aliasStats.averageCommandsPerAlias,
      aliasesWithCommands: aliasStats.aliasesWithCommands,
      
      // Combined statistics
      totalItems: keyStats.totalKeys + aliasStats.totalAliases,
      totalExecutableItems: keyStats.totalKeys + aliasStats.aliasesWithCommands
    }
  }
}