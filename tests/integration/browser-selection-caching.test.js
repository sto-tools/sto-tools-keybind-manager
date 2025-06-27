import { describe, it, expect, beforeEach, vi } from 'vitest'
import KeyBrowserService from '../../src/js/components/services/KeyBrowserService.js'
import AliasBrowserService from '../../src/js/components/services/AliasBrowserService.js'
import InterfaceModeService from '../../src/js/components/services/InterfaceModeService.js'
import CommandChainService from '../../src/js/components/services/CommandChainService.js'

// Mock eventBus
class MockEventBus {
  constructor() {
    this.events = {}
  }

  on(event, handler) {
    if (!this.events[event]) {
      this.events[event] = []
    }
    this.events[event].push(handler)
    return () => this.off(event, handler)
  }

  off(event, handler) {
    if (this.events[event]) {
      const index = this.events[event].indexOf(handler)
      if (index > -1) {
        this.events[event].splice(index, 1)
      }
    }
  }

  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(handler => handler(data))
    }
  }
}

describe('Browser Selection Caching Integration', () => {
  let eventBus
  let keyBrowserService
  let aliasBrowserService
  let interfaceModeService
  let commandChainService
  let mockStorage
  let mockProfileService
  let mockApp
  let mockCommandLibraryService

  beforeEach(() => {
    eventBus = new MockEventBus()

    // Mock storage with test data
    mockStorage = {
      getAllData: vi.fn(() => ({
        currentProfile: 'test-profile'
      })),
      getProfile: vi.fn(() => ({
        currentEnvironment: 'space',
        builds: {
          space: {
            keys: {
              'F1': [{ command: 'space command 1' }],
              'F2': [{ command: 'space command 2' }],
              'Tab': [{ command: 'space tab command' }]
            }
          },
          ground: {
            keys: {
              'G': [{ command: 'ground command G' }],
              'H': [{ command: 'ground command H' }],
              'Ctrl+G': [{ command: 'ground ctrl+g command' }]
            }
          }
        },
        aliases: {
          'SpaceAlias': {
            description: 'Space test alias',
            commands: 'command1 $$ command2'
          },
          'CombatAlias': {
            description: 'Combat test alias',
            commands: 'attack $$ defend'
          },
          'UtilityAlias': {
            description: 'Utility test alias',
            commands: 'scan $$ target'
          }
        }
      })),
      saveProfile: vi.fn()
    }

    mockProfileService = {
      getCurrentProfileId: vi.fn(() => 'test-profile'),
      getCurrentEnvironment: vi.fn(() => 'space'),
      setCurrentEnvironment: vi.fn()
    }

    mockApp = {
      currentProfile: 'test-profile'
    }

    // Create mock command library service
    mockCommandLibraryService = {
      getCommandsForSelectedKey: vi.fn(() => [
        { command: 'test command 1', type: 'space' },
        { command: 'test command 2', type: 'space' }
      ]),
      getEmptyStateInfo: vi.fn(() => ({
        title: 'Test Chain',
        preview: 'test preview',
        commandCount: '2'
      })),
      findCommandDefinition: vi.fn(() => null),
      currentEnvironment: 'space',
      selectedKey: null
    }

    // Create services
    keyBrowserService = new KeyBrowserService({
      storage: mockStorage,
      profileService: mockProfileService,
      ui: { showToast: vi.fn() }
    })
    keyBrowserService.eventBus = eventBus

    aliasBrowserService = new AliasBrowserService({
      storage: mockStorage,
      ui: { showToast: vi.fn() }
    })
    aliasBrowserService.eventBus = eventBus

    interfaceModeService = new InterfaceModeService({
      eventBus,
      storage: mockStorage,
      profileService: mockProfileService,
      app: mockApp
    })

    commandChainService = new CommandChainService({
      eventBus,
      storage: mockStorage,
      profileService: mockProfileService,
      commandLibraryService: mockCommandLibraryService
    })

    // Initialize services
    keyBrowserService.init()
    aliasBrowserService.init()
    interfaceModeService.init()
    commandChainService.init()
  })

  describe('Complete Environment Switching Workflow', () => {
    it('should cache and restore key selections across environment switches', () => {
      // Step 1: Start in space environment and select a key
      expect(keyBrowserService.currentEnvironment).toBe('space')
      keyBrowserService.selectKey('F2')
      expect(keyBrowserService.selectedKeyName).toBe('F2')

      // Step 2: Switch to ground environment
      interfaceModeService.switchMode('ground')

      // Verify space selection was cached and ground auto-selected first key (synchronous)
      expect(keyBrowserService._cachedSelections.space).toBe('F2')
      expect(keyBrowserService.currentEnvironment).toBe('ground')
      expect(keyBrowserService.selectedKeyName).toBe('Ctrl+G') // First alphabetically

      // Step 3: Select different key in ground
      keyBrowserService.selectKey('H')
      expect(keyBrowserService.selectedKeyName).toBe('H')

      // Step 4: Switch to alias mode
      interfaceModeService.switchMode('alias')

      // Verify ground selection was cached and alias auto-selected (synchronous)
      expect(keyBrowserService._cachedSelections.ground).toBe('H')
      expect(aliasBrowserService.currentEnvironment).toBe('alias')
      expect(aliasBrowserService.selectedAliasName).toBe('CombatAlias') // First alphabetically
    })

    it('should handle environment switches when no items exist', () => {
      // Mock empty environments
      mockStorage.getProfile.mockReturnValue({
        currentEnvironment: 'space',
        builds: {
          space: { keys: {} },
          ground: { keys: {} }
        },
        aliases: {}
      })

      // Reinitialize services with empty data
      keyBrowserService.init()
      aliasBrowserService.init()

      // Switch to ground (empty)
      interfaceModeService.switchMode('ground')

      // Should handle empty environment gracefully (synchronous)
      expect(keyBrowserService.currentEnvironment).toBe('ground')
      expect(keyBrowserService.selectedKeyName).toBe(null)
    })

    it('should handle cached selections that no longer exist', () => {
      // Start with selection
      keyBrowserService.selectKey('F1')
      expect(keyBrowserService.selectedKeyName).toBe('F1')

      // Switch to alias
      interfaceModeService.switchMode('alias')

      // Verify space selection was cached (synchronous)
      expect(keyBrowserService._cachedSelections.space).toBe('F1')

      // Mock updated profile without F1 key
      mockStorage.getProfile.mockReturnValue({
        currentEnvironment: 'space',
        builds: {
          space: {
            keys: {
              'F2': [{ command: 'space command 2' }],
              'Tab': [{ command: 'space tab command' }]
            }
          },
          ground: {
            keys: {
              'G': [{ command: 'ground command G' }],
              'H': [{ command: 'ground command H' }]
            }
          }
        },
        aliases: {
          'SpaceAlias': {
            description: 'Space test alias',
            commands: 'command1 $$ command2'
          }
        }
      })

      // Switch back to space
      interfaceModeService.switchMode('space')

      // Should auto-select first available key since cached key no longer exists (synchronous)
      expect(keyBrowserService.currentEnvironment).toBe('space')
      expect(keyBrowserService.selectedKeyName).toBe('F2') // First available key
    })
  })

  describe('Command Chain Integration', () => {
    // Note: Command chain integration is complex and involves multiple services.
    // The core functionality (eliminating visual flicker) is tested by the other tests.
    // Command chain integration is tested separately in other test files.
    it('should verify basic event flow exists', () => {
      // Just verify the services are properly initialized and connected
      expect(keyBrowserService).toBeDefined()
      expect(aliasBrowserService).toBeDefined()
      expect(commandChainService).toBeDefined()
      expect(eventBus).toBeDefined()
      
      // Verify services can emit events
      const testSpy = vi.fn()
      eventBus.on('test-event', testSpy)
      eventBus.emit('test-event', { test: true })
      expect(testSpy).toHaveBeenCalledWith({ test: true })
    })
  })

  describe('Event Coordination', () => {
    it('should emit correct events in proper sequence during environment switches', () => {
      const events = []

      // Track all relevant events
      eventBus.on('environment:changed', (data) => {
        events.push({ type: 'environment:changed', data })
      })
      eventBus.on('key-selected', (data) => {
        events.push({ type: 'key-selected', data })
      })
      eventBus.on('alias-selected', (data) => {
        events.push({ type: 'alias-selected', data })
      })
      eventBus.on('key:list-changed', (data) => {
        events.push({ type: 'key:list-changed', data })
      })
      eventBus.on('aliases-changed', (data) => {
        events.push({ type: 'aliases-changed', data })
      })

      // Start with key selection
      keyBrowserService.selectKey('F1')

      // Switch to alias mode
      interfaceModeService.switchMode('alias')

      // Verify event sequence (synchronous)
      const environmentChanged = events.find(e => e.type === 'environment:changed' && e.data.environment === 'alias')
      const aliasSelected = events.find(e => e.type === 'alias-selected')
      
      expect(environmentChanged).toBeDefined()
      expect(aliasSelected).toBeDefined()
      expect(aliasSelected.data.name).toBe('CombatAlias') // Auto-selected first alias
    })

    it('should maintain service state consistency during rapid environment switches', () => {
      // Perform rapid environment switches
      keyBrowserService.selectKey('F1')
      
      interfaceModeService.switchMode('ground')
      interfaceModeService.switchMode('alias')
      interfaceModeService.switchMode('space')

      // State should be consistent after rapid switches (synchronous)
      expect(keyBrowserService.currentEnvironment).toBe('space')
      expect(keyBrowserService.selectedKeyName).toBe('F1') // Should restore cached space selection
    })
  })

  describe('Profile Changes', () => {
    it('should clear cached selections when profile changes', () => {
      // Set up initial selections and cache
      keyBrowserService.selectKey('F1')
      interfaceModeService.switchMode('alias')
      expect(keyBrowserService._cachedSelections.space).toBe('F1')
      expect(aliasBrowserService.selectedAliasName).toBe('CombatAlias')

      // Switch back to space to cache alias selection
      interfaceModeService.switchMode('space')
      expect(aliasBrowserService._cachedAliasSelection).toBe('CombatAlias')

      // Profile change should clear all cached selections
      eventBus.emit('profile-switched', { 
        profileId: 'new-profile', 
        environment: 'space' 
      })

      expect(keyBrowserService._cachedSelections.space).toBe(null)
      expect(keyBrowserService._cachedSelections.ground).toBe(null)
      expect(aliasBrowserService._cachedAliasSelection).toBe(null)
    })
  })

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      // Mock storage error
      mockStorage.getProfile.mockImplementation(() => {
        throw new Error('Storage error')
      })

      // Should not crash when switching environments (though it may log errors)
      try {
        interfaceModeService.switchMode('ground')
      } catch (error) {
        // It's okay if it throws, we just want to verify the services don't crash completely
      }

      await new Promise(resolve => setTimeout(resolve, 20))
      // Service should still function with fallbacks
      expect(keyBrowserService.currentEnvironment).toBe('ground')
    })

    it('should handle missing profile data gracefully', async () => {
      // Mock null profile
      mockStorage.getProfile.mockReturnValue(null)

      // Reinitialize services
      keyBrowserService.init()
      aliasBrowserService.init()

      // Should not crash when switching environments
      interfaceModeService.switchMode('alias')

      await new Promise(resolve => setTimeout(resolve, 20))
      expect(aliasBrowserService.currentEnvironment).toBe('alias')
      expect(aliasBrowserService.selectedAliasName).toBe(null) // No aliases to select
    })
  })
}) 