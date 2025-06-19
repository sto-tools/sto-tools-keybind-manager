import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Import real data first to ensure STO_DATA is available
import '../../src/js/data.js'

// Load the modules (they create global instances)
import '../../src/js/storage.js'
import '../../src/js/commands.js'
import '../../src/js/keybinds.js'

// Setup real global objects instead of mocks
beforeEach(() => {
  // Set up global environment
  global.window = global.window || {}
  
  // The modules create global instances automatically
  global.stoStorage = global.window.stoStorage
  global.stoCommands = global.window.stoCommands
  
  // Mock only the UI methods that would show actual UI
  global.stoUI = {
    showToast: vi.fn()
  }
  
  // Mock only the app methods that would modify actual DOM
  global.app = {
    getCurrentProfile: vi.fn(() => ({
      keys: {},
      aliases: {},
      name: 'Test Profile',
      mode: 'Space'
    })),
    currentProfile: 'test-profile',
    currentEnvironment: 'space',
    setModified: vi.fn(),
    loadData: vi.fn(),
    renderKeyGrid: vi.fn(),
    renderCommandChain: vi.fn(),
    saveCurrentBuild: vi.fn(),
    saveProfile: vi.fn()
  }

  // Mock stoStorage.getProfile to return a profile with builds structure
  global.stoStorage.getProfile = vi.fn(() => ({
    name: 'Test Profile',
    builds: {
      space: { keys: {} },
      ground: { keys: {} }
    },
    aliases: {}
  }))

  global.stoStorage.saveProfile = vi.fn()
})

