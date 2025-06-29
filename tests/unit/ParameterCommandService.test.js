import { describe, it, expect, beforeEach, vi } from 'vitest'
import ParameterCommandService from '../../src/js/components/services/ParameterCommandService.js'
import eventBus from '../../src/js/core/eventBus.js'
import { request } from '../../src/js/core/requestResponse.js'

// Mock the request function for event bus communications
vi.mock('../../src/js/core/requestResponse.js', () => ({
  request: vi.fn()
}))

describe('ParameterCommandService', () => {
  let service

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ParameterCommandService({ eventBus })
    service.init()
    
    // Setup default mock for parser requests
    request.mockImplementation((bus, event, data) => {
      if (event === 'parser:parse-command-string') {
        // Return mock parsed command
        return Promise.resolve({
          commands: [{
            command: data.commandString,
            category: 'tray',
            displayText: data.commandString,
            id: 'parsed_test_id',
            parameters: {}
          }]
        })
      }
      return Promise.resolve({})
    })
  })

  describe('currentParameterCommand property access', () => {
    it('should not throw error when currentParameterCommand is undefined', async () => {
      // Ensure currentParameterCommand is undefined
      service.currentParameterCommand = undefined
      
      // This should not throw an error even when currentParameterCommand is undefined
      const result = await service.buildParameterizedCommand('tray', 'custom_tray', 
        { icon: 'test', name: 'Test Command' }, 
        { tray: 0, slot: 0 }
      )
      
      expect(result).toBeDefined()
      expect(result.command).toContain('TrayExecByTray')
    })

    it('should handle undefined getCurrentProfile gracefully', async () => {
      // Set up editing mode but with undefined getCurrentProfile
      service.currentParameterCommand = {
        isEditing: true,
        editIndex: 0
      }
      service.selectedKey = 'testKey'
      service.getCurrentProfile = undefined // This should not cause an error
      
      const result = await service.buildParameterizedCommand('tray', 'custom_tray', 
        { icon: 'test', name: 'Test Command' }, 
        { tray: 1, slot: 2 }
      )
      
      expect(result).toBeDefined()
      expect(result.command).toBe('+STOTrayExecByTray 1 2')
    })

    it('should handle missing currentParameterCommand properties gracefully', async () => {
      // Set up a currentParameterCommand without editIndex
      service.currentParameterCommand = {
        isEditing: true
        // editIndex is missing - this should not cause an error
      }
      service.selectedKey = 'testKey'
      service.getCurrentProfile = vi.fn(() => ({
        keys: { 'testKey': [{ command: '+TrayExecByTray 0 0', type: 'tray' }] }
      }))
      
      const result = await service.buildParameterizedCommand('tray', 'custom_tray', 
        { icon: 'test', name: 'Test Command' }, 
        { tray: 1, slot: 2 }
      )
      
      expect(result).toBeDefined()
      // Should fallback to normal behavior when editIndex is undefined
      expect(result.command).toBe('+STOTrayExecByTray 1 2')
    })

    it('should handle editing mode when currentParameterCommand is properly set', async () => {
      // Set up the service state to simulate editing mode using events
      service.selectedKey = 'testKey'
      
      // Emit parameter editing start event with existing command
      eventBus.emit('parameter-edit:start', {
        index: 0,
        key: 'testKey',
        command: { command: '+TrayExecByTray 0 0', type: 'tray' },
        commandDef: { icon: 'test', name: 'Test Command' }
      })
      
      const result = await service.buildParameterizedCommand('tray', 'custom_tray', 
        { icon: 'test', name: 'Test Command' }, 
        { tray: 1, slot: 2 }
      )
      
      expect(result).toBeDefined()
      expect(result.command).toBe('+TrayExecByTray 1 2')
    })
  })

  describe('active parameter handling consistency', () => {
    const commandDef = { icon: 'test', name: 'Test Command' }

    it('tray_with_backup should preserve falsy active values', async () => {
      // Test with active = 0 (falsy but valid)
      let result = await service.buildParameterizedCommand('tray', 'tray_with_backup', commandDef, {
        active: 0,
        tray: 1,
        slot: 2,
        backup_tray: 3,
        backup_slot: 4
      })
      
      expect(result.command).toBe('TrayExecByTrayWithBackup 0 1 2 3 4')
      
      // Test with active = false (falsy but should be preserved)
      result = await service.buildParameterizedCommand('tray', 'tray_with_backup', commandDef, {
        active: false,
        tray: 1,
        slot: 2,
        backup_tray: 3,
        backup_slot: 4
      })
      
      expect(result.command).toBe('TrayExecByTrayWithBackup false 1 2 3 4')
    })

    it('tray_range_with_backup should preserve falsy active values correctly', async () => {
      // Mock the parser to return multiple commands for the range
      request.mockImplementation((bus, event, data) => {
        if (event === 'parser:parse-command-string') {
          return Promise.resolve({
            commands: [{
              command: data.commandString,
              category: 'tray',
              displayText: data.commandString,
              id: 'parsed_test_id',
              parameters: {}
            }]
          })
        }
        return Promise.resolve({})
      })
      
      // Test with active = 0 (should preserve the 0 value)
      const result = await service.buildParameterizedCommand('tray', 'tray_range_with_backup', commandDef, {
        active: 0,
        start_tray: 1,
        start_slot: 2,
        end_tray: 1,
        end_slot: 3,
        backup_start_tray: 3,
        backup_start_slot: 4,
        backup_end_tray: 3,
        backup_end_slot: 5
      })
      
      expect(Array.isArray(result)).toBe(true)
      // Should generate multiple commands for the range
      expect(result.length).toBeGreaterThan(0)
    })

    it('whole_tray_with_backup should preserve falsy active values correctly', async () => {
      // Mock the parser to return multiple commands for whole tray
      request.mockImplementation((bus, event, data) => {
        if (event === 'parser:parse-command-string') {
          return Promise.resolve({
            commands: [{
              command: data.commandString,
              category: 'tray',
              displayText: data.commandString,
              id: 'parsed_test_id',
              parameters: {}
            }]
          })
        }
        return Promise.resolve({})
      })
      
      // Test with active = 0 (should preserve the 0 value)
      const result = await service.buildParameterizedCommand('tray', 'whole_tray_with_backup', commandDef, {
        active: 0,
        tray: 1,
        backup_tray: 2
      })
      
      expect(Array.isArray(result)).toBe(true)
      // Should generate 10 commands for whole tray (slots 0-9)
      expect(result.length).toBe(10)
    })

    it('should handle undefined active parameter by defaulting to 1', async () => {
      // All three commands should default to 1 when active is undefined
      const testCases = [
        'tray_with_backup',
        'tray_range_with_backup', 
        'whole_tray_with_backup'
      ]
      
      for (const commandId of testCases) {
        if (commandId === 'tray_with_backup') {
          const result = await service.buildParameterizedCommand('tray', commandId, commandDef, {
            tray: 1,
            slot: 2,
            backup_tray: 3,
            backup_slot: 4
          })
          expect(result.command).toBe('TrayExecByTrayWithBackup 1 1 2 3 4')
        } else {
          // Mock parser for bulk commands
          request.mockImplementation((bus, event, data) => {
            if (event === 'parser:parse-command-string') {
              return Promise.resolve({
                commands: [{
                  command: data.commandString,
                  category: 'tray',
                  displayText: data.commandString,
                  id: 'parsed_test_id',
                  parameters: { active: 1 } // Mock active parameter
                }]
              })
            }
            return Promise.resolve({})
          })
          
          const params = commandId === 'tray_range_with_backup' ? {
            start_tray: 1, start_slot: 0, end_tray: 1, end_slot: 1,
            backup_start_tray: 2, backup_start_slot: 0, backup_end_tray: 2, backup_end_slot: 1
          } : {
            tray: 1, backup_tray: 2
          }
          
          const result = await service.buildParameterizedCommand('tray', commandId, commandDef, params)
          expect(Array.isArray(result)).toBe(true)
          expect(result.length).toBeGreaterThan(0)
        }
      }
    })
  })

  describe('broadcast/cache pattern', () => {
    it('should provide generateCommandId functionality', () => {
      const id = service.generateCommandId()
      
      expect(id).toMatch(/^cmd_\d+_[a-z0-9]+$/)
    })

    it('should cache and provide current environment state', () => {
      service.currentEnvironment = 'ground'
      
      expect(service.currentEnvironment).toBe('ground')
    })

    it('should cache and provide selected key state', () => {
      service.selectedKey = 'testKey'
      
      expect(service.selectedKey).toBe('testKey')
    })

    it('should cache and provide selected alias state', () => {
      service.selectedAlias = 'testAlias'
      
      expect(service.selectedAlias).toBe('testAlias')
    })

    it('should provide current state for late-join sync', () => {
      service.selectedKey = 'F1'
      service.selectedAlias = null
      service.currentEnvironment = 'space'
      
      const state = service.getCurrentState()
      
      expect(state).toEqual({
        selectedKey: 'F1',
        selectedAlias: null,
        currentEnvironment: 'space',
        editingContext: null
      })
    })

    it('should handle initial state from other components', () => {
      service.handleInitialState('TestService', {
        selectedKey: 'F2',
        selectedAlias: 'TestAlias',
        currentEnvironment: 'ground'
      })
      
      expect(service.selectedKey).toBe('F2')
      expect(service.selectedAlias).toBe('TestAlias')
      expect(service.currentEnvironment).toBe('ground')
    })
  })

  describe('event listening', () => {
    it('should update selectedKey when key-selected event is emitted', () => {
      eventBus.emit('key-selected', { key: 'newKey' })
      expect(service.selectedKey).toBe('newKey')
      expect(service.selectedAlias).toBeNull()
    })

    it('should update selectedAlias when alias-selected event is emitted', () => {
      eventBus.emit('alias-selected', { name: 'newAlias' })
      expect(service.selectedAlias).toBe('newAlias')
      expect(service.selectedKey).toBeNull()
    })

    it('should update currentEnvironment when environment:changed event is emitted', () => {
      eventBus.emit('environment:changed', { environment: 'ground' })
      expect(service.currentEnvironment).toBe('ground')
      
      // Test string format as well
      eventBus.emit('environment:changed', 'space')
      expect(service.currentEnvironment).toBe('space')
    })

    it('should handle parameter editing events correctly', () => {
      const editData = {
        index: 1,
        key: 'F2',
        command: { command: '+TrayExecByTray 2 3', type: 'tray' },
        commandDef: { icon: 'test', name: 'Test Tray Command' }
      }

      // Start editing
      eventBus.emit('parameter-edit:start', editData)
      
      expect(service.editingContext).toEqual({
        isEditing: true,
        editIndex: 1,
        selectedKey: 'F2',
        existingCommand: editData.command
      })

      // End editing
      eventBus.emit('parameter-edit:end')
      expect(service.editingContext).toBeNull()
    })
  })

  /* ------------------------------------------------------------
   * Regression – Communication commands should retain verb
   * ---------------------------------------------------------- */

  describe('communication builder verb retention', () => {
    it('should default to command definition verb when verb param is missing', async () => {
      const svc = new ParameterCommandService({ eventBus })
      svc.init()

      const commDef = { name: 'Team Message', command: 'team', icon: '💬' }
      const params  = { message: 'Attack now!' } // no verb provided

      const result = await svc.buildParameterizedCommand('communication', 'team_message', commDef, params)

      expect(result.command).toBe('team "Attack now!"')
    })
  })
}) 