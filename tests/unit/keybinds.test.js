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
    setModified: vi.fn(),
    loadData: vi.fn(),
    renderKeyGrid: vi.fn(),
    renderCommandChain: vi.fn()
  }
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
    })

    it('should import valid keybind file content', () => {
      const saveProfileSpy = vi.spyOn(stoStorage, 'saveProfile')
      const content = 'F2 "say hello" ""'
      const result = keybindManager.importKeybindFile(content)
      
      expect(result.success).toBe(true)
      expect(result.imported.keys).toBe(1)
      expect(saveProfileSpy).toHaveBeenCalled()
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
        'Import completed: 1 keybinds, 1 aliases',
        'success'
      )
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

    it('should export aliases before keybinds', () => {
      const profile = {
        name: 'Test',
        mode: 'Space',
        keys: { F1: [{ command: 'say hello' }] },
        aliases: { TestAlias: { commands: 'say test' } }
      }
      
      const output = keybindManager.exportProfile(profile)
      const aliasIndex = output.indexOf('alias TestAlias')
      const keybindIndex = output.indexOf('F1 "say hello"')
      
      expect(aliasIndex).toBeLessThan(keybindIndex)
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
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
      
      keybindManager.setupEventListeners()
      
      expect(addEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function))
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
}) 