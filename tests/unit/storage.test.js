import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

/**
 * Unit Tests for STOStorage
 * 
 * Tests the localStorage persistence layer for the STO Keybind Manager.
 * 
 * TESTING APPROACH:
 * ✅ Import actual modules (STOStorage, STO_DATA)
 * ✅ Test real behavior with real localStorage
 * ✅ Focus on public API contract
 * ✅ Test actual data persistence
 * ✅ Minimal, targeted mocking only when necessary
 * ✅ Test isolation through proper cleanup
 * 
 * ANTI-PATTERNS AVOIDED:
 * ❌ Global mocking (global.STO_DATA)
 * ❌ Over-mocking localStorage
 * ❌ Testing implementation details
 * ❌ Mocking what should be real (simple objects/data)
 * ❌ Inline class definitions
 */

describe('STOStorage', () => {
  let STOStorage
  let STO_DATA
  let storage

  beforeAll(async () => {
    // Set up global environment for module dependencies
    global.window = global.window || {}
    
    // Import STO_DATA first (storage depends on it)
    const dataModule = await import('../../src/js/data.js')
    STO_DATA = dataModule.default || dataModule
    global.window.STO_DATA = STO_DATA
    
    // Load the storage module (it creates a global instance)
    await import('../../src/js/storage.js')
    
    // Get the constructor from the global instance
    STOStorage = global.window.stoStorage.constructor
  })

  beforeEach(() => {
    // Clear localStorage before each test for isolation
    localStorage.clear()
    
    // Create a fresh STOStorage instance
    storage = new STOStorage()
  })

  afterEach(() => {
    // Clean up localStorage after each test
    localStorage.clear()
  })

  describe('initialization and default data', () => {
    it('should initialize with correct storage keys', () => {
      expect(storage.storageKey).toBe('sto_keybind_manager')
      expect(storage.backupKey).toBe('sto_keybind_manager_backup')
      expect(storage.settingsKey).toBe('sto_keybind_settings')
      expect(storage.version).toBe('1.0.0')
    })

    it('should return default data structure when no data exists', () => {
      const data = storage.getAllData()
      
      expect(data).toHaveProperty('profiles')
      expect(data).toHaveProperty('currentProfile')
      expect(data).toHaveProperty('globalAliases')
      expect(data).toHaveProperty('settings')
      expect(data.currentProfile).toBe('default_space')
      expect(data.profiles.default_space).toBeDefined()
      expect(data.profiles.tactical_space).toBeDefined()
    })

    it('should use real STO_DATA for default profiles', () => {
      const data = storage.getAllData()
      
      // Verify it's using actual STO_DATA
      expect(data.profiles.default_space.name).toBe(STO_DATA.defaultProfiles.default_space.name)
      expect(data.profiles.tactical_space.name).toBe(STO_DATA.defaultProfiles.tactical_space.name)
    })
  })

  describe('data persistence', () => {
    it('should save and retrieve data correctly', () => {
      const testData = {
        currentProfile: 'test_profile',
        profiles: {
          test_profile: {
            name: 'Test Profile',
            builds: {
              space: { keys: { 'a': [{ command: 'Target_Enemy_Near' }] }, aliases: {} },
              ground: { keys: {}, aliases: {} }
            }
          }
        },
        globalAliases: {}
      }
      
      const saveResult = storage.saveAllData(testData)
      expect(saveResult).toBe(true)
      
      // Verify data was actually saved to localStorage
      const savedItem = localStorage.getItem('sto_keybind_manager')
      expect(savedItem).toBeTruthy()
      
      const retrievedData = storage.getAllData()
      expect(retrievedData.currentProfile).toBe('test_profile')
      expect(retrievedData.profiles.test_profile.name).toBe('Test Profile')
      expect(retrievedData.version).toBe('1.0.0')
      expect(retrievedData.lastModified).toBeDefined()
    })

    it('should handle corrupted JSON gracefully', () => {
      // Manually corrupt the localStorage data
      localStorage.setItem('sto_keybind_manager', 'invalid json{')
      
      const data = storage.getAllData()
      
      // Should fallback to default data
      expect(data.currentProfile).toBe('default_space')
      expect(data.profiles.default_space).toBeDefined()
    })

    it('should create backup before saving', () => {
      // Save initial data
      const initialData = { 
        currentProfile: 'initial',
        profiles: {
          initial: {
            name: 'Initial Profile',
            builds: { space: { keys: {}, aliases: {} } }
          }
        },
        globalAliases: {}
      }
      storage.saveAllData(initialData)
      
      // Save new data (should trigger backup)
      const newData = {
        currentProfile: 'new_profile',
        profiles: {
          new_profile: {
            name: 'New Profile',
            builds: { space: { keys: { 'x': [{ command: 'Target_Self' }] }, aliases: {} } }
          }
        },
        globalAliases: {}
      }
      
      storage.saveAllData(newData)
      
      // Verify backup was created
      const backup = localStorage.getItem('sto_keybind_manager_backup')
      expect(backup).toBeTruthy()
      
      const parsedBackup = JSON.parse(backup)
      expect(parsedBackup.data).toBeDefined()
      expect(parsedBackup.timestamp).toBeDefined()
      expect(parsedBackup.version).toBe('1.0.0')
    })

    it('should handle localStorage quota exceeded gracefully', () => {
      // Create a very large data object to potentially exceed quota
      const largeProfile = {
        name: 'Large Profile',
        builds: {
          space: { 
            keys: Object.fromEntries(
              Array.from({length: 1000}, (_, i) => [`key${i}`, [{ command: `command${i}` }]])
            ), 
            aliases: {} 
          },
          ground: { keys: {}, aliases: {} }
        }
      }
      
      const largeData = {
        currentProfile: 'large_profile',
        profiles: { large_profile: largeProfile },
        globalAliases: {}
      }
      
      // This should either succeed or fail gracefully (return boolean, not throw)
      const result = storage.saveAllData(largeData)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('profile management', () => {
    beforeEach(() => {
      // Set up test profiles
      const testData = {
        version: '1.0.0',
        currentProfile: 'profile1',
        profiles: {
          profile1: {
            name: 'Profile 1',
            builds: {
              space: { keys: { 'a': [{ command: 'Target_Enemy_Near' }] }, aliases: {} },
              ground: { keys: {}, aliases: {} }
            }
          },
          profile2: {
            name: 'Profile 2',
            builds: {
              space: { keys: {}, aliases: {} },
              ground: { keys: { 'b': [{ command: 'FireAll' }] }, aliases: {} }
            }
          }
        },
        globalAliases: {}
      }
      localStorage.setItem('sto_keybind_manager', JSON.stringify(testData))
    })

    it('should retrieve existing profile', () => {
      const profile = storage.getProfile('profile1')
      
      expect(profile).toBeDefined()
      expect(profile.name).toBe('Profile 1')
      expect(profile.builds.space.keys.a).toBeDefined()
      expect(profile.builds.space.keys.a[0].command).toBe('Target_Enemy_Near')
    })

    it('should return null for non-existent profile', () => {
      const profile = storage.getProfile('nonexistent')
      expect(profile).toBeNull()
    })

    it('should save profile with timestamp', () => {
      const newProfile = {
        name: 'Updated Profile',
        builds: {
          space: { keys: { 'c': [{ command: 'FireAll' }] }, aliases: {} },
          ground: { keys: {}, aliases: {} }
        }
      }
      
      const result = storage.saveProfile('profile1', newProfile)
      expect(result).toBe(true)
      
      const savedProfile = storage.getProfile('profile1')
      expect(savedProfile.name).toBe('Updated Profile')
      expect(savedProfile.lastModified).toBeDefined()
      expect(typeof savedProfile.lastModified).toBe('string')
      
      // Verify timestamp is recent (within last 5 seconds)
      const timestamp = new Date(savedProfile.lastModified)
      const now = new Date()
      expect(now - timestamp).toBeLessThan(5000)
    })

    it('should delete profile and update current profile', () => {
      const result = storage.deleteProfile('profile1')
      expect(result).toBe(true)
      
      const deletedProfile = storage.getProfile('profile1')
      expect(deletedProfile).toBeNull()
      
      const data = storage.getAllData()
      expect(data.currentProfile).toBe('profile2')
    })

    it('should handle deletion of non-existent profile', () => {
      const result = storage.deleteProfile('nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('settings management', () => {
    it('should return default settings when none exist', () => {
      const settings = storage.getSettings()
      
      expect(settings.theme).toBe('default')
      expect(settings.autoSave).toBe(true)
      expect(settings.showTooltips).toBe(true)
      expect(settings.maxUndoSteps).toBe(50)
    })

    it('should save and retrieve custom settings', () => {
      const customSettings = {
        theme: 'dark',
        autoSave: false,
        showTooltips: false,
        maxUndoSteps: 25
      }
      
      const saveResult = storage.saveSettings(customSettings)
      expect(saveResult).toBe(true)
      
      const retrievedSettings = storage.getSettings()
      expect(retrievedSettings.theme).toBe('dark')
      expect(retrievedSettings.autoSave).toBe(false)
      expect(retrievedSettings.maxUndoSteps).toBe(25)
    })

    it('should handle corrupted settings gracefully', () => {
      localStorage.setItem('sto_keybind_settings', 'invalid json{')
      
      const settings = storage.getSettings()
      
      // Should return default settings
      expect(settings.theme).toBe('default')
      expect(settings.autoSave).toBe(true)
    })
  })

  describe('backup and restore', () => {
    it('should restore data from backup', () => {
      const originalData = { 
        currentProfile: 'original',
        profiles: {
          original: {
            name: 'Original Profile',
            builds: { space: { keys: { 'x': [{ command: 'Target_Self' }] }, aliases: {} } }
          }
        },
        globalAliases: {}
      }
      
      // Create backup manually
      const backupData = {
        data: JSON.stringify(originalData),
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      }
      localStorage.setItem('sto_keybind_manager_backup', JSON.stringify(backupData))
      
      const result = storage.restoreFromBackup()
      expect(result).toBe(true)
      
      const restoredData = storage.getAllData()
      expect(restoredData.currentProfile).toBe('original')
      expect(restoredData.profiles.original.name).toBe('Original Profile')
    })

    it('should return false when no backup exists', () => {
      const result = storage.restoreFromBackup()
      expect(result).toBe(false)
    })

    it('should handle corrupted backup gracefully', () => {
      localStorage.setItem('sto_keybind_manager_backup', 'invalid json{')
      
      const result = storage.restoreFromBackup()
      expect(result).toBe(false)
    })
  })

  describe('import and export', () => {
    it('should export data as JSON string', () => {
      const testData = {
        currentProfile: 'export_test',
        profiles: {
          export_test: {
            name: 'Export Test Profile',
            builds: {
              space: { keys: { 'f': [{ command: 'FireAll' }] }, aliases: {} },
              ground: { keys: {}, aliases: {} }
            }
          }
        },
        globalAliases: {}
      }
      storage.saveAllData(testData)
      
      const exportedData = storage.exportData()
      
      expect(typeof exportedData).toBe('string')
      
      const parsedData = JSON.parse(exportedData)
      expect(parsedData.currentProfile).toBe('export_test')
      expect(parsedData.profiles.export_test.name).toBe('Export Test Profile')
      
      // Verify it's formatted (has indentation)
      expect(exportedData).toContain('\n  ')
    })

    it('should import valid data', () => {
      const importData = {
        version: '1.0.0',
        currentProfile: 'imported_profile',
        profiles: {
          imported_profile: {
            name: 'Imported Profile',
            builds: {
              space: { keys: { 'x': [{ command: 'Target_Enemy_Near' }] }, aliases: {} },
              ground: { keys: {}, aliases: {} }
            }
          }
        },
        globalAliases: {}
      }
      
      const result = storage.importData(JSON.stringify(importData))
      expect(result).toBe(true)
      
      const data = storage.getAllData()
      expect(data.currentProfile).toBe('imported_profile')
      expect(data.profiles.imported_profile.name).toBe('Imported Profile')
    })

    it('should reject invalid JSON', () => {
      const result = storage.importData('invalid json{')
      expect(result).toBe(false)
    })

    it('should reject invalid data structure', () => {
      const invalidData = { invalid: 'structure' }
      const result = storage.importData(JSON.stringify(invalidData))
      expect(result).toBe(false)
    })
  })

  describe('data validation', () => {
    it('should validate correct data structure', () => {
      const validData = {
        currentProfile: 'test',
        profiles: {
          test: {
            name: 'Test Profile',
            builds: {
              space: { keys: {}, aliases: {} },
              ground: { keys: {}, aliases: {} }
            }
          }
        },
        globalAliases: {}
      }
      
      const result = storage.importData(JSON.stringify(validData))
      expect(result).toBe(true)
    })

    it('should validate new profile format', () => {
      const newFormatData = {
        currentProfile: 'new_format',
        profiles: {
          new_format: {
            name: 'New Format Profile',
            builds: {
              space: { keys: { 'a': [{ command: 'Target_Self' }] }, aliases: {} },
              ground: { keys: {}, aliases: {} }
            }
          }
        },
        globalAliases: {}
      }
      
      const result = storage.importData(JSON.stringify(newFormatData))
      expect(result).toBe(true)
      
      const savedData = storage.getAllData()
      expect(savedData.profiles.new_format.name).toBe('New Format Profile')
    })

    it('should validate legacy profile format', () => {
      const legacyData = {
        currentProfile: 'legacy_profile',
        profiles: {
          legacy_profile: {
            name: 'Legacy Profile',
            mode: 'space',
            keys: { 'a': [{ command: 'Target_Self' }] },
            aliases: {}
          }
        },
        globalAliases: {}
      }
      
      const result = storage.importData(JSON.stringify(legacyData))
      expect(result).toBe(true)
      
      const savedData = storage.getAllData()
      expect(savedData.profiles.legacy_profile.name).toBe('Legacy Profile')
    })
  })

  describe('storage info and cleanup', () => {
    it('should calculate storage usage', () => {
      // Add some data to storage
      const testData = {
        currentProfile: 'test',
        profiles: { 
          test: { 
            name: 'Test Profile',
            builds: { 
              space: { 
                keys: { 
                  'a': [{ command: 'Target_Enemy_Near' }],
                  'b': [{ command: 'FireAll' }]
                }, 
                aliases: {} 
              },
              ground: { keys: {}, aliases: {} }
            }
          }
        },
        globalAliases: {}
      }
      storage.saveAllData(testData)
      storage.saveSettings({ theme: 'dark', autoSave: false })
      
      const info = storage.getStorageInfo()
      
      expect(info).toBeDefined()
      expect(info.totalSize).toBeGreaterThan(0)
      expect(info.dataSize).toBeGreaterThan(0)
      expect(info.available).toBeGreaterThan(0)
      
      // Verify the sizes are realistic
      expect(info.dataSize).toBeGreaterThan(100) // At least 100 bytes
      expect(info.totalSize).toBe(info.dataSize + info.backupSize + info.settingsSize)
    })

    it('should clear all data', () => {
      // Add some data first
      storage.saveAllData({ 
        currentProfile: 'test',
        profiles: { test: { name: 'Test', builds: { space: { keys: {}, aliases: {} } } } },
        globalAliases: {}
      })
      storage.saveSettings({ theme: 'dark' })
      storage.createBackup()
      
      const result = storage.clearAllData()
      expect(result).toBe(true)
      
      // Verify all data is cleared
      expect(localStorage.getItem('sto_keybind_manager')).toBeNull()
      expect(localStorage.getItem('sto_keybind_manager_backup')).toBeNull()
      expect(localStorage.getItem('sto_keybind_settings')).toBeNull()
    })
  })
}) 