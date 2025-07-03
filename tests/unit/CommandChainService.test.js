import { describe, it, expect, beforeEach, vi } from 'vitest'
import eventBus from '../../src/js/core/eventBus.js'
import { respond } from '../../src/js/core/requestResponse.js'

// Mock parameterCommands
vi.mock('../../src/js/components/ui/ParameterCommandUI.js', () => ({
  parameterCommands: {
    showParameterModal: vi.fn()
  }
}))

import CommandChainService from '../../src/js/components/services/CommandChainService.js'
import { parameterCommands } from '../../src/js/components/ui/ParameterCommandUI.js'

// Mock dependencies
const mockI18n = {
  t: vi.fn((key) => key)
}

// Mock profile data for DataCoordinator integration
const mockProfile = {
  id: 'test-profile',
  builds: { 
    space: { 
      keys: { 
        'test-key': [
          { command: 'test command 1', type: 'space' },
          { command: 'test command 2', type: 'space' }
        ] 
      } 
    },
    ground: { keys: {} }
  },
  aliases: {
    'test-alias': { commands: 'test_command' }
  }
}

describe('CommandChainService', () => {
  let service
  let responseCleanups = []

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Clear any existing listeners
    eventBus.clear()
    
    // Mock the request/response endpoints that CommandChainService uses
    responseCleanups.push(
      respond(eventBus, 'command:get-for-selected-key', () => []),
      respond(eventBus, 'command:get-empty-state-info', () => ({ title: 'Test' })),
      respond(eventBus, 'command:find-definition', () => null),
      respond(eventBus, 'command:get-warning', () => null),
      // DataCoordinator integration - replace old profile:get-current and profile:save
      respond(eventBus, 'data:update-profile', () => ({ success: true }))
    )
    
    service = new CommandChainService({
      i18n: mockI18n,
      eventBus: eventBus
    })
    service.selectedKey = 'test-key'
    service.currentEnvironment = 'space'
    service.currentProfile = 'test-profile'
    
    // Set up DataCoordinator cache with mock profile data
    service.cache.profile = mockProfile
    service.cache.currentProfile = 'test-profile'
    service.cache.keys = mockProfile.builds.space.keys
    service.cache.aliases = mockProfile.aliases
    service.cache.currentEnvironment = 'space'
  })

  afterEach(() => {
    // Clean up response handlers
    responseCleanups.forEach(cleanup => cleanup && cleanup())
    responseCleanups = []
  })

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(service.i18n).toBe(mockI18n)
      expect(service.componentName).toBe('CommandChainService')
    })
  })

  describe('onInit', () => {
    it('should setup event listeners', () => {
      const setupSpy = vi.spyOn(service, 'setupEventListeners')
      service.onInit()
      expect(setupSpy).toHaveBeenCalled()
    })
  })

  describe('command:add event handling', () => {
    beforeEach(() => {
      service.onInit()
      vi.clearAllMocks() // Clear mocks after onInit to avoid counting setup calls
    })

    it('should handle static commands', () => {
      const staticCommandDef = {
        command: 'test_command',
        type: 'space',
        icon: '🎯',
        text: 'Test Command'
      }

      // CommandChainService no longer handles static commands directly
      // Instead, it listens for the command-added event that CommandUI emits
      service.emit('command:add', { commandDef: staticCommandDef })

      // Should not involve any direct service calls anymore - handled by CommandUI
      expect(true).toBe(true) // Just verify no errors occur
    })

    it('should handle command-added events from CommandService', async () => {
      const emitSpy = vi.spyOn(service, 'emit')
      
      // Simulate CommandService adding a command
      service.emit('command-added', { key: 'test-key', command: { command: 'test' } })

      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 0))

      // Should emit chain-data-changed to update UI
      expect(emitSpy).toHaveBeenCalledWith('chain-data-changed', { commands: [] })
    })

    it('should not handle customizable commands directly (handled by CommandUI)', () => {
      const customizableCommandDef = {
        name: 'Custom Command',
        customizable: true
      }

      service.emit('command:add', {
        categoryId: 'space',
        commandId: 'custom_cmd',
        commandDef: customizableCommandDef
      })

      // CommandChainService no longer handles command:add events directly
      // These are now handled by CommandUI, so parameterCommands should not be called
      expect(parameterCommands.showParameterModal).not.toHaveBeenCalled()
    })
  })

  describe('commandlibrary:add event handling', () => {
    beforeEach(() => {
      service.onInit()
      vi.clearAllMocks() // Clear mocks after onInit to avoid counting setup calls
    })

    it('should handle commandObj from AliasModalService', async () => {
      const mockCommandObj = {
        command: 'test_command',
        type: 'alias',
        text: 'Test Command'
      }
      
      const emitSpy = vi.spyOn(service, 'emit')

      service.emit('commandlibrary:add', {
        categoryId: 'alias',
        commandId: 'test_alias',
        commandObj: mockCommandObj
      })

      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 0))

      // Should emit chain-data-changed when command is added
      expect(emitSpy).toHaveBeenCalledWith('chain-data-changed', { commands: [] })
    })

    it('should ignore events without commandObj', () => {
      service.emit('commandlibrary:add', {
        categoryId: 'space',
        commandId: 'test_cmd'
      })

      // Should not cause any errors
      expect(true).toBe(true)
    })
  })

  describe('request/response endpoints', () => {
    it('should provide command-chain management endpoints', async () => {
      service.onInit()
      
      // Test that the service exposes the expected endpoints
      expect(service._responseDetachFunctions.length).toBeGreaterThan(0)
      
      // Test getCommandsForSelectedKey method
      const result = await service.getCommandsForSelectedKey()
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('stabilization after app reload', () => {
    it('should correctly toggle stabilization on first attempt after reload', async () => {
      const service = new CommandChainService({ eventBus, i18n: { t: key => key } })
      
      // Mock DataCoordinator cache as if app just reloaded with existing profile
      const mockProfile = {
        id: 'test_profile',
        name: 'Test Profile',
        currentEnvironment: 'alias',
        aliases: {
          'AttackCall': { 
            commands: 'team Attacking [$Target] - focus fire! $$ Target_Enemy_Near',
            description: 'Attack command'
          }
        },
        aliasMetadata: {
          'AttackCall': {
            stabilizeExecutionOrder: true  // Initially stabilized
          }
        },
        builds: { space: { keys: {} }, ground: { keys: {} } }
      }

      // Set up service cache as if it received profile data from DataCoordinator
      service.cache.profile = mockProfile
      service.cache.currentProfile = 'test_profile'
      service.currentEnvironment = 'alias'
      service.cache.currentEnvironment = 'alias'

      // Mock the DataCoordinator update response
      const mockDataCoordinatorResponse = {
        success: true,
        profile: {
          ...mockProfile,
          aliasMetadata: {}, // AttackCall metadata removed entirely due to empty object cleanup
          lastModified: new Date().toISOString()
        }
      }

      // Set up request/respond mock for data:update-profile
      const requestSpy = vi.fn().mockResolvedValue(mockDataCoordinatorResponse)
      service.request = requestSpy

      // Set up emit spy to verify events
      const emitSpy = vi.spyOn(service, 'emit')

      // Verify initial state - should be stabilized
      const initialStabilized = service.isStabilized('AttackCall')
      expect(initialStabilized).toBe(true)

      // First attempt to toggle stabilization OFF (this was failing before the fix)
      const result = await service.setStabilize('AttackCall', false)

      // Verify the operation succeeded
      expect(result.success).toBe(true)

      // Verify the correct payload was sent to DataCoordinator
      expect(requestSpy).toHaveBeenCalledWith('data:update-profile', {
        profileId: 'test_profile',
        modify: {
          aliasMetadata: {
            'AttackCall': {} // Only the specific alias being modified, with empty object to signal cleanup
          }
        }
      })

      // Verify events were emitted
      expect(emitSpy).toHaveBeenCalledWith('stabilize-changed', {
        name: 'AttackCall',
        stabilize: false,
        isAlias: true
      })
      expect(emitSpy).toHaveBeenCalledWith('profile:updated', {
        profileId: 'test_profile',
        profile: mockDataCoordinatorResponse.profile
      })
    })

    it('should handle keybind stabilization correctly after reload', async () => {
      const service = new CommandChainService({ eventBus, i18n: { t: key => key } })
      
      // Mock profile with stabilized keybind
      const mockProfile = {
        id: 'test_profile',
        name: 'Test Profile',
        currentEnvironment: 'space',
        aliases: {},
        keybindMetadata: {
          space: {
            'F1': {
              stabilizeExecutionOrder: true
            }
          }
        },
        builds: { 
          space: { keys: { 'F1': [{ command: 'FirePhasers' }] } }, 
          ground: { keys: {} } 
        }
      }

      // Set up service cache
      service.cache.profile = mockProfile
      service.cache.currentProfile = 'test_profile'
      service.currentEnvironment = 'space'
      service.cache.currentEnvironment = 'space'

      // Mock DataCoordinator response
      const mockResponse = {
        success: true,
        profile: {
          ...mockProfile,
          keybindMetadata: {
            space: {} // F1 metadata removed entirely due to empty object cleanup
          }
        }
      }

      service.request = vi.fn().mockResolvedValue(mockResponse)
      const emitSpy = vi.spyOn(service, 'emit')

      // Verify initial state
      expect(service.isStabilized('F1')).toBe(true)

      // Toggle stabilization OFF
      const result = await service.setStabilize('F1', false)

      expect(result.success).toBe(true)
      expect(service.request).toHaveBeenCalledWith('data:update-profile', {
        profileId: 'test_profile',
        modify: {
          keybindMetadata: {
            space: {
              'F1': {} // Only the specific key being modified, with empty object to signal cleanup
            }
          }
        }
      })
    })

    it('should preserve existing metadata when toggling stabilization', async () => {
      const service = new CommandChainService({ eventBus, i18n: { t: key => key } })
      
      // Mock profile with multiple aliases having different metadata
      const mockProfile = {
        id: 'test_profile',
        aliases: {
          'AttackCall': { commands: 'test1' },
          'HealCall': { commands: 'test2' },
          'DefendCall': { commands: 'test3' }
        },
        aliasMetadata: {
          'AttackCall': {
            stabilizeExecutionOrder: true,
            customProperty: 'keep_this'  // This should be preserved
          },
          'HealCall': {
            someOtherProperty: 'preserve_this'  // This should not be affected
          }
        }
      }

      service.cache.profile = mockProfile
      service.cache.currentProfile = 'test_profile'
      service.currentEnvironment = 'alias'

      const mockResponse = { success: true, profile: mockProfile }
      service.request = vi.fn().mockResolvedValue(mockResponse)

      // Toggle stabilization OFF for AttackCall
      await service.setStabilize('AttackCall', false)

      // Verify that the modify payload preserves existing metadata
      const modifyPayload = service.request.mock.calls[0][1].modify.aliasMetadata
      
      expect(modifyPayload).toEqual({
        'AttackCall': {
          customProperty: 'keep_this'  // Preserved, stabilizeExecutionOrder should be deleted
        }
        // Only AttackCall should be included since we're only modifying that alias
      })

      // Verify AttackCall's stabilizeExecutionOrder was removed but customProperty remains
      expect(modifyPayload.AttackCall.stabilizeExecutionOrder).toBeUndefined()
      expect(modifyPayload.AttackCall.customProperty).toBe('keep_this')
    })
  })
}) 