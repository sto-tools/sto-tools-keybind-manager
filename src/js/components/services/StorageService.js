import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'

/*
 * StorageService
 *
 * Manages all data storage for the application.
 *
 * This service is responsible for:
 * - Storing and retrieving data from localStorage
 * - Creating automatic backups
 * - Clearing all data
 * - Migrating data from old formats to new formats
 * - Ensuring storage structure is valid
 * - Detecting browser language
 *
 * Note: Advanced import/export functionality is handled by ProjectManagementService
 */
export default class StorageService extends ComponentBase {
  constructor({
    eventBus: bus = eventBus,
    storageKey = 'sto_keybind_manager',
    backupKey = 'sto_keybind_manager_backup',
    settingsKey = 'sto_keybind_settings',
    version = '1.0.0',
    dataService = null,
    data = {},
    i18n = null
  } = {}) {
    super(bus)
    this.componentName = 'StorageService'
    this.storageKey = storageKey
    this.backupKey = backupKey
    this.settingsKey = settingsKey
    this.version = version
    this.dataService = dataService
    this.data = data || {}
    this.i18n = i18n

  }

  onInit() {
    // Check if we need to migrate old data
    this.migrateData()
    
    // Ensure we have basic structure
    this.ensureStorageStructure()
    
    // Set up event listeners
    this.setupEventListeners()
    
    // Emit storage ready event
    this.emit('storage:ready', { service: this })
  }

  setupEventListeners() {
    // Listen for app reset confirmation
    this.addEventListener('app:reset-confirmed', () => {
      this.handleAppReset()
    })
  }

  // Handle application reset
  async handleAppReset() {
    console.log('[StorageService] Handling application reset')
    
    try {
      // Clear all data using existing method - this sets the reset flag
      const success = this.clearAllData()
      
      if (success) {
        console.log('[StorageService] Application reset successful - data cleared')
        
        // Reset internal cache to empty structure
        this.data = this.getEmptyData()
        
        // Emit events to notify other components about the reset
        this.emit('storage:data-reset', { data: this.data }, { synchronous: true })
        this.emit('app:reset-complete', {}, { synchronous: true })
        
        // Show success message
        if (typeof window !== 'undefined' && window.stoUI && window.stoUI.showToast) {
          const message = this.i18n?.t('application_reset_successfully') || 'Application reset successfully. All profiles cleared.'
          window.stoUI.showToast(message, 'success')
        }
      } else {
        console.error('[StorageService] Application reset failed')
        // Emit error event for UI feedback
        this.emit('app:reset-failed')
      }
    } catch (error) {
      console.error('[StorageService] Error during application reset:', error)
      this.emit('app:reset-failed', { error })
    }
  }

  // Get all data from storage
  // If forceFresh is true, bypass in-memory cache and reload from localStorage
  getAllData(forceFresh = false) {
    // Use cached copy unless forceFresh requested
    if (!forceFresh && this._cachedData) {
      return this._cachedData
    }

    try {
      const data = localStorage.getItem(this.storageKey)
      const resetFlag = localStorage.getItem('sto_app_reset')

      if (!data) {
        // If reset flag exists, return empty structure instead of default data
        if (resetFlag) {
          localStorage.removeItem('sto_app_reset')
          return this.getEmptyData()
        }
        return this.getDefaultData()
      }

      const parsed = JSON.parse(data)

      // Validate data structure (but allow migration-eligible data to pass through)
      if (!this.isValidDataStructure(parsed, true)) {
        return this.getDefaultData()
      }

      // Cache and return parsed data
      this._cachedData = parsed
      return parsed
    } catch (error) {
      console.error('Error loading data from storage:', error)
      const defaults = this.getDefaultData()
      this._cachedData = defaults
      return defaults
    }
  }

  // Save all data to storage
  saveAllData(data) {
    try {
      // Create backup of current data
      this.createBackup()

      // Add metadata
      const dataWithMeta = {
        ...data,
        version: this.version,
        lastModified: new Date().toISOString(),
        lastBackup: new Date().toISOString(),
      }

      localStorage.setItem(this.storageKey, JSON.stringify(dataWithMeta))
      
      // Update cache
      this._cachedData = dataWithMeta
      
      // Emit data changed event
      this.emit('storage:data-changed', { data: dataWithMeta })
      
      return true
    } catch (error) {
      console.error('Error saving data to storage:', error)
      return false
    }
  }

  // Get specific profile
  getProfile(profileId) {
    const data = this.getAllData()
    return data.profiles[profileId] || null
  }