describe('STOKeybindFileManager', () => {
  let keybindManager
  let STOKeybindFileManager

  beforeEach(() => {
    // Get the constructor from the global instance
    STOKeybindFileManager = global.window.stoKeybinds.constructor
    keybindManager = new STOKeybindFileManager()
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize keybind patterns', () => {
      expect(keybindManager.keybindPatterns).toBeDefined()
      expect(keybindManager.keybindPatterns.standard).toBeInstanceOf(RegExp)
      expect(keybindManager.keybindPatterns.bind).toBeInstanceOf(RegExp)
      expect(keybindManager.keybindPatterns.alias).toBeInstanceOf(RegExp)
      expect(keybindManager.keybindPatterns.comment).toBeInstanceOf(RegExp)
    })

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
    it('should parse standard keybind format', () => {
      const content = 'F1 "say hello" ""'
      const result = keybindManager.parseKeybindFile(content)
      
      expect(result.keybinds).toHaveProperty('F1')
      expect(result.keybinds.F1.key).toBe('F1')
      expect(result.keybinds.F1.commands).toHaveLength(1)
      expect(result.keybinds.F1.commands[0].command).toBe('say hello')
    })

    it('should parse bind command format', () => {
      const content = '/bind F2 "say world"'
      const result = keybindManager.parseKeybindFile(content)
      
      expect(result.keybinds).toHaveProperty('F2')
      expect(result.keybinds.F2.key).toBe('F2')
      expect(result.keybinds.F2.commands[0].command).toBe('say world')
    })

    it('should parse alias definitions', () => {
      const content = 'alias TestAlias "say test"'
      const result = keybindManager.parseKeybindFile(content)
      
      expect(result.aliases).toHaveProperty('TestAlias')
      expect(result.aliases.TestAlias.name).toBe('TestAlias')
      expect(result.aliases.TestAlias.commands).toBe('say test')
    })

    it('should skip comment lines', () => {
      const content = '# This is a comment\n; Another comment\nF1 "say hello" ""'
      const result = keybindManager.parseKeybindFile(content)
      
      expect(result.comments).toHaveLength(2)
      expect(result.comments[0].content).toBe('# This is a comment')
      expect(result.comments[1].content).toBe('; Another comment')
      expect(result.keybinds).toHaveProperty('F1')
    })

    it('should handle multi-line files', () => {
      const content = 'F1 "say hello" ""\nF2 "say world" ""\nalias Test "say test"'
      const result = keybindManager.parseKeybindFile(content)
      
      expect(Object.keys(result.keybinds)).toHaveLength(2)
      expect(Object.keys(result.aliases)).toHaveLength(1)
    })

    it('should collect parsing errors', () => {
      const content = 'invalid line format\nF1 "say hello" ""'
      const result = keybindManager.parseKeybindFile(content)
      
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].line).toBe(1)
      expect(result.errors[0].error).toBe('Invalid keybind format')
    })

    it('should handle empty lines gracefully', () => {
      const content = '\n\nF1 "say hello" ""\n\n'
      const result = keybindManager.parseKeybindFile(content)
      
      expect(result.keybinds).toHaveProperty('F1')
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('command string parsing', () => {
    it('should split commands by $$ delimiter', () => {
      const commands = keybindManager.parseCommandString('say hello $$ emote wave')
      
      expect(commands).toHaveLength(2)
      expect(commands[0].command).toBe('say hello')
      expect(commands[1].command).toBe('emote wave')
    })

    it('should detect tray execution commands', () => {
      const commands = keybindManager.parseCommandString('+STOTrayExecByTray 0 1')
      
      expect(commands).toHaveLength(1)
      expect(commands[0].command).toBe('+STOTrayExecByTray 0 1')
      expect(commands[0].type).toBe('tray')
      expect(commands[0].parameters).toEqual({ tray: 0, slot: 1 })
    })

    it('should extract tray parameters', () => {
      const commands = keybindManager.parseCommandString('+STOTrayExecByTray 2 5')
      
      expect(commands[0].parameters.tray).toBe(2)
      expect(commands[0].parameters.slot).toBe(5)
      expect(commands[0].text).toBe('Execute Tray 3 Slot 6')
    })

    it('should handle communication commands', () => {
      const commands = keybindManager.parseCommandString('say hello world')
      
      expect(commands[0].command).toBe('say hello world')
      expect(commands[0].type).toBe('communication')
      expect(commands[0].icon).toBe('💬')
    })

    it('should generate command IDs', () => {
      const commands = keybindManager.parseCommandString('say hello')
      
      expect(commands[0].id).toMatch(/^imported_\d+_0$/)
    })

    it('should set command types and icons', () => {
      const commands = keybindManager.parseCommandString('say hello')
      
      expect(commands[0].type).toBe('communication')
      expect(commands[0].icon).toBe('💬')
    })
  })

  describe('keybind file import', () => {
    beforeEach(() => {
      global.app.getCurrentProfile.mockReturnValue({
        keys: { F1: [{ command: 'existing' }] },
        aliases: {},
        name: 'Test Profile',
        mode: 'Space'
      })
      global.app.saveProfile = vi.fn()
      global.app.renderKeyGrid = vi.fn()
    })

    it('should import valid keybind file content', () => {
      const content = 'F2 "say hello" ""'
      const result = keybindManager.importKeybindFile(content)
      
      expect(result.success).toBe(true)
      expect(result.imported.keys).toBe(1)
      expect(app.saveCurrentBuild).toHaveBeenCalled()
    })

    it('should merge with existing profile data', () => {
      const profile = {
        keys: { F1: [{ command: 'existing' }] },
        aliases: {},
        name: 'Test Profile',
        mode: 'Space'
      }
      global.app.getCurrentProfile.mockReturnValue(profile)
      
      const content = 'F2 "say hello" ""'
      keybindManager.importKeybindFile(content)
      
      expect(profile.keys).toHaveProperty('F1')
      expect(profile.keys).toHaveProperty('F2')
    })

    it('should handle duplicate key bindings', () => {
      const profile = {
        keys: { F1: [{ command: 'existing' }] },
        aliases: {},
        name: 'Test Profile',
        mode: 'Space'
      }
      global.app.getCurrentProfile.mockReturnValue(profile)
      
      const content = 'F1 "say new" ""'
      keybindManager.importKeybindFile(content)
      
      expect(profile.keys.F1).toHaveLength(1)
      expect(profile.keys.F1[0].command).toBe('say new')
    })

    it('should preserve existing commands when merging', () => {
      const profile = {
        keys: { F1: [{ command: 'existing' }] },
        aliases: {},
        name: 'Test Profile',
        mode: 'Space'
      }
      global.app.getCurrentProfile.mockReturnValue(profile)
      
      const content = 'F2 "say hello" ""'
      keybindManager.importKeybindFile(content)
      
      expect(profile.keys.F1).toHaveLength(1)
      expect(profile.keys.F1[0].command).toBe('existing')
    })

    it('should update profile modification timestamp', () => {
      const content = 'F1 "say hello" ""'
      keybindManager.importKeybindFile(content)
      
      expect(app.setModified).toHaveBeenCalledWith(true)
    })

    it('should show import summary', () => {
      const content = 'F1 "say hello" ""\nalias Test "say test"'
      keybindManager.importKeybindFile(content)
      
      expect(stoUI.showToast).toHaveBeenCalledWith(
        'Import completed: 1 keybinds (1 aliases ignored - use Import Aliases)',
        'success'
      )
    })

    it('should import keybinds separately from aliases', () => {
      const profile = {
        name: 'Test',
        mode: 'Space',
        keys: {},
        aliases: {}
      }
      
      const content = 'F1 "say hello"\nalias TestAlias "say test"'
      const result = keybindManager.importKeybindFile(content)
      
      // Should only import keybinds, not aliases
      expect(result.success).toBe(true)
      expect(result.imported.keys).toBe(1)
      expect(result.imported).not.toHaveProperty('aliases')
    })

    it('should import aliases separately', () => {
      const profile = {
        name: 'Test',
        mode: 'Space',
        keys: {},
        aliases: {}
      }
      global.app.getCurrentProfile.mockReturnValue(profile)
      
      const content = 'F1 "say hello"\nalias TestAlias "say test"'
      const result = keybindManager.importAliasFile(content)
      
      // Should only import aliases, not keybinds
      expect(result.success).toBe(true)
      expect(result.imported.aliases).toBe(1)
      expect(result.imported).not.toHaveProperty('keys')
    })
  })

  describe('profile export', () => {
    it('should export profile in STO keybind format', () => {
      const profile = {
        name: 'Test Profile',
        mode: 'Space',
        keys: { F1: [{ command: 'say hello' }] },
        aliases: {}
      }
      
      const output = keybindManager.exportProfile(profile)
      
      expect(output).toContain('# Test Profile - Space mode')
      expect(output).toContain('F1 "say hello" ""')
    })

    it('should sort keys logically', () => {
      const profile = {
        name: 'Test',
        mode: 'Space',
        keys: {
          'A': [{ command: 'say a' }],
          'F1': [{ command: 'say f1' }],
          '1': [{ command: 'say 1' }]
        },
        aliases: {}
      }
      
      const output = keybindManager.exportProfile(profile)
      const lines = output.split('\n').filter(line => line.match(/^[FA1]/))
      
      expect(lines[0]).toContain('F1')
      expect(lines[1]).toContain('1')
      expect(lines[2]).toContain('A')
    })

    it('should handle special characters in commands', () => {
      const profile = {
        name: 'Test',
        mode: 'Space',
        keys: { F1: [{ command: 'say hello world' }] },
        aliases: {}
      }
      
      const output = keybindManager.exportProfile(profile)
      
      expect(output).toContain('F1 "say hello world" ""')
    })

    it('should group similar keys together', () => {
      const profile = {
        name: 'Test',
        mode: 'Space',
        keys: {
          'F1': [{ command: 'say f1' }],
          'F2': [{ command: 'say f2' }],
          'A': [{ command: 'say a' }],
          'B': [{ command: 'say b' }]
        },
        aliases: {}
      }
      
      const output = keybindManager.exportProfile(profile)
      const lines = output.split('\n').filter(line => line.match(/^[FAB]/))
      
      expect(lines[0]).toContain('F1')
      expect(lines[1]).toContain('F2')
      expect(lines[2]).toContain('A')
      expect(lines[3]).toContain('B')
    })

    it('should include file header with metadata', () => {
      const profile = {
        name: 'Test Profile',
        mode: 'Ground',
        keys: {},
        aliases: {}
      }
      
      const output = keybindManager.exportProfile(profile)
      
      expect(output).toContain('# Test Profile - Ground mode')
      expect(output).toContain('# Generated by STO Tools Keybind Manager')
      expect(output).toMatch(/# \d{1,2}\/\d{1,2}\/\d{4}/)
    })

    it('should export keybinds without aliases', () => {
      const profile = {
        name: 'Test',
        mode: 'Space',
        keys: { F1: [{ command: 'say hello' }] },
        aliases: { TestAlias: { commands: 'say test' } }
      }
      
      const output = keybindManager.exportProfile(profile)
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
    it('should validate alias name format', () => {
      expect(keybindManager.isValidAliasName('ValidAlias')).toBe(true)
      expect(keybindManager.isValidAliasName('_underscore')).toBe(true)
      expect(keybindManager.isValidAliasName('alias123')).toBe(true)
    })

    it('should reject names with spaces', () => {
      expect(keybindManager.isValidAliasName('invalid alias')).toBe(false)
      expect(keybindManager.isValidAliasName('test alias')).toBe(false)
    })

    it('should reject names starting with numbers', () => {
      expect(keybindManager.isValidAliasName('123invalid')).toBe(false)
      expect(keybindManager.isValidAliasName('1test')).toBe(false)
    })

    it('should accept valid alphanumeric names', () => {
      expect(keybindManager.isValidAliasName('ValidAlias')).toBe(true)
      expect(keybindManager.isValidAliasName('test123')).toBe(true)
      expect(keybindManager.isValidAliasName('_private')).toBe(true)
    })
  })

  describe('keybind validation', () => {
    it('should validate keybind key and commands', () => {
      const result = keybindManager.validateKeybind('F1', [{ command: 'say hello' }])
      
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
      const commands = Array(25).fill(0).map((_, i) => ({ command: `command${i}` }))
      const result = keybindManager.validateKeybind('F1', commands)
      
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Too many commands (max 20)')
    })

    it('should validate key names', () => {
      const result = keybindManager.validateKeybind('InvalidKey', [{ command: 'say hello' }])
      
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Invalid key name: InvalidKey')
    })
  })

  describe('key suggestions', () => {
    it('should suggest keys based on filter', () => {
      const suggestions = keybindManager.suggestKeys('F1')
      
      expect(suggestions.some(key => key.includes('F1'))).toBe(true)
      expect(suggestions.every(key => key.toLowerCase().includes('f1'))).toBe(true)
      expect(suggestions.length).toBeLessThanOrEqual(20)
    })

    it('should filter keys case-insensitively', () => {
      const suggestions = keybindManager.suggestKeys('ctrl')
      
      expect(suggestions.some(key => key.includes('Ctrl'))).toBe(true)
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
        commands: [{ command: 'say hello' }]
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
          F2: [{ command: 'emote wave', type: 'custom' }]
        },
        aliases: {
          TestAlias: { commands: 'say test' }
        }
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
          F2: [{ command: 'say hello', type: 'communication' }]
        },
        aliases: {}
      }
      
      const stats = keybindManager.getProfileStats(profile)
      
      expect(stats.mostUsedCommands['say hello']).toBe(2)
    })

    it('should handle empty profiles', () => {
      const profile = {
        keys: {},
        aliases: {}
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
      const mockFile = new File(['F1 "say hello" ""'], 'test.txt', { type: 'text/plain' })
      const mockEvent = {
        target: {
          id: 'fileInput',
          accept: '.txt',
          files: [mockFile],
          value: 'test.txt'
        }
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
        mode: 'Space'
      })
      global.app.saveProfile = vi.fn()
      global.app.setModified = vi.fn()
    })

    it('should import alias file content successfully', () => {
      const content = 'alias TestAlias "say hello $$ emote wave"'
      const result = keybindManager.importAliasFile(content)
      
      expect(result.success).toBe(true)
      expect(result.imported.aliases).toBe(1)
    })

    it('should handle alias files with multiple aliases', () => {
      const content = `alias Attack "target_nearest_enemy $$ FireAll"
alias Heal "target_self $$ +power_exec Distribute_Shields"`
      const result = keybindManager.importAliasFile(content)
      
      expect(result.success).toBe(true)
      expect(result.imported.aliases).toBe(2)
    })

    it('should ignore keybinds in alias import', () => {
      const content = `F1 "say hello"
alias TestAlias "say test"
F2 "say world"`
      const result = keybindManager.importAliasFile(content)
      
      expect(result.success).toBe(true)
      expect(result.imported.aliases).toBe(1)
      expect(result.imported).not.toHaveProperty('keys')
    })

    it('should warn when no aliases found', () => {
      const content = 'F1 "say hello"\nF2 "say world"'
      const result = keybindManager.importAliasFile(content)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('No aliases found')
    })

    it('should handle empty alias files', () => {
      const content = ''
      const result = keybindManager.importAliasFile(content)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('No aliases found')
    })

    it('should merge aliases with existing ones', () => {
      const profile = {
        keys: {},
        aliases: { ExistingAlias: { commands: 'existing command' } },
        name: 'Test Profile',
        mode: 'Space'
      }
      global.app.getCurrentProfile.mockReturnValue(profile)
      
      // Mock stoStorage.getProfile to return the same profile that will be modified
      global.stoStorage.getProfile.mockReturnValue(profile)
      
      const content = 'alias NewAlias "new command"'
      keybindManager.importAliasFile(content)
      
      expect(profile.aliases).toHaveProperty('ExistingAlias')
      expect(profile.aliases).toHaveProperty('NewAlias')
    })

    it('should update profile modification status', () => {
      const content = 'alias TestAlias "say test"'
      keybindManager.importAliasFile(content)
      
      expect(stoStorage.saveProfile).toHaveBeenCalled()
      expect(app.setModified).toHaveBeenCalledWith(true)
    })
  })

  describe('execution order stabilization', () => {
    it('should generate mirrored command string for multiple commands', () => {
      const commands = [
        { command: '+TrayExecByTray 9 0' },
        { command: '+TrayExecByTray 9 1' },
        { command: '+TrayExecByTray 9 2' }
      ]
      
      const result = keybindManager.generateMirroredCommandString(commands)
      
      // Should be: reverse + original = [2,1,0] + [0,1,2]
      expect(result).toBe('+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0')
    })

    it('should handle single command without mirroring', () => {
      const commands = [
        { command: '+TrayExecByTray 9 0' }
      ]
      
      const result = keybindManager.generateMirroredCommandString(commands)
      
      expect(result).toBe('+TrayExecByTray 9 0')
    })

    it('should handle empty command list', () => {
      const commands = []
      
      const result = keybindManager.generateMirroredCommandString(commands)
      
      expect(result).toBe('')
    })

    it('should handle commands with only command strings', () => {
      const commands = [
        'FirePhasers',
        '+TrayExecByTray 9 0',
        '+TrayExecByTray 9 1'
      ]
      
      const result = keybindManager.generateMirroredCommandString(commands)
      
      expect(result).toBe('FirePhasers $$ +TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0 $$ FirePhasers')
    })

    it('should handle two commands correctly', () => {
      const commands = [
        { command: 'FirePhasers' },
        { command: 'FireTorpedos' }
      ]
      
      const result = keybindManager.generateMirroredCommandString(commands)
      
      expect(result).toBe('FirePhasers $$ FireTorpedos $$ FirePhasers')
    })

    it('should handle four commands correctly', () => {
      const commands = [
        { command: 'A' },
        { command: 'B' },
        { command: 'C' },
        { command: 'D' }
      ]
      
      const result = keybindManager.generateMirroredCommandString(commands)
      
      expect(result).toBe('A $$ B $$ C $$ D $$ C $$ B $$ A')
    })

    it('should handle mixed command formats', () => {
      const commands = [
        'StringCommand',
        { command: 'ObjectCommand1' },
        { command: 'ObjectCommand2' }
      ]
      
      const result = keybindManager.generateMirroredCommandString(commands)
      
      expect(result).toBe('StringCommand $$ ObjectCommand1 $$ ObjectCommand2 $$ ObjectCommand1 $$ StringCommand')
    })
  })

  describe('mirroring detection', () => {
    it('should detect mirrored commands and extract originals', () => {
      const mirroredCommand = '+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0'
      
      const result = keybindManager.detectAndUnmirrorCommands(mirroredCommand)
      
      expect(result.isMirrored).toBe(true)
      expect(result.originalCommands).toEqual([
        '+TrayExecByTray 9 0',
        '+TrayExecByTray 9 1', 
        '+TrayExecByTray 9 2'
      ])
    })

    it('should not detect non-mirrored commands as mirrored', () => {
      const normalCommand = '+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2'
      
      const result = keybindManager.detectAndUnmirrorCommands(normalCommand)
      
      expect(result.isMirrored).toBe(false)
      expect(result.originalCommands).toEqual([
        '+TrayExecByTray 9 0',
        '+TrayExecByTray 9 1',
        '+TrayExecByTray 9 2'
      ])
    })

    it('should detect two-command mirroring pattern', () => {
      const mirroredCommand = 'FirePhasers $$ FireTorpedos $$ FirePhasers'
      
      const result = keybindManager.detectAndUnmirrorCommands(mirroredCommand)
      
      expect(result.isMirrored).toBe(true)
      expect(result.originalCommands).toEqual(['FirePhasers', 'FireTorpedos'])
    })

    it('should handle single commands as non-mirrored', () => {
      const singleCommand = 'FirePhasers'
      
      const result = keybindManager.detectAndUnmirrorCommands(singleCommand)
      
      expect(result.isMirrored).toBe(false)
      expect(result.originalCommands).toEqual(['FirePhasers'])
    })

    it('should handle empty commands', () => {
      const result1 = keybindManager.detectAndUnmirrorCommands('')
      const result2 = keybindManager.detectAndUnmirrorCommands(null)
      const result3 = keybindManager.detectAndUnmirrorCommands(undefined)
      
      expect(result1.isMirrored).toBe(false)
      expect(result1.originalCommands).toEqual([])
      
      expect(result2.isMirrored).toBe(false)
      expect(result2.originalCommands).toEqual([])
      
      expect(result3.isMirrored).toBe(false)
      expect(result3.originalCommands).toEqual([])
    })

    it('should not detect even-length sequences as mirrored', () => {
      const evenSequence = 'A $$ B $$ C $$ D'
      
      const result = keybindManager.detectAndUnmirrorCommands(evenSequence)
      
      expect(result.isMirrored).toBe(false)
      expect(result.originalCommands).toEqual(['A', 'B', 'C', 'D'])
    })

    it('should not detect sequences shorter than 3 as mirrored', () => {
      const twoCommands = 'A $$ B'
      
      const result = keybindManager.detectAndUnmirrorCommands(twoCommands)
      
      expect(result.isMirrored).toBe(false)
      expect(result.originalCommands).toEqual(['A', 'B'])
    })

    it('should detect complex mirrored pattern', () => {
      const complexMirrored = 'cmd1 $$ cmd2 $$ cmd3 $$ cmd4 $$ cmd5 $$ cmd4 $$ cmd3 $$ cmd2 $$ cmd1'
      
      const result = keybindManager.detectAndUnmirrorCommands(complexMirrored)
      
      expect(result.isMirrored).toBe(true)
      expect(result.originalCommands).toEqual(['cmd1', 'cmd2', 'cmd3', 'cmd4', 'cmd5'])
    })

    it('should not detect partial mirrors as mirrored', () => {
      const partialMirror = 'A $$ B $$ C $$ B $$ D' // Should be A-B-C-B-A
      
      const result = keybindManager.detectAndUnmirrorCommands(partialMirror)
      
      expect(result.isMirrored).toBe(false)
      expect(result.originalCommands).toEqual(['A', 'B', 'C', 'B', 'D'])
    })

    it('should handle commands with spaces and special characters', () => {
      const specialCommand = '+power_exec Distribute_Shields $$ target_nearest_enemy $$ +power_exec Distribute_Shields'
      
      const result = keybindManager.detectAndUnmirrorCommands(specialCommand)
      
      expect(result.isMirrored).toBe(true)
      expect(result.originalCommands).toEqual(['+power_exec Distribute_Shields', 'target_nearest_enemy'])
    })
  })

  describe('import with mirroring detection', () => {
    beforeEach(() => {
      // Mock app.getCurrentProfile for import tests
      global.app = {
        getCurrentProfile: vi.fn().mockReturnValue({
          keys: {},
          keybindMetadata: {}
        }),
        currentProfile: 'test-profile',
        currentEnvironment: 'space',
        saveProfile: vi.fn(),
        saveCurrentBuild: vi.fn(),
        setModified: vi.fn(),
        renderKeyGrid: vi.fn()
      }
    })
    
    afterEach(() => {
      delete global.app
      // Don't delete global.stoUI as it's needed globally
    })

    it('should detect and unmirror commands during import', () => {
      const keybindContent = `F1 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0"
F2 "FirePhasers $$ FireTorpedos $$ FirePhasers"`
      
      const result = keybindManager.importKeybindFile(keybindContent)
      
      expect(result.success).toBe(true)
      expect(result.imported.keys).toBe(2)
      
      // Check that the profile was updated with original commands
      const profile = app.getCurrentProfile()
      expect(profile.keys.F1).toHaveLength(3)
      expect(profile.keys.F1[0].command).toBe('+TrayExecByTray 9 0')
      expect(profile.keys.F1[1].command).toBe('+TrayExecByTray 9 1')
      expect(profile.keys.F1[2].command).toBe('+TrayExecByTray 9 2')
      
      expect(profile.keys.F2).toHaveLength(2)
      expect(profile.keys.F2[0].command).toBe('FirePhasers')
      expect(profile.keys.F2[1].command).toBe('FireTorpedos')
      
      // Check that stabilization metadata was set
      expect(profile.keybindMetadata.F1.stabilizeExecutionOrder).toBe(true)
      expect(profile.keybindMetadata.F2.stabilizeExecutionOrder).toBe(true)
    })

    it('should not set stabilization metadata for non-mirrored commands', () => {
      const keybindContent = `F1 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2"
F2 "FirePhasers"`
      
      const result = keybindManager.importKeybindFile(keybindContent)
      
      expect(result.success).toBe(true)
      
      // Check that commands are stored normally
      const profile = app.getCurrentProfile()
      expect(profile.keys.F1).toHaveLength(3)
      expect(profile.keys.F2).toHaveLength(1)
      
      // Check that no stabilization metadata was set
      expect(profile.keybindMetadata.F1).toBeUndefined()
      expect(profile.keybindMetadata.F2).toBeUndefined()
    })

    it('should handle mixed mirrored and non-mirrored commands', () => {
      const keybindContent = `F1 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0"
F2 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1"
F3 "SingleCommand"`
      
      const result = keybindManager.importKeybindFile(keybindContent)
      
      expect(result.success).toBe(true)
      
      const profile = app.getCurrentProfile()
      
      // F1 is mirrored
      expect(profile.keys.F1).toHaveLength(2)
      expect(profile.keybindMetadata.F1.stabilizeExecutionOrder).toBe(true)
      
      // F2 is not mirrored
      expect(profile.keys.F2).toHaveLength(2)
      expect(profile.keybindMetadata.F2).toBeUndefined()
      
      // F3 is single command
      expect(profile.keys.F3).toHaveLength(1)
      expect(profile.keybindMetadata.F3).toBeUndefined()
    })

    it('should handle empty command chains', () => {
      const keybindContent = `F1 ""
F2 " "`
      
      const result = keybindManager.importKeybindFile(keybindContent)
      
      expect(result.success).toBe(true)
      
      const profile = app.getCurrentProfile()
      // Empty strings still get parsed as command objects but with empty command strings
      expect(profile.keys.F1).toHaveLength(1)
      expect(profile.keys.F1[0].command).toBe('')
      expect(profile.keys.F2).toHaveLength(1)
      expect(profile.keys.F2[0].command).toBe('')
      expect(profile.keybindMetadata.F1).toBeUndefined()
      expect(profile.keybindMetadata.F2).toBeUndefined()
    })

    it('should preserve existing keybindMetadata structure', () => {
      // Set up profile with existing metadata
      app.getCurrentProfile.mockReturnValue({
        keys: {},
        keybindMetadata: {
          F3: { stabilizeExecutionOrder: false }
        }
      })
      
      const keybindContent = `F1 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0"`
      
      const result = keybindManager.importKeybindFile(keybindContent)
      
      expect(result.success).toBe(true)
      
      const profile = app.getCurrentProfile()
      
      // Should preserve existing metadata
      expect(profile.keybindMetadata.F3.stabilizeExecutionOrder).toBe(false)
      
      // Should add new metadata
      expect(profile.keybindMetadata.F1.stabilizeExecutionOrder).toBe(true)
    })

    it('should handle complex mirrored patterns', () => {
      const keybindContent = `numpad0 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 3 $$ +TrayExecByTray 9 4 $$ +TrayExecByTray 9 3 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0"`
      
      const result = keybindManager.importKeybindFile(keybindContent)
      
      expect(result.success).toBe(true)
      
      const profile = app.getCurrentProfile()
      expect(profile.keys.numpad0).toHaveLength(5)
      expect(profile.keys.numpad0[0].command).toBe('+TrayExecByTray 9 0')
      expect(profile.keys.numpad0[4].command).toBe('+TrayExecByTray 9 4')
      expect(profile.keybindMetadata.numpad0.stabilizeExecutionOrder).toBe(true)
    })
  })
}) 