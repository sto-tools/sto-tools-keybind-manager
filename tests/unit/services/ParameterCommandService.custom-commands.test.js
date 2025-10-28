import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ParameterCommandService from '../../../src/js/components/services/ParameterCommandService.js'
import { createServiceFixture } from '../../fixtures'

describe('ParameterCommandService - Custom Commands', () => {
  let service
  let fixture
  
  beforeEach(async () => {
    fixture = createServiceFixture()
    service = new ParameterCommandService({ eventBus: fixture.eventBus })
    await service.init()
    service.selectedKey = 'F1'
    service.currentEnvironment = 'space'
    
    // Initialize service if needed
    if (typeof service.init === 'function') service.init()
  })
  
  afterEach(() => {
    fixture?.destroy()
  })

  describe('custom command builder', () => {
    it('should build custom command from raw input', async () => {
      const commandDef = {
        name: 'Add Custom Command',
        customizable: true,
        categoryId: 'custom',
        commandId: 'add_custom_command',
        parameters: {
          rawCommand: {
            type: 'text',
            default: '',
            placeholder: 'Enter any STO command',
            label: 'Command:'
          }
        }
      }
      
      const params = {
        rawCommand: 'Target_Enemy_Near'
      }
      
      const result = await service.buildParameterizedCommand(
        'custom', 
        'add_custom_command', 
        commandDef, 
        params
      )
      
      expect(result).toEqual({
        command: 'Target_Enemy_Near',
        displayText: 'Custom: Target_Enemy_Near',
        type: 'custom',
        icon: undefined,
        id: expect.stringMatching(/^cmd_/),
        parameters: { rawCommand: 'Target_Enemy_Near' }
      })
    })
    
    it('should handle complex STO commands', async () => {
      const commandDef = {
        name: 'Add Custom Command',
        customizable: true,
        categoryId: 'custom',
        commandId: 'add_custom_command'
      }
      
      const params = {
        rawCommand: '+power_exec Science_Team'
      }
      
      const result = await service.buildParameterizedCommand(
        'custom', 
        'add_custom_command', 
        commandDef, 
        params
      )
      
      expect(result).toEqual({
        command: '+power_exec Science_Team',
        displayText: 'Custom: +power_exec Science_Team',
        type: 'custom',
        icon: undefined,
        id: expect.stringMatching(/^cmd_/),
        parameters: { rawCommand: '+power_exec Science_Team' }
      })
    })
    
    it('should handle tray execution commands', async () => {
      const commandDef = {
        name: 'Add Custom Command',
        customizable: true
      }
      
      const params = {
        rawCommand: '+STOTrayExecByTray 3 5'
      }
      
      const result = await service.buildParameterizedCommand(
        'custom', 
        'add_custom_command', 
        commandDef, 
        params
      )
      
      expect(result.command).toBe('+STOTrayExecByTray 3 5')
      expect(result.type).toBe('custom')
    })
    
    it('should trim whitespace from raw command', async () => {
      const commandDef = {
        name: 'Add Custom Command',
        customizable: true
      }
      
      const params = {
        rawCommand: '  Target_Self  '
      }
      
      const result = await service.buildParameterizedCommand(
        'custom', 
        'add_custom_command', 
        commandDef, 
        params
      )
      
      expect(result.command).toBe('Target_Self')
      expect(result.displayText).toBe('Custom: Target_Self')
    })
    
    it('should throw error for empty command', async () => {
      const commandDef = {
        name: 'Add Custom Command',
        customizable: true
      }
      
      const params = {
        rawCommand: ''
      }
      
      await expect(
        service.buildParameterizedCommand(
          'custom', 
          'add_custom_command', 
          commandDef, 
          params
        )
      ).rejects.toThrow('please_enter_a_raw_command')
    })
    
    it('should throw error for whitespace-only command', async () => {
      const commandDef = {
        name: 'Add Custom Command',
        customizable: true
      }
      
      const params = {
        rawCommand: '   '
      }
      
      await expect(
        service.buildParameterizedCommand(
          'custom', 
          'add_custom_command', 
          commandDef, 
          params
        )
      ).rejects.toThrow('please_enter_a_raw_command')
    })
    
    it('should handle missing rawCommand parameter', async () => {
      const commandDef = {
        name: 'Add Custom Command',
        customizable: true
      }
      
      const params = {} // No rawCommand parameter
      
      await expect(
        service.buildParameterizedCommand(
          'custom', 
          'add_custom_command', 
          commandDef, 
          params
        )
      ).rejects.toThrow('please_enter_a_raw_command')
    })
  })

  describe('integration with existing builders', () => {
    it('should not interfere with existing command builders', async () => {
      // Test that the existing targeting builder still works
      const targetingDef = {
        name: 'Target by Name',
        command: 'Target',
        customizable: true,
        parameters: {
          entityName: {
            type: 'text',
            default: 'EntityName'
          }
        }
      }
      
      const params = {
        entityName: 'TestTarget'
      }
      
      const result = await service.buildParameterizedCommand(
        'targeting', 
        'target', 
        targetingDef, 
        params
      )
      
      expect(result).toEqual({
        command: 'Target "TestTarget"',
        displayText: 'Target: TestTarget',
        type: 'targeting',
        icon: undefined,
        id: expect.stringMatching(/^cmd_/),
        parameters: { entityName: 'TestTarget' }
      })
    })
  })
}) 