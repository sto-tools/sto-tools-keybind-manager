import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Import real data first to ensure STO_DATA is available
import '../../src/js/data.js'

// Load the modules (they create global instances)
import eventBus from '../../src/js/core/eventBus.js'
import store, { resetStore } from '../../src/js/core/store.js'
import { respond } from '../../src/js/core/requestResponse.js'
import { StorageService } from '../../src/js/components/services/index.js'

import KeyService from '../../src/js/components/services/KeyService.js'
import FileOperationsService from '../../src/js/components/services/FileOperationsService.js'
import STOCommandParser from '../../src/js/lib/STOCommandParser.js'

  // Setup real global objects instead of mocks
beforeEach(() => {
  resetStore()
  global.window = global.window || {}
  global.storageService = new StorageService()


  // Initialize STOCommandParser for request handling
  global.stoCommandParser = new STOCommandParser(eventBus)

  // Mock only the UI methods that would show actual UI
  global.stoUI = {
    showToast: vi.fn(),
  }
  global.window = global.window || {}
  global.window.stoUI = global.stoUI

  // Initialize FileOperationsService with proper eventBus for requestResponse support
  global.fileOperationsService = new FileOperationsService({
    eventBus,
    storage: global.storageService,
    i18n: { 
      t: (key, params) => {
        // Mock i18n that returns appropriate test strings
        if (key === 'import_completed_with_ignored_aliases') {
          return `Import completed: ${params.keyCount} keybinds (${params.ignoredAliases} aliases ignored - use Import Aliases)`
        }
        if (key === 'import_completed') {
          return `Import completed: ${params.keyCount} keybinds`
        }
        return key
      }
    },
    ui: global.stoUI
  })
  global.fileOperationsService.init()

  // Mock data service response for alias validation
  respond(eventBus, 'data:get-alias-name-pattern', () => {
    return /^[A-Za-z_][A-Za-z0-9_]*$/ // Valid pattern: letters/numbers/underscore, can start with letter or underscore
  })

  // Set up proper storage mock that actually persists data for testing
  const testProfiles = {
    'test-profile': {
      id: 'test-profile',
      name: 'Test Profile',
      mode: 'Space',
      builds: {
        space: { keys: {} },
        ground: { keys: {} }
      },
      aliases: {}
    }
  }
  
  // Mock the storage service with actual persistence simulation
  global.storageService.getProfile = vi.fn((profileId) => {
    return testProfiles[profileId] || null
  })
  
  global.storageService.saveProfile = vi.fn((profileId, profile) => {
    testProfiles[profileId] = profile
  })
  
  global.storageService.getCurrentProfileId = vi.fn().mockReturnValue('test-profile')

  // Mock only the app methods that would modify actual DOM
  global.app = {
    getCurrentProfile: vi.fn(() => ({
      keys: {},
      aliases: {},
      name: 'Test Profile',
      mode: 'Space',
    })),
    currentProfile: 'test-profile',
    currentEnvironment: 'space',
    setModified: vi.fn(),
    loadData: vi.fn(),
    renderKeyGrid: vi.fn(),
    renderCommandChain: vi.fn(),
    saveCurrentBuild: vi.fn(),
    saveProfile: vi.fn(),
  }

  store.currentProfile = 'test-profile'
  store.currentEnvironment = 'space'
})

