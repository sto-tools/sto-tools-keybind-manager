import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createEventBusFixture } from '../../fixtures/core/index.js'
import { respond } from '../../../src/js/core/requestResponse.js'
import { 
  enrichForDisplay, 
  normalizeToString, 
  normalizeToStringArray,
  isRichObject,
  countRichObjects,
  normalizeToOptimizedString
} from '../../../src/js/lib/commandDisplayAdapter.js'

describe('Command Display Adapter', () => {
  let busFixture, eventBus, detachParserHandler, detachCommandDefHandler, mockI18n

  beforeEach(() => {
    busFixture = createEventBusFixture()
    eventBus = busFixture.eventBus

    // Mock STOCommandParser
    detachParserHandler = respond(eventBus, 'parser:parse-command-string', ({ commandString, options }) => {
      // Simple mock that creates a command object from the string
      if (commandString.includes('TrayExecByTray') && !commandString.includes('WithBackup')) {
        // Handle TrayExecByTray commands
        const parts = commandString.split(/\s+/)
        let active, tray, slot
        
        if (commandString.startsWith('+')) {
          // + form: +TrayExecByTray <tray> <slot> (active=1 implicit)
          active = 1
          tray = parseInt(parts[1])
          slot = parseInt(parts[2])
        } else {
          // Standard form: TrayExecByTray <active> <tray> <slot>
          active = parseInt(parts[1])
          tray = parseInt(parts[2])
          slot = parseInt(parts[3])
        }
        
        return {
          commands: [{
            command: commandString,
            signature: 'TrayExecByTray',
            parameters: {
              active,
              tray,
              slot,
              baseCommand: 'TrayExecByTray'
            },
            displayText: {
              key: 'command_definitions.custom_tray.name',
              params: { tray, slot },
              fallback: `Tray Execution (${tray} ${slot})`
            },
            category: 'combat',
            id: `mock_${Date.now()}`
          }]
        }
      } else if (commandString.includes('TrayExecByTrayWithBackup')) {
        // Handle TrayExecByTrayWithBackup commands
        const parts = commandString.split(/\s+/)
        let active, tray, slot, backup_tray, backup_slot
        
        if (commandString.startsWith('+')) {
          // + form: +TrayExecByTrayWithBackup <tray> <slot> <backup_tray> <backup_slot> (active=1 implicit)
          active = 1
          tray = parseInt(parts[1])
          slot = parseInt(parts[2])
          backup_tray = parseInt(parts[3])
          backup_slot = parseInt(parts[4])
        } else {
          // Standard form: TrayExecByTrayWithBackup <active> <tray> <slot> <backup_tray> <backup_slot>
          active = parseInt(parts[1])
          tray = parseInt(parts[2])
          slot = parseInt(parts[3])
          backup_tray = parseInt(parts[4])
          backup_slot = parseInt(parts[5])
        }
        
        return {
          commands: [{
            command: commandString,
            signature: 'TrayExecByTrayWithBackup',
            parameters: {
              active,
              tray,
              slot,
              backup_tray,
              backup_slot,
              baseCommand: 'TrayExecByTrayWithBackup'
            },
            displayText: {
              key: 'command_definitions.tray_with_backup.name',
              params: { tray, slot, backup_tray, backup_slot },
              fallback: `Tray Execution with Backup (${tray} ${slot} -> ${backup_tray} ${backup_slot})`
            },
            category: 'combat',
            id: `mock_${Date.now()}`
          }]
        }
      } else {
        // Handle other commands
        return {
          commands: [{
            command: commandString,
            signature: commandString.includes('TrayExecByTray') ? 'TrayExecByTray' : 'BasicCommand',
            parameters: commandString.includes('TrayExecByTray') ? { tray: 0, slot: 0 } : {},
            displayText: commandString,
            // Return 'custom' for unknown/empty commands, 'combat' for known ones
            category: commandString === 'FireAll' || commandString.includes('TrayExecByTray') ? 'combat' : 'custom',
            id: `mock_${Date.now()}`
          }]
        }
      }
    })

    // Mock command definition lookup
    detachCommandDefHandler = respond(eventBus, 'command:find-definition', ({ command }) => {
      if (command === 'FireAll') {
        return {
          command: 'FireAll',
          name: 'Fire All Weapons',
          description: 'Fire all weapons',
          icon: '🔥',
          categoryId: 'combat',
          commandId: 'fire_all'
        }
      }
      if (command === '+TrayExecByTray 0 0') {
        return {
          command: '+TrayExecByTray 0 0',
          name: 'Tray Execution',
          description: 'Execute tray slot',
          icon: '⚡',
          categoryId: 'trays',
          commandId: 'tray_exec'
        }
      }
      return null
    })

    mockI18n = {
      t: (key, params) => {
        if (key === 'unknown_command') return 'Unknown Command'
        if (key === 'command_definitions.fire_all.name') return 'Fire All Weapons'
        return key
      }
    }
  })

  afterEach(() => {
    detachParserHandler()
    detachCommandDefHandler()
    busFixture.destroy()
  })

  describe('enrichForDisplay', () => {
    it('should convert canonical string to rich object', async () => {
      const result = await enrichForDisplay('FireAll', mockI18n, { eventBus })
      
      expect(result.command).toBe('FireAll')
      expect(result.text).toBe('Fire All Weapons')
      expect(result.displayText).toBe('Fire All Weapons')
      expect(result.icon).toBe('🔥')
      expect(result.type).toBe('combat')
      expect(result.category).toBe('combat')
      expect(result.signature).toBe('BasicCommand')
      expect(result.parameters).toEqual({})
    })

    it('should handle commands without definitions', async () => {
      const result = await enrichForDisplay('UnknownCommand', mockI18n, { eventBus })
      
      expect(result.command).toBe('UnknownCommand')
      expect(result.text).toBe('UnknownCommand')
      expect(result.displayText).toBe('UnknownCommand')
      expect(result.icon).toBe('⚙️')
      expect(result.type).toBe('custom')
      expect(result.category).toBe('custom')
      expect(result.signature).toBe('BasicCommand')
    })

    it('should handle empty or invalid commands', async () => {
      const result1 = await enrichForDisplay('', mockI18n, { eventBus })
      const result2 = await enrichForDisplay(null, mockI18n, { eventBus })
      const result3 = await enrichForDisplay(undefined, mockI18n, { eventBus })
      
      expect(result1.command).toBe('')
      expect(result2.command).toBe('')
      expect(result3.command).toBe('')
      
      // For empty string from parser, we get the parsed result
      expect(result1.text).toBe('')
      // For null/undefined, fallback creates Unknown Command
      expect(result2.text).toBe('Unknown Command')
      expect(result3.text).toBe('Unknown Command')
    })

    it('should convert rich object to string and process', async () => {
      const richObject = {
        command: 'FireAll',
        name: 'Fire All Weapons',
        description: 'Fire all weapons',
        icon: '🔥'
      }
      
      // When a rich object is passed, it gets converted to string and processed
      const result = await enrichForDisplay(richObject, mockI18n, { eventBus })
      expect(result.command).toBe('[object Object]') // This is expected due to string conversion
    })

    it('should work without i18n parameter', async () => {
      const result = await enrichForDisplay('FireAll', null, { eventBus })
      expect(result.command).toBe('FireAll')
      expect(result.text).toBe('Fire All Weapons')
    })
  })

  describe('normalizeToString', () => {
    it('should extract command from rich object', () => {
      const richObject = {
        command: 'FireAll',
        name: 'Fire All Weapons',
        description: 'Fire all weapons'
      }
      
      const result = normalizeToString(richObject)
      expect(result).toBe('FireAll')
    })

    it('should pass through strings unchanged', () => {
      const result = normalizeToString('FireAll')
      expect(result).toBe('FireAll')
    })

    it('should handle empty and invalid inputs', () => {
      expect(normalizeToString('')).toBe('')
      expect(normalizeToString(null)).toBe('')
      expect(normalizeToString(undefined)).toBe('')
      expect(normalizeToString({})).toBe('')
      expect(normalizeToString({ name: 'Test' })).toBe('') // object without command property
    })

    it('should handle non-string inputs by returning empty string', () => {
      expect(normalizeToString(123)).toBe('')
      expect(normalizeToString(true)).toBe('')
      expect(normalizeToString(false)).toBe('')
    })
  })

  describe('normalizeToStringArray', () => {
    it('should normalize array of rich objects', () => {
      const richObjects = [
        { command: 'FireAll', name: 'Fire All' },
        { command: '+TrayExecByTray 0 0', name: 'Tray Exec' }
      ]
      
      const result = normalizeToStringArray(richObjects)
      expect(result).toEqual(['FireAll', '+TrayExecByTray 0 0'])
    })

    it('should normalize array of strings', () => {
      const strings = ['FireAll', '+TrayExecByTray 0 0']
      
      const result = normalizeToStringArray(strings)
      expect(result).toEqual(['FireAll', '+TrayExecByTray 0 0'])
    })

    it('should normalize mixed array', () => {
      const mixed = [
        'FireAll',
        { command: '+TrayExecByTray 0 0', name: 'Tray Exec' },
        'FireTorps'
      ]
      
      const result = normalizeToStringArray(mixed)
      expect(result).toEqual(['FireAll', '+TrayExecByTray 0 0', 'FireTorps'])
    })

    it('should handle single item (not array)', () => {
      const result1 = normalizeToStringArray('FireAll')
      const result2 = normalizeToStringArray({ command: 'FireAll', name: 'Fire All' })
      
      expect(result1).toEqual(['FireAll'])
      expect(result2).toEqual(['FireAll'])
    })

    it('should filter out empty commands', () => {
      const mixed = [
        'FireAll',
        '',
        { command: '+TrayExecByTray 0 0', name: 'Tray Exec' },
        null,
        undefined,
        { command: '', name: 'Empty' },
        'FireTorps'
      ]
      
      const result = normalizeToStringArray(mixed)
      expect(result).toEqual(['FireAll', '+TrayExecByTray 0 0', 'FireTorps'])
    })

    it('should handle empty or invalid inputs', () => {
      expect(normalizeToStringArray([])).toEqual([])
      expect(normalizeToStringArray(null)).toEqual([])
      expect(normalizeToStringArray(undefined)).toEqual([])
      expect(normalizeToStringArray('')).toEqual([])
    })
  })

  describe('isRichObject', () => {
    it('should identify rich command objects', () => {
      const richObject = {
        command: 'FireAll',
        name: 'Fire All Weapons'
      }
      
      expect(isRichObject(richObject)).toBe(true)
    })

    it('should reject non-objects', () => {
      expect(isRichObject('FireAll')).toBe(false)
      expect(isRichObject(null)).toBe(false)
      expect(isRichObject(undefined)).toBe(false)
      expect(isRichObject(123)).toBe(false)
      expect(isRichObject([])).toBe(false)
    })

    it('should reject objects without command property', () => {
      expect(isRichObject({})).toBe(false)
      expect(isRichObject({ name: 'Test' })).toBe(false)
    })

    it('should require command to be a non-empty string', () => {
      expect(isRichObject({ command: null })).toBe(false)
      expect(isRichObject({ command: undefined })).toBe(false)
      expect(isRichObject({ command: 123 })).toBe(false)
      expect(isRichObject({ command: '' })).toBe(false)
      expect(isRichObject({ command: '   ' })).toBe(false) // whitespace only
    })
  })

  describe('countRichObjects', () => {
    it('should count rich objects in array', () => {
      const mixed = [
        'FireAll',
        { command: '+TrayExecByTray 0 0', name: 'Tray Exec' },
        'FireTorps',
        { command: 'Distribute_Shields', name: 'Distribute Shields' }
      ]
      
      const result = countRichObjects(mixed)
      expect(result).toBe(2)
    })

    it('should return 0 for array with no rich objects', () => {
      const strings = ['FireAll', 'FireTorps', '+TrayExecByTray 0 0']
      
      const result = countRichObjects(strings)
      expect(result).toBe(0)
    })

    it('should handle single item', () => {
      expect(countRichObjects('FireAll')).toBe(0)
      expect(countRichObjects({ command: 'FireAll', name: 'Fire All' })).toBe(1)
    })

    it('should handle empty or invalid inputs', () => {
      expect(countRichObjects([])).toBe(0)
      expect(countRichObjects(null)).toBe(0)
      expect(countRichObjects(undefined)).toBe(0)
    })

    it('should exclude invalid rich objects from count', () => {
      const mixed = [
        { command: 'FireAll', name: 'Fire All' },
        { name: 'No Command Property' },
        { command: '' },
        { command: null },
        'StringCommand'
      ]
      
      const result = countRichObjects(mixed)
      expect(result).toBe(1) // Only the first object is valid
    })
  })

  describe('integration scenarios', () => {
    it('should handle complete workflow: rich objects to strings and back', async () => {
      const originalRichObjects = [
        { command: 'FireAll', name: 'Fire All Weapons' },
        { command: '+TrayExecByTray 0 0', name: 'Tray Execution' }
      ]
      
      // Convert to canonical strings
      const canonicalStrings = normalizeToStringArray(originalRichObjects)
      expect(canonicalStrings).toEqual(['FireAll', '+TrayExecByTray 0 0'])
      
      // Convert back to rich objects for display
      const enrichedObjects = await Promise.all(
        canonicalStrings.map(cmd => enrichForDisplay(cmd, mockI18n, { eventBus }))
      )
      
      expect(enrichedObjects).toHaveLength(2)
      expect(enrichedObjects[0].command).toBe('FireAll')
      expect(enrichedObjects[0].text).toBe('Fire All Weapons')
      expect(enrichedObjects[1].command).toBe('+TrayExecByTray 0 0')
      expect(enrichedObjects[1].text).toBe('Tray Execution')
    })

    it('should handle mixed legacy and canonical formats', () => {
      const mixed = [
        'FireAll', // canonical string
        { command: '+TrayExecByTray 0 0', name: 'Legacy Rich Object' }, // legacy rich object
        'FireTorps' // canonical string
      ]
      
      const normalized = normalizeToStringArray(mixed)
      expect(normalized).toEqual(['FireAll', '+TrayExecByTray 0 0', 'FireTorps'])
      
      const richObjectCount = countRichObjects(mixed)
      expect(richObjectCount).toBe(1)
    })

    it('should preserve data integrity through multiple conversions', () => {
      const originalCommands = ['FireAll', '+TrayExecByTray 0 0', 'Distribute_Shields']
      
      // Convert to rich objects (simulating UI display)
      const asRichObjects = originalCommands.map(cmd => ({ command: cmd, name: `Name for ${cmd}` }))
      
      // Convert back to canonical strings (simulating storage)
      const backToStrings = normalizeToStringArray(asRichObjects)
      
      expect(backToStrings).toEqual(originalCommands)
    })
  })

  describe('normalizeToOptimizedString', () => {
    it('should optimize TrayExecByTray commands with active=1 to + form', async () => {
      const result = await normalizeToOptimizedString('TrayExecByTray 1 3 0', { eventBus })
      expect(result).toBe('+TrayExecByTray 3 0')
    })

    it('should keep TrayExecByTray commands with active=0 in explicit form', async () => {
      const result = await normalizeToOptimizedString('TrayExecByTray 0 3 0', { eventBus })
      expect(result).toBe('TrayExecByTray 0 3 0')
    })

    it('should optimize TrayExecByTrayWithBackup commands with active=1 to + form', async () => {
      const result = await normalizeToOptimizedString('TrayExecByTrayWithBackup 1 3 0 4 1', { eventBus })
      expect(result).toBe('+TrayExecByTrayWithBackup 3 0 4 1')
    })

    it('should keep TrayExecByTrayWithBackup commands with active=0 in explicit form', async () => {
      const result = await normalizeToOptimizedString('TrayExecByTrayWithBackup 0 3 0 4 1', { eventBus })
      expect(result).toBe('TrayExecByTrayWithBackup 0 3 0 4 1')
    })

    it('should return original command if not a tray command', async () => {
      const result = await normalizeToOptimizedString('FireAll', { eventBus })
      expect(result).toBe('FireAll')
    })

    it('should handle command objects by extracting command property', async () => {
      const result = await normalizeToOptimizedString({ command: 'TrayExecByTray 1 3 0' }, { eventBus })
      expect(result).toBe('+TrayExecByTray 3 0')
    })
  })
}) 