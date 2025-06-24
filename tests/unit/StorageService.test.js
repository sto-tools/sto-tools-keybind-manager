import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest'
import StorageService from '../../src/js/components/services/StorageService.js'
import ComponentBase from '../../src/js/components/ComponentBase.js'
import '../../src/js/data.js'

describe('StorageService', () => {
  let storageService
  let mockEventBus
  let STO_DATA

  beforeAll(async () => {
    global.window = global.window || {}
    await import('../../src/js/data.js')
    STO_DATA = global.window.STO_DATA
  })

  beforeEach(() => {
    // Setup mocks and test environment
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn()
    }
    
    storageService = new StorageService({ eventBus: mockEventBus })
    
    // Clear localStorage before each test
    localStorage.clear()
  })

  afterEach(() => {
    // Cleanup localStorage
    localStorage.clear()
  })

  describe('ComponentBase Integration', () => {
    it('should extend ComponentBase', () => {
      expect(storageService).toBeInstanceOf(ComponentBase)
    })

    it('should initialize properly', () => {
      storageService.init()
      expect(storageService.isInitialized()).toBe(true)
      expect(mockEventBus.emit).toHaveBeenCalledWith('storage:ready', { service: storageService })
    })

    it('should have correct component name', () => {
      expect(storageService.getComponentName()).toBe('StorageService')
    })
  })

  describe('Constructor and Configuration', () => {
    it('should use default configuration when no options provided', () => {
      const service = new StorageService()
      expect(service.storageKey).toBe('sto_keybind_manager')
      expect(service.backupKey).toBe('sto_keybind_manager_backup')
      expect(service.settingsKey).toBe('sto_keybind_settings')
      expect(service.version).toBe('1.0.0')
    })

    it('should use custom configuration when provided', () => {
      const customConfig = {
        storageKey: 'custom_storage',
        backupKey: 'custom_backup',
        settingsKey: 'custom_settings',
        version: '2.0.0'
      }
      const service = new StorageService(customConfig)
      expect(service.storageKey).toBe('custom_storage')
      expect(service.backupKey).toBe('custom_backup')
      expect(service.settingsKey).toBe('custom_settings')
      expect(service.version).toBe('2.0.0')
    })
  })

  describe('Storage Operations', () => {
    beforeEach(() => {
      storageService.init()
    })

    it('should get all data with default structure when no data exists', () => {
      const data = storageService.getAllData()
      expect(data).toHaveProperty('profiles')
      expect(data).toHaveProperty('currentProfile')
      expect(data).toHaveProperty('globalAliases')
      expect(data).toHaveProperty('settings')
      expect(data).toHaveProperty('version')
      expect(data.currentProfile).toBe('default_space')
      expect(Object.keys(data.profiles)).toContain('default_space')
      expect(Object.keys(data.profiles)).toContain('tactical_space')
    })

    it('should use real STO_DATA for default profiles', () => {
      const data = storageService.getAllData()

      // Verify it's using actual STO_DATA
      expect(data.profiles.default_space.name).toBe(
        STO_DATA.defaultProfiles.default_space.name
      )
      expect(data.profiles.tactical_space.name).toBe(
        STO_DATA.defaultProfiles.tactical_space.name
      )
    })

    it('should save and retrieve data correctly', () => {
      const testData = { 
        profiles: { 
          test: { 
            name: 'Test Profile',
            builds: { space: { keys: {} }, ground: { keys: {} } }
          } 
        }, 
        currentProfile: 'test',
        globalAliases: {},
        settings: {}
      }
      const result = storageService.saveAllData(testData)
      expect(result).toBe(true)
      
      const retrieved = storageService.getAllData()
      expect(retrieved.profiles.test.name).toBe('Test Profile')
      expect(retrieved.currentProfile).toBe('test')
    })

    it('should emit data-changed event when saving data', () => {
      const testData = { profiles: {}, currentProfile: null, globalAliases: {}, settings: {} }
      storageService.saveAllData(testData)
      
      expect(mockEventBus.emit).toHaveBeenCalledWith('storage:data-changed', expect.any(Object))
    })

    it('should handle storage errors gracefully', () => {
      // Create a mock localStorage that throws an error
      const originalLocalStorage = global.localStorage
      global.localStorage = {
        ...originalLocalStorage,
        setItem: vi.fn().mockImplementation(() => {
          throw new Error('Storage error')
        })
      }

      const result = storageService.saveAllData({ profiles: {}, currentProfile: null })
      expect(result).toBe(false)

      // Restore original
      global.localStorage = originalLocalStorage
    })
  })

  describe('Profile Operations', () => {
    beforeEach(() => {
      storageService.init()
    })

    it('should get specific profile', () => {
      const profile = storageService.getProfile('default_space')
      expect(profile).toBeTruthy()
      expect(profile.name).toBe('Default Space')
    })

    it('should return null for non-existent profile', () => {
      const profile = storageService.getProfile('non_existent')
      expect(profile).toBeNull()
    })

    it('should save profile correctly', () => {
      const testProfile = {
        name: 'Test Profile',
        description: 'Test Description',
        currentEnvironment: 'space',
        builds: { space: { keys: {} }, ground: { keys: {} } }
      }
      
      const result = storageService.saveProfile('test_profile', testProfile)
      expect(result).toBe(true)
      
      const savedProfile = storageService.getProfile('test_profile')
      expect(savedProfile.name).toBe('Test Profile')
      expect(savedProfile.lastModified).toBeDefined()
    })

    it('should delete profile correctly', () => {
      // First save a profile
      const testProfile = { name: 'Test Profile', builds: { space: { keys: {} }, ground: { keys: {} } } }
      storageService.saveProfile('test_profile', testProfile)
      
      // Set as current profile
      const data = storageService.getAllData()
      data.currentProfile = 'test_profile'
      storageService.saveAllData(data)
      
      // Delete the profile
      const result = storageService.deleteProfile('test_profile')
      expect(result).toBe(true)
      
      // Verify profile is gone
      const deletedProfile = storageService.getProfile('test_profile')
      expect(deletedProfile).toBeNull()
      
      // Verify current profile was updated
      const updatedData = storageService.getAllData()
      expect(updatedData.currentProfile).not.toBe('test_profile')
    })
  })

  describe('Settings Operations', () => {
    beforeEach(() => {
      storageService.init()
    })

    it('should get default settings when no settings exist', () => {
      const settings = storageService.getSettings()
      expect(settings).toHaveProperty('theme')
      expect(settings).toHaveProperty('autoSave')
      expect(settings).toHaveProperty('language')
    })

    it('should save and retrieve settings correctly', () => {
      const testSettings = { theme: 'dark', autoSave: false }
      const result = storageService.saveSettings(testSettings)
      expect(result).toBe(true)
      
      const retrieved = storageService.getSettings()
      expect(retrieved.theme).toBe('dark')
      expect(retrieved.autoSave).toBe(false)
    })

    it('should merge settings with existing ones', () => {
      // Save initial settings
      storageService.saveSettings({ theme: 'light' })
      
      // Save additional settings
      storageService.saveSettings({ autoSave: false })
      
      const finalSettings = storageService.getSettings()
      expect(finalSettings.theme).toBe('light')
      expect(finalSettings.autoSave).toBe(false)
    })

    it('should emit settings-changed event when saving settings', () => {
      storageService.saveSettings({ theme: 'dark' })
      
      expect(mockEventBus.emit).toHaveBeenCalledWith('storage:settings-changed', expect.any(Object))
    })
  })

  describe('Backup Operations', () => {
    beforeEach(() => {
      storageService.init()
    })

    it('should create backup successfully', () => {
      const testData = { 
        profiles: { 
          test: { 
            name: 'Test',
            builds: { space: { keys: {} }, ground: { keys: {} } }
          } 
        }, 
        currentProfile: 'test', 
        globalAliases: {}, 
        settings: {} 
      }
      storageService.saveAllData(testData)
      
      storageService.createBackup()
      
      const backup = localStorage.getItem(storageService.backupKey)
      expect(backup).toBeTruthy()
      
      const parsedBackup = JSON.parse(backup)
      expect(parsedBackup).toHaveProperty('data')
      expect(parsedBackup).toHaveProperty('timestamp')
      expect(parsedBackup).toHaveProperty('version')
    })

    it('should emit backup-created event', () => {
      storageService.createBackup()
      
      expect(mockEventBus.emit).toHaveBeenCalledWith('storage:backup-created', expect.any(Object))
    })

    it('should restore from backup successfully', () => {
      // Create some data and backup
      const testData = { 
        profiles: { 
          test: { 
            name: 'Test',
            builds: { space: { keys: {} }, ground: { keys: {} } }
          } 
        }, 
        currentProfile: 'test', 
        globalAliases: {}, 
        settings: {} 
      }
      storageService.saveAllData(testData)
      storageService.createBackup()
      
      // Clear current data
      localStorage.removeItem(storageService.storageKey)
      
      // Restore from backup
      const result = storageService.restoreFromBackup()
      expect(result).toBe(true)
      
      // Verify data was restored
      const restoredData = storageService.getAllData()
      expect(restoredData.profiles.test.name).toBe('Test')
    })

    it('should emit backup-restored event', () => {
      // Create backup first
      storageService.createBackup()
      
      // Restore
      storageService.restoreFromBackup()
      
      expect(mockEventBus.emit).toHaveBeenCalledWith('storage:backup-restored', expect.any(Object))
    })
  })

  describe('Import/Export Operations', () => {
    beforeEach(() => {
      storageService.init()
    })

    it('should export data as JSON string', () => {
      const testData = { 
        profiles: { 
          test: { 
            name: 'Test',
            builds: { space: { keys: {} }, ground: { keys: {} } }
          } 
        }, 
        currentProfile: 'test', 
        globalAliases: {}, 
        settings: {} 
      }
      storageService.saveAllData(testData)
      
      const exported = storageService.exportData()
      expect(typeof exported).toBe('string')
      
      const parsed = JSON.parse(exported)
      expect(parsed.profiles.test.name).toBe('Test')
    })

    it('should import valid data successfully', () => {
      const validData = {
        profiles: { imported: { name: 'Imported Profile', builds: { space: { keys: {} }, ground: { keys: {} } } } },
        currentProfile: 'imported',
        globalAliases: {},
        settings: {}
      }
      
      const jsonString = JSON.stringify(validData)
      const result = storageService.importData(jsonString)
      expect(result).toBe(true)
      
      const importedProfile = storageService.getProfile('imported')
      expect(importedProfile.name).toBe('Imported Profile')
    })

    it('should emit data-imported event on successful import', () => {
      const validData = {
        profiles: { imported: { name: 'Imported Profile', builds: { space: { keys: {} }, ground: { keys: {} } } } },
        currentProfile: 'imported',
        globalAliases: {},
        settings: {}
      }
      
      const jsonString = JSON.stringify(validData)
      storageService.importData(jsonString)
      
      expect(mockEventBus.emit).toHaveBeenCalledWith('storage:data-imported', expect.any(Object))
    })

    it('should reject invalid data structure', () => {
      const invalidData = { invalid: 'structure' }
      const jsonString = JSON.stringify(invalidData)
      
      const result = storageService.importData(jsonString)
      expect(result).toBe(false)
    })

    it('should handle JSON parse errors gracefully', () => {
      const invalidJson = 'invalid json string'
      
      const result = storageService.importData(invalidJson)
      expect(result).toBe(false)
    })
  })

  describe('Data Clearing', () => {
    beforeEach(() => {
      storageService.init()
    })

    it('should clear all data successfully', () => {
      // Save some data first
      const testData = { 
        profiles: { 
          test: { 
            name: 'Test',
            builds: { space: { keys: {} }, ground: { keys: {} } }
          } 
        }, 
        currentProfile: 'test', 
        globalAliases: {}, 
        settings: {} 
      }
      storageService.saveAllData(testData)
      storageService.saveSettings({ theme: 'dark' })
      
      const result = storageService.clearAllData()
      expect(result).toBe(true)
      
      // Verify data is cleared
      expect(localStorage.getItem(storageService.storageKey)).toBeNull()
      expect(localStorage.getItem(storageService.settingsKey)).toBeNull()
      expect(localStorage.getItem(storageService.backupKey)).toBeNull()
      
      // Verify reset flag is set
      expect(localStorage.getItem('sto_app_reset')).toBe('true')
    })

    it('should emit data-cleared event', () => {
      // Clear the mock to start fresh
      mockEventBus.emit.mockClear()
      
      storageService.clearAllData()
      
      // Check that the event was emitted (it should be the last call)
      const calls = mockEventBus.emit.mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall[0]).toBe('storage:data-cleared')
    })
  })

  describe('Storage Information', () => {
    beforeEach(() => {
      storageService.init()
    })

    it('should get storage info correctly', () => {
      const info = storageService.getStorageInfo()
      expect(info).toHaveProperty('totalSize')
      expect(info).toHaveProperty('dataSize')
      expect(info).toHaveProperty('backupSize')
      expect(info).toHaveProperty('settingsSize')
      expect(info).toHaveProperty('available')
    })

    it('should detect browser language correctly', () => {
      const language = storageService.detectBrowserLanguage()
      expect(['en', 'de', 'es', 'fr']).toContain(language)
    })

    it('should get available storage space', () => {
      const available = storageService.getAvailableStorage()
      expect(typeof available).toBe('number')
      expect(available).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Data Validation', () => {
    it('should validate correct data structure', () => {
      const validData = {
        profiles: { test: { name: 'Test', builds: { space: { keys: {} }, ground: { keys: {} } } } },
        currentProfile: 'test'
      }
      
      const isValid = storageService.isValidDataStructure(validData)
      expect(isValid).toBe(true)
    })

    it('should reject invalid data structure', () => {
      const invalidData = { profiles: 'not an object' }
      
      const isValid = storageService.isValidDataStructure(invalidData)
      expect(isValid).toBe(false)
    })

    it('should validate profile structure correctly', () => {
      const validProfile = {
        name: 'Test Profile',
        builds: { space: { keys: {} }, ground: { keys: {} } }
      }
      
      const isValid = storageService.isValidProfile(validProfile)
      expect(isValid).toBe(true)
    })

    it('should reject invalid profile structure', () => {
      const invalidProfile = { name: 'Test' } // Missing builds
      
      const isValid = storageService.isValidProfile(invalidProfile)
      expect(isValid).toBe(false)
    })
  })

  describe('Data Migration', () => {
    it('should detect profiles needing migration', () => {
      const oldProfile = { name: 'Old Profile', mode: 'space', keys: {} }
      const newProfile = { name: 'New Profile', builds: { space: { keys: {} }, ground: { keys: {} } } }
      
      expect(storageService.needsProfileMigration(oldProfile)).toBe(true)
      expect(storageService.needsProfileMigration(newProfile)).toBe(false)
    })

    it('should migrate old profile format to new format', () => {
      const oldProfile = {
        name: 'Old Profile',
        mode: 'space',
        keys: { Space: [{ command: 'Test' }] },
        aliases: { test: 'alias' }
      }
      
      const migrated = storageService.migrateProfile(oldProfile)
      
      expect(migrated.name).toBe('Old Profile')
      expect(migrated.builds.space.keys).toEqual({ Space: [{ command: 'Test' }] })
      expect(migrated.builds.ground.keys).toEqual({})
      expect(migrated.currentEnvironment).toBe('space')
      expect(migrated.aliases).toEqual({ test: 'alias' })
    })

    it('should map old mode to environment correctly', () => {
      expect(storageService.mapOldModeToEnvironment('space')).toBe('space')
      expect(storageService.mapOldModeToEnvironment('ground')).toBe('ground')
      expect(storageService.mapOldModeToEnvironment('Ground Mode')).toBe('ground')
      expect(storageService.mapOldModeToEnvironment(null)).toBe('space')
    })
  })

  describe('Default Data Loading', () => {
    it('should load default data explicitly', () => {
      const result = storageService.loadDefaultData()
      expect(result).toBe(true)
      
      const data = storageService.getAllData()
      expect(data.currentProfile).toBe('default_space')
      expect(Object.keys(data.profiles)).toContain('default_space')
      expect(Object.keys(data.profiles)).toContain('tactical_space')
    })
  })
}) 