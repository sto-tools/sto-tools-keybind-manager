import { describe, it, expect, beforeEach, vi } from 'vitest'
import STOCommandParser from '../../src/js/lib/STOCommandParser.js'
import eventBus from '../../src/js/core/eventBus.js'
import { request } from '../../src/js/core/requestResponse.js'

describe('STOCommandParser - Function Signature Based Parsing', () => {
  let parser

  beforeEach(() => {
    parser = new STOCommandParser(null, {
      enableCache: true,
      enablePerformanceMetrics: true,
      hotPathThreshold: 3
    })
  })

  describe('High-Frequency TrayExec Commands', () => {
    it('should parse TrayExecByTray with highest priority', () => {
      const result = parser.parseCommandString('+STOTrayExecByTray 2 5')
      
      expect(result.commands).toHaveLength(1)
      expect(result.commands[0]).toMatchObject({
        command: '+STOTrayExecByTray 2 5',
        signature: 'TrayExecByTray(tray: number, slot: number)',
        category: 'tray',
        icon: '⚡',
        parameters: {
          tray: 2,
          slot: 5,
          baseCommand: '+STOTrayExecByTray'
        },
        displayText: 'Execute Tray 3 Slot 6'
      })
    })

    it('should handle TrayExec variants correctly', () => {
      const variants = [
        'TrayExecByTray 0 0',
        '+TrayExecByTray 1 2', 
        'STOTrayExecByTray 3 7',
        '+STOTrayExecByTray 4 9'
      ]

      variants.forEach(command => {
        const result = parser.parseCommandString(command)
        expect(result.commands[0].category).toBe('tray')
        expect(result.commands[0].signature).toBe('TrayExecByTray(tray: number, slot: number)')
        expect(result.commands[0].parseMetadata.patternWeight).toBe(100)
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
        },
        displayText: 'Tray Backup (3.4 → 5.6)'
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
      const result = parser.parseCommandString('dynFxSetFXExlusionList Fx_Explosion,Fx_Beam')
      
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
      const result = parser.parseCommandString('dynFxSetFXExlusionList_LowVFX')
      
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
      const result = parser.parseCommandString('say "Ready" $$ TrayExecByTray 1 2 $$ FireAll')
      
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
        'TrayExecByTray(tray: number, slot: number)',
        'TrayExecByTray 1 2'
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
        'TrayExecByTray(tray: number, slot: number)',
        'TrayExecByTray 3 7'
      )
      
      expect(params).toEqual({
        tray: 3,
        slot: 7,
        baseCommand: 'TrayExecByTray'
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
      commandString: 'TrayExecByTray 1 2',
      options: { generateDisplayText: true }
    })

    expect(result.commands).toHaveLength(1)
    expect(result.commands[0].category).toBe('tray')
    expect(result.commands[0].displayText).toBe('Execute Tray 2 Slot 3')
  })

  it('should respond to parser:validate-command requests', async () => {
    const isValid = await request(eventBus, 'parser:validate-command', {
      signature: 'TrayExecByTray(tray: number, slot: number)',
      commandString: 'TrayExecByTray 1 2'
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