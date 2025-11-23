import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ActivityTranslator } from '../../../src/js/lib/kbf/translation/ActivityTranslator.js'

/**
 * Unit tests for ActivityTranslator
 * Tests activity command generation for all supported activity types
 * Tests command structure and aliases
 */

describe('ActivityTranslator', () => {
  let translator

  beforeEach(() => {
    translator = new ActivityTranslator({
      strictMode: false,
      enableProgressCallbacks: true,
      validateUtf8: true,
    })
  })

  afterEach(() => {
    translator = null
  })

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const defaultTranslator = new ActivityTranslator()
      expect(defaultTranslator.options.enableProgressCallbacks).toBe(true)
      expect(defaultTranslator.options.validateUtf8).toBe(true)
      expect(defaultTranslator.options.strictMode).toBe(false)
      expect(defaultTranslator.options.maxFileSize).toBe(1024 * 1024)
    })

    it('should merge custom options with defaults', () => {
      const customTranslator = new ActivityTranslator({
        strictMode: true,
        maxFileSize: 500000,
      })
      expect(customTranslator.options.strictMode).toBe(true)
      expect(customTranslator.options.maxFileSize).toBe(500000)
      expect(customTranslator.options.enableProgressCallbacks).toBe(true) // Default preserved
    })

    it('should initialize translation maps and parse state', () => {
      expect(translator.activityTranslations).toBeInstanceOf(Map)
      expect(translator.keyTokenMap).toBeInstanceOf(Map)
      expect(translator.parseState.currentLayer).toBe(0)
      expect(translator.parseState.errors).toEqual([])
      expect(translator.parseState.warnings).toEqual([])
    })
  })

  describe('translateActivity', () => {
    it('should handle invalid activity types', () => {
      const result = translator.translateActivity('invalid', {})
      expect(result.success).toBe(false)
      expect(result.error).toContain('Activity translation failed')
    })

    it('should handle activity numbers outside valid range', () => {
      const result = translator.translateActivity(999, {})
      expect(result.success).toBe(false)
      // Check if any warning contains the expected text
      const hasExpectedWarning = result.warnings.some(warning =>
        warning.includes('outside valid range (0-123)')
      )
      expect(hasExpectedWarning).toBe(true)
    })

    it('should handle negative activity numbers', () => {
      const result = translator.translateActivity(-1, {})
      expect(result.success).toBe(false)
      // Check if any warning contains the expected text
      const hasExpectedWarning = result.warnings.some(warning =>
        warning.includes('outside valid range (0-123)')
      )
      expect(hasExpectedWarning).toBe(true)
    })

    it('should use default context when none provided', () => {
      const result = translator.translateActivity(3, {})
      expect(result.metadata.environment).toBe('space')
      expect(result.metadata.bindsetName).toBe('unknown_bindset')
      expect(result.metadata.keyToken).toBe('unknown_key')
    })

    it('should use provided context values', () => {
      const context = {
        environment: 'ground',
        bindsetName: 'test_bindset',
        keyToken: 'F',
        activityData: { text: 'test', n1: 1, n2: 2, n3: 3 }
      }
      const result = translator.translateActivity(3, context)
      expect(result.metadata.environment).toBe('ground')
      expect(result.metadata.bindsetName).toBe('test_bindset')
      expect(result.metadata.keyToken).toBe('F')
    })

    it('should default to space environment for invalid environment', () => {
      const context = { environment: 'invalid' }
      const result = translator.translateActivity(3, context)
      expect(result.metadata.environment).toBe('space')
    })
  })

  describe('generateActivityCommand - General Handling', () => {
    describe('Activity Handling - Fixed String Command Parameter Handling', () => {
      const FixedStringCommand = 16 // FireTorps

      it('should generate fixed string command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F' }

        const result = translator.generateActivityCommand(FixedStringCommand, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['FireTorps'])
        expect(result.aliases).toEqual({})
      })

      it('should ignore all activity data parameters', () => {
        // Test with various activityData that should all be ignored
        const testCases = [
          { text: 'some text' },
          { n1: 5, n2: 10, n3: 15 },
          { text: 'ignored', n1: 1, n2: 2, n3: 3 },
          { text2: 'also ignored' },
          { text: 'test', n1: 999, n2: 888, n3: 777, text2: 'ignored' }
        ]

        testCases.forEach((activityData, index) => {
          const context = { environment: 'space', bindsetName: 'test', keyToken: 'F' }
          const result = translator.generateActivityCommand(FixedStringCommand, activityData, context)

          expect(result.type).toBe('fixed_command')
          expect(result.commands).toEqual(['FireTorps'])
          expect(result.aliases).toEqual({})
        })
      })

      it('should handle empty activity data', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F' }

        const result = translator.generateActivityCommand(FixedStringCommand, activityData, context)

        expect(result.commands).toEqual(['FireTorps'])
        expect(result.type).toBe('fixed_command')
      })

      it('should handle null and undefined activity data values', () => {
        const activityData = {
          text: null,
          text2: undefined,
          n1: null,
          n2: undefined,
          n3: null
        }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F' }

        const result = translator.generateActivityCommand(FixedStringCommand, activityData, context)

        expect(result.commands).toEqual(['FireTorps'])
        expect(result.type).toBe('fixed_command')
      })
    })

    describe('Activity Handling - Parameterized Command Parameter Handling', () => {
      const ParameterizedCommand = 5 // Target
    
      it('should generate parameterized command with text', () => {
        const activityData = { text: 'Kirk' }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'T' }

        const result = translator.generateActivityCommand(ParameterizedCommand, activityData, context)

        expect(result.type).toBe('text_command')
        expect(result.commands).toEqual(['Target Kirk'])
        expect(result.aliases).toEqual({})
      })

      it('should trim whitespace from target name', () => {
        const activityData = { text: '  Enemy Ship  ' }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'T' }

        const result = translator.generateActivityCommand(ParameterizedCommand, activityData, context)

        expect(result.commands).toEqual(['Target Enemy Ship'])
      })

      it('should handle empty text', () => {
        const activityData = { text: '' }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'T' }

        const result = translator.generateActivityCommand(ParameterizedCommand, activityData, context)

        expect(result.commands).toEqual(['Target '])
      })

      it('should handle missing text', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'T' }

        const result = translator.generateActivityCommand(ParameterizedCommand, activityData, context)

        expect(result.commands).toEqual(['Target '])
      })

      it('should handle special characters in parameter values', () => {
        const activityData = { text: 'Bio-Neural Warhead' }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'T' }

        const result = translator.generateActivityCommand(ParameterizedCommand, activityData, context)

        expect(result.commands).toEqual(['Target Bio-Neural Warhead'])
      })

      it('should ignore other activity data parameters', () => {
        const activityData = { text: 'Enemy', n1: 999, n2: 888, n3: 777, text2: 'ignored' }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'T' }

        const result = translator.generateActivityCommand(ParameterizedCommand, activityData, context)

        expect(result.commands).toEqual(['Target Enemy'])
      })
    })

    describe('Activity Handling - Scale Type Command Parameter Handling', () => {
      const ScaleTypeCommand = 88 // TargetFocusScale
      it('should generate scale commands with valid n1 percentage', () => {
        const activityData = { n1: 75 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F3' }

        const result = translator.generateActivityCommand(ScaleTypeCommand, activityData, context)

        // Should generate two commands joined by $$ for space and ground
        expect(result.commands[0]).toBe('GenSetEarlyOverrideFloat Hud_Statustargetfocused_Space_Bufflist scale 0.75$$GenSetEarlyOverrideFloat Hud_Statustargetfocused_Ground_Bufflist scale 0.75')
        expect(result.type).toBe('parameterized_command')
        expect(result.aliases).toEqual({})
      })

      it('should use default scale (1.00) when n1 is missing or invalid', () => {
        const testCases = [
          { n1: 0 },      // Zero should use default
          { n1: -15 },    // Negative should use default
          {},             // Missing should use default
          { n1: null },   // Null should use default
          { n1: undefined } // Undefined should use default
        ]

        testCases.forEach((activityData, index) => {
          const context = { environment: 'space', bindsetName: 'test', keyToken: 'F3' }
          const result = translator.generateActivityCommand(ScaleTypeCommand, activityData, context)

          expect(result.commands[0]).toBe('GenSetEarlyOverrideFloat Hud_Statustargetfocused_Space_Bufflist scale 1.00$$GenSetEarlyOverrideFloat Hud_Statustargetfocused_Ground_Bufflist scale 1.00')
          expect(result.type).toBe('parameterized_command')
        })
      })
    })

    describe('General Handling - Unknown Activities', () => {
      it('should handle unknown activity IDs', () => {
        const activityData = { text: 'test' }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'X' }
  
        const result = translator.generateActivityCommand(999, activityData, context)
  
        expect(result.type).toBe('unknown')
        expect(result.success).toBe(false)
        expect(result.commands).toEqual([])
        expect(result.error).toContain('Activity 999 translation not implemented or failed')
      })
  
      it('should include warnings for unknown activities', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'X' }
  
        const result = translator.generateActivityCommand(999, activityData, context)
  
        expect(result.warnings).toContain(
          'Activity 999 translation not implemented or failed'
        )
        expect(result.warnings).toContain(
          'This activity will be skipped but parsing will continue with other activities'
        )
      })
  
      it('should handle high activity IDs with special warnings', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'X' }
  
        const result = translator.generateActivityCommand(150, activityData, context)
  
        // Check if any warning contains the expected text
        const hasExpectedWarning = result.warnings.some(warning =>
          warning.includes('High activity ID 150 may indicate custom or future KBF format extension')
        )
        expect(hasExpectedWarning).toBe(true)
      })
    })

    describe('General Handling - Error Categories and Suggestions', () => {
      it('should categorize invalid type activities correctly', () => {
        const result = translator.determineActivityErrorCategory('string')
        expect(result).toBe('invalid_type')
      })
  
      it('should categorize out of range activities correctly', () => {
        expect(translator.determineActivityErrorCategory(-1)).toBe('out_of_range')
        expect(translator.determineActivityErrorCategory(124)).toBe('out_of_range')
      })
  
      it('should categorize future extension activities correctly', () => {
        expect(translator.determineActivityErrorCategory(124)).toBe('out_of_range')
        expect(translator.determineActivityErrorCategory(150)).toBe('out_of_range')
      })
  
      it('should categorize unimplemented standard activities correctly', () => {
        expect(translator.determineActivityErrorCategory(30)).toBe('unimplemented_standard')
        expect(translator.determineActivityErrorCategory(123)).toBe('unimplemented_standard')
      })
  
      it('should categorize unknown basic activities correctly', () => {
        expect(translator.determineActivityErrorCategory(5)).toBe('unknown_basic')
      })
  
      it('should provide appropriate suggestions for different activity types', () => {
        expect(translator.getActivitySuggestion('string')).toBe('Activity IDs should be numeric values')
        expect(translator.getActivitySuggestion(-1)).toBe('Valid activity IDs range from 0 to 123')
        expect(translator.getActivitySuggestion(150)).toBe('Valid activity IDs range from 0 to 123')
        expect(translator.getActivitySuggestion(50)).toBe('This activity may not be implemented yet in the current parser version')
      })
    })  

    describe('General Handling - Integration with translateActivity', () => {
      it('should successfully translate known activity', () => {
        const context = {
          environment: 'space',
          bindsetName: 'test_bindset',
          keyToken: 'Tab',
          activityData: {}
        }
  
        const result = translator.translateActivity(3, context)
  
        expect(result.success).toBe(true)
        expect(result.commands).toEqual(['Target_Enemy_Next'])
        expect(result.type).toBe('fixed_command')
      })
  
      it('should handle translation errors gracefully', () => {
        // Mock a scenario where command generation might throw an error
        const originalGenerate = translator.generateActivityCommand
        translator.generateActivityCommand = vi.fn().mockImplementation(() => {
          throw new Error('Mock error')
        })
  
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'X' }
        const result = translator.translateActivity(3, context)
  
        expect(result.success).toBe(false)
        expect(result.error).toContain('Activity translation failed: 3')
  
        // Restore original method
        translator.generateActivityCommand = originalGenerate
      })
    })
  })

})

