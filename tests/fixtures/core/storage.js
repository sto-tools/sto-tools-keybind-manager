// Storage fixture
// Provides mock storage with realistic behavior for testing

import { vi } from 'vitest'
import { registerFixture, unregisterFixture, generateFixtureId } from './cleanup.js'

/**
 * Create a Storage fixture for testing
 * @param {Object} options - Configuration options
 * @param {Object} options.initialData - Initial data to populate storage
 * @param {boolean} options.persistAcrossTests - Whether to persist data across tests
 * @param {boolean} options.trackOperations - Whether to track operations for debugging
 * @returns {Object} Storage fixture with testing utilities
 */
export function createStorageFixture(options = {}) {
  const {
    initialData = null,
    persistAcrossTests = false,
    trackOperations = true
  } = options

  const fixtureId = generateFixtureId('storage')
  
  // Create in-memory storage
  let store = new Map()
  const operations = []
  
  // Initialize with default STO data if no initial data provided
  if (initialData) {
    for (const [key, value] of Object.entries(initialData)) {
      store.set(key, JSON.stringify(value))
    }
  } else {
    // Set up minimal default data
    const defaultData = {
      sto_keybind_manager: JSON.stringify({
        currentProfile: 'default_space',
        profiles: {
          default_space: {
            name: 'Default Space',
            description: 'Default space profile',
            currentEnvironment: 'space',
            builds: {
              space: { keys: {} },
              ground: { keys: {} }
            },
            aliases: {},
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
          }
        },
        settings: {
          theme: 'dark',
          language: 'en',
          autoSave: true
        },
        version: '1.0.0',
        lastModified: new Date().toISOString()
      }),
      sto_keybind_settings: JSON.stringify({
        theme: 'dark',
        language: 'en',
        autoSave: true
      })
    }
    
    for (const [key, value] of Object.entries(defaultData)) {
      store.set(key, value)
    }
  }

  // Track operations
  const trackOperation = (operation, key, value) => {
    if (trackOperations) {
      operations.push({
        operation,
        key,
        value: value ? JSON.parse(JSON.stringify(value)) : undefined,
        timestamp: Date.now()
      })
    }
  }

  // Mock localStorage interface
  const mockLocalStorage = {
    getItem: vi.fn((key) => {
      const value = store.get(key) || null
      trackOperation('getItem', key, value)
      return value
    }),
    
    setItem: vi.fn((key, value) => {
      store.set(key, value)
      trackOperation('setItem', key, value)
    }),
    
    removeItem: vi.fn((key) => {
      const existed = store.has(key)
      store.delete(key)
      trackOperation('removeItem', key, existed)
    }),
    
    clear: vi.fn(() => {
      store.clear()
      trackOperation('clear')
    }),
    
    key: vi.fn((index) => {
      const keys = Array.from(store.keys())
      return keys[index] || null
    }),
    
    get length() {
      return store.size
    }
  }

  // Mock StorageService interface
  const mockStorageService = {
    getAllData: vi.fn(() => {
      const data = mockLocalStorage.getItem('sto_keybind_manager')
      if (data) {
        return JSON.parse(data)
      }
      return {
        currentProfile: 'default_space',
        profiles: {},
        settings: {},
        version: '1.0.0'
      }
    }),
    
    saveAllData: vi.fn((data) => {
      try {
        mockLocalStorage.setItem('sto_keybind_manager', JSON.stringify(data))
        return true
      } catch (error) {
        return false
      }
    }),
    
    getProfile: vi.fn((profileId) => {
      const data = mockStorageService.getAllData()
      return data.profiles[profileId] || null
    }),
    
    saveProfile: vi.fn((profileId, profile) => {
      try {
        const data = mockStorageService.getAllData()
        data.profiles[profileId] = {
          ...profile,
          lastModified: new Date().toISOString()
        }
        return mockStorageService.saveAllData(data)
      } catch (error) {
        return false
      }
    }),
    
    deleteProfile: vi.fn((profileId) => {
      try {
        const data = mockStorageService.getAllData()
        delete data.profiles[profileId]
        
        // Switch to another profile if this was current
        if (data.currentProfile === profileId) {
          const remainingProfiles = Object.keys(data.profiles)
          data.currentProfile = remainingProfiles[0] || null
        }
        
        return mockStorageService.saveAllData(data)
      } catch (error) {
        return false
      }
    }),
    
    getSettings: vi.fn(() => {
      const data = mockLocalStorage.getItem('sto_keybind_settings')
      if (data) {
        return JSON.parse(data)
      }
      return {
        theme: 'dark',
        language: 'en',
        autoSave: true
      }
    }),
    
    saveSettings: vi.fn((settings) => {
      try {
        mockLocalStorage.setItem('sto_keybind_settings', JSON.stringify(settings))
        return true
      } catch (error) {
        return false
      }
    }),
    
    clearAllData: vi.fn(() => {
      mockLocalStorage.clear()
      return true
    }),
    
    // StorageService component methods
    init: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(() => Promise.resolve()),
    isInitialized: vi.fn(() => true),
    isDestroyed: vi.fn(() => false),
    getComponentName: vi.fn(() => 'StorageService')
  }

  const fixture = {
    localStorage: mockLocalStorage,
    storageService: mockStorageService,
    
    // Testing utilities
    getOperations: () => [...operations],
    
    clearOperations: () => {
      operations.length = 0
    },
    
    getOperationsOfType: (type) => {
      return operations.filter(op => op.operation === type)
    },
    
    expectOperation: (type, key) => {
      const ops = operations.filter(op => op.operation === type && op.key === key)
      if (ops.length === 0) {
        throw new Error(`Expected ${type} operation for key '${key}' but it was not found`)
      }
    },
    
    expectOperationCount: (type, count) => {
      const ops = operations.filter(op => op.operation === type)
      if (ops.length !== count) {
        throw new Error(`Expected ${count} ${type} operations but got ${ops.length}`)
      }
    },
    
    // Data manipulation
    setData: (key, value) => {
      store.set(key, typeof value === 'string' ? value : JSON.stringify(value))
    },
    
    getData: (key) => {
      const value = store.get(key)
      if (value) {
        try {
          return JSON.parse(value)
        } catch {
          return value
        }
      }
      return null
    },
    
    hasData: (key) => {
      return store.has(key)
    },
    
    // Profile utilities
    addProfile: (profileId, profile) => {
      const data = mockStorageService.getAllData()
      data.profiles[profileId] = {
        name: profile.name || 'Test Profile',
        description: profile.description || '',
        currentEnvironment: profile.currentEnvironment || 'space',
        builds: profile.builds || {
          space: { keys: {} },
          ground: { keys: {} }
        },
        aliases: profile.aliases || {},
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        ...profile
      }
      mockStorageService.saveAllData(data)
    },
    
    setCurrentProfile: (profileId) => {
      const data = mockStorageService.getAllData()
      data.currentProfile = profileId
      mockStorageService.saveAllData(data)
    },
    
    // State management
    reset: () => {
      if (!persistAcrossTests) {
        store.clear()
        operations.length = 0
        
        // Restore default data
        const defaultData = {
          sto_keybind_manager: JSON.stringify({
            currentProfile: 'default_space',
            profiles: {
              default_space: {
                name: 'Default Space',
                description: 'Default space profile',
                currentEnvironment: 'space',
                builds: {
                  space: { keys: {} },
                  ground: { keys: {} }
                },
                aliases: {},
                created: new Date().toISOString(),
                lastModified: new Date().toISOString()
              }
            },
            settings: {
              theme: 'dark',
              language: 'en',
              autoSave: true
            },
            version: '1.0.0',
            lastModified: new Date().toISOString()
          })
        }
        
        for (const [key, value] of Object.entries(defaultData)) {
          store.set(key, value)
        }
      }
    },
    
    // Mock control
    mockReset: () => {
      Object.keys(mockLocalStorage).forEach(key => {
        if (vi.isMockFunction(mockLocalStorage[key])) {
          mockLocalStorage[key].mockReset()
        }
      })
      Object.keys(mockStorageService).forEach(key => {
        if (vi.isMockFunction(mockStorageService[key])) {
          mockStorageService[key].mockReset()
        }
      })
    },
    
    // Cleanup
    destroy: () => {
      fixture.reset()
      unregisterFixture(fixtureId)
    }
  }

  // Register for cleanup
  registerFixture(fixtureId, fixture.destroy)

  return fixture
}

