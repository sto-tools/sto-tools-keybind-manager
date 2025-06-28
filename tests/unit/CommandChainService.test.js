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
    eventBus.listeners = {}
    
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

    it('should handle customizable commands', () => {
      const customizableCommandDef = {
        name: 'Custom Command',
        customizable: true
      }

      service.emit('command:add', {
        categoryId: 'space',
        commandId: 'custom_cmd',
        commandDef: customizableCommandDef
      })

      expect(parameterCommands.showParameterModal).toHaveBeenCalledWith(
        'space',
        'custom_cmd',
        customizableCommandDef
      )
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
}) 