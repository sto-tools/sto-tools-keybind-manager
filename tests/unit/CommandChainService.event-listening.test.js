import { describe, it, expect, beforeEach, vi } from 'vitest'
import eventBus from '../../src/js/core/eventBus.js'
import { respond } from '../../src/js/core/requestResponse.js'
import CommandChainService from '../../src/js/components/services/CommandChainService.js'

// Mock profile data for DataCoordinator integration
const mockProfile = {
  id: 'test-profile',
  builds: { 
    space: { 
      keys: { 
        'F1': [
          { command: 'test command 1', type: 'space' },
          { command: 'test command 2', type: 'space' }
        ] 
      } 
    },
    ground: { keys: {} }
  },
  aliases: {
    'testAlias': { commands: 'test command 1 $$ test command 2' }
  }
}

describe('CommandChainService Event Listening', () => {
  let commandChainService
  let responseCleanups = []

  beforeEach(() => {
    // Clear any existing listeners
    eventBus.listeners = {}

    // Mock the request/response endpoints that CommandChainService uses
    responseCleanups.push(
      respond(eventBus, 'command:get-for-selected-key', () => [
        { command: 'test command 1', type: 'space' },
        { command: 'test command 2', type: 'space' }
      ]),
      respond(eventBus, 'command:get-empty-state-info', () => ({
        title: 'Test Chain',
        preview: 'test preview',
        commandCount: '2'
      })),
      respond(eventBus, 'command:find-definition', () => null),
      respond(eventBus, 'command:get-warning', () => null),
      // DataCoordinator integration - replace old profile:get-current and profile:save
      respond(eventBus, 'data:update-profile', () => ({ success: true }))
    )

    // Create CommandChainService
    commandChainService = new CommandChainService({
      i18n: { t: (key) => key }
    })
    commandChainService.currentProfile = 'test-profile'
    
    // Set up DataCoordinator cache with mock profile data
    commandChainService.cache.profile = mockProfile
    commandChainService.cache.currentProfile = 'test-profile'
    commandChainService.cache.keys = mockProfile.builds.space.keys
    commandChainService.cache.aliases = mockProfile.aliases
    commandChainService.cache.currentEnvironment = 'space'

    commandChainService.init()
  })

  afterEach(() => {
    // Clean up response handlers
    responseCleanups.forEach(cleanup => cleanup && cleanup())
    responseCleanups = []
  })

  it('should listen for key-selected events and emit chain-data-changed', async () => {
    const chainDataChangedSpy = vi.fn()
    eventBus.on('chain-data-changed', chainDataChangedSpy)

    // Emit key-selected event
    eventBus.emit('key-selected', { key: 'F1' })

    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 0))

    // Verify that CommandChainService received the event and emitted chain-data-changed
    expect(commandChainService.selectedKey).toBe('F1')
    expect(chainDataChangedSpy).toHaveBeenCalledWith({
      commands: [
        { command: 'test command 1', type: 'space' },
        { command: 'test command 2', type: 'space' }
      ]
    })
  })

  it('should listen for alias-selected events and emit chain-data-changed', async () => {
    const chainDataChangedSpy = vi.fn()
    eventBus.on('chain-data-changed', chainDataChangedSpy)

    // Emit alias-selected event
    eventBus.emit('alias-selected', { name: 'testAlias' })

    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 0))

    // Verify that CommandChainService received the event and emitted chain-data-changed
    expect(commandChainService.selectedKey).toBe('testAlias')
    expect(commandChainService.currentEnvironment).toBe('alias')
    expect(chainDataChangedSpy).toHaveBeenCalledWith({
      commands: [
        { command: 'test command 1', type: 'space' },
        { command: 'test command 2', type: 'space' }
      ]
    })
  })

  it('should listen for environment:changed events', () => {
    // Set initial state
    commandChainService.selectedKey = 'F1'

    // Emit environment:changed event
    eventBus.emit('environment:changed', { environment: 'ground' })

    // Verify that CommandChainService updated environment
    expect(commandChainService.currentEnvironment).toBe('ground')
  })
}) 