  // Save specific profile
  saveProfile(profileId, profile) {
    // Always fetch fresh to avoid stale cache overwriting newer changes
    const data = this.getAllData(true)
    data.profiles[profileId] = {
      ...profile,
      lastModified: new Date().toISOString(),
    }
    const ok = this.saveAllData(data)
    return ok
  }

  // Delete profile
  deleteProfile(profileId) {
    const data = this.getAllData()
    if (data.profiles[profileId]) {
      delete data.profiles[profileId]

      // If this was the current profile, switch to first available
      if (data.currentProfile === profileId) {
        const remainingProfiles = Object.keys(data.profiles)
        data.currentProfile =
          remainingProfiles.length > 0 ? remainingProfiles[0] : null
      }

      return this.saveAllData(data)
    }
    return false
  }

  // Get application settings
  getSettings() {
    try {
      const raw = localStorage.getItem(this.settingsKey)
      if (!raw) return this.getDefaultSettings()
      const parsed = JSON.parse(raw)
      return { ...this.getDefaultSettings(), ...parsed }
    } catch (error) {
      console.error('Error loading settings:', error)
      return this.getDefaultSettings()
    }
  }

  // Save application settings
  saveSettings(settings) {
    try {
      const current = this.getSettings()
      const merged = { ...current, ...settings }
      localStorage.setItem(this.settingsKey, JSON.stringify(merged))
      
      // Emit settings changed event
      this.emit('storage:settings-changed', { settings: merged })
      
      return true
    } catch (error) {
      console.error('Error saving settings:', error)
      return false
    }
  }

  // Create backup of current data
  createBackup() {
    try {
      const currentData = localStorage.getItem(this.storageKey)
      if (currentData) {
        const backup = {
          data: currentData,
          timestamp: new Date().toISOString(),
          version: this.version,
        }
        localStorage.setItem(this.backupKey, JSON.stringify(backup))
        
        // Emit backup created event
        this.emit('storage:backup-created', { backup })
      }
    } catch (error) {
      console.error('Error creating backup:', error)
    }
  }

  
  // Clear all data (reset application)
  clearAllData() {
    try {
      localStorage.removeItem(this.storageKey)
      localStorage.removeItem(this.backupKey)
      localStorage.removeItem(this.settingsKey)

      // Set reset flag to prevent loading default data on next startup
      localStorage.setItem('sto_app_reset', 'true')

      // Emit data cleared event
      this.emit('storage:data-cleared')

      return true
    } catch (error) {
      console.error('Error clearing data:', error)
      return false
    }
  }

  
  // Private methods

  getDefaultData() {
    // StorageService should only provide empty structure
    // DataCoordinator handles creating default profiles
    return {
      version: this.version,
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      currentProfile: null,
      profiles: {},
      globalAliases: {},
      settings: this.getDefaultSettings(),
    }
  }

  getEmptyData() {
    return {
      version: this.version,
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      currentProfile: null,
      profiles: {},
      globalAliases: {},
      settings: this.getDefaultSettings(),
    }
  }

  getDefaultSettings() {
    return {
      theme: 'default',
      autoSave: true,
      showTooltips: true,
      confirmDeletes: true,
      maxUndoSteps: 50,
      defaultMode: 'space',
      compactView: false,
      language: this.detectBrowserLanguage(),
      syncFolderName: null,
      syncFolderPath: null,
      autoSync: false,
      autoSyncInterval: 'change',
    }
  }

  detectBrowserLanguage() {
    try {
      if (typeof navigator === 'undefined') return 'en'
      const cand = (navigator.languages && navigator.languages[0]) || navigator.language
      if (!cand) return 'en'
      const lang = cand.toLowerCase().split(/[-_]/)[0]
      return ['en', 'de', 'es', 'fr'].includes(lang) ? lang : 'en'
    } catch (error) {
      console.error('Error detecting browser language:', error)
      return 'en'
    }
  }

  isValidDataStructure(data, allowMigration = false) {
    if (!data || typeof data !== 'object') return false

    // Check required properties
    const required = ['profiles', 'currentProfile']
    for (const prop of required) {
      if (!(prop in data)) return false
    }

    // Check profiles structure
    if (typeof data.profiles !== 'object') return false

    // Validate each profile
    for (const [profileId, profile] of Object.entries(data.profiles)) {
      const isValid = this.isValidProfile(profile)
      const canMigrate = allowMigration && this.needsProfileMigration(profile)
      
      if (!isValid && !canMigrate) {
        // Invalid profile structure is an expected validation result, not something to log
        return false
      }
    }

    return true
  }

