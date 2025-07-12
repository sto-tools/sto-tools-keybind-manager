import { describe, it, expect, beforeEach, vi } from 'vitest'
import KeyBrowserService from '../../../src/js/components/services/KeyBrowserService.js'

describe('KeyBrowserService Null Selection', () => {
  let service, mockEventBus, mockStorage

  beforeEach(() => {
    // Mock event bus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      request: vi.fn()
    }
    
    // Mock storage
    mockStorage = {
      get: vi.fn(),
      set: vi.fn()
    }

    // Create service instance
    service = new KeyBrowserService({
      eventBus: mockEventBus,
      storage: mockStorage
    })
    
    // Mock the emit method directly on the service
    service.emit = vi.fn()

    // Set up basic cache state
    service.cache = {
      profile: {
        id: 'test-profile',
        selections: {}
      },
      keys: {},
      builds: {
        space: { keys: { F1: {}, F2: {} } },
        ground: { keys: {} }, // No keys in ground
        alias: { aliases: {} }
      },
      currentEnvironment: 'space'
    }
    
    service.currentEnvironment = 'space'
    service.selectedKeyName = null
  })

  describe('_restoreOrAutoSelectKey', () => {
    it('should emit key-selected with null when no keys exist in environment', async () => {
      // Set up environment with no keys
      service.cache.keys = {} // No keys available
      
      // Call the method
      await service._restoreOrAutoSelectKey('ground')
      
      // Verify that key-selected was emitted with null values
      expect(service.emit).toHaveBeenCalledWith('key-selected', {
        key: null,
        name: null
      })
      
      // Verify that selectedKeyName was set to null
      expect(service.selectedKeyName).toBe(null)
    })

    it('should auto-select first key when keys exist', async () => {
      // Set up environment with keys
      service.cache.keys = { F1: {}, F2: {} }
      
      // Mock selectKey method
      const selectKeySpy = vi.spyOn(service, 'selectKey').mockImplementation(() => {})
      
      // Call the method
      await service._restoreOrAutoSelectKey('space')
      
      // Verify that selectKey was called with first key
      expect(selectKeySpy).toHaveBeenCalledWith('F1')
      
      // Verify that key-selected with null was NOT emitted
      expect(mockEventBus.emit).not.toHaveBeenCalledWith('key-selected', {
        key: null,
        name: null
      })
    })

    it('should restore persisted selection when available', async () => {
      // Set up persisted selection
      service.cache.profile.selections = { space: 'F2' }
      service.cache.keys = { F1: {}, F2: {} }
      
      // Mock selectKey method
      const selectKeySpy = vi.spyOn(service, 'selectKey').mockImplementation(() => {})
      
      // Call the method
      await service._restoreOrAutoSelectKey('space')
      
      // Verify that selectKey was called with persisted key
      expect(selectKeySpy).toHaveBeenCalledWith('F2')
      
      // Verify that key-selected with null was NOT emitted
      expect(mockEventBus.emit).not.toHaveBeenCalledWith('key-selected', {
        key: null,
        name: null
      })
    })

    it('should emit null selection when persisted key no longer exists', async () => {
      // Set up persisted selection for key that doesn't exist anymore
      service.cache.profile.selections = { ground: 'F1' }
      service.cache.keys = {} // F1 no longer exists in ground
      
      // Call the method
      await service._restoreOrAutoSelectKey('ground')
      
      // Verify that key-selected was emitted with null values
      expect(service.emit).toHaveBeenCalledWith('key-selected', {
        key: null,
        name: null
      })
      
      // Verify that selectedKeyName was set to null
      expect(service.selectedKeyName).toBe(null)
    })
  })
})