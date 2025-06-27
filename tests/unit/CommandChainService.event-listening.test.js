import { describe, it, expect, beforeEach, vi } from 'vitest'
import eventBus from '../../src/js/core/eventBus.js'
import CommandChainService from '../../src/js/components/services/CommandChainService.js'

describe('CommandChainService Event Listening', () => {
  let commandChainService
  let mockCommandLibraryService

  beforeEach(() => {
    // Clear any existing listeners
    eventBus.removeAllListeners()

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

    // Create CommandChainService
    commandChainService = new CommandChainService({
      i18n: { t: (key) => key },
      commandLibraryService: mockCommandLibraryService
    })

    commandChainService.init()
  })

  it('should listen for key-selected events and emit chain-data-changed', () => {
    const chainDataChangedSpy = vi.fn()
    eventBus.on('chain-data-changed', chainDataChangedSpy)

    // Emit key-selected event
    eventBus.emit('key-selected', { key: 'F1' })

    // Verify that CommandChainService received the event and emitted chain-data-changed
    expect(commandChainService.selectedKey).toBe('F1')
    expect(chainDataChangedSpy).toHaveBeenCalledWith({
      commands: [
        { command: 'test command 1', type: 'space' },
        { command: 'test command 2', type: 'space' }
      ]
    })
  })

  it('should listen for alias-selected events and emit chain-data-changed', () => {
    const chainDataChangedSpy = vi.fn()
    eventBus.on('chain-data-changed', chainDataChangedSpy)

    // Emit alias-selected event
    eventBus.emit('alias-selected', { name: 'testAlias' })

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
    const chainDataChangedSpy = vi.fn()
    eventBus.on('chain-data-changed', chainDataChangedSpy)

    // Set initial state
    commandChainService.selectedKey = 'F1'
    commandChainService.commands = [{ command: 'test' }]

    // Emit environment:changed event
    eventBus.emit('environment:changed', { environment: 'ground' })

    // Verify that CommandChainService updated environment and cleared selection
    expect(commandChainService.currentEnvironment).toBe('ground')
    expect(commandChainService.selectedKey).toBe(null)
    expect(commandChainService.commands).toEqual([])
    expect(chainDataChangedSpy).toHaveBeenCalledWith({ commands: [] })
  })
}) 