  isValidProfile(profile) {
    if (!profile || typeof profile !== 'object') return false
    if (!profile.name) return false

    // Check for new format with builds structure
    if (profile.builds && typeof profile.builds === 'object') {
      // Validate new format
      const builds = profile.builds
      if (!builds.space && !builds.ground) return false

      // Validate build structure
      for (const [env, build] of Object.entries(builds)) {
        if (env === 'space' || env === 'ground') {
          if (!build || typeof build !== 'object') return false
          if (!build.keys || typeof build.keys !== 'object') return false
        }
      }
      return true
    }

    // Check for old format with mode and keys at top level
    if (profile.mode && profile.keys && typeof profile.keys === 'object') {
      return true
    }

    return false
  }

  ensureStorageStructure() {
    const data = this.getAllData()

    // Ensure all required properties exist
    if (!data.globalAliases) data.globalAliases = {}
    if (!data.settings) data.settings = this.getDefaultSettings()

    // DO NOT create default profiles here - DataCoordinator handles that
    // Just ensure basic structure exists

    // Ensure current profile exists (if we have profiles)
    if (
      Object.keys(data.profiles).length > 0 &&
      !data.profiles[data.currentProfile]
    ) {
      data.currentProfile = Object.keys(data.profiles)[0]
    }

    this.saveAllData(data)
  }

  migrateData() {
    // Handle data migration for future versions
    const data = this.getAllData()
    let migrationPerformed = false

    if (data.version !== this.version) {
      console.log(`Migrating data from ${data.version} to ${this.version}`)
      migrationPerformed = true
    }

    // Migrate profiles from old format to new format
    for (const [profileId, profile] of Object.entries(data.profiles)) {
      if (this.needsProfileMigration(profile)) {
        console.log(`Migrating profile "${profile.name}" from old format to new format`)
        data.profiles[profileId] = this.migrateProfile(profile)
        migrationPerformed = true
      }
    }

    if (migrationPerformed) {
      data.version = this.version
      this.saveAllData(data)
      console.log('Data migration completed')
    }
  }

  needsProfileMigration(profile) {
    // Profile needs migration if it has old format (mode + keys) but not new format (builds)
    if (profile && profile.mode && profile.keys && !profile.builds) {
      return true
    }
    return false
  }

  migrateProfile(oldProfile) {
    console.log(`Migrating profile: ${oldProfile.name}`)
    
    // Create new profile structure
    const newProfile = {
      name: oldProfile.name,
      description: oldProfile.description || '',
      currentEnvironment: this.mapOldModeToEnvironment(oldProfile.mode),
      builds: {
        space: { keys: {} },
        ground: { keys: {} }
      },
      aliases: oldProfile.aliases || {},
      keybindMetadata: oldProfile.keybindMetadata || {},
      created: oldProfile.created || new Date().toISOString(),
      lastModified: new Date().toISOString()
    }

    // Map old keys to the appropriate environment
    const targetEnvironment = this.mapOldModeToEnvironment(oldProfile.mode)
    newProfile.builds[targetEnvironment].keys = oldProfile.keys || {}

    // If the profile had keybind metadata, migrate it to be environment-scoped
    if (oldProfile.keybindMetadata && typeof oldProfile.keybindMetadata === 'object') {
      // Check if metadata is already environment-scoped
      const hasEnvironmentScope = oldProfile.keybindMetadata.space || oldProfile.keybindMetadata.ground
      
      if (!hasEnvironmentScope) {
        // Migrate flat metadata structure to environment-scoped
        newProfile.keybindMetadata = {
          [targetEnvironment]: oldProfile.keybindMetadata
        }
      } else {
        // Already environment-scoped, keep as is
        newProfile.keybindMetadata = oldProfile.keybindMetadata
      }
    }

    return newProfile
  }

  mapOldModeToEnvironment(mode) {
    if (!mode) return 'space'
    
    // Ensure mode is a string before calling toLowerCase()
    const modeStr = typeof mode === 'string' ? mode : String(mode)
    const lowerMode = modeStr.toLowerCase()
    
    if (lowerMode === 'ground' || lowerMode === 'ground mode') {
      return 'ground'
    }
    return 'space' // Default to space for 'space', 'Space', or any other value
  }

  
  
  /**
   * Get current state for late-join support
   * @returns {Object} The storage service instance
   */
  getCurrentState() {
    return {
      service: this,
      isReady: this.isInitialized()
    }
  }
} 