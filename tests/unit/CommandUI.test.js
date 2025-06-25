import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock parameterCommands
vi.mock('../../src/js/components/ui/ParameterCommandUI.js', () => ({
  parameterCommands: {
    showParameterModal: vi.fn(),
    commandService: null,
    commandLibraryService: null
  }
}))

// Mock eventBus
vi.mock('../../src/js/core/eventBus.js', () => ({
  default: {
    on: vi.fn(),
    emit: vi.fn(),
    off: vi.fn()
  }
}))

import CommandUI from '../../src/js/components/ui/CommandUI.js'
import { parameterCommands } from '../../src/js/components/ui/ParameterCommandUI.js'

// Mock dependencies
const mockUI = {
  showToast: vi.fn()
}

const mockEventBus = {
  on: vi.fn(),
  emit: vi.fn(),
  off: vi.fn()
}

const mockModalManager = {
  show: vi.fn(),
  hide: vi.fn()
}

const mockCommandService = {
  selectedKey: 'test-key',
  addCommand: vi.fn(),
  i18n: {
    t: vi.fn((key) => key)
  }
}

const mockCommandLibraryService = {
  selectedKey: 'test-key',
  addCommand: vi.fn()
}

describe('CommandUI', () => {
  let commandUI

  beforeEach(() => {
    vi.clearAllMocks()
    
    commandUI = new CommandUI({
      eventBus: mockEventBus,
      ui: mockUI,
      modalManager: mockModalManager,
      commandService: mockCommandService,
      commandLibraryService: mockCommandLibraryService
    })
  })

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(commandUI.ui).toBe(mockUI)
      expect(commandUI.modalManager).toBe(mockModalManager)
      expect(commandUI.commandService).toBe(mockCommandService)
      expect(commandUI.commandLibraryService).toBe(mockCommandLibraryService)
    })

    it('should use global stoUI if no ui provided', () => {
      global.stoUI = { test: 'global' }
      const ui = new CommandUI({})
      expect(ui.ui).toBe(global.stoUI)
      delete global.stoUI
    })
  })

  describe('onInit', () => {
    it('should setup parameterCommands with services', () => {
      commandUI.onInit()
      
      expect(parameterCommands.commandService).toBe(mockCommandService)
      expect(parameterCommands.commandLibraryService).toBe(mockCommandLibraryService)
    })

    it('should setup command:add event listener', () => {
      const addEventListenerSpy = vi.spyOn(commandUI, 'addEventListener')
      commandUI.onInit()
      
      expect(addEventListenerSpy).toHaveBeenCalledWith('command:add', expect.any(Function))
    })
  })

  describe('command:add event handling', () => {
    beforeEach(() => {
      commandUI.onInit()
    })

    it('should handle static commands by calling commandService.addCommand', () => {
      const staticCommandDef = {
        command: 'test_command',
        type: 'space',
        icon: '🎯',
        text: 'Test Command',
        id: 'test-id-123'
      }

      // Emit command:add event for static command
      commandUI.emit('command:add', { commandDef: staticCommandDef })

      expect(mockCommandService.addCommand).toHaveBeenCalledWith('test-key', staticCommandDef)
      expect(parameterCommands.showParameterModal).not.toHaveBeenCalled()
    })

    it('should handle customizable commands by showing parameter modal', () => {
      const customizableCommandDef = {
        name: 'Custom Command',
        command: 'custom_command',
        icon: '⚙️',
        description: 'A customizable command',
        customizable: true
      }

      // Emit command:add event for customizable command
      commandUI.emit('command:add', {
        categoryId: 'space',
        commandId: 'custom_cmd',
        commandDef: customizableCommandDef
      })

      expect(parameterCommands.showParameterModal).toHaveBeenCalledWith(
        'space',
        'custom_cmd',
        customizableCommandDef
      )
      expect(mockCommandService.addCommand).not.toHaveBeenCalled()
    })

    it('should show warning for static commands when no key is selected', () => {
      mockCommandService.selectedKey = null

      const staticCommandDef = {
        command: 'test_command',
        type: 'space',
        icon: '🎯',
        text: 'Test Command',
        id: 'test-id-123'
      }

      // Emit command:add event for static command
      commandUI.emit('command:add', { commandDef: staticCommandDef })

      expect(mockUI.showToast).toHaveBeenCalledWith('please_select_a_key_first', 'warning')
      expect(mockCommandService.addCommand).not.toHaveBeenCalled()
    })

    it('should show warning for static commands when no commandService', () => {
      commandUI.commandService = null

      const staticCommandDef = {
        command: 'test_command',
        type: 'space',
        icon: '🎯',
        text: 'Test Command',
        id: 'test-id-123'
      }

      // Emit command:add event for static command
      commandUI.emit('command:add', { commandDef: staticCommandDef })

      expect(mockUI.showToast).toHaveBeenCalledWith('Please select a key first', 'warning')
    })

    it('should handle gracefully when ui is not available', () => {
      commandUI.ui = null
      commandUI.commandService = null

      const staticCommandDef = {
        command: 'test_command',
        type: 'space',
        icon: '🎯',
        text: 'Test Command',
        id: 'test-id-123'
      }

      // Should not throw an error
      expect(() => {
        commandUI.emit('command:add', { commandDef: staticCommandDef })
      }).not.toThrow()
    })

    it('should ignore invalid payloads', () => {
      // Emit command:add event with invalid payload
      commandUI.emit('command:add', {})

      expect(mockCommandService.addCommand).not.toHaveBeenCalled()
      expect(parameterCommands.showParameterModal).not.toHaveBeenCalled()
      expect(mockUI.showToast).not.toHaveBeenCalled()
    })

    it('should ignore payloads with partial data', () => {
      // Emit command:add event with only categoryId but no commandId
      commandUI.emit('command:add', { categoryId: 'space' })

      expect(mockCommandService.addCommand).not.toHaveBeenCalled()
      expect(parameterCommands.showParameterModal).not.toHaveBeenCalled()
      expect(mockUI.showToast).not.toHaveBeenCalled()
    })
  })
}) 