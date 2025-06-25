import { describe, it, expect, beforeEach, vi } from 'vitest'

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

const mockCommandLibraryService = {
  selectedKey: 'test-key',
  addCommand: vi.fn(),
  deleteCommand: vi.fn(),
  moveCommand: vi.fn(),
  getCommandsForSelectedKey: vi.fn(() => []),
  getEmptyStateInfo: vi.fn(() => ({ title: 'Test' })),
  findCommandDefinition: vi.fn(),
  getCommandWarning: vi.fn(),
  setCurrentEnvironment: vi.fn(),
  ui: { showToast: vi.fn() },
  i18n: mockI18n
}

describe('CommandChainService', () => {
  let service

  beforeEach(() => {
    vi.clearAllMocks()
    
    service = new CommandChainService({
      i18n: mockI18n,
      commandLibraryService: mockCommandLibraryService
    })
    service.selectedKey = 'test-key'
    service.currentEnvironment = 'space'
  })

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(service.i18n).toBe(mockI18n)
      expect(service.commandLibraryService).toBe(mockCommandLibraryService)
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

      // Should not call addCommand directly anymore
      expect(mockCommandLibraryService.addCommand).not.toHaveBeenCalled()
    })

    it('should handle command-added events from CommandService', () => {
      const emitSpy = vi.spyOn(service, 'emit')
      
      // Simulate CommandService adding a command
      service.emit('command-added', { key: 'test-key', command: { command: 'test' } })

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

    it('should handle commandObj from AliasModalService', () => {
      const mockCommandObj = {
        command: 'test_command',
        type: 'alias',
        text: 'Test Command'
      }
      
      mockCommandLibraryService.addCommand.mockReturnValue(true)

      service.emit('commandlibrary:add', {
        categoryId: 'alias',
        commandId: 'test_alias',
        commandObj: mockCommandObj
      })

      expect(mockCommandLibraryService.addCommand).toHaveBeenCalledWith('test-key', mockCommandObj)
    })

    it('should ignore events without commandObj', () => {
      service.emit('commandlibrary:add', {
        categoryId: 'space',
        commandId: 'test_cmd'
      })

      expect(mockCommandLibraryService.addCommand).not.toHaveBeenCalled()
    })
  })

  describe('proxy methods', () => {
    it('should delegate to commandLibraryService', () => {
      const mockCommands = [{ command: 'test' }]
      mockCommandLibraryService.getCommandsForSelectedKey.mockReturnValue(mockCommands)

      const result = service.getCommandsForSelectedKey()
      expect(result).toBe(mockCommands)
    })
  })
}) 