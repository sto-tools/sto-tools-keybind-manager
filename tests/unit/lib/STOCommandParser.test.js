import { describe, it, expect, beforeEach, vi } from 'vitest'
import STOCommandParser from '../../../src/js/lib/STOCommandParser.js'
import eventBus from '../../../src/js/core/eventBus.js'
import { request } from '../../../src/js/core/requestResponse.js'

describe('STOCommandParser - Function Signature Based Parsing', () => {
  let parser

  beforeEach(() => {
    parser = new STOCommandParser(null, {
      enableCache: true,
      enablePerformanceMetrics: true,
      hotPathThreshold: 3
    })
  })

  describe('Input Validation', () => {
    it('should handle TrayExec shorthand commands with invalid numeric parameters gracefully', () => {
      const invalidCommands = [
        '+TrayExecByTray abc 1',
        '+TrayExecByTray 1 def',
        '+TrayExecByTray abc def',
        '+TrayExecByTray 1.2.3 4',
        '+TrayExecByTray 1 2.3.4',
        '+TrayExecByTray "" 1',
        '+TrayExecByTray 1 ""',
        '+TrayExecByTray null 1',
        '+TrayExecByTray 1 undefined'
      ]

      invalidCommands.forEach(command => {
        const result = parser.parseCommandString(command)
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0].category).toBe('custom')
        expect(result.commands[0].signature).toBe('UnknownCommand(command: string)')
      })
    })

    it('should handle TrayExec standard commands with invalid numeric parameters gracefully', () => {
      const invalidCommands = [
        'TrayExecByTray abc 1 2',
        'TrayExecByTray 1 def 3',
        'TrayExecByTray 1 2 abc',
        'TrayExecByTray 1.2.3 4 5',
        'TrayExecByTray 1 2.3.4 6',
        'TrayExecByTray 1 2 3.4.5'
      ]

      invalidCommands.forEach(command => {
        const result = parser.parseCommandString(command)
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0].category).toBe('custom')
        expect(result.commands[0].signature).toBe('UnknownCommand(command: string)')
      })
    })

    it('should handle TrayExecWithBackup shorthand commands with invalid numeric parameters gracefully', () => {
      const invalidCommands = [
        '+TrayExecByTrayWithBackup abc 1 2 3',
        '+TrayExecByTrayWithBackup 1 def 3 4',
        '+TrayExecByTrayWithBackup 1 2 abc 4',
        '+TrayExecByTrayWithBackup 1 2 3 abc',
        '+TrayExecByTrayWithBackup 1.2.3 4 5 6',
        '+TrayExecByTrayWithBackup 1 2.3.4 5 6',
        '+TrayExecByTrayWithBackup 1 2 3.4.5 6',
        '+TrayExecByTrayWithBackup 1 2 3 4.5.6'
      ]

      invalidCommands.forEach(command => {
        const result = parser.parseCommandString(command)
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0].category).toBe('custom')
        expect(result.commands[0].signature).toBe('UnknownCommand(command: string)')
      })
    })

    it('should handle TrayExecWithBackup standard commands with invalid numeric parameters gracefully', () => {
      const invalidCommands = [
        'TrayExecByTrayWithBackup abc 1 2 3 4',
        'TrayExecByTrayWithBackup 1 def 3 4 5',
        'TrayExecByTrayWithBackup 1 2 abc 4 5',
        'TrayExecByTrayWithBackup 1 2 3 abc 5',
        'TrayExecByTrayWithBackup 1 2 3 4 abc',
        'TrayExecByTrayWithBackup 1.2.3 4 5 6 7'
      ]

      invalidCommands.forEach(command => {
        const result = parser.parseCommandString(command)
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0].category).toBe('custom')
        expect(result.commands[0].signature).toBe('UnknownCommand(command: string)')
      })
    })

    it('should accept valid numeric parameters in TrayExec commands', () => {
      const validCommands = [
        '+TrayExecByTray 0 0',
        '+TrayExecByTray 1 2',
        '+TrayExecByTray 10 20',
        '+TrayExecByTray 001 002',
        'TrayExecByTray 0 0 0',
        'TrayExecByTray 1 2 3',
        'TrayExecByTray 1 10 20'
      ]

      validCommands.forEach(command => {
        const result = parser.parseCommandString(command)
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0].category).toBe('tray')
        expect(result.commands[0].signature).toContain('TrayExecByTray')
      })
    })

    it('should accept valid numeric parameters in TrayExecWithBackup commands', () => {
      const validCommands = [
        '+TrayExecByTrayWithBackup 0 0 1 1',
        '+TrayExecByTrayWithBackup 1 2 3 4',
        'TrayExecByTrayWithBackup 1 0 0 1 1',
        'TrayExecByTrayWithBackup 0 1 2 3 4'
      ]

      validCommands.forEach(command => {
        const result = parser.parseCommandString(command)
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0].category).toBe('tray')
        expect(result.commands[0].signature).toContain('TrayExecByTrayWithBackup')
      })
    })
  })

  describe('High-Frequency TrayExec Commands', () => {
    it('should parse TrayExecByTray with highest priority', () => {
      const result = parser.parseCommandString('+STOTrayExecByTray 2 5')

      expect(result.commands).toHaveLength(1)
      expect(result.commands[0]).toMatchObject({
        command: '+STOTrayExecByTray 2 5',
        signature: 'TrayExecByTray(active: number, tray: number, slot: number)',
        category: 'tray',
        icon: '⚡',
        parameters: {
          active: 1,
          tray: 2,
          slot: 5,
          baseCommand: '+STOTrayExecByTray'
        }
      })
    })

    it('should handle TrayExec variants correctly', () => {
      const testCases = [
        { command: 'TrayExecByTray 1 0 0', expectedWeight: 99 }, // standard form
        { command: '+TrayExecByTray 1 2', expectedWeight: 100 }, // + form
        { command: 'STOTrayExecByTray 0 3 7', expectedWeight: 99 }, // standard form
        { command: '+STOTrayExecByTray 4 9', expectedWeight: 100 } // + form
      ]

      testCases.forEach(({ command, expectedWeight }) => {
        const result = parser.parseCommandString(command)
        expect(result.commands[0].category).toBe('tray')
        expect(result.commands[0].signature).toBe('TrayExecByTray(active: number, tray: number, slot: number)')
        expect(result.commands[0].parseMetadata.patternWeight).toBe(expectedWeight)
      })
    })

    it('should parse TrayExecByTrayWithBackup', () => {
      const result = parser.parseCommandString('TrayExecByTrayWithBackup 1 2 3 4 5')

      expect(result.commands[0]).toMatchObject({
        signature: 'TrayExecByTrayWithBackup(active: number, tray: number, slot: number, backup_tray: number, backup_slot: number)',
        category: 'tray',
        parameters: {
          active: 1,
          tray: 2,
          slot: 3,
          backup_tray: 4,
          backup_slot: 5
        }
      })
    })
  })

  describe('Communication Commands', () => {
    it('should parse quoted communication commands', () => {
      const result = parser.parseCommandString('say "Hello World"')

      expect(result.commands[0]).toMatchObject({
        signature: 'Communication(verb: string, message: string)',
        category: 'communication',
        icon: '💬',
        parameters: {
          verb: 'say',
          message: 'Hello World'
        },
        displayText: 'say: "Hello World"'
      })
    })

    it('should parse unquoted communication commands with lower priority', () => {
      const result = parser.parseCommandString('team Attack now!')

      expect(result.commands[0]).toMatchObject({
        signature: 'Communication(verb: string, message: string)',
        category: 'communication',
        parameters: {
          verb: 'team',
          message: 'Attack now!'
        },
        displayText: 'team: Attack now!'
      })
    })
  })

  describe('Static Combat Commands', () => {
    it('should parse static combat commands', () => {
      const commands = ['FireAll', 'FirePhasers', 'FireTorps']

      commands.forEach(cmd => {
        const result = parser.parseCommandString(cmd)
        expect(result.commands[0]).toMatchObject({
          signature: 'StaticCombat()',
          category: 'combat',
          icon: '🔥',
          parameters: { commandName: cmd }
        })
      })
    })
  })

  describe('VFX Commands', () => {
    it('should parse VFX exclusion commands', () => {
      const result = parser.parseCommandString('dynFxSetFXExclusionList Fx_Explosion,Fx_Beam')

      expect(result.commands[0]).toMatchObject({
        signature: 'VFXExclusion(effects: string)',
        category: 'vfx',
        icon: '✨',
        parameters: {
          effects: 'Fx_Explosion,Fx_Beam'
        },
        displayText: 'VFX Exclude: Fx_Explosion,Fx_Beam'
      })
    })

    it('should parse VFX alias commands', () => {
      const result = parser.parseCommandString('dynFxSetFXExclusionList_LowVFX')

      expect(result.commands[0]).toMatchObject({
        signature: 'VFXExclusionAlias(aliasName: string)',
        category: 'vfx',
        parameters: {
          aliasName: 'LowVFX'
        },
        displayText: 'VFX Alias: LowVFX'
      })
    })
  })

  describe('Command Chain Parsing', () => {
    it('should parse multi-command strings', () => {
      const result = parser.parseCommandString('say "Ready" $$ +TrayExecByTray 1 2 $$ FireAll')

      expect(result.commands).toHaveLength(3)
      expect(result.commands[0].category).toBe('communication')
      expect(result.commands[1].category).toBe('tray')
      expect(result.commands[2].category).toBe('combat')
    })

    it('should detect mirrored commands', () => {
      const result = parser.parseCommandString('say "Start" $$ TrayExecByTray 1 2 $$ say "End" $$ TrayExecByTray 1 2 $$ say "Start"')

      expect(result.isMirrored).toBe(true)
      expect(result.commands).toHaveLength(5)
    })

    it('should not detect non-mirrored as mirrored', () => {
      const result = parser.parseCommandString('say "A" $$ say "B" $$ say "C"')

      expect(result.isMirrored).toBe(false)
    })
  })

  describe('Performance & Caching', () => {
    it('should cache frequently used commands in hot path', () => {
      const command = 'TrayExecByTray 1 2'

      // Parse multiple times to trigger hot path caching
      for (let i = 0; i < 5; i++) {
        parser.parseCommandString(command)
      }

      expect(parser.hotPathCache.has(command)).toBe(true)
      expect(parser.frequencyTracker.get(command)).toBeGreaterThanOrEqual(5)
    })

    it('should provide performance metrics when enabled', () => {
      parser.options.enablePerformanceMetrics = true

      parser.parseCommandString('FireAll')

      const metrics = parser.performanceMetrics
      expect(metrics.has('parse_complete')).toBe(true)
    })

    it('should prioritize by weight (TrayExec should be checked first)', () => {
      const sortedSignatures = Object.entries(parser.signatures)
        .sort((a, b) => {
          const aWeight = Math.max(...a[1].patterns.map(p => p.weight))
          const bWeight = Math.max(...b[1].patterns.map(p => p.weight))
          return bWeight - aWeight
        })

      expect(sortedSignatures[0][0]).toBe('TrayExecution')
      expect(sortedSignatures[0][1].patterns[0].weight).toBe(100)
    })
  })

  describe('Fallback Handling', () => {
    it('should handle unrecognized commands gracefully', () => {
      const result = parser.parseCommandString('SomeUnknownCommand arg1 arg2')

      expect(result.commands[0]).toMatchObject({
        signature: 'UnknownCommand(command: string)',
        category: 'custom',
        icon: '⚙️',
        parameters: { command: 'SomeUnknownCommand arg1 arg2' },
        parseMetadata: {
          signatureName: 'fallback',
          patternWeight: 0
        }
      })
    })
  })

  describe('API Methods', () => {
    it('should validate commands against signatures', () => {
      const isValid = parser.validateCommand(
        'TrayExecByTray(active: number, tray: number, slot: number)',
        '+TrayExecByTray 1 2'
      )

      expect(isValid).toBe(true)
    })

    it('should extract command signatures', () => {
      const signatures = parser.getCommandSignature('say "test" $$ FireAll')

      expect(signatures).toEqual([
        'Communication(verb: string, message: string)',
        'StaticCombat()'
      ])
    })

    it('should extract parameters for specific signatures', () => {
      const params = parser.extractParameters(
        'TrayExecByTray(active: number, tray: number, slot: number)',
        '+TrayExecByTray 3 7'
      )

      expect(params).toEqual({
        active: 1,
        tray: 3,
        slot: 7,
        baseCommand: '+TrayExecByTray',
        isShorthand: true
      })
    })
  })
})