/**
 * Create a real localStorage fixture that uses actual localStorage
 * Useful for integration tests that need real persistence behavior
 */
export function createRealLocalStorageFixture() {
  const fixtureId = generateFixtureId('realLocalStorage')
  
  // Store original localStorage state
  const originalState = new Map()
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) {
      originalState.set(key, localStorage.getItem(key))
    }
  }
  
  const fixture = {
    localStorage: window.localStorage,
    
    // Reset to clean state
    reset: () => {
      localStorage.clear()
    },
    
    // Restore original state
    restore: () => {
      localStorage.clear()
      for (const [key, value] of originalState) {
        localStorage.setItem(key, value)
      }
    },
    
    destroy: () => {
      fixture.restore()
      unregisterFixture(fixtureId)
    }
  }
  
  registerFixture(fixtureId, fixture.destroy)
  
  return fixture
}

export function createLocalStorageFixture(options = {}) {
  const {
    initialData = {},
    quotaError = false
  } = options

  const fixtureId = generateFixtureId('localStorage')
  const originalLocalStorage = globalThis.localStorage

  // Simple in-memory store
  const store = new Map()
  for (const [k, v] of Object.entries(initialData)) {
    store.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  }

  const mock = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      if (quotaError) throw new Error('quota exceeded')
      store.set(key, String(value))
    },
    removeItem: (key) => { store.delete(key) },
    clear: () => { store.clear() },
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size }
  }

  Object.defineProperty(globalThis, 'localStorage', { value: mock, configurable: true })

  const destroy = () => {
    Object.defineProperty(globalThis, 'localStorage', { value: originalLocalStorage, configurable: true })
  }

  registerFixture(fixtureId, destroy)

  return {
    localStorage: mock,
    destroy
  }
} 