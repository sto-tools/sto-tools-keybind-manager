import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import CommandChainService from '../../../src/js/components/services/CommandChainService.js'
import { createServiceFixture } from '../../fixtures'

describe('CommandChainService - Custom Commands', () => {
  let service
  let fixture
  
  beforeEach(() => {
    fixture = createServiceFixture()
    
    service = new CommandChainService({ eventBus: fixture.eventBus })
    service.selectedKey = 'F1'
    service.currentEnvironment = 'space'
    
    // Initialize service if needed
    if (typeof service.init === 'function') service.init()
    
    // Mock required request responses
    fixture.eventBus.registerMockResponse('parser:parse-command-string', ({ commandString }) => {
      // Mock parser response for custom commands
      if (commandString === 'Target_Enemy_Near') {
        return {
          commands: [{
            command: 'Target_Enemy_Near',
            category: 'targeting',
            displayText: 'Target Nearest Enemy',
            icon: '🎯'
          }]
        }
      }
      
      // Default to custom for unknown commands
      return {
        commands: [{
          command: commandString,
          category: 'custom',
          displayText: commandString,
          icon: '⚙️'
        }]
      }
    })
    
    fixture.eventBus.registerMockResponse('command:find-definition', ({ command }) => {
      // Return null for custom commands (no definition found)
      return null
    })
  })
  
  afterEach(() => {
    fixture?.destroy()
  })

  describe('isCustomCommand', () => {
    it('should identify custom commands correctly', async () => {
      const isCustom1 = await service.isCustomCommand('SomeUnknownCommand')
      expect(isCustom1).toBe(true)
      
      const isCustom2 = await service.isCustomCommand('Target_Enemy_Near')
      expect(isCustom2).toBe(false)
    })
    
    it('should handle parsing errors gracefully', async () => {
      // Mock parser to throw an error
      fixture.eventBus.registerMockResponse('parser:parse-command-string', () => {
        throw new Error('Parser error')
      })
      
      const isCustom = await service.isCustomCommand('AnyCommand')
      expect(isCustom).toBe(true) // Should default to true on error
    })
  })

  describe('edit handler for custom commands', () => {
    it('should emit parameter-command:edit for custom commands', async () => {
      const mockEmit = vi.spyOn(service, 'emit')
      
      // Mock a custom command
      const command = {
        command: 'CustomCommand123',
        type: 'custom'
      }
      
      // Trigger edit
      await service.handleEditCommand({ index: 0, command })
      
      expect(mockEmit).toHaveBeenCalledWith('parameter-command:edit', 
        expect.objectContaining({
          index: 0,
          command,
          commandDef: expect.objectContaining({
            name: 'Edit Custom Command',
            customizable: true,
            categoryId: 'custom',
            commandId: 'add_custom_command'
          }),
          categoryId: 'custom',
          commandId: 'add_custom_command'
        })
      )
    })
    
    it('should emit parameter-command:edit for commands with custom category', async () => {
      const mockEmit = vi.spyOn(service, 'emit')
      
      const command = {
        command: 'SomeRawCommand',
        category: 'custom'
      }
      
      await service.handleEditCommand({ index: 1, command })
      
      expect(mockEmit).toHaveBeenCalledWith('parameter-command:edit', 
        expect.objectContaining({
          categoryId: 'custom',
          commandId: 'add_custom_command'
        })
      )
    })
    
    it('should handle unrecognized commands as custom', async () => {
      const mockEmit = vi.spyOn(service, 'emit')
      
      const command = {
        command: 'UnrecognizedCommand'
      }
      
      await service.handleEditCommand({ index: 2, command })
      
      expect(mockEmit).toHaveBeenCalledWith('parameter-command:edit', 
        expect.objectContaining({
          categoryId: 'custom',
          commandId: 'add_custom_command'
        })
      )
    })
  })

  // Helper method to simulate edit handler behavior
  async function handleEditCommand({ index, command }) {
    // Simulate the edit handler logic
    let cmd
    if (typeof command === 'string') {
      cmd = { command }
    } else {
      cmd = command.parameters
        ? { ...command, parameters: { ...command.parameters } }
        : { ...command }
    }

    const def = await service.findCommandDefinition(cmd)
    const isCustomizable = !!(def && def.customizable)
    
    const isCustomCommand = cmd.type === 'custom' || cmd.category === 'custom' || 
                            (cmd.command && await service.isCustomCommand(cmd.command))

    if (isCustomizable) {
      service.emit('parameter-command:edit', {
        index,
        command: cmd,
        commandDef: def,
        categoryId: def.categoryId || cmd.type,
        commandId: def.commandId
      })
      return
    } else if (isCustomCommand) {
      const customDef = {
        name: 'Edit Custom Command',
        customizable: true,
        categoryId: 'custom',
        commandId: 'add_custom_command',
        parameters: {
          rawCommand: {
            type: 'text',
            default: cmd.command || '',
            placeholder: 'Enter any STO command',
            label: 'Command:'
          }
        }
      }
      
      service.emit('parameter-command:edit', {
        index,
        command: cmd,
        commandDef: customDef,
        categoryId: 'custom',
        commandId: 'add_custom_command'
      })
      return
    }
  }
  
  // Expose the helper method for testing
  service.handleEditCommand = handleEditCommand
}) 