describe('STOCommandParser - RequestResponse Integration', () => {
  let parser

  beforeEach(() => {
    // Clear any existing listeners
    eventBus.listeners?.clear?.()

    parser = new STOCommandParser(eventBus, {
      enableCache: true,
      enablePerformanceMetrics: true
    })
  })

  it('should respond to parser:parse-command-string requests', async () => {
    const result = await request(eventBus, 'parser:parse-command-string', {
      commandString: '+TrayExecByTray 1 2',
      options: { generateDisplayText: true }
    })

    expect(result.commands).toHaveLength(1)
    expect(result.commands[0].category).toBe('tray')
  })

  it('should respond to parser:validate-command requests', async () => {
    const isValid = await request(eventBus, 'parser:validate-command', {
      signature: 'TrayExecByTray(active: number, tray: number, slot: number)',
      commandString: '+TrayExecByTray 1 2'
    })

    expect(isValid).toBe(true)
  })

  it('should respond to parser:get-command-signature requests', async () => {
    const signatures = await request(eventBus, 'parser:get-command-signature', {
      commandString: 'say "test" $$ FireAll'
    })

    expect(signatures).toEqual([
      'Communication(verb: string, message: string)',
      'StaticCombat()'
    ])
  })

  it('should clear cache on request', async () => {
    // Add something to cache first
    parser.parseCommandString('FireAll')
    expect(parser.parseCache.size).toBeGreaterThan(0)

    const result = await request(eventBus, 'parser:clear-cache', {})

    expect(result.success).toBe(true)
    expect(parser.parseCache.size).toBe(0)
  })

  it('should handle invalid commands through requestResponse gracefully', async () => {
    const result = await request(eventBus, 'parser:parse-command-string', {
      commandString: '+TrayExecByTray abc 1'
    })

    expect(result.commands[0].category).toBe('custom')
    expect(result.commands[0].signature).toBe('UnknownCommand(command: string)')
  })
})

describe('STOCommandParser - Standalone Usage', () => {
  it('should create standalone parser without eventBus', () => {
    const standaloneParser = STOCommandParser.createStandalone({
      enableCache: false,
      enablePerformanceMetrics: true
    })

    expect(standaloneParser.eventBus).toBeNull()
    expect(standaloneParser.options.enableCache).toBe(false)
    expect(standaloneParser.options.enablePerformanceMetrics).toBe(true)

    const result = standaloneParser.parseCommandString('FireAll')
    expect(result.commands[0].category).toBe('combat')
  })

  it('should work without requestResponse handlers when standalone', () => {
    const standaloneParser = new STOCommandParser(null)

    // Should not throw when there's no eventBus
    expect(() => {
      standaloneParser.parseCommandString('TrayExecByTray 1 2')
    }).not.toThrow()
  })
})