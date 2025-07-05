import { describe, it, expect, beforeEach, vi } from 'vitest'
import ParameterCommandService from '../../src/js/components/services/ParameterCommandService.js'
import STOCommandParser from '../../src/js/lib/STOCommandParser.js'
import eventBus from '../../src/js/core/eventBus.js'
import CommandFormatAdapter from '../../src/js/lib/CommandFormatAdapter.js'
import { getParameterDefinition, isEditableSignature } from '../../src/js/lib/CommandSignatureDefinitions.js'

describe('ParameterCommandService Integration with STOCommandParser', () => {
  let service
  let parser

  beforeEach(() => {
    // Clear eventBus listeners
    eventBus.clear()
    
    // Create fresh instances
    parser = new STOCommandParser(eventBus)
    service = new ParameterCommandService({ eventBus })
    service.init()
  })

  describe('CommandFormatAdapter', () => {
    it('should convert STOCommandParser output to legacy format', () => {
      const parsedCommand = {
        command: '+TrayExecByTray 2 5',
        signature: 'TrayExecByTray(tray: number, slot: number)',
        category: 'tray',
        baseCommand: 'TrayExecByTray',
        icon: '⚡',
        parameters: { tray: 2, slot: 5, baseCommand: '+TrayExecByTray' },
        displayText: 'Execute Tray 3 Slot 6',
        id: 'parsed_123_0'
      }

      const legacyCommand = CommandFormatAdapter.newToOld(parsedCommand)

      expect(legacyCommand).toEqual({
        command: '+TrayExecByTray 2 5',
        type: 'tray',
        parameters: { tray: 2, slot: 5, baseCommand: '+TrayExecByTray' },
        signature: 'TrayExecByTray(tray: number, slot: number)',
        baseCommand: 'TrayExecByTray',
        displayText: 'Execute Tray 3 Slot 6',
        icon: '⚡',
        id: 'parsed_123_0'
      })
    })

    it('should detect parameterized commands', () => {
      const trayCommand = { signature: 'TrayExecByTray(tray: number, slot: number)' }
      const staticCommand = { signature: 'StaticCombat()' }
      const unknownCommand = { signature: 'UnknownCommand(command: string)' }

      expect(CommandFormatAdapter.isParameterized(trayCommand)).toBe(true)
      expect(CommandFormatAdapter.isParameterized(staticCommand)).toBe(false)
      expect(CommandFormatAdapter.isParameterized(unknownCommand)).toBe(false)
    })
  })

  describe('Signature-based Command Recognition', () => {
    it('should recognize tray commands', async () => {
      const command = { command: '+TrayExecByTray 2 5', type: 'tray' }
      const definition = await service.findCommandDefinition(command)

      expect(definition).toBeTruthy()
      expect(definition.commandId).toBe('custom_tray')
      expect(definition.name).toBe('Execute Tray Slot')
      expect(definition.signature).toBe('TrayExecByTray(tray: number, slot: number)')
      expect(definition.parameters.tray).toBeDefined()
      expect(definition.parameters.slot).toBeDefined()
    })

    it('should recognize communication commands', async () => {
      const command = { command: 'say "Hello World"', type: 'communication' }
      const definition = await service.findCommandDefinition(command)

      expect(definition).toBeTruthy()
      expect(definition.commandId).toBe('communication')
      expect(definition.name).toBe('Communication Command')
      expect(definition.signature).toBe('Communication(verb: string, message: string)')
      expect(definition.parameters.verb).toBeDefined()
      expect(definition.parameters.message).toBeDefined()
    })

    it('should recognize VFX commands', async () => {
      const command = { command: 'dynFxSetFXExlusionList Fx_Explosion,Fx_Beam', type: 'vfx' }
      const definition = await service.findCommandDefinition(command)

      expect(definition).toBeTruthy()
      expect(definition.commandId).toBe('vfx_exclusion')
      expect(definition.name).toBe('VFX Exclusion List')
      expect(definition.signature).toBe('VFXExclusion(effects: string)')
      expect(definition.parameters.effects).toBeDefined()
    })

    it('should recognize targeting commands', async () => {
      const command = { command: 'Target "Enemy Ship"', type: 'targeting' }
      const definition = await service.findCommandDefinition(command)

      expect(definition).toBeTruthy()
      expect(definition.commandId).toBe('target_entity')
      expect(definition.name).toBe('Target Entity')
      expect(definition.signature).toBe('Target(entityName: string)')
      expect(definition.parameters.entityName).toBeDefined()
    })

    it('should recognize power commands', async () => {
      const command = { command: '+power_exec SomePower', type: 'power' }
      const definition = await service.findCommandDefinition(command)

      expect(definition).toBeTruthy()
      expect(definition.commandId).toBe('power_exec')
      expect(definition.name).toBe('Execute Power')
      expect(definition.signature).toBe('PowerExec(powerName: string)')
      expect(definition.parameters.powerName).toBeDefined()
    })

    it('should return null for non-parameterized commands', async () => {
      const command = { command: 'FireAll', type: 'combat' }
      const definition = await service.findCommandDefinition(command)

      // Static combat commands are not editable (have only hidden parameters)
      expect(definition).toBe(null)
    })

    it('should return null for unknown commands', async () => {
      const command = { command: 'UnknownCommand123', type: 'custom' }
      const definition = await service.findCommandDefinition(command)

      expect(definition).toBe(null)
    })
  })

  describe('Parameter Building Integration', () => {
    it('should build tray commands with extracted parameters', () => {
      const commandDef = {
        commandId: 'custom_tray',
        name: 'Execute Tray Slot',
        icon: '⚡',
        parameters: {
          tray: { type: 'number', default: 0 },
          slot: { type: 'number', default: 0 }
        }
      }
      
      const params = { tray: 2, slot: 5 }
      const result = service.buildParameterizedCommand('tray', 'custom_tray', commandDef, params)

      expect(result).toBeTruthy()
      expect(result.command).toBe('+STOTrayExecByTray 2 5')
      expect(result.text).toBe('Execute Tray 3 Slot 6')
    })

    it('should build communication commands', () => {
      const commandDef = {
        commandId: 'communication',
        name: 'Communication Command',
        icon: '💬',
        parameters: {
          verb: { type: 'select', default: 'say' },
          message: { type: 'text', default: '' }
        }
      }
      
      const params = { verb: 'team', message: 'Attack now!' }
      const result = service.buildParameterizedCommand('communication', 'communication', commandDef, params)

      expect(result).toBeTruthy()
      expect(result.command).toBe('team "Attack now!"')
      expect(result.text).toBe('team: "Attack now!"')
    })

    it('should build VFX commands', () => {
      const commandDef = {
        commandId: 'vfx_exclusion',
        name: 'VFX Exclusion List',
        icon: '✨',
        parameters: {
          effects: { type: 'text', default: '' }
        }
      }
      
      const params = { effects: 'Fx_Explosion,Fx_Beam' }
      const result = service.buildParameterizedCommand('vfx', 'vfx_exclusion', commandDef, params)

      expect(result).toBeTruthy()
      expect(result.command).toBe('dynFxSetFXExlusionList Fx_Explosion,Fx_Beam')
      expect(result.text).toBe('VFX Exclude: Fx_Explosion,Fx_Beam')
    })

    it('should build targeting commands', () => {
      const commandDef = {
        commandId: 'target_entity',
        name: 'Target Entity',
        icon: '🎯',
        parameters: {
          entityName: { type: 'text', default: '' }
        }
      }
      
      const params = { entityName: 'Enemy Ship' }
      const result = service.buildParameterizedCommand('targeting', 'target_entity', commandDef, params)

      expect(result).toBeTruthy()
      expect(result.command).toBe('Target "Enemy Ship"')
      expect(result.text).toBe('Target: Enemy Ship')
    })

    it('should build power commands', () => {
      const commandDef = {
        commandId: 'power_exec',
        name: 'Execute Power',
        icon: '🔋',
        parameters: {
          powerName: { type: 'text', default: '' }
        }
      }
      
      const params = { powerName: 'SomePower' }
      const result = service.buildParameterizedCommand('power', 'power_exec', commandDef, params)

      expect(result).toBeTruthy()
      expect(result.command).toBe('+power_exec SomePower')
      expect(result.text).toBe('Power: SomePower')
    })
  })

  describe('End-to-End Parameter Editing Workflow', () => {
    it('should support complete edit workflow for tray commands', async () => {
      // Step 1: Find command definition (parsing phase)
      const originalCommand = { command: '+TrayExecByTray 1 3', type: 'tray' }
      const definition = await service.findCommandDefinition(originalCommand)
      
      expect(definition).toBeTruthy()
      expect(definition.extractedParameters.tray).toBe(1)
      expect(definition.extractedParameters.slot).toBe(3)

      // Step 2: Edit parameters (user changes values)
      const newParams = { tray: 2, slot: 5 }
      
      // Step 3: Build new command (saving phase)
      const updatedCommand = service.buildParameterizedCommand(
        definition.category, 
        definition.commandId, 
        definition, 
        newParams
      )

      expect(updatedCommand).toBeTruthy()
      expect(updatedCommand.command).toBe('+TrayExecByTray 2 5') // Preserve original format
      expect(updatedCommand.text).toBe('Execute Tray 3 Slot 6')
    })

    it('should support complete edit workflow for communication commands', async () => {
      // Step 1: Parse existing command
      const originalCommand = { command: 'say "Hello"', type: 'communication' }
      const definition = await service.findCommandDefinition(originalCommand)
      
      expect(definition).toBeTruthy()
      expect(definition.extractedParameters.verb).toBe('say')
      expect(definition.extractedParameters.message).toBe('Hello')

      // Step 2: Edit parameters
      const newParams = { verb: 'team', message: 'Ready for battle!' }
      
      // Step 3: Build new command
      const updatedCommand = service.buildParameterizedCommand(
        definition.category, 
        definition.commandId, 
        definition, 
        newParams
      )

      expect(updatedCommand).toBeTruthy()
      expect(updatedCommand.command).toBe('team "Ready for battle!"')
      expect(updatedCommand.text).toBe('team: "Ready for battle!"')
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid commands gracefully', async () => {
      const invalidCommand = { command: '', type: '' }
      const definition = await service.findCommandDefinition(invalidCommand)
      
      expect(definition).toBe(null)
    })

    it('should handle null/undefined commands', async () => {
      expect(await service.findCommandDefinition(null)).toBe(null)
      expect(await service.findCommandDefinition(undefined)).toBe(null)
    })

    it('should handle parser errors gracefully', async () => {
      // Mock parser to throw error
      const originalRequest = eventBus.listeners.get('rpc:parser:parse-command-string')
      eventBus.listeners.set('rpc:parser:parse-command-string', new Set([
        () => { throw new Error('Parser error') }
      ]))

      const command = { command: 'test', type: 'test' }
      const definition = await service.findCommandDefinition(command)
      
      expect(definition).toBe(null)

      // Restore original
      if (originalRequest) {
        eventBus.listeners.set('rpc:parser:parse-command-string', originalRequest)
      }
    })
  })

  describe('Signature Definitions Library', () => {
    it('should provide parameter definitions for all supported signatures', () => {
      const trayDef = getParameterDefinition('TrayExecByTray(tray: number, slot: number)')
      expect(trayDef).toBeTruthy()
      expect(trayDef.commandId).toBe('custom_tray')

      const commDef = getParameterDefinition('Communication(verb: string, message: string)')
      expect(commDef).toBeTruthy()
      expect(commDef.commandId).toBe('communication')

      const vfxDef = getParameterDefinition('VFXExclusion(effects: string)')
      expect(vfxDef).toBeTruthy()
      expect(vfxDef.commandId).toBe('vfx_exclusion')
    })

    it('should correctly identify editable signatures', () => {
      expect(isEditableSignature('TrayExecByTray(tray: number, slot: number)')).toBe(true)
      expect(isEditableSignature('Communication(verb: string, message: string)')).toBe(true)
      expect(isEditableSignature('StaticCombat()')).toBe(false) // Only hidden parameters
      expect(isEditableSignature('UnknownCommand(command: string)')).toBe(false)
      expect(isEditableSignature('NonExistentSignature()')).toBe(false)
    })
  })
}) 