describe('KeyService', () => {
  let keybindManager
  let testProfiles
  let stoUI

  beforeEach(() => {
    // Set reference to stoUI for test expectations
    stoUI = global.stoUI
    keybindManager = new KeyService({ eventBus })
  
    // Set current profile for import operations
    keybindManager.setCurrentProfile('test-profile')
    
    // Reset test profiles between tests to ensure clean state
    testProfiles = {
      'test-profile': {
        id: 'test-profile',
        name: 'Test Profile',
        mode: 'Space',
        builds: {
          space: { keys: {} },
          ground: { keys: {} }
        },
        aliases: {}
      }
    }
    
    // Update the mock implementations to use the fresh profile data
    global.storageService.getProfile.mockImplementation((profileId) => {
      return testProfiles[profileId] || null
    })
    
    global.storageService.saveProfile.mockImplementation((profileId, profile) => {
      testProfiles[profileId] = profile
    })
    
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should generate valid keys list', () => {
      const validKeys = keybindManager.generateValidKeys()
      expect(validKeys).toBeInstanceOf(Array)
      expect(validKeys.length).toBeGreaterThan(0)
      expect(validKeys).toContain('F1')
      expect(validKeys).toContain('Space')
      expect(validKeys).toContain('A')
    })

    it('should include function keys F1-F12', () => {
      const validKeys = keybindManager.validKeys
      for (let i = 1; i <= 12; i++) {
        expect(validKeys).toContain(`F${i}`)
      }
    })

    it('should include modifier combinations', () => {
      const validKeys = keybindManager.validKeys
      expect(validKeys).toContain('Ctrl+A')
      expect(validKeys).toContain('Alt+F1')
      expect(validKeys).toContain('Shift+Space')
      expect(validKeys).toContain('Control+A')
    })

    it('should include special keys and mouse buttons', () => {
      const validKeys = keybindManager.validKeys
      expect(validKeys).toContain('Space')
      expect(validKeys).toContain('Tab')
      expect(validKeys).toContain('Button4')
      expect(validKeys).toContain('Lbutton')
      expect(validKeys).toContain('Wheelplus')
    })
  })

  describe('keybind file parsing', () => {
    it('should parse standard keybind format', async () => {
      const content = 'F1 "say hello" ""'
      const result = await keybindManager.parseKeybindFile(content)

      expect(result.keybinds).toHaveProperty('F1')
      expect(result.keybinds.F1.raw).toBe('say hello')
      expect(result.keybinds.F1.commands).toHaveLength(1)
      expect(result.keybinds.F1.commands[0].command).toBe('say hello')
      expect(result.keybinds.F1.commands[0].category).toBe('communication')
    })



    it('should parse alias definitions', async () => {
      const content = 'alias TestAlias "say test"'
      const result = await keybindManager.parseKeybindFile(content)

      expect(result.aliases).toHaveProperty('TestAlias')
      expect(result.aliases.TestAlias.commands).toBe('say test')
    })

    it('should skip comment lines', async () => {
      const content =
        '# This is a comment\n; Another comment\nF1 "say hello" ""'
      const result = await keybindManager.parseKeybindFile(content)

      // Comments are ignored (not tracked separately in new format)
      expect(result.keybinds).toHaveProperty('F1')
      expect(result.keybinds.F1.commands[0].command).toBe('say hello')
      expect(result.errors).toHaveLength(0) // Comments should not generate errors
    })

    it('should handle multi-line files', async () => {
      const content =
        'F1 "say hello" ""\nF2 "say world" ""\nalias Test "say test"'
      const result = await keybindManager.parseKeybindFile(content)

      expect(Object.keys(result.keybinds)).toHaveLength(2)
      expect(Object.keys(result.aliases)).toHaveLength(1)
    })

    it('should collect parsing errors', async () => {
      const content = 'invalid line format\nF1 "say hello" ""'
      const result = await keybindManager.parseKeybindFile(content)

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].line).toBe(1)
      expect(result.errors[0].error).toBe('Invalid keybind format')
    })

    it('should handle empty lines gracefully', async () => {
      const content = '\n\nF1 "say hello" ""\n\n'
      const result = await keybindManager.parseKeybindFile(content)

      expect(result.keybinds).toHaveProperty('F1')
      expect(result.errors).toHaveLength(0)
    })

    it('should parse aliases with both quoted and bracket syntax', async () => {
      const content = `alias test_quoted "say hello world"
alias test_bracket <& say hello world &>
alias complex_bracket <& TrayExecByTray 1 3 0 $$ alias cone_attack "cone_attack2" &>`

      const result = await keybindManager.parseKeybindFile(content)

      expect(result.aliases).toHaveProperty('test_quoted')
      expect(result.aliases.test_quoted.commands).toBe('say hello world')

      expect(result.aliases).toHaveProperty('test_bracket')
      expect(result.aliases.test_bracket.commands).toBe('say hello world')

      expect(result.aliases).toHaveProperty('complex_bracket')
      expect(result.aliases.complex_bracket.commands).toBe(
        'TrayExecByTray 1 3 0 $$ alias cone_attack "cone_attack2"'
      )

      expect(Object.keys(result.aliases)).toHaveLength(3)
    })
  })

  describe('command string parsing', () => {
    it('should split commands by $$ delimiter', async () => {
      const commands = await keybindManager.parseCommandString(
        'say hello $$ emote wave'
      )

      expect(commands).toHaveLength(2)
      expect(commands[0].command).toBe('say hello')
      expect(commands[1].command).toBe('emote wave')
    })

    it('should detect tray execution commands', async () => {
      const commands = await keybindManager.parseCommandString(
        '+STOTrayExecByTray 0 1'
      )

      expect(commands).toHaveLength(1)
      expect(commands[0].command).toBe('+STOTrayExecByTray 0 1')
      expect(commands[0].category).toBe('tray')
      expect(commands[0].parameters).toEqual({ 
        tray: 0, 
        slot: 1, 
        baseCommand: '+STOTrayExecByTray' 
      })
    })

    it('should extract tray parameters', async () => {
      const commands = await keybindManager.parseCommandString(
        '+STOTrayExecByTray 2 5'
      )

      expect(commands[0].parameters.tray).toBe(2)
      expect(commands[0].parameters.slot).toBe(5)
      expect(commands[0].displayText).toBe('Execute Tray 3 Slot 6')
    })

    it('should handle communication commands', async () => {
      const commands = await keybindManager.parseCommandString('say hello world')

      expect(commands[0].command).toBe('say hello world')
      expect(commands[0].category).toBe('communication')
      expect(commands[0].icon).toBe('💬')
    })

    it('should parse commands with flexible separator formats', async () => {
      // Test with spaces around separator
      const commandsWithSpaces = await keybindManager.parseCommandString('say hello $$ emote wave')
      expect(commandsWithSpaces).toHaveLength(2)
      expect(commandsWithSpaces[0].command).toBe('say hello')
      expect(commandsWithSpaces[1].command).toBe('emote wave')

      // Test without spaces around separator
      const commandsWithoutSpaces = await keybindManager.parseCommandString('say hello$$emote wave')
      expect(commandsWithoutSpaces).toHaveLength(2)
      expect(commandsWithoutSpaces[0].command).toBe('say hello')
      expect(commandsWithoutSpaces[1].command).toBe('emote wave')

      // Test with mixed spacing
      const commandsMixed = await keybindManager.parseCommandString('say hello$$ emote wave')
      expect(commandsMixed).toHaveLength(2)
      expect(commandsMixed[0].command).toBe('say hello')
      expect(commandsMixed[1].command).toBe('emote wave')
    })

    it('should generate command IDs', async () => {
      const commands = await keybindManager.parseCommandString('say hello')

      expect(commands[0].id).toMatch(/^parsed_\d+_0$/)
    })

    it('should set command types and icons', async () => {
      const commands = await keybindManager.parseCommandString('say hello')

      expect(commands[0].category).toBe('communication')
      expect(commands[0].icon).toBe('💬')
    })
  })

  describe('keybind file import', () => {
    beforeEach(() => {
      global.app.getCurrentProfile.mockReturnValue({
        keys: { F1: [{ command: 'existing' }] },
        aliases: {},
        name: 'Test Profile',
        mode: 'Space',
      })
      global.app.saveProfile = vi.fn()
      global.app.renderKeyGrid = vi.fn()
    })

    it('should import valid keybind file content', async () => {
      const content = 'F2 "say hello" ""'
      const result = await keybindManager.importKeybindFile(content)

      expect(result.success).toBe(true)
      expect(result.imported.keys).toBe(1)
      expect(storageService.saveProfile).toHaveBeenCalled()
    })

    it('should merge with existing profile data', async () => {
      const content = 'F2 "say hello" ""'
      const result = await keybindManager.importKeybindFile(content)

      expect(result.success).toBe(true)
      expect(result.imported.keys).toBe(1)
      // Test that the import function succeeded
      expect(result.imported).toHaveProperty('keys')
    })

    it('should handle duplicate key bindings', async () => {
      const content = 'F1 "say new" ""'
      const result = await keybindManager.importKeybindFile(content)

      expect(result.success).toBe(true)
      expect(result.imported.keys).toBe(1)
      // Test that the import function succeeded
      expect(result.imported).toHaveProperty('keys')
    })

    it('should preserve existing commands when merging', async () => {
      const content = 'F2 "say hello" ""'
      const result = await keybindManager.importKeybindFile(content)

      expect(result.success).toBe(true)
      expect(result.imported.keys).toBe(1)
      // Test that the import function succeeded
      expect(result.imported).toHaveProperty('keys')
    })

    it('should update profile modification timestamp', async () => {
      const content = 'F1 "say hello" ""'
      await keybindManager.importKeybindFile(content)

      expect(app.setModified).toHaveBeenCalledWith(true)
    })

    it('should show import summary', async () => {
      const content = 'F1 "say hello" ""\nalias Test "say test"'
      await keybindManager.importKeybindFile(content)

      expect(stoUI.showToast).toHaveBeenCalledWith(
        'Import completed: 1 keybinds (1 aliases ignored - use Import Aliases)',
        'success'
      )
    })

    it('should import keybinds separately from aliases', async () => {
      const profile = {
        name: 'Test',
        mode: 'Space',
        keys: {},
        aliases: {},
      }

      const content = 'F1 "say hello"\nalias TestAlias "say test"'
      const result = await keybindManager.importKeybindFile(content)

      // Should only import keybinds, not aliases
      expect(result.success).toBe(true)
      expect(result.imported.keys).toBe(1)
      expect(result.imported).not.toHaveProperty('aliases')
    })

    it('should import aliases separately', async () => {
      const profile = {
        name: 'Test',
        mode: 'Space',
        keys: {},
        aliases: {},
      }
      global.app.getCurrentProfile.mockReturnValue(profile)

      const content = 'F1 "say hello"\nalias TestAlias "say test"'
      const result = await keybindManager.importAliasFile(content)

      // Should only import aliases, not keybinds
      expect(result.success).toBe(true)
      expect(result.imported.aliases).toBe(1)
      expect(result.imported).not.toHaveProperty('keys')
    })
  })

  describe('profile export', () => {
    it('should export profile in STO keybind format', async () => {
      const profile = {
        name: 'Test Profile',
        mode: 'Space',
        keys: { F1: [{ command: 'say hello' }] },
        aliases: {},
      }

      const output = await keybindManager.exportProfile(profile)

      expect(output).toContain('; Test Profile - STO Keybind Configuration')
      expect(output).toContain('F1 "say hello"')
    })

    it('should sort keys logically', async () => {
      const profile = {
        name: 'Test',
        mode: 'Space',
        keys: {
          A: [{ command: 'say a' }],
          F1: [{ command: 'say f1' }],
          1: [{ command: 'say 1' }],
        },
        aliases: {},
      }

      const output = await keybindManager.exportProfile(profile)
      const lines = output.split('\n').filter((line) => line.match(/^[FA1]/))

      expect(lines[0]).toContain('F1')
      expect(lines[1]).toContain('1')
      expect(lines[2]).toContain('A')
    })

    it('should handle special characters in commands', async () => {
      const profile = {
        name: 'Test',
        mode: 'Space',
        keys: { F1: [{ command: 'say hello world' }] },
        aliases: {},
      }

      const output = await keybindManager.exportProfile(profile)

      expect(output).toContain('F1 "say hello world"')
    })

    it('should group similar keys together', async () => {
      const profile = {
        name: 'Test',
        mode: 'Space',
        keys: {
          F1: [{ command: 'say f1' }],
          F2: [{ command: 'say f2' }],
          A: [{ command: 'say a' }],
          B: [{ command: 'say b' }],
        },
        aliases: {},
      }

      const output = await keybindManager.exportProfile(profile)
      const lines = output.split('\n').filter((line) => line.match(/^[FAB]/))

      expect(lines[0]).toContain('F1')
      expect(lines[1]).toContain('F2')
      expect(lines[2]).toContain('A')
      expect(lines[3]).toContain('B')
    })

    it('should include file header with metadata', async () => {
      const profile = {
        name: 'Test Profile',
        mode: 'Ground',
        keys: {},
        aliases: {},
      }

      const output = await keybindManager.exportProfile(profile)

      expect(output).toContain('; Test Profile - STO Keybind Configuration')
      expect(output).toContain('; Created by: STO Tools Keybind Manager')
      expect(output).toMatch(/; Generated: \d{1,2}\/\d{1,2}\/\d{4}/)
    })

    it('should export keybinds without aliases', async () => {
      const profile = {
        name: 'Test',
        mode: 'Space',
        keys: { F1: [{ command: 'say hello' }] },
        aliases: { TestAlias: { commands: 'say test' } },
      }

      const output = await keybindManager.exportProfile(profile)
      expect(output).toContain('F1 "say hello"')
      expect(output).not.toContain('alias TestAlias')
    })
  })

  describe('key validation', () => {
    it('should validate key names against valid keys list', () => {
      expect(keybindManager.isValidKey('F1')).toBe(true)
      expect(keybindManager.isValidKey('InvalidKey')).toBe(false)
    })

    it('should accept standard keys', () => {
      expect(keybindManager.isValidKey('F1')).toBe(true)
      expect(keybindManager.isValidKey('Space')).toBe(true)
      expect(keybindManager.isValidKey('A')).toBe(true)
    })

    it('should accept modifier combinations', () => {
      expect(keybindManager.isValidKey('Ctrl+A')).toBe(true)
      expect(keybindManager.isValidKey('Alt+F1')).toBe(true)
      expect(keybindManager.isValidKey('Shift+Space')).toBe(true)
    })

    it('should reject invalid key names', () => {
      expect(keybindManager.isValidKey('InvalidKey')).toBe(false)
      expect(keybindManager.isValidKey('F13')).toBe(false)
      expect(keybindManager.isValidKey('')).toBe(false)
    })

    it('should handle case sensitivity appropriately', () => {
      expect(keybindManager.isValidKey('f1')).toBe(true)
      expect(keybindManager.isValidKey('space')).toBe(true)
      expect(keybindManager.isValidKey('ctrl+a')).toBe(true)
    })

    it('should handle null and undefined values', () => {
      expect(keybindManager.isValidKey(null)).toBe(false)
      expect(keybindManager.isValidKey(undefined)).toBe(false)
      expect(keybindManager.isValidKey(123)).toBe(false)
    })
  })

  describe('alias name validation', () => {
    it('should validate alias name format', async () => {
      expect(await keybindManager.isValidAliasName('ValidAlias')).toBe(true)
      expect(await keybindManager.isValidAliasName('_underscore')).toBe(true)
      expect(await keybindManager.isValidAliasName('alias123')).toBe(true)
    })

    it('should reject names with spaces', async () => {
      expect(await keybindManager.isValidAliasName('invalid alias')).toBe(false)
      expect(await keybindManager.isValidAliasName('test alias')).toBe(false)
    })

    it('should reject names starting with numbers', async () => {
      expect(await keybindManager.isValidAliasName('123invalid')).toBe(false)
      expect(await keybindManager.isValidAliasName('1test')).toBe(false)
    })

    it('should accept valid alphanumeric names', async () => {
      expect(await keybindManager.isValidAliasName('ValidAlias')).toBe(true)
      expect(await keybindManager.isValidAliasName('test123')).toBe(true)
      expect(await keybindManager.isValidAliasName('_private')).toBe(true)
    })
  })

  describe('keybind validation', () => {
    it('should validate keybind key and commands', () => {
      const result = keybindManager.validateKeybind('F1', [
        { command: 'say hello' },
      ])

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect empty command sequences', () => {
      const result = keybindManager.validateKeybind('F1', [])

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('At least one command is required')
    })

    it('should validate command syntax', () => {
      const result = keybindManager.validateKeybind('F1', [{ command: '' }])

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Command 1 is empty')
    })

    it('should check for command count limits', () => {
      const commands = Array(25)
        .fill(0)
        .map((_, i) => ({ command: `command${i}` }))
      const result = keybindManager.validateKeybind('F1', commands)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Too many commands (max 20)')
    })

    it('should validate key names', () => {
      const result = keybindManager.validateKeybind('InvalidKey', [
        { command: 'say hello' },
      ])

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Invalid key name: InvalidKey')
    })
  })

  describe('key suggestions', () => {
    it('should suggest keys based on filter', () => {
      const suggestions = keybindManager.suggestKeys('F1')

      expect(suggestions.some((key) => key.includes('F1'))).toBe(true)
      expect(suggestions.every((key) => key.toLowerCase().includes('f1'))).toBe(
        true
      )
      expect(suggestions.length).toBeLessThanOrEqual(20)
    })

    it('should filter keys case-insensitively', () => {
      const suggestions = keybindManager.suggestKeys('ctrl')

      expect(suggestions.some((key) => key.includes('Ctrl'))).toBe(true)
    })

    it('should limit suggestion count', () => {
      const suggestions = keybindManager.suggestKeys('')

      expect(suggestions.length).toBeLessThanOrEqual(20)
    })

    it('should return empty array for no matches', () => {
      const suggestions = keybindManager.suggestKeys('InvalidKeyPattern')

      expect(suggestions).toHaveLength(0)
    })
  })

  describe('common keys', () => {
    it('should return list of commonly used keys', () => {
      const commonKeys = keybindManager.getCommonKeys()

      expect(commonKeys).toContain('Space')
      expect(commonKeys).toContain('F1')
      expect(commonKeys).toContain('Ctrl+1')
      expect(commonKeys.length).toBeGreaterThan(0)
    })
  })

  describe('utility methods', () => {
    it('should generate unique keybind IDs', () => {
      const id1 = keybindManager.generateKeybindId()
      const id2 = keybindManager.generateKeybindId()

      expect(id1).toMatch(/^keybind_\d+_[a-z0-9]+$/)
      expect(id2).toMatch(/^keybind_\d+_[a-z0-9]+$/)
      expect(id1).not.toBe(id2)
    })

    it('should clone keybind objects', () => {
      const original = {
        key: 'F1',
        commands: [{ command: 'say hello' }],
      }

      const cloned = keybindManager.cloneKeybind(original)

      expect(cloned).toEqual(original)
      expect(cloned).not.toBe(original)
      expect(cloned.commands).not.toBe(original.commands)
    })
  })

  describe('profile statistics', () => {
    it('should calculate profile statistics', () => {
      const profile = {
        keys: {
          F1: [{ command: 'say hello', type: 'communication' }],
          F2: [{ command: 'emote wave', type: 'custom' }],
        },
        aliases: {
          TestAlias: { commands: 'say test' },
        },
      }

      const stats = keybindManager.getProfileStats(profile)

      expect(stats.totalKeys).toBe(2)
      expect(stats.totalCommands).toBe(2)
      expect(stats.totalAliases).toBe(1)
      expect(stats.commandTypes.communication).toBe(1)
      expect(stats.commandTypes.custom).toBe(1)
    })

    it('should count command usage', () => {
      const profile = {
        keys: {
          F1: [{ command: 'say hello', type: 'communication' }],
          F2: [{ command: 'say hello', type: 'communication' }],
        },
        aliases: {},
      }

      const stats = keybindManager.getProfileStats(profile)

      expect(stats.mostUsedCommands['say hello']).toBe(2)
    })

    it('should handle empty profiles', () => {
      const profile = {
        keys: {},
        aliases: {},
      }

      const stats = keybindManager.getProfileStats(profile)

      expect(stats.totalKeys).toBe(0)
      expect(stats.totalCommands).toBe(0)
      expect(stats.totalAliases).toBe(0)
    })
  })

  describe('key comparison and sorting', () => {
    it('should sort function keys numerically', () => {
      const keys = ['F10', 'F2', 'F1']
      const sorted = keys.sort(keybindManager.compareKeys.bind(keybindManager))

      expect(sorted).toEqual(['F1', 'F2', 'F10'])
    })

    it('should prioritize function keys over other keys', () => {
      const keys = ['A', 'F1', '1']
      const sorted = keys.sort(keybindManager.compareKeys.bind(keybindManager))

      expect(sorted[0]).toBe('F1')
    })

    it('should sort numbers after function keys', () => {
      const keys = ['A', '2', 'F1', '1']
      const sorted = keys.sort(keybindManager.compareKeys.bind(keybindManager))

      expect(sorted).toEqual(['F1', '1', '2', 'A'])
    })

    it('should sort letters after numbers', () => {
      const keys = ['Z', '1', 'A']
      const sorted = keys.sort(keybindManager.compareKeys.bind(keybindManager))

      expect(sorted).toEqual(['1', 'A', 'Z'])
    })

    it('should handle special keys', () => {
      const keys = ['Enter', 'Space', 'Tab', 'Escape']
      const sorted = keys.sort(keybindManager.compareKeys.bind(keybindManager))

      expect(sorted).toEqual(['Space', 'Tab', 'Enter', 'Escape'])
    })
  })

  describe('event handling', () => {
    it('should setup event listeners', () => {
      // Event listeners are now handled directly in profiles.js
      // This test verifies the method exists and doesn't throw
      expect(() => keybindManager.setupEventListeners()).not.toThrow()
    })

    it('should handle file input changes', () => {
      const mockFile = new File(['F1 "say hello" ""'], 'test.txt', {
        type: 'text/plain',
      })
      const mockEvent = {
        target: {
          id: 'fileInput',
          accept: '.txt',
          files: [mockFile],
          value: 'test.txt',
        },
      }

      const readAsTextSpy = vi.spyOn(FileReader.prototype, 'readAsText')

      keybindManager.handleKeybindFileImport(mockEvent)

      expect(readAsTextSpy).toHaveBeenCalledWith(mockFile)
      expect(mockEvent.target.value).toBe('')
    })
  })

  describe('alias import functionality', () => {
    beforeEach(() => {
      global.app.getCurrentProfile.mockReturnValue({
        keys: {},
        aliases: {},
        name: 'Test Profile',
        mode: 'Space',
      })
      global.app.saveProfile = vi.fn()
      global.app.setModified = vi.fn()
    })

    it('should import alias file content successfully', async () => {
      const content = 'alias TestAlias "say hello $$ emote wave"'
      const result = await keybindManager.importAliasFile(content)

      expect(result.success).toBe(true)
      expect(result.imported.aliases).toBe(1)
    })

    it('should handle alias files with multiple aliases', async () => {
      const content = `alias Attack "target_nearest_enemy $$ FireAll"
alias Heal "target_self $$ +power_exec Distribute_Shields"`
      const result = await keybindManager.importAliasFile(content)

      expect(result.success).toBe(true)
      expect(result.imported.aliases).toBe(2)
    })

    it('should ignore keybinds in alias import', async () => {
      const content = `F1 "say hello"
alias TestAlias "say test"
F2 "say world"`
      const result = await keybindManager.importAliasFile(content)

      expect(result.success).toBe(true)
      expect(result.imported.aliases).toBe(1)
      expect(result.imported).not.toHaveProperty('keys')
    })

    it('should warn when no aliases found', async () => {
      const content = 'F1 "say hello"\nF2 "say world"'
      const result = await keybindManager.importAliasFile(content)

      expect(result.success).toBe(false)
      expect(result.error).toBe('No aliases found')
    })

    it('should handle empty alias files', async () => {
      const content = ''
      const result = await keybindManager.importAliasFile(content)

      expect(result.success).toBe(false)
      expect(result.error).toBe('No aliases found')
    })

    it('should merge aliases with existing ones', async () => {
      const profile = {
        keys: {},
        aliases: { ExistingAlias: { commands: 'existing command' } },
        name: 'Test Profile',
        mode: 'Space',
      }
      global.app.getCurrentProfile.mockReturnValue(profile)

      // Mock storageService.getProfile to return the same profile that will be modified
      global.storageService.getProfile.mockReturnValue(profile)

      const content = 'alias NewAlias "new command"'
      await keybindManager.importAliasFile(content)

      expect(profile.aliases).toHaveProperty('ExistingAlias')
      expect(profile.aliases).toHaveProperty('NewAlias')
    })

    it('should update profile modification status', async () => {
      const content = 'alias TestAlias "say test"'
      await keybindManager.importAliasFile(content)

      expect(storageService.saveProfile).toHaveBeenCalled()
      expect(app.setModified).toHaveBeenCalledWith(true)
    })
  })

  describe('execution order stabilization', () => {
    it('should generate mirrored command string for multiple commands', async () => {
      const commands = [
        { command: '+TrayExecByTray 9 0' },
        { command: '+TrayExecByTray 9 1' },
        { command: '+TrayExecByTray 9 2' },
      ]

      const result = await keybindManager.generateMirroredCommandString(commands)

      // Should be: reverse + original = [2,1,0] + [0,1,2]
      expect(result).toBe(
        '+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0'
      )
    })

    it('should handle single command without mirroring', async () => {
      const commands = [{ command: '+TrayExecByTray 9 0' }]

      const result = await keybindManager.generateMirroredCommandString(commands)

      expect(result).toBe('+TrayExecByTray 9 0')
    })

    it('should handle empty command list', async () => {
      const commands = []

      const result = await keybindManager.generateMirroredCommandString(commands)

      expect(result).toBe('')
    })

    it('should handle null and undefined commands without throwing errors', async () => {
      const result1 = await keybindManager.generateMirroredCommandString(null)
      const result2 = await keybindManager.generateMirroredCommandString(undefined)

      expect(result1).toBe('')
      expect(result2).toBe('')
    })

    it('should handle commands with only command strings', async () => {
      const commands = [
        'FirePhasers',
        '+TrayExecByTray 9 0',
        '+TrayExecByTray 9 1',
      ]

      const result = await keybindManager.generateMirroredCommandString(commands)

      expect(result).toBe(
        'FirePhasers $$ +TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0 $$ FirePhasers'
      )
    })

    it('should handle two commands correctly', async () => {
      const commands = [{ command: 'FirePhasers' }, { command: 'FireTorpedos' }]

      const result = await keybindManager.generateMirroredCommandString(commands)

      expect(result).toBe('FirePhasers $$ FireTorpedos $$ FirePhasers')
    })

    it('should handle four commands correctly', async () => {
      const commands = [
        { command: 'A' },
        { command: 'B' },
        { command: 'C' },
        { command: 'D' },
      ]

      const result = await keybindManager.generateMirroredCommandString(commands)

      expect(result).toBe('A $$ B $$ C $$ D $$ C $$ B $$ A')
    })

    it('should handle mixed command formats', async () => {
      const commands = [
        'StringCommand',
        { command: 'ObjectCommand1' },
        { command: 'ObjectCommand2' },
      ]

      const result = await keybindManager.generateMirroredCommandString(commands)

      expect(result).toBe(
        'StringCommand $$ ObjectCommand1 $$ ObjectCommand2 $$ ObjectCommand1 $$ StringCommand'
      )
    })
  })

  describe('mirroring detection', () => {
    it('should detect mirrored commands and extract originals', async () => {
      const mirroredCommand =
        '+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0'

      const result = await keybindManager.detectAndUnmirrorCommands(mirroredCommand)

      expect(result.isMirrored).toBe(true)
      expect(result.originalCommands).toEqual([
        '+TrayExecByTray 9 0',
        '+TrayExecByTray 9 1',
        '+TrayExecByTray 9 2',
      ])
    })

    it('should not detect non-mirrored commands as mirrored', async () => {
      const normalCommand =
        '+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2'

      const result = await keybindManager.detectAndUnmirrorCommands(normalCommand)

      expect(result.isMirrored).toBe(false)
      expect(result.originalCommands).toEqual([
        '+TrayExecByTray 9 0',
        '+TrayExecByTray 9 1',
        '+TrayExecByTray 9 2',
      ])
    })

    it('should detect two-command mirroring pattern', async () => {
      const mirroredCommand = 'FirePhasers $$ FireTorpedos $$ FirePhasers'

      const result = await keybindManager.detectAndUnmirrorCommands(mirroredCommand)

      expect(result.isMirrored).toBe(true)
      expect(result.originalCommands).toEqual(['FirePhasers', 'FireTorpedos'])
    })

    it('should handle single commands as non-mirrored', async () => {
      const singleCommand = 'FirePhasers'

      const result = await keybindManager.detectAndUnmirrorCommands(singleCommand)

      expect(result.isMirrored).toBe(false)
      expect(result.originalCommands).toEqual(['FirePhasers'])
    })

    it('should handle empty commands', async () => {
      const result1 = await keybindManager.detectAndUnmirrorCommands('')
      const result2 = await keybindManager.detectAndUnmirrorCommands(null)
      const result3 = await keybindManager.detectAndUnmirrorCommands(undefined)

      expect(result1.isMirrored).toBe(false)
      expect(result1.originalCommands).toEqual([])

      expect(result2.isMirrored).toBe(false)
      expect(result2.originalCommands).toEqual([])

      expect(result3.isMirrored).toBe(false)
      expect(result3.originalCommands).toEqual([])
    })

    it('should not detect even-length sequences as mirrored', async () => {
      const evenSequence = 'A $$ B $$ C $$ D'

      const result = await keybindManager.detectAndUnmirrorCommands(evenSequence)

      expect(result.isMirrored).toBe(false)
      expect(result.originalCommands).toEqual(['A', 'B', 'C', 'D'])
    })

    it('should not detect sequences shorter than 3 as mirrored', async () => {
      const twoCommands = 'A $$ B'

      const result = await keybindManager.detectAndUnmirrorCommands(twoCommands)

      expect(result.isMirrored).toBe(false)
      expect(result.originalCommands).toEqual(['A', 'B'])
    })

    it('should detect complex mirrored pattern', async () => {
      const complexMirrored =
        'cmd1 $$ cmd2 $$ cmd3 $$ cmd4 $$ cmd5 $$ cmd4 $$ cmd3 $$ cmd2 $$ cmd1'

      const result = await keybindManager.detectAndUnmirrorCommands(complexMirrored)

      expect(result.isMirrored).toBe(true)
      expect(result.originalCommands).toEqual([
        'cmd1',
        'cmd2',
        'cmd3',
        'cmd4',
        'cmd5',
      ])
    })

    it('should not detect partial mirrors as mirrored', async () => {
      const partialMirror = 'A $$ B $$ C $$ B $$ D' // Should be A-B-C-B-A

      const result = await keybindManager.detectAndUnmirrorCommands(partialMirror)

      expect(result.isMirrored).toBe(false)
      expect(result.originalCommands).toEqual(['A', 'B', 'C', 'B', 'D'])
    })

    it('should handle commands with spaces and special characters', async () => {
      const specialCommand =
        '+power_exec Distribute_Shields $$ target_nearest_enemy $$ +power_exec Distribute_Shields'

      const result = await keybindManager.detectAndUnmirrorCommands(specialCommand)

      expect(result.isMirrored).toBe(true)
      expect(result.originalCommands).toEqual([
        '+power_exec Distribute_Shields',
        'target_nearest_enemy',
      ])
    })
  })

  describe('import with mirroring detection', () => {
    let realStorage
    let realApp

    beforeEach(() => {
      resetStore()
      // Create real storage instance for integration testing
      realStorage = new StorageService()

      // Create a real app implementation
      realApp = {
        currentProfile: 'test-profile',
        currentEnvironment: 'space',
        setModified: vi.fn(),
        renderKeyGrid: vi.fn(),

        getCurrentProfile() {
          const profile = realStorage.getProfile(this.currentProfile)
          if (!profile) return null

          // Ensure builds structure exists
          if (!profile.builds) {
            profile.builds = {
              space: { keys: {} },
              ground: { keys: {} },
            }
          }

          if (!profile.builds[this.currentEnvironment]) {
            profile.builds[this.currentEnvironment] = { keys: {} }
          }

          // Ensure the build keys object exists
          if (!profile.builds[this.currentEnvironment].keys) {
            profile.builds[this.currentEnvironment].keys = {}
          }

          // Return a profile-like object with current build data
          // IMPORTANT: keys must be a direct reference, not a copy
          return {
            ...profile,
            keys: profile.builds[this.currentEnvironment].keys, // Direct reference
            aliases: profile.aliases || {},
            mode: this.currentEnvironment === 'space' ? 'Space' : 'Ground',
          }
        },
      }

      // Set up a test profile
      const testProfile = {
        name: 'Test Profile',
        builds: {
          space: { keys: {} },
          ground: { keys: {} },
        },
        aliases: {},
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        currentEnvironment: 'space',
      }

      realStorage.saveProfile('test-profile', testProfile)

      // Override global app and storage for this test
      global.app = realApp
      global.storageService = realStorage
      
      // Reinitialize FileOperationsService with the real storage
      global.fileOperationsService = new FileOperationsService({
        eventBus,
        storage: realStorage,
        i18n: { t: (key) => key },
        ui: global.stoUI
      })
      global.fileOperationsService.init()
      
      store.currentProfile = 'test-profile'
      store.currentEnvironment = 'space'
    })

    afterEach(() => {
      // Clean up test data
      realStorage.deleteProfile('test-profile')
    })

    it('should detect and unmirror commands during import', async () => {
      const keybindContent = `F1 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0"
F2 "FirePhasers $$ FireTorpedos $$ FirePhasers"`

      const result = await keybindManager.importKeybindFile(keybindContent)

      expect(result.success).toBe(true)
      expect(result.imported.keys).toBe(2)

      // Check that the profile was updated with original commands
      const savedProfile = realStorage.getProfile('test-profile')
      expect(savedProfile.builds.space.keys.F1).toHaveLength(3)
      expect(savedProfile.builds.space.keys.F1[0].command).toBe(
        '+TrayExecByTray 9 0'
      )
      expect(savedProfile.builds.space.keys.F1[1].command).toBe(
        '+TrayExecByTray 9 1'
      )
      expect(savedProfile.builds.space.keys.F1[2].command).toBe(
        '+TrayExecByTray 9 2'
      )

      expect(savedProfile.builds.space.keys.F2).toHaveLength(2)
      expect(savedProfile.builds.space.keys.F2[0].command).toBe('FirePhasers')
      expect(savedProfile.builds.space.keys.F2[1].command).toBe('FireTorpedos')

      // Check that stabilization metadata was set
      expect(
        savedProfile.keybindMetadata.space.F1.stabilizeExecutionOrder
      ).toBe(true)
      expect(
        savedProfile.keybindMetadata.space.F2.stabilizeExecutionOrder
      ).toBe(true)
    })

    it('should not set stabilization metadata for non-mirrored commands', async () => {
      const keybindContent = `F1 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2"
F2 "FirePhasers"`

      const result = await keybindManager.importKeybindFile(keybindContent)

      expect(result.success).toBe(true)

      // Check that commands are stored normally
      const savedProfile = realStorage.getProfile('test-profile')
      expect(savedProfile.builds.space.keys.F1).toHaveLength(3)
      expect(savedProfile.builds.space.keys.F2).toHaveLength(1)

      // Check that no stabilization metadata was set
      expect(savedProfile.keybindMetadata?.space?.F1).toBeUndefined()
      expect(savedProfile.keybindMetadata?.space?.F2).toBeUndefined()
    })

    it('should handle mixed mirrored and non-mirrored commands', async () => {
      const keybindContent = `F1 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0"
F2 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1"
F3 "SingleCommand"`

      const result = await keybindManager.importKeybindFile(keybindContent)

      expect(result.success).toBe(true)

      const savedProfile = realStorage.getProfile('test-profile')

      // F1 is mirrored
      expect(savedProfile.builds.space.keys.F1).toHaveLength(2)
      expect(
        savedProfile.keybindMetadata.space.F1.stabilizeExecutionOrder
      ).toBe(true)

      // F2 is not mirrored
      expect(savedProfile.builds.space.keys.F2).toHaveLength(2)
      expect(savedProfile.keybindMetadata?.space?.F2).toBeUndefined()

      // F3 is single command
      expect(savedProfile.builds.space.keys.F3).toHaveLength(1)
      expect(savedProfile.keybindMetadata?.space?.F3).toBeUndefined()
    })

    it('should handle empty command chains', async () => {
      const keybindContent = `F1 ""
F2 " "`

      const result = await keybindManager.importKeybindFile(keybindContent)

      expect(result.success).toBe(true)

      const savedProfile = realStorage.getProfile('test-profile')
      // Empty strings still get parsed as command objects but with empty command strings
      expect(savedProfile.builds.space.keys.F1).toHaveLength(1)
      expect(savedProfile.builds.space.keys.F1[0].command).toBe('')
      expect(savedProfile.builds.space.keys.F2).toHaveLength(1)
      expect(savedProfile.builds.space.keys.F2[0].command).toBe('')
      expect(savedProfile.keybindMetadata?.space?.F1).toBeUndefined()
      expect(savedProfile.keybindMetadata?.space?.F2).toBeUndefined()
    })

    it('should preserve existing keybindMetadata structure', async () => {
      // Set up profile with existing metadata
      const testProfile = realStorage.getProfile('test-profile')
      testProfile.keybindMetadata = {
        space: { F3: { stabilizeExecutionOrder: false } },
      }
      realStorage.saveProfile('test-profile', testProfile)

      const keybindContent = `F1 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0"`

      const result = await keybindManager.importKeybindFile(keybindContent)

      expect(result.success).toBe(true)

      const savedProfile = realStorage.getProfile('test-profile')

      // Should preserve existing metadata
      expect(
        savedProfile.keybindMetadata.space.F3.stabilizeExecutionOrder
      ).toBe(false)

      // Should add new metadata
      expect(
        savedProfile.keybindMetadata.space.F1.stabilizeExecutionOrder
      ).toBe(true)
    })

    it('should handle complex mirrored patterns', async () => {
      const keybindContent = `numpad0 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 3 $$ +TrayExecByTray 9 4 $$ +TrayExecByTray 9 3 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0"`

      const result = await keybindManager.importKeybindFile(keybindContent)

      expect(result.success).toBe(true)

      const savedProfile = realStorage.getProfile('test-profile')
      expect(savedProfile.builds.space.keys.numpad0).toHaveLength(5)
      expect(savedProfile.builds.space.keys.numpad0[0].command).toBe(
        '+TrayExecByTray 9 0'
      )
      expect(savedProfile.builds.space.keys.numpad0[4].command).toBe(
        '+TrayExecByTray 9 4'
      )
      expect(
        savedProfile.keybindMetadata.space.numpad0.stabilizeExecutionOrder
      ).toBe(true)
    })

    it('should merge with existing profile data', async () => {
      // Set up profile with existing data
      const testProfile = realStorage.getProfile('test-profile')
      testProfile.builds.space.keys = { F1: [{ command: 'existing' }] }
      realStorage.saveProfile('test-profile', testProfile)

      const content = 'F2 "say hello" ""'
      const result = await keybindManager.importKeybindFile(content)

      expect(result.success).toBe(true)

      const savedProfile = realStorage.getProfile('test-profile')
      expect(savedProfile.builds.space.keys).toHaveProperty('F1')
      expect(savedProfile.builds.space.keys).toHaveProperty('F2')
      expect(savedProfile.builds.space.keys.F1[0].command).toBe('existing')
      expect(savedProfile.builds.space.keys.F2[0].command).toBe('say hello')
    })

    it('should handle duplicate key bindings', async () => {
      // Set up profile with existing data
      const testProfile = realStorage.getProfile('test-profile')
      testProfile.builds.space.keys = { F1: [{ command: 'existing' }] }
      realStorage.saveProfile('test-profile', testProfile)

      const content = 'F1 "say new" ""'
      const result = await keybindManager.importKeybindFile(content)

      expect(result.success).toBe(true)

      const savedProfile = realStorage.getProfile('test-profile')
      expect(savedProfile.builds.space.keys.F1).toHaveLength(1)
      expect(savedProfile.builds.space.keys.F1[0].command).toBe('say new')
    })

    it('should preserve existing commands when merging', async () => {
      // Set up profile with existing data
      const testProfile = realStorage.getProfile('test-profile')
      testProfile.builds.space.keys = { F1: [{ command: 'existing' }] }
      realStorage.saveProfile('test-profile', testProfile)

      const content = 'F2 "say hello" ""'
      const result = await keybindManager.importKeybindFile(content)

      expect(result.success).toBe(true)

      const savedProfile = realStorage.getProfile('test-profile')
      expect(savedProfile.builds.space.keys.F1).toHaveLength(1)
      expect(savedProfile.builds.space.keys.F1[0].command).toBe('existing')
      expect(savedProfile.builds.space.keys.F2[0].command).toBe('say hello')
    })

    it('should import aliases separately', async () => {
      const content = 'F1 "say hello"\nalias TestAlias "say test"'
      const result = await keybindManager.importAliasFile(content)

      // Should only import aliases, not keybinds
      expect(result.success).toBe(true)
      expect(result.imported.aliases).toBe(1)
      expect(result.imported).not.toHaveProperty('keys')

      // Verify alias was actually saved
      const savedProfile = realStorage.getProfile('test-profile')
      expect(savedProfile.aliases).toHaveProperty('TestAlias')
      expect(savedProfile.aliases.TestAlias.commands).toBe('say test')

      // Verify keybind was not imported
      expect(savedProfile.builds.space.keys).not.toHaveProperty('F1')
    })
  })

  describe('real keybind import integration', () => {
    let realStorage
    let realApp

    beforeEach(() => {
      // Create real storage instance for integration testing
      realStorage = new StorageService()

      // Create a minimal real app implementation
      realApp = {
        currentProfile: 'test-profile',
        currentEnvironment: 'space',
        setModified: vi.fn(),
        renderKeyGrid: vi.fn(),
        renderCommandChain: vi.fn(),

        getCurrentProfile() {
          const profile = realStorage.getProfile(this.currentProfile)
          if (!profile) return null

          return this.getCurrentBuild(profile)
        },

        getCurrentBuild(profile) {
          if (!profile.builds) {
            profile.builds = {
              space: { keys: {} },
              ground: { keys: {} },
            }
          }

          const build = profile.builds[this.currentEnvironment] || { keys: {} }

          return {
            ...profile,
            keys: build.keys || {},
            mode: this.currentEnvironment === 'space' ? 'Space' : 'Ground',
          }
        },

        saveCurrentBuild() {
          const profile = realStorage.getProfile(this.currentProfile)
          const currentBuild = this.getCurrentProfile()

          if (profile && currentBuild) {
            if (!profile.builds) {
              profile.builds = {
                space: { keys: {} },
                ground: { keys: {} },
              }
            }

            profile.builds[this.currentEnvironment] = {
              keys: currentBuild.keys || {},
            }

            realStorage.saveProfile(this.currentProfile, profile)
          }
        },

        saveProfile() {
          const virtualProfile = this.getCurrentProfile()

          if (!virtualProfile) {
            return
          }

          this.saveCurrentBuild()

          const actualProfile = realStorage.getProfile(this.currentProfile)
          if (!actualProfile) {
            return
          }

          const updatedProfile = {
            ...actualProfile,
            name: virtualProfile.name,
            description:
              virtualProfile.description || actualProfile.description,
            aliases: virtualProfile.aliases || {},
            keybindMetadata:
              virtualProfile.keybindMetadata || actualProfile.keybindMetadata,
            created: actualProfile.created,
            lastModified: new Date().toISOString(),
            currentEnvironment: this.currentEnvironment,
          }

          realStorage.saveProfile(this.currentProfile, updatedProfile)
        },
      }

      // Set up a test profile
      const testProfile = {
        name: 'Test Profile',
        builds: {
          space: { keys: {} },
          ground: { keys: {} },
        },
        aliases: {},
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        currentEnvironment: 'space',
      }

      realStorage.saveProfile('test-profile', testProfile)

      // Override global app and storage for this test
      global.app = realApp
      global.storageService = realStorage
      
      // Reinitialize FileOperationsService with the real storage
      global.fileOperationsService = new FileOperationsService({
        eventBus,
        storage: realStorage,
        i18n: { t: (key) => key },
        ui: global.stoUI
      })
      global.fileOperationsService.init()
      
      store.currentProfile = 'test-profile'
      store.currentEnvironment = 'space'
    })

    afterEach(() => {
      // Clean up test data
      realStorage.deleteProfile('test-profile')
    })

    it('should actually import keybinds and save them to the correct build structure', async () => {
      const content = 'F2 "say hello" ""\nF3 "emote wave" ""'

      // Verify profile starts empty
      const initialProfile = realStorage.getProfile('test-profile')
      expect(initialProfile.builds.space.keys).toEqual({})

      // Import keybinds
      const result = await keybindManager.importKeybindFile(content)

      // Verify import was successful
      expect(result.success).toBe(true)
      expect(result.imported.keys).toBe(2)

      // Verify keybinds were actually saved to storage
      const savedProfile = realStorage.getProfile('test-profile')
      expect(savedProfile.builds.space.keys).toHaveProperty('F2')
      expect(savedProfile.builds.space.keys).toHaveProperty('F3')
      expect(savedProfile.builds.space.keys.F2).toHaveLength(1)
      expect(savedProfile.builds.space.keys.F2[0].command).toBe('say hello')
      expect(savedProfile.builds.space.keys.F3[0].command).toBe('emote wave')

      // Verify they show up in getCurrentProfile
      const currentProfile = realApp.getCurrentProfile()
      expect(currentProfile.keys).toHaveProperty('F2')
      expect(currentProfile.keys).toHaveProperty('F3')
    })

    it('should import keybinds to the correct environment', async () => {
      const content = 'F1 "ground command" ""'

      // Switch to ground environment
      realApp.currentEnvironment = 'ground'
      store.currentEnvironment = 'ground'
      keybindManager.setCurrentEnvironment('ground')

      // Import keybinds
      const result = await keybindManager.importKeybindFile(content)
      expect(result.success).toBe(true)

      // Verify keybind was saved to ground build, not space
      const savedProfile = realStorage.getProfile('test-profile')
      expect(savedProfile.builds.ground.keys).toHaveProperty('F1')
      expect(savedProfile.builds.space.keys).not.toHaveProperty('F1')

      // Verify it shows up when in ground mode
      const currentProfile = realApp.getCurrentProfile()
      expect(currentProfile.keys).toHaveProperty('F1')
      expect(currentProfile.mode).toBe('Ground')
    })

    it('should merge with existing keybinds without overwriting', async () => {
      // Add initial keybind
      const initialContent = 'F1 "initial command" ""'
      await keybindManager.importKeybindFile(initialContent)

      // Add more keybinds
      const additionalContent = 'F2 "additional command" ""'
      const result = await keybindManager.importKeybindFile(additionalContent)

      expect(result.success).toBe(true)

      // Verify both keybinds exist
      const savedProfile = realStorage.getProfile('test-profile')
      expect(savedProfile.builds.space.keys).toHaveProperty('F1')
      expect(savedProfile.builds.space.keys).toHaveProperty('F2')
      expect(savedProfile.builds.space.keys.F1[0].command).toBe(
        'initial command'
      )
      expect(savedProfile.builds.space.keys.F2[0].command).toBe(
        'additional command'
      )
    })
  })
})
