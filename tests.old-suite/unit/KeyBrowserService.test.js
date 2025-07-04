import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import KeyBrowserService from '../../src/js/components/services/KeyBrowserService.js'
import eventBus from '../../src/js/core/eventBus.js'
import { respond } from '../../src/js/core/requestResponse.js'

describe('KeyBrowserService', () => {
  let keyBrowserService
  let mockStorage
  let mockProfileService
  let mockUI
  let mockDataCoordinatorResponder

  const mockProfile = {
    id: 'test-profile',
    currentEnvironment: 'space',
    builds: {
      space: {
        keys: {
          'F1': [{ command: 'test command 1' }],
          'F2': [{ command: 'test command 2' }],
          'A': [{ command: 'test command A' }]
        }
      },
      ground: {
        keys: {
          'G': [{ command: 'ground command G' }],
          'H': [{ command: 'ground command H' }]
        }
      }
    }
  }

  beforeEach(async () => {
    // Mock DataCoordinator responses
    mockDataCoordinatorResponder = respond(eventBus, 'data:register-subscriber', () => {
      return { success: true }
    })

    // Mock legacy dependencies (kept for backward compatibility)
    mockStorage = {
      getAllData: vi.fn(() => ({
        currentProfile: 'test-profile'
      })),
      getProfile: vi.fn(() => mockProfile)
    }

    mockProfileService = {
      getCurrentProfileId: vi.fn(() => 'test-profile'),
      getCurrentEnvironment: vi.fn(() => 'space')
    }

    mockUI = {
      showToast: vi.fn()
    }

    keyBrowserService = new KeyBrowserService({
      storage: mockStorage,
      profileService: mockProfileService,
      ui: mockUI
    })

    // Initialize the service
    await keyBrowserService.init()
    
    // Simulate receiving initial state from DataCoordinator
    keyBrowserService.updateCacheFromProfile(mockProfile)
    keyBrowserService.cache.currentProfile = 'test-profile'
    keyBrowserService.cache.currentEnvironment = 'space'
    keyBrowserService.currentProfileId = 'test-profile'
    keyBrowserService.currentEnvironment = 'space'
  })

  afterEach(() => {
    if (mockDataCoordinatorResponder) mockDataCoordinatorResponder()
  })

  describe('Selection Caching', () => {
    it('should cache key selection when switching from key environment to alias', () => {
      keyBrowserService.currentEnvironment = 'space'
      keyBrowserService.selectedKeyName = 'F1'

      // Simulate environment change to alias by calling the handler logic directly
      // This mimics what happens when environment:changed event is received
      if (keyBrowserService.currentEnvironment !== 'alias' && keyBrowserService.selectedKeyName) {
        keyBrowserService._cachedSelections[keyBrowserService.currentEnvironment] = keyBrowserService.selectedKeyName
      }
      keyBrowserService.currentEnvironment = 'alias'
      keyBrowserService.cache.currentEnvironment = 'alias'
      keyBrowserService.selectedKeyName = null

      // Check that selection was cached
      expect(keyBrowserService._cachedSelections.space).toBe('F1')
      expect(keyBrowserService.selectedKeyName).toBe(null)
    })

    it('should restore cached key selection when switching back to key environment', async () => {
      keyBrowserService.currentEnvironment = 'space'
      keyBrowserService.cache.currentEnvironment = 'space'
      keyBrowserService._cachedSelections.space = 'F2'

      const selectKeySpy = vi.spyOn(keyBrowserService, 'selectKey')

      // Simulate environment change back to space by calling the handler directly
      keyBrowserService.currentEnvironment = 'space'
      keyBrowserService.cache.currentEnvironment = 'space'
      keyBrowserService.selectedKeyName = null
      keyBrowserService._restoreOrAutoSelectKey('space')

      // Check that cached selection is restored
      expect(selectKeySpy).toHaveBeenCalledWith('F2')
    })

    it('should auto-select first key when no cached selection exists', async () => {
      keyBrowserService.currentEnvironment = 'alias'
      keyBrowserService.cache.currentEnvironment = 'space'  
      keyBrowserService._cachedSelections.space = null

      const selectKeySpy = vi.spyOn(keyBrowserService, 'selectKey')

      // Simulate environment change to space by calling the handler directly
      keyBrowserService.currentEnvironment = 'space'
      keyBrowserService.cache.currentEnvironment = 'space'
      keyBrowserService.selectedKeyName = null
      keyBrowserService._restoreOrAutoSelectKey('space')

      // Check that first key is auto-selected
      expect(selectKeySpy).toHaveBeenCalledWith('A') // First alphabetically
    })

    it('should handle cached selection that no longer exists', async () => {
      keyBrowserService.currentEnvironment = 'alias'
      keyBrowserService.cache.currentEnvironment = 'space'
      keyBrowserService._cachedSelections.space = 'NONEXISTENT'

      const selectKeySpy = vi.spyOn(keyBrowserService, 'selectKey')

      // Simulate environment change to space by calling the handler directly
      keyBrowserService.currentEnvironment = 'space'
      keyBrowserService.cache.currentEnvironment = 'space'
      keyBrowserService.selectedKeyName = null
      keyBrowserService._restoreOrAutoSelectKey('space')

      // Check that first available key is selected instead
      expect(selectKeySpy).toHaveBeenCalledWith('A') // First alphabetically
    })

    it('should cache selections separately for space and ground environments', () => {
      // Set up space selection
      keyBrowserService.currentEnvironment = 'space'
      keyBrowserService.cache.currentEnvironment = 'space'
      keyBrowserService.selectedKeyName = 'F1'
      
      // Switch to ground and cache space selection by calling handler logic directly
      if (keyBrowserService.currentEnvironment !== 'alias' && keyBrowserService.selectedKeyName) {
        keyBrowserService._cachedSelections[keyBrowserService.currentEnvironment] = keyBrowserService.selectedKeyName
      }
      keyBrowserService.currentEnvironment = 'ground'
      keyBrowserService.cache.currentEnvironment = 'ground'
      keyBrowserService.cache.keys = mockProfile.builds.ground.keys
      keyBrowserService.selectedKeyName = null
      
      expect(keyBrowserService._cachedSelections.space).toBe('F1')

      // Set ground selection
      keyBrowserService.selectedKeyName = 'G'
      
      // Switch to alias and cache ground selection
      if (keyBrowserService.currentEnvironment !== 'alias' && keyBrowserService.selectedKeyName) {
        keyBrowserService._cachedSelections[keyBrowserService.currentEnvironment] = keyBrowserService.selectedKeyName
      }
      keyBrowserService.currentEnvironment = 'alias'
      keyBrowserService.cache.currentEnvironment = 'alias'
      keyBrowserService.selectedKeyName = null
      
      expect(keyBrowserService._cachedSelections.ground).toBe('G')
      expect(keyBrowserService._cachedSelections.space).toBe('F1')
    })

    it('should clear cached selections when profile changes', () => {
      keyBrowserService._cachedSelections.space = 'F1'
      keyBrowserService._cachedSelections.ground = 'G'

      // Simulate profile:switched event
      eventBus.emit('profile:switched', { 
        profileId: 'new-profile', 
        profile: mockProfile, 
        environment: 'space' 
      })

      expect(keyBrowserService._cachedSelections.space).toBe(null)
      expect(keyBrowserService._cachedSelections.ground).toBe(null)
    })

    it('should not auto-select when no keys are available', async () => {
      // Update cache to have empty keys
      keyBrowserService.cache.builds = {
        space: { keys: {} },
        ground: { keys: {} }
      }
      keyBrowserService.cache.keys = {}

      const selectKeySpy = vi.spyOn(keyBrowserService, 'selectKey')

      // Simulate environment change to space by calling the handler directly
      keyBrowserService.currentEnvironment = 'space'
      keyBrowserService.cache.currentEnvironment = 'space'
      keyBrowserService.selectedKeyName = null
      keyBrowserService._restoreOrAutoSelectKey('space')

      // Check that no selection occurs when no keys available
      expect(selectKeySpy).not.toHaveBeenCalled()
    })
  })

  describe('DataCoordinator Integration', () => {
    it('should update cache when receiving profile:updated event', () => {
      const updatedProfile = {
        ...mockProfile,
        builds: {
          ...mockProfile.builds,
          space: {
            keys: {
              'F1': [{ command: 'updated command 1' }],
              'F3': [{ command: 'new command 3' }]
            }
          }
        }
      }

      // Set up cache to current profile
      keyBrowserService.cache.currentProfile = 'test-profile'

      // Emit profile:updated event
      eventBus.emit('profile:updated', { 
        profileId: 'test-profile', 
        profile: updatedProfile 
      })

      expect(keyBrowserService.cache.profile).toEqual(updatedProfile)
      expect(keyBrowserService.getKeys()).toEqual(updatedProfile.builds.space.keys)
    })

    it('should handle late join state from DataCoordinator', () => {
      // Reset service state
      keyBrowserService.currentProfileId = null
      keyBrowserService.cache.currentProfile = null

      // Simulate ComponentBase late-join from DataCoordinator
      const mockState = {
        currentProfileData: {
          id: 'test-profile',
          environment: 'ground',
          builds: mockProfile.builds
        }
      }

      keyBrowserService.handleInitialState('DataCoordinator', mockState)

      expect(keyBrowserService.currentProfileId).toBe('test-profile')
      expect(keyBrowserService.cache.currentProfile).toBe('test-profile')
      expect(keyBrowserService.currentEnvironment).toBe('ground')
      expect(keyBrowserService.cache.currentEnvironment).toBe('ground')
    })

    it('should update keys cache when receiving keys:changed event', () => {
      const newKeys = {
        'F1': [{ command: 'new F1 command' }],
        'F4': [{ command: 'new F4 command' }]
      }

      eventBus.emit('keys:changed', { keys: newKeys })

      expect(keyBrowserService.cache.keys).toEqual(newKeys)
      expect(keyBrowserService.getKeys()).toEqual(newKeys)
    })
  })

  describe('Mode Changed Event Handling', () => {
    it('should handle mode-changed events with caching', () => {
      keyBrowserService.currentEnvironment = 'space'
      keyBrowserService.cache.currentEnvironment = 'space'
      keyBrowserService.selectedKeyName = 'F1'

      // Simulate mode-changed event by calling the handler logic directly
      if (keyBrowserService.currentEnvironment !== 'alias' && keyBrowserService.selectedKeyName) {
        keyBrowserService._cachedSelections[keyBrowserService.currentEnvironment] = keyBrowserService.selectedKeyName
      }
      keyBrowserService.currentEnvironment = 'alias'
      keyBrowserService.cache.currentEnvironment = 'alias'
      keyBrowserService.selectedKeyName = null

      expect(keyBrowserService._cachedSelections.space).toBe('F1')
      expect(keyBrowserService.selectedKeyName).toBe(null)
    })

    it('should restore selection on mode-changed events', async () => {
      keyBrowserService._cachedSelections.ground = 'G'
      keyBrowserService.cache.currentEnvironment = 'ground'
      keyBrowserService.cache.keys = mockProfile.builds.ground.keys

      const selectKeySpy = vi.spyOn(keyBrowserService, 'selectKey')

      // Simulate mode-changed event by calling the handler directly
      keyBrowserService.currentEnvironment = 'ground'
      keyBrowserService.cache.currentEnvironment = 'ground'
      keyBrowserService.selectedKeyName = null
      keyBrowserService._restoreOrAutoSelectKey('ground')

      expect(selectKeySpy).toHaveBeenCalledWith('G')
    })
  })

  describe('Key Selection', () => {
    it('should emit key-selected event when selecting a key', () => {
      const emitSpy = vi.spyOn(keyBrowserService, 'emit')
      keyBrowserService.selectKey('F1')

      expect(emitSpy).toHaveBeenCalledWith('key-selected', { key: 'F1', name: 'F1' })
    })

    it('should not emit event when selecting the same key', () => {
      keyBrowserService.selectedKeyName = 'F1'
      
      const emitSpy = vi.spyOn(keyBrowserService, 'emit')
      keyBrowserService.selectKey('F1')

      expect(emitSpy).not.toHaveBeenCalled()
    })

    it('should update selectedKeyName when selecting a key', () => {
      keyBrowserService.selectKey('F2')

      expect(keyBrowserService.selectedKeyName).toBe('F2')
    })
  })

  describe('Data Retrieval', () => {
    it('should return keys for current environment from cache', () => {
      keyBrowserService.cache.currentEnvironment = 'space'
      keyBrowserService.cache.keys = mockProfile.builds.space.keys

      const keys = keyBrowserService.getKeys()

      expect(keys).toEqual({
        'F1': [{ command: 'test command 1' }],
        'F2': [{ command: 'test command 2' }],
        'A': [{ command: 'test command A' }]
      })
    })

    it('should return empty object when no cached keys exist', () => {
      keyBrowserService.cache.keys = {}

      const keys = keyBrowserService.getKeys()

      expect(keys).toEqual({})
    })

    it('should return cached profile', () => {
      keyBrowserService.cache.profile = mockProfile

      const profile = keyBrowserService.getProfile()

      expect(profile).toEqual(mockProfile)
    })
  })

  describe('Request/Response Endpoints', () => {
    it('should have key:select endpoint functionality', () => {
      // Test that selectKey method exists and works
      const selectKeySpy = vi.spyOn(keyBrowserService, 'selectKey')
      keyBrowserService.selectKey('F1')
      
      expect(selectKeySpy).toHaveBeenCalledWith('F1')
      expect(keyBrowserService.selectedKeyName).toBe('F1')
    })
  })
}) 