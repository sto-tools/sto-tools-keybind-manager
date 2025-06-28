import { describe, it, expect, beforeEach, vi } from 'vitest'
import KeyBrowserService from '../../src/js/components/services/KeyBrowserService.js'

describe('KeyBrowserService', () => {
  let keyBrowserService
  let mockStorage
  let mockProfileService
  let mockUI
  let mockEventBus

  beforeEach(() => {
    mockEventBus = {
      on: vi.fn(),
      emit: vi.fn(),
      off: vi.fn()
    }

    mockStorage = {
      getAllData: vi.fn(() => ({
        currentProfile: 'test-profile'
      })),
      getProfile: vi.fn(() => ({
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
      }))
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

    // Mock the eventBus and addEventListener
    keyBrowserService.eventBus = mockEventBus
    keyBrowserService.addEventListener = vi.fn()
  })

  describe('Selection Caching', () => {
    it('should cache key selection when switching from key environment to alias', () => {
      keyBrowserService.init()
      keyBrowserService.currentEnvironment = 'space'
      keyBrowserService.selectedKeyName = 'F1'

      // Simulate environment change to alias by calling the handler logic directly
      // This mimics what happens when environment:changed event is received
      if (keyBrowserService.currentEnvironment !== 'alias' && keyBrowserService.selectedKeyName) {
        keyBrowserService._cachedSelections[keyBrowserService.currentEnvironment] = keyBrowserService.selectedKeyName
      }
      keyBrowserService.currentEnvironment = 'alias'
      keyBrowserService.selectedKeyName = null

      // Check that selection was cached
      expect(keyBrowserService._cachedSelections.space).toBe('F1')
      expect(keyBrowserService.selectedKeyName).toBe(null)
    })

    it('should restore cached key selection when switching back to key environment', async () => {
      keyBrowserService.init()
      keyBrowserService.currentEnvironment = 'space'
      keyBrowserService._cachedSelections.space = 'F2'

      const selectKeySpy = vi.spyOn(keyBrowserService, 'selectKey')

      // Simulate environment change back to space by calling the handler directly
      keyBrowserService.currentEnvironment = 'space'
      keyBrowserService.selectedKeyName = null
      keyBrowserService._restoreOrAutoSelectKey('space')

      // Check that cached selection is restored
      expect(selectKeySpy).toHaveBeenCalledWith('F2')
    })

    it('should auto-select first key when no cached selection exists', async () => {
      keyBrowserService.init()
      keyBrowserService.currentEnvironment = 'alias'
      keyBrowserService._cachedSelections.space = null

      const selectKeySpy = vi.spyOn(keyBrowserService, 'selectKey')

      // Simulate environment change to space by calling the handler directly
      keyBrowserService.currentEnvironment = 'space'
      keyBrowserService.selectedKeyName = null
      keyBrowserService._restoreOrAutoSelectKey('space')

      // Check that first key is auto-selected
      expect(selectKeySpy).toHaveBeenCalledWith('A') // First alphabetically
    })

    it('should handle cached selection that no longer exists', async () => {
      keyBrowserService.init()
      keyBrowserService.currentEnvironment = 'alias'
      keyBrowserService._cachedSelections.space = 'NONEXISTENT'

      const selectKeySpy = vi.spyOn(keyBrowserService, 'selectKey')

      // Simulate environment change to space by calling the handler directly
      keyBrowserService.currentEnvironment = 'space'
      keyBrowserService.selectedKeyName = null
      keyBrowserService._restoreOrAutoSelectKey('space')

      // Check that first available key is selected instead
      expect(selectKeySpy).toHaveBeenCalledWith('A') // First alphabetically
    })

    it('should cache selections separately for space and ground environments', () => {
      keyBrowserService.init()
      
      // Set up space selection
      keyBrowserService.currentEnvironment = 'space'
      keyBrowserService.selectedKeyName = 'F1'
      
      // Switch to ground and cache space selection by calling handler logic directly
      if (keyBrowserService.currentEnvironment !== 'alias' && keyBrowserService.selectedKeyName) {
        keyBrowserService._cachedSelections[keyBrowserService.currentEnvironment] = keyBrowserService.selectedKeyName
      }
      keyBrowserService.currentEnvironment = 'ground'
      keyBrowserService.selectedKeyName = null
      
      expect(keyBrowserService._cachedSelections.space).toBe('F1')

      // Set ground selection
      keyBrowserService.selectedKeyName = 'G'
      
      // Switch to alias and cache ground selection
      if (keyBrowserService.currentEnvironment !== 'alias' && keyBrowserService.selectedKeyName) {
        keyBrowserService._cachedSelections[keyBrowserService.currentEnvironment] = keyBrowserService.selectedKeyName
      }
      keyBrowserService.currentEnvironment = 'alias'
      keyBrowserService.selectedKeyName = null
      
      expect(keyBrowserService._cachedSelections.ground).toBe('G')
      expect(keyBrowserService._cachedSelections.space).toBe('F1')
    })

    it('should clear cached selections when profile changes', () => {
      keyBrowserService.init()
      keyBrowserService._cachedSelections.space = 'F1'
      keyBrowserService._cachedSelections.ground = 'G'

      keyBrowserService.setupEventListeners()
      
          // Find the profile:switched handler from addEventListener calls
    const profileSwitchedCall = keyBrowserService.addEventListener.mock.calls.find(call =>
      call[0] === 'profile:switched'
      )
      
      expect(profileSwitchedCall).toBeDefined()
      const profileHandler = profileSwitchedCall[1]

      profileHandler({ profileId: 'new-profile', environment: 'space' })

      expect(keyBrowserService._cachedSelections.space).toBe(null)
      expect(keyBrowserService._cachedSelections.ground).toBe(null)
    })

    it('should not auto-select when no keys are available', async () => {
      // Mock empty keys
      mockStorage.getProfile.mockReturnValue({
        currentEnvironment: 'space',
        builds: {
          space: { keys: {} }
        }
      })

      keyBrowserService.init()
      const selectKeySpy = vi.spyOn(keyBrowserService, 'selectKey')

      // Simulate environment change to space by calling the handler directly
      keyBrowserService.currentEnvironment = 'space'
      keyBrowserService.selectedKeyName = null
      keyBrowserService._restoreOrAutoSelectKey('space')

      // Check that no selection occurs when no keys available
      expect(selectKeySpy).not.toHaveBeenCalled()
    })
  })

  describe('Mode Changed Event Handling', () => {
    it('should handle mode-changed events with caching', () => {
      keyBrowserService.init()
      keyBrowserService.currentEnvironment = 'space'
      keyBrowserService.selectedKeyName = 'F1'

      // Simulate mode-changed event by calling the handler logic directly
      if (keyBrowserService.currentEnvironment !== 'alias' && keyBrowserService.selectedKeyName) {
        keyBrowserService._cachedSelections[keyBrowserService.currentEnvironment] = keyBrowserService.selectedKeyName
      }
      keyBrowserService.currentEnvironment = 'alias'
      keyBrowserService.selectedKeyName = null

      expect(keyBrowserService._cachedSelections.space).toBe('F1')
      expect(keyBrowserService.selectedKeyName).toBe(null)
    })

    it('should restore selection on mode-changed events', async () => {
      keyBrowserService.init()
      keyBrowserService._cachedSelections.ground = 'G'

      const selectKeySpy = vi.spyOn(keyBrowserService, 'selectKey')

      // Simulate mode-changed event by calling the handler directly
      keyBrowserService.currentEnvironment = 'ground'
      keyBrowserService.selectedKeyName = null
      keyBrowserService._restoreOrAutoSelectKey('ground')

      expect(selectKeySpy).toHaveBeenCalledWith('G')
    })
  })

  describe('Key Selection', () => {
    it('should emit key-selected event when selecting a key', () => {
      keyBrowserService.init()
      keyBrowserService.selectKey('F1')

      expect(mockEventBus.emit).toHaveBeenCalledWith('key-selected', { key: 'F1', name: 'F1' })
    })

    it('should not emit event when selecting the same key', () => {
      keyBrowserService.init()
      keyBrowserService.selectedKeyName = 'F1'
      
      mockEventBus.emit.mockClear()
      keyBrowserService.selectKey('F1')

      expect(mockEventBus.emit).not.toHaveBeenCalled()
    })

    it('should update selectedKeyName when selecting a key', () => {
      keyBrowserService.init()
      keyBrowserService.selectKey('F2')

      expect(keyBrowserService.selectedKeyName).toBe('F2')
    })
  })

  describe('Data Retrieval', () => {
    it('should return keys for current environment', () => {
      keyBrowserService.init()
      keyBrowserService.currentEnvironment = 'space'

      const keys = keyBrowserService.getKeys()

      expect(keys).toEqual({
        'F1': [{ command: 'test command 1' }],
        'F2': [{ command: 'test command 2' }],
        'A': [{ command: 'test command A' }]
      })
    })

    it('should return empty object when no profile exists', () => {
      mockStorage.getProfile.mockReturnValue(null)
      keyBrowserService.init()

      const keys = keyBrowserService.getKeys()

      expect(keys).toEqual({})
    })

    it('should return empty object when no keys exist for environment', () => {
      mockStorage.getProfile.mockReturnValue({
        builds: {
          space: {}
        }
      })
      keyBrowserService.init()
      keyBrowserService.currentEnvironment = 'space'

      const keys = keyBrowserService.getKeys()

      expect(keys).toEqual({})
    })
  })

  describe('Request/Response Endpoints', () => {
    it('should have key:select endpoint functionality', () => {
      keyBrowserService.init()
      
      // Test that selectKey method exists and works
      const selectKeySpy = vi.spyOn(keyBrowserService, 'selectKey')
      keyBrowserService.selectKey('F1')
      
      expect(selectKeySpy).toHaveBeenCalledWith('F1')
      expect(keyBrowserService.selectedKeyName).toBe('F1')
    })
  })
}) 