describe('generateActivityCommand - Bindset Loader', () => {
  describe('Activity 104 - Load Bind Set', () => {
    it('should generate bindset loader alias with valid text', () => {
      const activityData = { text: 'My Bindset' }
      const context = { environment: 'space', bindsetName: 'test' }
      const result = translator.generateActivityCommand(104, activityData, context)

      expect(result.type).toBe('bindset_loader')
      expect(result.commands).toEqual(['sto_kb_bindset_enable_space_My_Bindset'])
      expect(result.aliases).toEqual({})
    })

    it('should sanitize special characters in bindset name', () => {
      const activityData = { text: 'Combat-Binds 2.0' }
      const context = { environment: 'ground' }
      const result = translator.generateActivityCommand(104, activityData, context)

      expect(result.commands).toEqual(['sto_kb_bindset_enable_ground_Combat_Binds_2_0'])
    })

    it('should handle empty text', () => {
      const activityData = { text: '' }
      const context = { environment: 'space' }
      const result = translator.generateActivityCommand(104, activityData, context)

      expect(result.type).toBe('text_command')
      expect(result.commands).toEqual([])
    })

    it('should handle whitespace-only text', () => {
      const activityData = { text: '   ' }
      const context = { environment: 'space' }
      const result = translator.generateActivityCommand(104, activityData, context)

      expect(result.commands).toEqual([])
    })

    it('should use default environment when context missing', () => {
      const activityData = { text: 'TestSet' }
      const context = {}
      const result = translator.generateActivityCommand(104, activityData, context)

      expect(result.commands).toEqual(['sto_kb_bindset_enable_space_TestSet'])
    })

    // Tests for Master to Primary Bindset mapping (bug fix: js-kbf-import-master-bindset-mapping)
    describe('Master to Primary Bindset mapping', () => {
      it('should map "Master" to "Primary Bindset" in space environment', () => {
        const activityData = { text: 'Master' }
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(104, activityData, context)

        expect(result.type).toBe('bindset_loader')
        expect(result.commands).toEqual(['sto_kb_bindset_enable_space_Primary_Bindset'])
        expect(result.aliases).toEqual({})
      })

      it('should map "Master" to "Primary Bindset" in ground environment', () => {
        const activityData = { text: 'Master' }
        const context = { environment: 'ground' }
        const result = translator.generateActivityCommand(104, activityData, context)

        expect(result.type).toBe('bindset_loader')
        expect(result.commands).toEqual(['sto_kb_bindset_enable_ground_Primary_Bindset'])
        expect(result.aliases).toEqual({})
      })

      it('should handle case-insensitive "master" mapping', () => {
        const testCases = [
          { text: 'master', expected: 'Primary_Bindset' },
          { text: 'MASTER', expected: 'Primary_Bindset' },
          { text: 'Master', expected: 'Primary_Bindset' },
          { text: 'MaStEr', expected: 'Primary_Bindset' }
        ]

        testCases.forEach(({ text, expected }) => {
          const activityData = { text }
          const context = { environment: 'space' }
          const result = translator.generateActivityCommand(104, activityData, context)

          expect(result.commands).toEqual([`sto_kb_bindset_enable_space_${expected}`])
        })
      })

      it('should not affect other bindset names', () => {
        const testCases = [
          'Combat Binds',
          'PVP Setup',
          'Healing',
          'Masterfile', // Should not be mapped - contains "Master" but not exactly "Master"
          'The Master Set', // Should not be mapped - contains "Master" but not exactly "Master"
          'Mastery' // Should not be mapped - contains "Master" but not exactly "Master"
        ]

        testCases.forEach((bindsetName) => {
          const activityData = { text: bindsetName }
          const context = { environment: 'ground' }
          const result = translator.generateActivityCommand(104, activityData, context)

          const expectedSanitized = bindsetName.replace(/[^a-zA-Z0-9_]/g, '_')
          expect(result.commands).toEqual([`sto_kb_bindset_enable_ground_${expectedSanitized}`])
        })
      })

      it('should handle "Master" with whitespace correctly', () => {
        const activityData = { text: '  Master  ' }
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(104, activityData, context)

        expect(result.commands).toEqual(['sto_kb_bindset_enable_space_Primary_Bindset'])
      })

      it('should preserve existing behavior for non-Master bindsets', () => {
        const activityData = { text: 'Custom Bindset' }
        const context = { environment: 'space', bindsetName: 'test' }
        const result = translator.generateActivityCommand(104, activityData, context)

        expect(result.type).toBe('bindset_loader')
        expect(result.commands).toEqual(['sto_kb_bindset_enable_space_Custom_Bindset'])
        expect(result.aliases).toEqual({})
      })
    })
  })

  describe('generateActivityCommand - Fixed String Commands', () => {
    describe('Activity 1 - Target_clear', () => {
      it('should generate target_clear command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Esc' }

        const result = translator.generateActivityCommand(1, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['target_clear'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 2 - Target_Enemy_Near', () => {
      it('should generate Target_Enemy_Near command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'R' }

        const result = translator.generateActivityCommand(2, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['Target_Enemy_Near'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 3 - Target_Enemy_Next', () => {
      it('should generate Target_Enemy_Next command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Tab' }

        const result = translator.generateActivityCommand(3, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['Target_Enemy_Next'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 6 - Target_Friend_Next', () => {
      it('should generate Target_Friend_Next command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Tab' }

        const result = translator.generateActivityCommand(6, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['Target_Friend_Next'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 7 - Target_Enemy_Next_Exposed', () => {
      it('should generate Target_Enemy_Next_Exposed command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'E' }

        const result = translator.generateActivityCommand(7, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['Target_Enemy_Next_Exposed'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 8 - StatsPreset_Load_Preset_1', () => {
      it('should generate StatsPreset_Load Preset_1 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }

        const result = translator.generateActivityCommand(8, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['StatsPreset_Load Preset_1'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 9 - StatsPreset_Load_Preset_2', () => {
      it('should generate StatsPreset_Load Preset_2 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F2' }

        const result = translator.generateActivityCommand(9, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['StatsPreset_Load Preset_2'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 10 - StatsPreset_Load_Preset_3', () => {
      it('should generate StatsPreset_Load Preset_3 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F3' }

        const result = translator.generateActivityCommand(10, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['StatsPreset_Load Preset_3'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 11 - StatsPreset_Load_Preset_4', () => {
      it('should generate StatsPreset_Load Preset_4 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F4' }

        const result = translator.generateActivityCommand(11, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['StatsPreset_Load Preset_4'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 14 - FireAll', () => {
      it('should generate GenSendMessage HUD_Root FireAll command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }

        const result = translator.generateActivityCommand(14, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['GenSendMessage HUD_Root FireAll'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 15 - FirePhasers', () => {
      it('should generate FirePhasers command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }

        const result = translator.generateActivityCommand(15, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['FirePhasers'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 16 - FireTorps', () => {
      it('should generate FireTorps command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F' }

        const result = translator.generateActivityCommand(16, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['FireTorps'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 17 - FireMines', () => {
      it('should generate FireMines command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'M' }

        const result = translator.generateActivityCommand(17, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['FireMines'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 18 - FirePhasersTorps', () => {
      it('should generate FirePhasersTorps command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }

        const result = translator.generateActivityCommand(18, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['FirePhasersTorps'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 19 - FireProjectiles', () => {
      it('should generate fixed command FireProjectiles', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }

        const result = translator.generateActivityCommand(19, activityData, context)

        // Verify basic result structure
        expect(result).toHaveProperty('type', 'fixed_command')
        expect(result).toHaveProperty('commands')
        expect(result).toHaveProperty('aliases', {})

        // Verify command content
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0]).toBe('FireProjectiles')
      })
    })

    describe('Activity 20 - CamReset', () => {
      it('should generate fixed command CamReset', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }

        const result = translator.generateActivityCommand(20, activityData, context)

        // Verify basic result structure
        expect(result).toHaveProperty('type', 'fixed_command')
        expect(result).toHaveProperty('commands')
        expect(result).toHaveProperty('aliases', {})

        // Verify command content
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0]).toBe('CamReset')
      })
    })

    describe('Activity 22 - camUseChaseCam 1', () => {
      it('should generate camUseChaseCam 1 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'C' }

        const result = translator.generateActivityCommand(22, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['camUseChaseCam 1'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 23 - camUseChaseCam 0', () => {
      it('should generate camUseChaseCam 0 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'C' }

        const result = translator.generateActivityCommand(23, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['camUseChaseCam 0'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 27 - camUseAutoTargetLock 1', () => {
      it('should generate camUseAutoTargetLock 1 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'L' }

        const result = translator.generateActivityCommand(27, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['camUseAutoTargetLock 1'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 28 - camUseAutoTargetLock 0', () => {
      it('should generate camUseAutoTargetLock 0 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'U' }

        const result = translator.generateActivityCommand(28, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['camUseAutoTargetLock 0'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 29 - DistributeShields', () => {
      it('should generate DistributeShields command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'D' }

        const result = translator.generateActivityCommand(29, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['+Power_Exec Distribute_Shields'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 30 - Up', () => {
      it('should generate +up command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'W' }

        const result = translator.generateActivityCommand(30, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0]).toBe('+up')
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 31 - Down', () => {
      it('should generate +down command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'S' }

        const result = translator.generateActivityCommand(31, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0]).toBe('+down')
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 32 - Left', () => {
      it('should generate +left command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test' }

        const result = translator.generateActivityCommand(32, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0]).toBe('+left')
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 33 - Right', () => {
      it('should generate +right command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test' }

        const result = translator.generateActivityCommand(33, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0]).toBe('+right')
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 35 - FullImpulse', () => {
      it('should generate FullImpulse command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }

        const result = translator.generateActivityCommand(35, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['GenSendMessage Throttle_FullImpulse_Button FullThrottle'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 36 - Forward', () => {
      it('should generate +Forward command', () => {
        const activityData = {}
        const context = { environment: 'ground', bindsetName: 'test', keyToken: 'W' }

        const result = translator.generateActivityCommand(36, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['+Forward'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 37 - Backward', () => {
      it('should generate +backward command', () => {
        const activityData = {}
        const context = { environment: 'ground', bindsetName: 'test', keyToken: 'S' }

        const result = translator.generateActivityCommand(37, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['+backward'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 38 - Left', () => {
      it('should generate +Left command', () => {
        const activityData = {}
        const context = { environment: 'ground', bindsetName: 'test', keyToken: 'A' }

        const result = translator.generateActivityCommand(38, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['+Left'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 39 - Right', () => {
      it('should generate +Right command', () => {
        const activityData = {}
        const context = { environment: 'ground', bindsetName: 'test', keyToken: 'D' }
        const result = translator.generateActivityCommand(39, activityData, context)
        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['+Right'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 40 - TurnLeft', () => {
      it('should generate +TurnLeft command', () => {
        const activityData = {}
        const context = { environment: 'ground', bindsetName: 'test', keyToken: 'A' }
        const result = translator.generateActivityCommand(40, activityData, context)
        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['+TurnLeft'])
        expect(result.aliases).toEqual({})
      })
    })
    
    describe('Activity 41 - TurnRight', () => {
      it('should generate +TurnRight command', () => {
        const activityData = {}
        const context = { environment: 'ground', bindsetName: 'test', keyToken: 'D' }
        const result = translator.generateActivityCommand(41, activityData, context)
        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['+TurnRight'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 42 - AutoForward', () => {
      it('should generate ++AutoForward command', () => {
        const activityData = {}
        const context = { environment: 'ground', bindsetName: 'test', keyToken: 'W' }
        const result = translator.generateActivityCommand(42, activityData, context)
        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['++AutoForward'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 43 - Jump', () => {
      it('should generate +Up command', () => {
        const activityData = {}
        const context = { environment: 'ground', bindsetName: 'test', keyToken: 'Space' }

        const result = translator.generateActivityCommand(43, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['+Up'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 44 - Walk', () => {
        it('should generate +Walk command', () => {
        const activityData = {}
        const context = { environment: 'ground', bindsetName: 'test', keyToken: 'W' }

        const result = translator.generateActivityCommand(44, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['+Walk'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 45 - Run', () => {
      it('should generate correct +Run command', () => {
        const activityData = {}
        const context = { environment: 'ground', bindsetName: 'test', keyToken: 'W' }

        const result = translator.generateActivityCommand(45, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['+Run'])
        expect(result.aliases).toEqual({})

      })
    })

    describe('Activity 46 - Roll', () => {
      it('should generate correct +Roll command', () => {
        const activityData = {}
        const context = { environment: 'ground', bindsetName: 'test', keyToken: 'R' }

        const result = translator.generateActivityCommand(46, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['+Roll'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 47 - Aim', () => {
      it('should generate correct +Aim command', () => {
        const activityData = {}
        const context = { environment: 'ground', bindsetName: 'test', keyToken: 'Space' }

        const result = translator.generateActivityCommand(47, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['+Aim'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 48 - Follow', () => {
      it('should generate Follow command', () => {
        const activityData = { text: 'test', n1: 1, n2: 2, n3: 3 }
        const context = { environment: 'ground', bindsetName: 'test', keyToken: 'F' }

        const result = translator.generateActivityCommand(48, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['Follow'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 49 - SwitchWeapon', () => {
      it('should generate GenSendMessage Inventory_Root SwitchActiveWeapon command', () => {
        const activityData = { text: 'test', n1: 1, n2: 2, n3: 3 }
        const context = { environment: 'ground', bindsetName: 'test', keyToken: 'F' }

        const result = translator.generateActivityCommand(49, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['GenSendMessage Inventory_Root SwitchActiveWeapon'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 50 - HolsterToggle', () => {
      it('should generate HolsterToggle command', () => {
        const activityData = { text: 'test', n1: 1, n2: 2, n3: 3 }
        const context = { environment: 'ground', bindsetName: 'test', keyToken: 'h' }

        const result = translator.generateActivityCommand(50, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['HolsterToggle'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 51 - Crouch', () => {
      it('should generate +Crouch command', () => {
        const activityData = { text: 'test', n1: 1, n2: 2, n3: 3 }
        const context = { environment: 'ground', bindsetName: 'test', keyToken: 'c' }

        const result = translator.generateActivityCommand(51, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['+Crouch'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 52 - Clear Chat', () => {
      it('should generate Clear command', () => {
        const activityData = { text: 'test', n1: 1, n2: 2, n3: 3 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'c' }
        const result = translator.generateActivityCommand(52, activityData, context)
        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['Clear'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 53 - None', () => {
      it('should generate None command', () => {
        const activityData = { text: 'test', n1: 1, n2: 2, n3: 3 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }
        const result = translator.generateActivityCommand(53, activityData, context)
        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['None'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 54 - ShowFPS 1', () => {
      it('should generate ShowFPS 1 command', () => {
        const activityData = { text: 'test', n1: 1, n2: 2, n3: 3 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }
        const result = translator.generateActivityCommand(54, activityData, context)
        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['ShowFPS 1'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 55 - ShowFPS 0', () => {
      it('should generate ShowFPS 0 command', () => {
        const activityData = { text: 'test', n1: 1, n2: 2, n3: 3 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }
        const result = translator.generateActivityCommand(55, activityData, context)
        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['ShowFPS 0'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 57 - NetGraph 0', () => {
      it('should generate netgraph 0 command', () => {
        const activityData = { text: 'test', n1: 1, n2: 2, n3: 3 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }
        const result = translator.generateActivityCommand(57, activityData, context)
        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['netgraph 0'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 56 - NetGraph 1', () => {
      it('should generate netgraph 1 command', () => {
        const activityData = { text: 'test', n1: 1, n2: 2, n3: 3 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }
        const result = translator.generateActivityCommand(56, activityData, context)
        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['netgraph 1'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 58 - NetTimingGraph 1', () => {
      it('should generate netTimingGraph 1 command', () => {
        const activityData = { text: 'test', n1: 1, n2: 2, n3: 3 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }
        const result = translator.generateActivityCommand(58, activityData, context)
        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['netTimingGraph 1'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 59 - NetTimingGraph 0', () => {
      it('should generate netTimingGraph 0 command', () => {
        const activityData = { text: 'test', n1: 1, n2: 2, n3: 3 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }
        const result = translator.generateActivityCommand(59, activityData, context)
        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['netTimingGraph 0'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 60 - ShowMem 1', () => {
      it('should generate showmem 1 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F12' }
        const result = translator.generateActivityCommand(60, activityData, context)
        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['showmem 1'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 61 - ShowMem 0', () => {
      it('should generate showmem 0 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F12' }
        const result = translator.generateActivityCommand(61, activityData, context)
        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['showmem 0'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 62 - FrameRateStabilizer 1', () => {
      it('should generate frameRateStabilizer 1 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F12' }
        const result = translator.generateActivityCommand(62, activityData, context)
        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['frameRateStabilizer 1'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 63 - FrameRateStabilizer 0', () => {
      it('should generate frameRateStabilizer 0 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F12' }
        const result = translator.generateActivityCommand(63, activityData, context)
        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['frameRateStabilizer 0'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 68 - Target Blockade Freighter - Forward', () => {
      it('should generate sequence of 8 freighter targeting commands', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: '1' }

        const result = translator.generateActivityCommand(68, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual([
          'Target Alpha Freighter',
          'Target Bravo Freighter',
          'Target Charlie Freighter',
          'Target Delta Freighter',
          'Target Foxtrot Freighter',
          'Target Golf Freighter',
          'Target India Freighter',
          'Target Juliet Freighter'
        ])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 69 - Target Blockade Freighter - Reverse', () => {
      it('should generate sequence of 8 freighter targeting commands in reverse order', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }

        const result = translator.generateActivityCommand(69, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.aliases).toEqual({})

        // Should generate single chained command with reverse order (Juliet to Alpha)
        const expectedCommand = 'Target Juliet Freighter $$ Target India Freighter $$ Target Golf Freighter $$ Target Foxtrot Freighter $$ Target Delta Freighter $$ Target Charlie Freighter $$ Target Bravo Freighter $$ Target Alpha Freighter'
        expect(result.commands).toEqual([expectedCommand])
      })
    })

    describe('Activity 70 - Target Starbase', () => {
      it('should generate Target Starbase command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }

        const result = translator.generateActivityCommand(70, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['Target Starbase'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 71 - Target Civilian Transport', () => {
      it('should generate Target Civilian Transport command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }

        const result = translator.generateActivityCommand(71, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['Target Civilian Transport'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 72 - Target Bio-Neural Warhead', () => {
      it('should generate Target Bio-Neural Warhead command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }

        const result = translator.generateActivityCommand(72, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['Target Bio-Neural Warhead'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 73 - FocusTargetSet', () => {
      it('should generate focustargetset command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F' }

        const result = translator.generateActivityCommand(73, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['focustargetset'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 74 - FocusTargetSelect', () => {
      it('should generate focustargetselect command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F' }

        const result = translator.generateActivityCommand(74, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['focustargetselect'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 79 - ControlSchemeCycle', () => {
      it('should generate ControlSchemeCycle command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }

        const result = translator.generateActivityCommand(79, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['ControlSchemeCycle'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 80 - Toggle Inventory', () => {
      it('should generate Inventory command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'I' }

        const result = translator.generateActivityCommand(80, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['Inventory'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 81 - Toggle Map', () => {
      it('should generate Map command for Toggle Map', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'M' }

        const result = translator.generateActivityCommand(81, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['Map'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 82 - Target Aceton Assimilator', () => {
      it('should generate Target Aceton Assimilator command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }

        const result = translator.generateActivityCommand(82, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['Target Aceton Assimilator'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 83 - camTurnToFace 1', () => {
      it('should generate camturntoface 1 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'T' }

        const result = translator.generateActivityCommand(83, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['camturntoface 1'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 84 - Toggle PvP Queues', () => {
      it('should generate PvPQueues command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'P' }

        const result = translator.generateActivityCommand(84, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['PvPQueues'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 85 - Toggle PvE Queues', () => {
      it('should generate PvEQueues command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'E' }

        const result = translator.generateActivityCommand(85, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['PvEQueues'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 90 - Target_Self', () => {
      it('should generate Target_Self command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F' }
        const result = translator.generateActivityCommand(90, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0]).toBe('Target_Self')
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 102 - Target Armored Bio-Neural Warhead', () => {
      it('should generate fixed targeting command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'T' }
        const result = translator.generateActivityCommand(102, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['target Armored Bio-Neural Warhead'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 103 - Interact', () => {
      it('should generate fixed interaction command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F' }
        const result = translator.generateActivityCommand(103, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['InteractWindow'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 106 - CombatLog 1', () => {
      it('should generate CombatLog 1 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test' }
        const result = translator.generateActivityCommand(106, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['CombatLog 1'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 107 - CombatLog 0', () => {
      it('should generate CombatLog 0 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test' }
        const result = translator.generateActivityCommand(107, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['CombatLog 0'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 108 - CombatLog', () => {
      it('should generate CombatLog command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test' }
        const result = translator.generateActivityCommand(108, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['CombatLog'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 109 - defaultautoattack 1', () => {
      it('should generate defaultautoattack 1 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test' }
        const result = translator.generateActivityCommand(109, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['defaultautoattack 1'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 110 - defaultautoattack 0', () => {
      it('should generate defaultautoattack 0 command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test' }
        const result = translator.generateActivityCommand(110, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['defaultautoattack 0'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 111 - unbind_all', () => {
      it('should generate unbind_all command', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test' }
        const result = translator.generateActivityCommand(111, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['unbind_all'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 115 - GenSendMessage Doff_Recipe_Start_Action Clicked', () => {
      it('should generate correct command structure for Doff_Action_Start_Clicked activity', () => {
        const activityData = {}
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(115, activityData, context)

        expect(result.type).toBe('fixed_command')
        expect(result.commands).toEqual(['GenSendMessage Doff_Recipe_Start_Action Clicked'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 117 - GenSendMessage Doff_Recipe_Actions_Starttask Clicked', () => {
      it('should generate GenSendMessage Doff_Recipe_Actions_Starttask Clicked command', () => {
        const activityData = {}
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(117, activityData, context)

        expect(result.commands).toEqual(['GenSendMessage Doff_Recipe_Actions_Starttask Clicked'])
        expect(result.type).toBe('fixed_command')
      })
    })

    describe('Activity 118 - Loot Roll Need', () => {
      it('should generate LootRollNeed command', () => {
        const activityData = {}
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(118, activityData, context)

        expect(result.commands).toEqual(['LootRollNeed'])
        expect(result.type).toBe('fixed_command')
      })
    })

    describe('Activity 119 - Loot Roll Greed', () => {
      it('should generate LootRollGreed command', () => {
        const activityData = {}
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(119, activityData, context)

        expect(result.commands).toEqual(['LootRollGreed'])
        expect(result.type).toBe('fixed_command')
      })
    })

    describe('Activity 120 - Loot Roll Pass', () => {
      it('should generate LootRollPass command', () => {
        const activityData = {}
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(120, activityData, context)

        expect(result.commands).toEqual(['LootRollPass'])
        expect(result.type).toBe('fixed_command')
      })
    })

    describe('Activity 123 - ScanForClickies', () => {
      it('should generate ScanForClickies command', () => {
        const activityData = {}
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(123, activityData, context)

        expect(result.commands).toEqual(['ScanForClickies'])
        expect(result.type).toBe('fixed_command')
      })
    })
  })

  describe('generateActivityCommand - Text Commands', () => {
    describe('Activity 0 - Team', () => {
      it('should generate team command with text', () => {
        const activityData = { text: 'Hello Team' }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'T' }

        const result = translator.generateActivityCommand(0, activityData, context)

        expect(result.type).toBe('text_command')
        expect(result.commands).toEqual(['team Hello Team'])
        expect(result.aliases).toEqual({})
      })
    })
    
    describe('Activity 5 - Target', () => {
      it('should generate Target command with text', () => {
        const activityData = { text: 'Kirk' }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'T' }

        const result = translator.generateActivityCommand(5, activityData, context)

        expect(result.type).toBe('text_command')
        expect(result.commands).toEqual(['Target Kirk'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 12 - Assist', () => {
      it('should generate Assist command with character name', () => {
        const activityData = { text: 'Kirk' }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }

        const result = translator.generateActivityCommand(12, activityData, context)

        expect(result.type).toBe('text_command')
        expect(result.commands).toEqual(['Assist Kirk'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 77 - Zone', () => {
      it('should generate zone command with text parameter', () => {
        const activityData = { text: 'Hello everyone!' }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }
        const result = translator.generateActivityCommand(77, activityData, context)

        expect(result.type).toBe('text_command')
        expect(result.commands).toEqual(['zone Hello everyone!'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 78 - Local', () => {
      it('should generate local command with text parameter', () => {
        const activityData = { text: 'Hello everyone!' }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }
        const result = translator.generateActivityCommand(78, activityData, context)

        expect(result.type).toBe('text_command')
        expect(result.commands).toEqual(['local Hello everyone!'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 96 - Emote', () => {
      it('should generate emote_notext command with text', () => {
        const activityData = { text: 'wave' }
        const context = { baseKeyName: 'Space', index: 0 }
        const result = translator.generateActivityCommand(96, activityData, context)

        expect(result.type).toBe('text_command')
        expect(result.commands).toEqual(['emote_notext wave'])
        expect(result.aliases).toEqual({})
      })

      it('should handle empty emote text', () => {
        const activityData = { text: '' }
        const context = { baseKeyName: 'E', index: 0 }
        const result = translator.generateActivityCommand(96, activityData, context)

        expect(result.commands).toEqual(['emote_notext '])
      })

      it('should handle different emote names', () => {
        const testCases = [
          { text: 'dance', expected: 'emote_notext dance' },
          { text: 'salute', expected: 'emote_notext salute' },
          { text: 'laugh', expected: 'emote_notext laugh' }
        ]

        testCases.forEach(({ text, expected }) => {
          const activityData = { text }
          const result = translator.generateActivityCommand(96, activityData, {})
          expect(result.commands[0]).toBe(expected)
        })
      })
    })

    describe('Activity 97 - EmoteCycle', () => {
      it('should generate cycle alias system for emote', () => {
        const activityData = { text: 'laugh' }
        const context = { baseKeyName: 'Space', index: 0 }
        const result = translator.generateActivityCommand(97, activityData, context)

        expect(result.type).toBe('cycle_command')
        expect(result.commands).toEqual(['sto_kb_emotecycle_Space_0'])

        // Check alias structure
        const mainAlias = result.aliases['sto_kb_emotecycle_Space_0']
        expect(mainAlias).toBeDefined()
        expect(mainAlias.steps).toEqual(['sto_kb_emotecycle_Space_0_step0'])
        expect(mainAlias.currentIndex).toBe(0)

        const stepAlias = result.aliases['sto_kb_emotecycle_Space_0_step0']
        expect(stepAlias).toBeDefined()
        expect(stepAlias.commands).toEqual(['emote_notext laugh'])
        expect(stepAlias.next).toBe('sto_kb_emotecycle_Space_0_step0')
      })

      it('should handle empty emote cycle text', () => {
        const activityData = { text: '' }
        const context = { baseKeyName: 'Q', index: 2 }
        const result = translator.generateActivityCommand(97, activityData, context)

        expect(result.commands).toEqual(['sto_kb_emotecycle_Q_2'])
        expect(result.aliases['sto_kb_emotecycle_Q_2_step0'].commands).toEqual(['emote_notext '])
      })

      it('should use context defaults for alias naming', () => {
        const activityData = { text: 'cheer' }
        const context = {}  // No baseKeyName or index
        const result = translator.generateActivityCommand(97, activityData, context)

        expect(result.commands).toEqual(['sto_kb_emotecycle_key_0'])
        expect(result.aliases['sto_kb_emotecycle_key_0_step0'].commands).toEqual(['emote_notext cheer'])
      })
    })

    describe('Activity 98 - Tell', () => {
      it('should generate tell command with recipient and message', () => {
        const activityData = { text: 'Player@Handle', text2: 'Hello there!' }
        const context = {}
        const result = translator.generateActivityCommand(98, activityData, context)

        expect(result.type).toBe('text_command')
        expect(result.commands).toEqual(['tell Player@Handle, Hello there!'])
        expect(result.aliases).toEqual({})
      })

      it('should handle empty message', () => {
        const activityData = { text: 'Player@Handle', text2: '' }
        const context = {}
        const result = translator.generateActivityCommand(98, activityData, context)

        expect(result.commands).toEqual(['tell Player@Handle, '])
      })

      it('should handle empty recipient', () => {
        const activityData = { text: '', text2: 'Hello' }
        const context = {}
        const result = translator.generateActivityCommand(98, activityData, context)

        expect(result.commands).toEqual(['tell , Hello'])
      })
    })

    describe('Activity 99 - bind_load_file', () => {
      it('should generate bind_load_file command with filename', () => {
        const activityData = { text: 'combat_binds.txt' }
        const context = {}
        const result = translator.generateActivityCommand(99, activityData, context)

        expect(result.type).toBe('text_command')
        expect(result.commands).toEqual(['bind_load_file combat_binds.txt'])
        expect(result.aliases).toEqual({})
      })

      it('should handle empty filename', () => {
        const activityData = { text: '' }
        const context = {}
        const result = translator.generateActivityCommand(99, activityData, context)

        expect(result.commands).toEqual(['bind_load_file'])
      })

      it('should handle missing text', () => {
        const activityData = {}
        const context = {}
        const result = translator.generateActivityCommand(99, activityData, context)

        expect(result.commands).toEqual(['bind_load_file'])
      })

      it('should handle filename with spaces', () => {
        const activityData = { text: 'pvp healing setup.txt' }
        const context = {}
        const result = translator.generateActivityCommand(99, activityData, context)

        expect(result.commands).toEqual(['bind_load_file pvp healing setup.txt'])
      })

      it('should handle filename with underscores', () => {
        const activityData = { text: 'social_setup.txt' }
        const context = {}
        const result = translator.generateActivityCommand(99, activityData, context)

        expect(result.commands).toEqual(['bind_load_file social_setup.txt'])
      })
    })

    describe('Activity 101 - cycle_emote', () => {
      it('should generate cycle command for visible emote', () => {
        const activityData = { text: 'wave' }
        const context = { baseKeyName: 'Space', index: 0 }
        const result = translator.generateActivityCommand(101, activityData, context)

        expect(result.type).toBe('cycle_command')
        expect(result.commands).toEqual(['sto_kb_emotecyclevisible_Space_0'])
        expect(result.aliases).toEqual({
          'sto_kb_emotecyclevisible_Space_0': {
            steps: ['sto_kb_emotecyclevisible_Space_0_step0'],
            currentIndex: 0
          },
          'sto_kb_emotecyclevisible_Space_0_step0': {
            commands: ['emote wave'],
            next: 'sto_kb_emotecyclevisible_Space_0_step0'
          }
        })
      })

      it('should handle empty text gracefully', () => {
        const activityData = { text: '' }
        const context = { baseKeyName: 'F', index: 1 }
        const result = translator.generateActivityCommand(101, activityData, context)

        expect(result.type).toBe('cycle_command')
        expect(result.aliases['sto_kb_emotecyclevisible_F_1_step0'].commands).toEqual(['emote '])
      })

      it('should handle missing context gracefully', () => {
        const activityData = { text: 'dance' }
        const context = {}
        const result = translator.generateActivityCommand(101, activityData, context)

        expect(result.commands).toEqual(['sto_kb_emotecyclevisible_key_0'])
        expect(result.aliases['sto_kb_emotecyclevisible_key_0_step0'].commands).toEqual(['emote dance'])
      })

      it('should ignore unused parameters (text2, n1, n2, n3)', () => {
        const activityData = {
          text: 'salute',
          text2: 'ignored',
          n1: 999,
          n2: 999,
          n3: 999
        }
        const context = {}
        const result = translator.generateActivityCommand(101, activityData, context)

        expect(result.aliases['sto_kb_emotecyclevisible_key_0_step0'].commands).toEqual(['emote salute'])
      })
    })

    describe('Activity 105 - bind_save_file', () => {
      it('should generate bind_save_file command with valid .txt file', () => {
        const activityData = { text: 'my_binds.txt' }
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(105, activityData, context)

        expect(result.type).toBe('text_command')
        expect(result.commands).toEqual(['bind_save_file my_binds.txt'])
        expect(result.aliases).toEqual({})
      })

      it('should replace spaces with underscores', () => {
        const activityData = { text: 'custom keybinds.txt' }
        const context = { environment: 'ground' }
        const result = translator.generateActivityCommand(105, activityData, context)

        expect(result.commands).toEqual(['bind_save_file custom_keybinds.txt'])
      })

      it('should handle case-insensitive .txt extension', () => {
        const activityData = { text: 'SAVES.TXT' }
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(105, activityData, context)

        expect(result.commands).toEqual(['bind_save_file SAVES.TXT'])
      })

      it('should reject files without .txt extension', () => {
        const activityData = { text: 'config.json' }
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(105, activityData, context)

        expect(result.type).toBe('text_command')
        expect(result.commands).toEqual([])
      })

      it('should reject empty file name', () => {
        const activityData = { text: '' }
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(105, activityData, context)

        expect(result.commands).toEqual([])
      })

      it('should reject short file names', () => {
        const activityData = { text: 'txt' }
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(105, activityData, context)

        expect(result.commands).toEqual([])
      })

      it('should handle exactly .txt extension', () => {
        const activityData = { text: 'test.txt' }
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(105, activityData, context)

        expect(result.commands).toEqual(['bind_save_file test.txt'])
      })
    })

    describe('Activity 112 - unbind_local', () => {
      it('should generate unbind_local command with text', () => {
        const activityData = { text: 'Space' }
        const context = { environment: 'space', bindsetName: 'test' }
        const result = translator.generateActivityCommand(112, activityData, context)

        expect(result.type).toBe('text_command')
        expect(result.commands).toEqual(['unbind_local Space'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 113 - chan', () => {
      it('should generate correct command structure for SayChannel activity', () => {
        const activityData = { text: 'team', text2: 'Hello team' }
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(113, activityData, context)

        expect(result.type).toBe('text_command')
        expect(result.commands).toEqual(['chan team Hello team'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 114 - unbind', () => {
      it('should generate correct command structure for UnbindKey activity', () => {
        const activityData = { text: 'Space' }
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(114, activityData, context)

        expect(result.type).toBe('text_command')
        expect(result.commands).toEqual(['unbind Space'])
        expect(result.aliases).toEqual({})
      })
    })
  })

  describe('generateActivityCommand - Parameterized Commands', () => {
    describe('Activity 4 - target_teammate', () => {
      it('should generate Target_Teammate command with n1 parameter', () => {
        const activityData = { n1: 1 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }

        const result = translator.generateActivityCommand(4, activityData, context)

        expect(result.type).toBe('parameterized_command')
        expect(result.commands).toEqual(['Target_Teammate 1'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 13 - TrayExecByTray', () => {
      it('should generate +TrayExecByTray command with n1 and n2 parameters', () => {
        const activityData = { n1: 8, n2: 5 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }

        const result = translator.generateActivityCommand(13, activityData, context)

        expect(result.type).toBe('parameterized_command')
        expect(result.commands).toEqual(['+TrayExecByTray 8 5'])
        expect(result.aliases).toEqual({})
      })

      it('should reject non-numeric types', () => {
        // Test that non-numeric types result in empty commands array
        const testCases = [
          { n1: '8', n2: 5, desc: 'n1 is string that is number' },
          { n1: 8, n2: '5', desc: 'n2 is string that is number' },
          { n1: '8', n2: '5', desc: 'both are strings that are numbers' },
          { n1: 'abc', n2: 5, desc: 'n1 is non-numeric string' },
          { n1: 8, n2: 'xyz', desc: 'n2 is non-numeric string' },
          { n1: 'abc', n2: 'xyz', desc: 'both are non-numeric strings' },
          { n1: {}, n2: 5, desc: 'n1 is object' },
          { n1: 8, n2: [], desc: 'n2 is array' }
        ]

        testCases.forEach(({ n1, n2, desc }) => {
          const activityData = { n1, n2 }
          const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }

          const result = translator.generateActivityCommand(13, activityData, context)

          expect(result.commands).toEqual([])
        })
      })
    })

    describe('Activity 24 - camdist', () => {
      it('should generate camdist command with n1 parameter', () => {
        const activityData = { n1: 200 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }

        const result = translator.generateActivityCommand(24, activityData, context)

        expect(result.type).toBe('parameterized_command')
        expect(result.commands).toEqual(['camdist 200'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 26 - TrayExecByTray - Full Tray', () => {
      const buildTraySequence = (tray) =>
        Array.from({ length: 10 }, (_, slot) => `+TrayExecByTray ${tray} ${slot}`)

      it('should generate full tray execution sequence with default tray 0', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }

        const result = translator.generateActivityCommand(26, activityData, context)

        expect(result.type).toBe('parameterized_command')
        expect(result.commands).toEqual(buildTraySequence(0))
        expect(result.aliases).toEqual({})
      })

      it('should generate full tray execution sequence for tray 1', () => {
        const activityData = { n1: 1 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F2' }

        const result = translator.generateActivityCommand(26, activityData, context)

        expect(result.type).toBe('parameterized_command')
        expect(result.commands).toEqual(buildTraySequence(1))
      })

      it('should handle invalid n1 parameter by defaulting to 0', () => {
        const activityData = { n1: null }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }

        const result = translator.generateActivityCommand(26, activityData, context)

        expect(result.commands).toEqual(buildTraySequence(0))
      })

      it('should handle NaN n1 parameter by defaulting to 0', () => {
        const activityData = { n1: NaN }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }

        const result = translator.generateActivityCommand(26, activityData, context)

        expect(result.commands).toEqual(buildTraySequence(0))
      })

      it('should produce ten individual tray commands in order', () => {
        const activityData = { n1: 0 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }

        const result = translator.generateActivityCommand(26, activityData, context)

        expect(result.commands).toHaveLength(10)
        expect(result.commands).toEqual(buildTraySequence(0))
        expect(result.commands[0]).toBe('+TrayExecByTray 0 0')
        expect(result.commands[9]).toBe('+TrayExecByTray 0 9')
      })
    })

    describe('Activity 64 - maxfps', () => {
      it('should generate maxfps command with n1 parameter', () => {
        const activityData = { n1: 60 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }

        const result = translator.generateActivityCommand(64, activityData, context)

        expect(result.type).toBe('parameterized_command')
        expect(result.commands).toEqual(['maxfps 60'])
        expect(result.aliases).toEqual({})
      })

      it('should handle NaN n1 parameter', () => {
        const activityData = { n1: NaN }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F5' }

        const result = translator.generateActivityCommand(64, activityData, context)

        expect(result.commands).toEqual(['maxfps 0'])
      })
    })

    describe('Activity 65 - perFrameSleep', () => {
      it('should generate perFrameSleep command with n1 parameter', () => {
        const activityData = { n1: 5 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }
        const result = translator.generateActivityCommand(65, activityData, context)
        expect(result.type).toBe('parameterized_command')
        expect(result.commands).toEqual(['perFrameSleep 5'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 34 - throttleadjust', () => {
      it('should generate throttleadjust command with positive percentage', () => {
        const activityData = { n1: 25 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }

        const result = translator.generateActivityCommand(34, activityData, context)

        expect(result.commands).toHaveLength(1)
        expect(result.commands[0]).toBe('throttleadjust 0.25')
        expect(result.type).toBe('parameterized_command')
        expect(result.aliases).toEqual({})
      })

      it('should generate throttleadjust command with negative percentage', () => {
        const activityData = { n1: -10 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }

        const result = translator.generateActivityCommand(34, activityData, context)

        expect(result.commands).toHaveLength(1)
        expect(result.commands[0]).toBe('throttleadjust -0.10')
        expect(result.type).toBe('parameterized_command')
      })
    })

    describe('Activity 66 - rdrMaxGPUFramesAhead', () => {
      it('should generate rdrMaxGPUFramesAhead 3 command when N1 is 3', () => {
        const activityData = { text: '', n1: 3, n2: 0, n3: 0 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }
        const result = translator.generateActivityCommand(66, activityData, context)

        expect(result.type).toBe('parameterized_command')
        expect(result.commands).toEqual(['rdrMaxGPUFramesAhead 3'])
        expect(result.commands).toHaveLength(1)
      })
    })

    describe('Activity 67 - rdrMaxFramesAhead', () => {
      it('should generate rdrMaxFramesAhead 3 command with N1 parameter', () => {
        const activityData = { text: '', n1: 3, n2: 0, n3: 0 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'Space' }
        const result = translator.generateActivityCommand(67, activityData, context)

        expect(result.type).toBe('parameterized_command')
        expect(result.commands).toEqual(['rdrMaxFramesAhead 3'])
        expect(result.commands).toHaveLength(1)
      })

      it('should process numeric values', () => {
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F3' }

        // Test integer
        const intResult = translator.generateActivityCommand(67, { n1: 4 }, context)
        expect(intResult.commands).toEqual(['rdrMaxFramesAhead 4'])

        // Test decimal
        const decimalResult = translator.generateActivityCommand(67, { n1: 3.7 }, context)
        expect(decimalResult.commands).toEqual(['rdrMaxFramesAhead 3.7'])

        // Test zero
        const zeroResult = translator.generateActivityCommand(67, { n1: 0 }, context)
        expect(zeroResult.commands).toEqual(['rdrMaxFramesAhead 0'])
      })
    })

    describe('Activity 76 - gamma', () => {
      it('should generate gamma command with formatted decimal value', () => {
        // Test cases from documentation: N1 divided by 100.0 and formatted to 2 decimal places
        const testCases = [
          { n1: 50, expected: 'gamma 0.50' },   // Light gamma
          { n1: 100, expected: 'gamma 1.00' },  // Normal gamma
          { n1: 150, expected: 'gamma 1.50' },  // Dark gamma
          { n1: 200, expected: 'gamma 2.00' },  // Very dark gamma
          { n1: 310, expected: 'gamma 3.10' },  // Extremely dark gamma
          { n1: 0, expected: 'gamma 0.00' },    // Minimum gamma
          { n1: 75, expected: 'gamma 0.75' },   // Custom value
        ]

        testCases.forEach(({ n1, expected }) => {
          const activityData = { n1 }
          const context = { environment: 'space', bindsetName: 'test', keyToken: 'G' }
          const result = translator.generateActivityCommand(76, activityData, context)

          expect(result.type).toBe('parameterized_command')
          expect(result.commands).toEqual([expected])
          expect(result.aliases).toEqual({})
        })
      })

      it('should generate gamma command with default value when n1 is missing', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'G' }
        const result = translator.generateActivityCommand(76, activityData, context)

        expect(result.type).toBe('parameterized_command')
        expect(result.commands).toEqual(['gamma 0.00'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 86 - GenSetEarlyOverrideFloat Hud_Statustargetoftarget_Space_Bufflist scale', () => {
      it('should generate scale commands with valid n1 percentage', () => {
        const activityData = { n1: 150 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }

        const result = translator.generateActivityCommand(86, activityData, context)

        // Should generate two commands joined by $$ for space and ground
        expect(result.commands[0]).toBe('GenSetEarlyOverrideFloat Hud_Statustargetoftarget_Space_Bufflist scale 1.50$$GenSetEarlyOverrideFloat Hud_Statustargetoftarget_Ground_Bufflist scale 1.50')
        expect(result.type).toBe('parameterized_command')
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 87 - GenSetEarlyOverrideFloat Hud_Statustarget_Space_Bufflist scale', () => {
      it('should generate scale commands with valid n1 percentage', () => {
        const activityData = { n1: 120 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F2' }

        const result = translator.generateActivityCommand(87, activityData, context)

        // Should generate two commands joined by $$ for space and ground
        expect(result.commands[0]).toBe('GenSetEarlyOverrideFloat Hud_Statustarget_Space_Bufflist scale 1.20$$GenSetEarlyOverrideFloat Hud_Statustarget_Ground_Bufflist scale 1.20')
        expect(result.type).toBe('parameterized_command')
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 88 - GenSetEarlyOverrideFloat Hud_Statustargetfocused_Space_Bufflist scale', () => {
      it('should generate scale commands with valid n1 percentage', () => {
        const activityData = { n1: 75 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F3' }

        const result = translator.generateActivityCommand(88, activityData, context)

        // Should generate two commands joined by $$ for space and ground
        expect(result.commands[0]).toBe('GenSetEarlyOverrideFloat Hud_Statustargetfocused_Space_Bufflist scale 0.75$$GenSetEarlyOverrideFloat Hud_Statustargetfocused_Ground_Bufflist scale 0.75')
        expect(result.type).toBe('parameterized_command')
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 89 - GenSetEarlyOverrideFloat Hud_Statusself_Bufflist scale', () => {
      it('should generate PersonalBuffScale command with default scale', () => {
        const activityData = { n1: 100 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }
        const result = translator.generateActivityCommand(89, activityData, context)

        expect(result.type).toBe('parameterized_command')
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0]).toBe('GenSetEarlyOverrideFloat Hud_Statusself_Bufflist scale 1.00')
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 91 - GenSetEarlyOverrideFloat Hud_Statustargetoftarget_Space_Bufflist scale', () => {
      it('should generate AllBuffScale commands with default scale', () => {
        const activityData = { n1: 100 }
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'F1' }
        const result = translator.generateActivityCommand(91, activityData, context)

        expect(result.type).toBe('parameterized_command')
        expect(result.commands).toHaveLength(1)
        expect(result.aliases).toEqual({})

        const command = result.commands[0]
        expect(command).toContain('GenSetEarlyOverrideFloat Hud_Statustargetoftarget_Space_Bufflist scale 1.00')
        expect(command).toContain('GenSetEarlyOverrideFloat Hud_Statustargetoftarget_Ground_Bufflist scale 1.00')
        expect(command).toContain('GenSetEarlyOverrideFloat Hud_Statustarget_Space_Bufflist scale 1.00')
        expect(command).toContain('GenSetEarlyOverrideFloat Hud_Statustarget_Ground_Bufflist scale 1.00')
        expect(command).toContain('GenSetEarlyOverrideFloat Hud_Statustargetfocused_Space_Bufflist scale 1.00')
        expect(command).toContain('GenSetEarlyOverrideFloat Hud_Statustargetfocused_Ground_Bufflist scale 1.00')
        expect(command).toContain('GenSetEarlyOverrideFloat Hud_Statusself_Bufflist scale 1.00')
      })
    })

    describe('Activity 92 - GenSetEarlyOverrideFloat Hud_Spacetraywindow_Large scale', () => {
      it('should generate ScaleSpaceTray command with default scale 100%', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'S' }
        const result = translator.generateActivityCommand(92, activityData, context)

        expect(result.type).toBe('parameterized_command')
        expect(result.commands).toEqual(['GenSetEarlyOverrideFloat Hud_Spacetraywindow_Large scale 1.00'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 93 - GenSetEarlyOverrideFloat Hud_Buffs scale', () => {
      it('should generate SpacePersonalBuffScale command with default scale 100%', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'B' }
        const result = translator.generateActivityCommand(93, activityData, context)

        expect(result.type).toBe('parameterized_command')
        expect(result.commands).toEqual(['GenSetEarlyOverrideFloat Hud_Buffs scale 1.00'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 94 - GenSetEarlyOverrideFloat Hud_Spacetraywindow_Secondary 1.00', () => {
      it('should generate SpaceVerticleTrayScale command with default scale 100%', () => {
        const activityData = {}
        const context = { environment: 'space', bindsetName: 'test', keyToken: 'V' }
        const result = translator.generateActivityCommand(94, activityData, context)

        expect(result.type).toBe('parameterized_command')
        expect(result.commands).toEqual(['GenSetEarlyOverrideFloat Hud_Spacetraywindow_Secondary 1.00'])
        expect(result.aliases).toEqual({})
      })
    })

    describe('Activity 95 - TrayExecByTray - Partial Tray', () => {
      it('should generate +TrayExecByTray commands for range of slots', () => {
        const activityData = { n1: 0, n2: 2, n3: 4 }  // Tray 0, slots 2-4
        const context = { baseKeyName: 'Space', index: 0 }
        const result = translator.generateActivityCommand(95, activityData, context)

        expect(result.type).toBe('parameterized_command')
        expect(result.commands).toEqual([
          '+TrayExecByTray 0 2',
          '+TrayExecByTray 0 3',
          '+TrayExecByTray 0 4'
        ])
        expect(result.aliases).toEqual({})
      })

      it('should handle single slot execution', () => {
        const activityData = { n1: 1, n2: 5, n3: 5 }  // Tray 1, slot 5 only
        const context = { baseKeyName: 'R', index: 1 }
        const result = translator.generateActivityCommand(95, activityData, context)

        expect(result.commands).toEqual(['+TrayExecByTray 1 5'])
      })

      it('should handle missing numeric values with defaults', () => {
        const activityData = {}  // No values provided
        const context = { baseKeyName: 'T', index: 0 }
        const result = translator.generateActivityCommand(95, activityData, context)

        expect(result.commands).toEqual(['+TrayExecByTray 0 0'])  // fromSlot=0, toSlot=0
      })
    })

    describe('Activity 116 - GenSliderSetNotch Doff_Recipe_Quantity_Slider', () => {
      it('should generate correct command with default value', () => {
        const activityData = {}
        const context = { environment: 'space' }
        const result = translator.generateActivityCommand(116, activityData, context)

        expect(result.commands).toEqual(['GenSliderSetNotch Doff_Recipe_Quantity_Slider 100'])
        expect(result.type).toBe('parameterized_command')
        expect(result.aliases).toEqual({})
      })

      it('should generate correct command with custom n1 value', () => {
        const activityData = { n1: 50 }
        const context = { environment: 'ground' }
        const result = translator.generateActivityCommand(116, activityData, context)

        expect(result.commands).toEqual(['GenSliderSetNotch Doff_Recipe_Quantity_Slider 50'])
        expect(result.type).toBe('parameterized_command')
      })
    })

    describe('Activity 121 - trayelemdestroy', () => {
      it('should generate parameterized command with tray and slot numbers', () => {
        const testCases = [
          { n1: 0, n2: 0, expected: 'trayelemdestroy 0 0' },
          { n1: 1, n2: 4, expected: 'trayelemdestroy 1 4' },
          { n1: 9, n2: 2, expected: 'trayelemdestroy 9 2' },
          { n1: 5, n2: 9, expected: 'trayelemdestroy 5 9' }
        ]

        testCases.forEach((testCase, index) => {
          const context = { environment: 'space' }
          const result = translator.generateActivityCommand(121, testCase, context)

          expect(result.commands).toEqual([testCase.expected])
          expect(result.type).toBe('parameterized_command')
          expect(result.aliases).toEqual({})
        })
      })

      it('should handle edge cases and default values', () => {
        const testCases = [
          { activityData: {}, expected: 'trayelemdestroy 0 0' },
          { activityData: { text: 'ignored' }, expected: 'trayelemdestroy 0 0' },
          { activityData: { n1: null, n2: null }, expected: 'trayelemdestroy 0 0' },
          { activityData: { n1: undefined, n2: undefined }, expected: 'trayelemdestroy 0 0' },
          { activityData: { n1: 3 }, expected: 'trayelemdestroy 3 0' },
          { activityData: { n2: 7 }, expected: 'trayelemdestroy 0 7' }
        ]

        testCases.forEach((testCase, index) => {
          const context = { environment: 'space' }
          const result = translator.generateActivityCommand(121, testCase.activityData, context)

          expect(result.commands).toEqual([testCase.expected])
          expect(result.type).toBe('parameterized_command')
        })
      })
    })

    describe('Activity 122 - trayelemdestroy - Full Tray', () => {
      it('should generate loop of trayelemdestroy commands for all slots 0-9', () => {
        const testCases = [
          { n1: 0, expectedTray: 0 },
          { n1: 1, expectedTray: 1 },
          { n1: 5, expectedTray: 5 },
          { n1: 9, expectedTray: 9 }
        ]

        testCases.forEach((testCase) => {
          const context = { environment: 'space' }
          const result = translator.generateActivityCommand(122, testCase, context)

          // Should generate 10 commands for slots 0-9
          expect(result.commands).toHaveLength(10)
          expect(result.type).toBe('parameterized_command')
          expect(result.aliases).toEqual({})

          // Check each command in the sequence
          for (let slotNum = 0; slotNum <= 9; slotNum++) {
            expect(result.commands[slotNum]).toBe(`trayelemdestroy ${testCase.expectedTray} ${slotNum}`)
          }
        })
      })

      it('should handle edge cases and default tray number', () => {
        const testCases = [
          { activityData: {}, expectedTray: 0 },
          { activityData: { text: 'ignored' }, expectedTray: 0 },
          { activityData: { n1: null }, expectedTray: 0 },
          { activityData: { n1: undefined }, expectedTray: 0 },
          { activityData: { n2: 5, n3: 7 }, expectedTray: 0 } // n2, n3 should be ignored
        ]

        testCases.forEach((testCase) => {
          const context = { environment: 'ground' }
          const result = translator.generateActivityCommand(122, testCase.activityData, context)

          expect(result.commands).toHaveLength(10)
          // All commands should use tray 0 (default)
          for (let slotNum = 0; slotNum <= 9; slotNum++) {
            expect(result.commands[slotNum]).toBe(`trayelemdestroy ${testCase.expectedTray} ${slotNum}`)
          }
          expect(result.type).toBe('parameterized_command')
        })
      })
    })
  })
})
