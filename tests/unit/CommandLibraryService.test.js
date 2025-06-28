import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

import CommandLibraryService from '../../src/js/components/services/CommandLibraryService.js'
import DataService from '../../src/js/components/services/DataService.js'
import eventBus from '../../src/js/core/eventBus.js'

// Mock dependencies
const mockStorage = {
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  getAllData: vi.fn(),
  loadProfile: vi.fn().mockReturnValue(null) // Default to null, can be overridden per test
}

const mockUI = {
  showToast: vi.fn(),
  initDragAndDrop: vi.fn()
}

const mockModalManager = {
  show: vi.fn(),
  hide: vi.fn()
}

const mockI18n = {
  t: vi.fn((key) => key)
}

// Mock STO_DATA for DataService
const mockStoData = {
  commands: {
    space: {
      name: 'Space Commands',
      icon: 'fas fa-rocket',
      environments: ['space'],
      commands: {
        tray_exec: {
          name: 'Execute Tray',
          command: '+STOTrayExec 0 0',
          icon: '🎯',
          description: 'Execute tray command',
          customizable: true,
          parameters: {
            tray: { type: 'number', min: 0, max: 9 },
            slot: { type: 'number', min: 0, max: 9 }
          }
        },
        target: {
          name: 'Target Entity',
          command: 'Target "Entity Name"',
          icon: '🎯',
          description: 'Target an entity',
          customizable: true,
          parameters: {
            entityName: { type: 'string' }
          }
        }
      }
    },
    ground: {
      name: 'Ground Commands',
      icon: 'fas fa-mountain',
      environments: ['ground'],
      commands: {
        ground_cmd: {
          name: 'Ground Command',
          command: 'GroundCommand',
          icon: '🏔️',
          description: 'Ground command',
          customizable: false
        }
      }
    },
    tray: {
      name: 'Tray Execution',
      icon: 'fas fa-th',
      commands: {
        custom_tray: {
          name: 'Tray Execution',
          command: '+STOTrayExecByTray 0 0',
          icon: '⚡',
          description: 'Execute specific tray slot',
          customizable: true,
          parameters: {
            tray: { type: 'number', min: 0, max: 9, default: 0 },
            slot: { type: 'number', min: 0, max: 9, default: 0 },
          },
        },
        tray_with_backup: {
          name: 'Tray Execution with Backup',
          command: 'TrayExecByTrayWithBackup 1 0 0 0 0',
          icon: '⚡',
          description: 'Execute specific tray slot with backup ability',
          customizable: true,
        },
        tray_range: {
          name: 'Tray Range Execution',
          command: '+STOTrayExecByTray 0 0',
          icon: '⚡',
          description: 'Execute a range of tray slots',
          customizable: true,
        },
        tray_range_with_backup: {
          name: 'Tray Range with Backup',
          command: 'TrayExecByTrayWithBackup 1 0 0 0 0',
          icon: '⚡',
          description: 'Execute a range of tray slots with backup',
          customizable: true,
        },
      }
    }
  },
  validationPatterns: {
    keyName: /^[A-Za-z0-9_]+$/,
    aliasName: /^[A-Za-z0-9_]+$/
  }
}

// Mock legacy global for any remaining references in tests
global.STO_DATA = mockStoData

describe('CommandLibraryService', () => {
  let service, dataService

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // Set up DataService with mock data
    dataService = new DataService({ eventBus, data: mockStoData })
    await dataService.init()
    
    service = new CommandLibraryService({
      storage: mockStorage,
      eventBus,
      i18n: mockI18n,
      ui: mockUI,
      modalManager: mockModalManager
    })
    
    // Initialize the service to set up event listeners
    await service.init()
    
    // Mock the emit method as a spy
    vi.spyOn(service, 'emit')
    
    // Mock the request function that CommandLibraryService uses for FileOperationsService
    const { respond } = await import('../../src/js/core/requestResponse.js')
    
    // Set up FileOperations mock responses
    const detachFileOps1 = respond(eventBus, 'fileops:parse-command-string', (data) => {
      const commands = data.commandString.split(' $$ ')
      return commands.map(cmd => ({ command: cmd.trim() }))
    })
    
    const detachFileOps2 = respond(eventBus, 'fileops:generate-command-preview', (data) => {
      const { key, commands } = data
      if (!commands || commands.length === 0) {
        return `${key} ""`
      }
      const commandString = commands.map(c => c.command || c).join(' $$ ')
      return `${key} "${commandString}"`
    })
    
    const detachFileOps3 = respond(eventBus, 'fileops:generate-mirrored-commands', (data) => {
      const { commands } = data
      const forwardCommands = commands.map(cmd => cmd.command)
      const reverseCommands = [...commands].slice(0, -1).reverse().map(cmd => cmd.command)
      return `${forwardCommands.join(' $$ ')} $$ ${reverseCommands.join(' $$ ')}`
    })
    
    // Store detach functions for cleanup
    service._testDetachFunctions = [detachFileOps1, detachFileOps2, detachFileOps3]
  })
  
  afterEach(async () => {
    // Clean up mock responses
    if (service._testDetachFunctions) {
      service._testDetachFunctions.forEach(detach => detach())
    }
    
    if (service) await service.destroy()
    if (dataService) await dataService.destroy()
  })

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(service.storage).toBe(mockStorage)
      expect(service.i18n).toBe(mockI18n)
      expect(service.ui).toBe(mockUI)
      expect(service.modalManager).toBe(mockModalManager)
      expect(service.selectedKey).toBeNull()
      expect(service.currentEnvironment).toBe('space')
      expect(service.currentProfile).toBeNull()
    })
  })

  describe('onInit', () => {
    it('should setup event listeners', () => {
      const setupSpy = vi.spyOn(service, 'setupEventListeners')
      service.onInit()
      expect(setupSpy).toHaveBeenCalled()
    })
  })

  describe('event-driven state management', () => {
    it('should respond to key-selected events', () => {
      eventBus.emit('key-selected', { key: 'test-key' })
      expect(service.selectedKey).toBe('test-key')
    })

    it('should respond to environment:changed events', () => {
      eventBus.emit('environment:changed', { environment: 'ground' })
      expect(service.currentEnvironment).toBe('ground')
    })

    it('should respond to profile:switched events', () => {
          // The service listens for both 'profile:switched' and uses profile (not profileId)
    eventBus.emit('profile:switched', { profile: 'profile-1', environment: 'space' })
      
      // Give the event time to process
      expect(service.currentProfile).toBe('profile-1')
      expect(service.currentEnvironment).toBe('space')
    })

    it('should clear selections when environment changes', () => {
      service.selectedKey = 'some-key'
      eventBus.emit('environment:changed', { environment: 'ground' })
      expect(service.selectedKey).toBe(null)
    })
  })

  describe('getCommandsForSelectedKey', () => {
    beforeEach(() => {
      eventBus.emit('profile:switched', { profile: 'profile-1', environment: 'space' })
      eventBus.emit('key-selected', { key: 'test-key' })
    })

    it('should return empty array when no key is selected', async () => {
      service.selectedKey = null
      const result = await service.getCommandsForSelectedKey()
      expect(result).toEqual([])
    })

    it('should return empty array when no profile exists', async () => {
      mockStorage.getProfile.mockReturnValue(null)
      const result = await service.getCommandsForSelectedKey()
      expect(result).toEqual([])
    })

    it('should handle alias environment commands', async () => {
      eventBus.emit('environment:changed', { environment: 'alias' })
      
      // Set service state properly
      service.selectedAlias = 'test-key'
      service.currentProfile = 'profile-1'
      service.currentEnvironment = 'alias'
      
      const mockProfile = {
        aliases: {
          'test-key': {
            commands: 'command1 $$ command2'
          }
        }
      }
      mockStorage.getProfile.mockReturnValue(mockProfile)

      const commands = await service.getCommandsForSelectedKey()
      expect(commands).toHaveLength(2)
      expect(commands[0].command).toBe('command1')
      expect(commands[1].command).toBe('command2')
    })

    it('should handle keybind environment commands', async () => {
      eventBus.emit('environment:changed', { environment: 'space' })
      
      // Ensure the service has the correct state
      service.selectedKey = 'test-key'
      service.currentProfile = 'profile-1'
      service.currentEnvironment = 'space'
      
      // Set up the profile structure that getCurrentBuild expects
      const mockProfile = {
        builds: {
          space: {
            keys: {
              'test-key': [
                { command: 'command1', type: 'space', icon: '🎯', text: 'Command 1' },
                { command: 'command2', type: 'space', icon: '🎯', text: 'Command 2' }
              ]
            }
          }
        },
        aliases: {}
      }
      mockStorage.getProfile.mockReturnValue(mockProfile)

      const commands = await service.getCommandsForSelectedKey()
      expect(commands).toHaveLength(2)
      expect(commands[0].command).toBe('command1')
      expect(commands[1].command).toBe('command2')
    })
  })

  describe('findCommandDefinition', () => {
    it('should find command definition by command text', async () => {
      const command = { command: '+STOTrayExec 0 0' }
      const result = await service.findCommandDefinition(command)
      expect(result).toBeDefined()
      expect(result.name).toBe('Execute Tray')
    })

    it('should find command definition by name', async () => {
      const command = { text: 'Execute Tray' }
      const result = await service.findCommandDefinition(command)
      expect(result).toBeDefined()
      expect(result.command).toBe('+STOTrayExec 0 0')
    })

    it('should return null when command not found', async () => {
      const command = { command: 'nonexistent' }
      const result = await service.findCommandDefinition(command)
      expect(result).toBeNull()
    })

    it('should map tray execution command with parameters back to library definition', async () => {
      const command = { command: '+STOTrayExecByTray 1 1', text: '+STOTrayExecByTray 1 1' }
      const result = await service.findCommandDefinition(command)
      expect(result).toBeDefined()
      expect(result.commandId).toBe('custom_tray')
      expect(result.name).toBe('Tray Execution')
    })
  })

  describe('getCommandWarning', () => {
    it('should return warning when command has one', async () => {
      // Add a warning to the mock data
      mockStoData.commands.space.commands.tray_exec.warning = 'Test warning'
      
      const command = { command: '+STOTrayExec 0 0' }
      const result = await service.getCommandWarning(command)
      expect(result).toBe('Test warning')
    })

    it('should return null when command has no warning', async () => {
      const command = { command: 'GroundCommand' }
      const result = await service.getCommandWarning(command)
      expect(result).toBeNull()
    })
  })

  describe('addCommand', () => {
    beforeEach(() => {
      eventBus.emit('profile:switched', { profile: 'profile-1', environment: 'space' })
      eventBus.emit('key-selected', { key: 'test-key' })
    })

    it('should show warning when no key is selected', () => {
      service.selectedKey = null
      const result = service.addCommand('test-key', { command: 'test' })
      expect(result).toBe(false)
      expect(mockUI.showToast).toHaveBeenCalledWith('please_select_a_key_first', 'warning')
    })

    it('should show error when no valid profile', () => {
      mockStorage.getProfile.mockReturnValue(null)
      const result = service.addCommand('test-key', { command: 'test' })
      expect(result).toBe(false)
      expect(mockUI.showToast).toHaveBeenCalledWith('no_valid_profile', 'error')
    })

    it('should add command to alias environment', () => {
      eventBus.emit('environment:changed', { environment: 'alias' })
      
      // For alias environment, we need to select an alias, not a key
      eventBus.emit('alias-selected', { name: 'test-key' })
      
      // Set the service state correctly
      service.selectedAlias = 'test-key'
      service.selectedKey = 'test-key'  // The addCommand method still checks selectedKey
      service.currentProfile = 'profile-1'
      service.currentEnvironment = 'alias'
      
      const mockProfile = {
        aliases: {
          'test-key': {
            commands: 'existing'
          }
        }
      }
      mockStorage.getProfile.mockReturnValue(mockProfile)

      const result = service.addCommand('test-key', { command: 'new-command' })
      expect(result).toBe(true)
      expect(mockStorage.saveProfile).toHaveBeenCalled()
      expect(service.emit).toHaveBeenCalledWith('command-added', { key: 'test-key', command: { command: 'new-command' } })
    })

    it('should add command to keybind environment', () => {
      eventBus.emit('environment:changed', { environment: 'space' })
      
      // Set the service state correctly
      service.selectedKey = 'test-key'
      service.currentProfile = 'profile-1'
      service.currentEnvironment = 'space'
      
      const mockProfile = {
        builds: {
          space: {
            keys: {
              'test-key': []
            }
          }
        },
        aliases: {}
      }
      mockStorage.getProfile.mockReturnValue(mockProfile)

      const command = { command: 'new-command', type: 'space', icon: '🎯', text: 'New Command' }
      const result = service.addCommand('test-key', command)
      expect(result).toBe(true)
      expect(mockStorage.saveProfile).toHaveBeenCalled()
      expect(service.emit).toHaveBeenCalledWith('command-added', { key: 'test-key', command })
    })
  })

  describe('deleteCommand', () => {
    beforeEach(() => {
      eventBus.emit('profile:switched', { profile: 'profile-1', environment: 'space' })
      eventBus.emit('key-selected', { key: 'test-key' })
    })

    it('should return false when no profile exists', () => {
      mockStorage.getProfile.mockReturnValue(null)
      const result = service.deleteCommand('test-key', 0)
      expect(result).toBe(false)
    })

    it('should delete command from alias environment', () => {
      eventBus.emit('environment:changed', { environment: 'alias' })
      
      // Set service state properly
      service.selectedAlias = 'test-key'
      service.currentProfile = 'profile-1'
      service.currentEnvironment = 'alias'
      
      const mockProfile = {
        aliases: {
          'test-key': {
            commands: 'cmd1 $$ cmd2 $$ cmd3'
          }
        }
      }
      mockStorage.getProfile.mockReturnValue(mockProfile)

      const result = service.deleteCommand('test-key', 1)
      expect(result).toBe(true)
      expect(mockStorage.saveProfile).toHaveBeenCalled()
      expect(service.emit).toHaveBeenCalledWith('command-deleted', { key: 'test-key', index: 1 })
    })

    it('should delete command from keybind environment', () => {
      eventBus.emit('environment:changed', { environment: 'space' })
      
      // Set service state properly
      service.selectedKey = 'test-key'
      service.currentProfile = 'profile-1'
      service.currentEnvironment = 'space'
      
      const mockProfile = {
        builds: {
          space: {
            keys: {
              'test-key': [
                { command: 'cmd1' },
                { command: 'cmd2' },
                { command: 'cmd3' }
              ]
            }
          }
        },
        aliases: {}
      }
      mockStorage.getProfile.mockReturnValue(mockProfile)

      const result = service.deleteCommand('test-key', 1)
      expect(result).toBe(true)
      expect(mockStorage.saveProfile).toHaveBeenCalled()
      expect(service.emit).toHaveBeenCalledWith('command-deleted', { key: 'test-key', index: 1 })
    })
  })

  describe('moveCommand', () => {
    beforeEach(() => {
      eventBus.emit('profile:switched', { profile: 'profile-1', environment: 'space' })
      eventBus.emit('key-selected', { key: 'test-key' })
    })

    it('should return false when no profile exists', () => {
      mockStorage.getProfile.mockReturnValue(null)
      const result = service.moveCommand('test-key', 0, 1)
      expect(result).toBe(false)
    })

    it('should move command in alias environment', () => {
      eventBus.emit('environment:changed', { environment: 'alias' })
      
      // Set service state properly
      service.selectedAlias = 'test-key'
      service.currentProfile = 'profile-1'
      service.currentEnvironment = 'alias'
      
      const mockProfile = {
        aliases: {
          'test-key': {
            commands: 'cmd1 $$ cmd2 $$ cmd3'
          }
        }
      }
      mockStorage.getProfile.mockReturnValue(mockProfile)

      const result = service.moveCommand('test-key', 0, 2)
      expect(result).toBe(true)
      expect(mockStorage.saveProfile).toHaveBeenCalled()
      expect(service.emit).toHaveBeenCalledWith('command-moved', { key: 'test-key', fromIndex: 0, toIndex: 2 })
    })

    it('should move command in keybind environment', () => {
      eventBus.emit('environment:changed', { environment: 'space' })
      
      // Set service state properly
      service.selectedKey = 'test-key'
      service.currentProfile = 'profile-1'
      service.currentEnvironment = 'space'
      
      const mockProfile = {
        builds: {
          space: {
            keys: {
              'test-key': [
                { command: 'cmd1' },
                { command: 'cmd2' },
                { command: 'cmd3' }
              ]
            }
          }
        },
        aliases: {}
      }
      mockStorage.getProfile.mockReturnValue(mockProfile)

      const result = service.moveCommand('test-key', 0, 2)
      expect(result).toBe(true)
      expect(mockStorage.saveProfile).toHaveBeenCalled()
      expect(service.emit).toHaveBeenCalledWith('command-moved', { key: 'test-key', fromIndex: 0, toIndex: 2 })
    })
  })

  describe('generateCommandId', () => {
    it('should generate unique command IDs', () => {
      const id1 = service.generateCommandId()
      const id2 = service.generateCommandId()
      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^cmd_\d+_[a-z0-9]+$/)
      expect(id2).toMatch(/^cmd_\d+_[a-z0-9]+$/)
    })
  })

  describe('getCommandCategories', () => {
    it('should return command categories', async () => {
      const categories = await service.getCommandCategories()
      expect(categories).toEqual(mockStoData.commands)
    })

    it('should return empty object when STO_DATA is not available', async () => {
      // Temporarily stop DataService to simulate no data available
      await dataService.destroy()
      
      const categories = await service.getCommandCategories()
      expect(categories).toEqual({})
      
      // Restart DataService for other tests
      dataService = new DataService({ eventBus, data: mockStoData })
      await dataService.init()
    })
  })

  describe('getCommandChainPreview', () => {
    beforeEach(() => {
      eventBus.emit('profile:switched', { profile: 'profile-1', environment: 'space' })
    })

    it('should return select message when no key is selected', async () => {
      const preview = await service.getCommandChainPreview()
      expect(preview).toBe('select_a_key_to_see_the_generated_command')
    })

    it('should return empty alias format for alias environment with no commands', async () => {
      eventBus.emit('environment:changed', { environment: 'alias' })
      service.selectedAlias = 'test-key'
      const preview = await service.getCommandChainPreview()
      expect(preview).toBe('alias test-key <&  &>')
    })

    it('should return empty keybind format for keybind environment with no commands', async () => {
      eventBus.emit('environment:changed', { environment: 'space' })
      service.selectedKey = 'test-key'
      mockStorage.getProfile.mockReturnValue(null)
      const preview = await service.getCommandChainPreview()
      expect(preview).toBe('test-key ""')
    })

    it('should return alias format with commands', async () => {
      eventBus.emit('environment:changed', { environment: 'alias' })
      
      // Set service state properly
      service.selectedAlias = 'test-key'
      service.currentProfile = 'profile-1'
      service.currentEnvironment = 'alias'
      
      const mockProfile = {
        aliases: {
          'test-key': {
            commands: 'cmd1 $$ cmd2'
          }
        }
      }
      mockStorage.getProfile.mockReturnValue(mockProfile)

      const preview = await service.getCommandChainPreview()
      expect(preview).toBe('alias test-key <& cmd1 $$ cmd2 &>')
    })

    it('should return keybind format with commands', async () => {
      eventBus.emit('environment:changed', { environment: 'space' })
      
      // Set service state properly
      service.selectedKey = 'test-key'
      service.currentProfile = 'profile-1'
      service.currentEnvironment = 'space'
      
      const mockProfile = {
        builds: {
          space: {
            keys: {
              'test-key': [
                { command: 'cmd1' },
                { command: 'cmd2' }
              ]
            }
          }
        },
        aliases: {}
      }
      mockStorage.getProfile.mockReturnValue(mockProfile)

      const preview = await service.getCommandChainPreview()
      expect(preview).toBe('test-key "cmd1 $$ cmd2"')
    })
  })

  describe('filterCommandLibrary', () => {
    beforeEach(() => {
      // Mock DOM elements with proper structure
      const mockCommandItems = [
        {
          dataset: { command: 'ground_cmd' },
          style: { display: '' }
        },
        {
          dataset: { command: 'space_cmd' },
          style: { display: '' }
        },
        {
          dataset: { command: 'unknown_cmd' },
          style: { display: '' }
        }
      ]
      
      const mockCategories = [
        {
          querySelectorAll: vi.fn().mockReturnValue([
            { style: { display: '' } },
            { style: { display: 'none' } }
          ]),
          style: { display: '' },
          getAttribute: vi.fn().mockReturnValue('space') // Mock regular category
        }
      ]
      
      // Mock document.querySelectorAll to return different results based on selector
      document.querySelectorAll = vi.fn().mockImplementation((selector) => {
        if (selector === '.command-item') {
          return mockCommandItems
        } else if (selector === '.category') {
          return mockCategories
        }
        return []
      })
      
      eventBus.emit('environment:changed', { environment: 'space' })
    })

    it('should handle categories without environments property', () => {
      // Temporarily modify STO_DATA to include a category without environments
      const originalSTO_DATA = global.STO_DATA
      global.STO_DATA = {
        commands: {
          ground: {
            commands: {
              ground_cmd: { command: 'GroundCommand', environment: 'ground' }
            }
          },
          space: {
            commands: {
              space_cmd: { command: 'SpaceCommand', environment: 'space' }
            }
          }
        }
      }

      // This should not throw an error
      expect(() => service.filterCommandLibrary()).not.toThrow()
      
      // Restore original STO_DATA
      global.STO_DATA = originalSTO_DATA
    })

    it('should filter commands based on current environment', async () => {
      await service.filterCommandLibrary()
      
      // Verify that querySelectorAll was called for both command items and categories
      expect(document.querySelectorAll).toHaveBeenCalledWith('.command-item')
      expect(document.querySelectorAll).toHaveBeenCalledWith('.category')
    })

    it('should handle missing STO_DATA gracefully', () => {
      const originalSTO_DATA = global.STO_DATA
      global.STO_DATA = null
      
      expect(() => service.filterCommandLibrary()).not.toThrow()
      
      global.STO_DATA = originalSTO_DATA
    })
  })

  describe('getEmptyStateInfo', () => {
    it('should return empty state info when no key is selected', async () => {
      const info = await service.getEmptyStateInfo()
      expect(info.title).toBe('select_a_key_to_edit')
      expect(info.preview).toBe('select_a_key_to_see_the_generated_command')
      expect(info.commandCount).toBe('0')
    })

    it('should return empty state info for alias environment', async () => {
      eventBus.emit('environment:changed', { environment: 'alias' })
      service.selectedAlias = 'test-key'
      const info = await service.getEmptyStateInfo()
      expect(info.title).toBe('Alias Chain for test-key')
      expect(info.emptyTitle).toBe('no_commands')
    })

    it('should return empty state info for keybind environment', async () => {
      eventBus.emit('environment:changed', { environment: 'space' })
      service.selectedKey = 'test-key'
      const info = await service.getEmptyStateInfo()
      expect(info.title).toBe('Command Chain for test-key')
      expect(info.emptyTitle).toBe('no_commands')
    })
  })

  describe('Whole tray execution bug fix', () => {
    it('should handle whole-tray commands without [object Object] issue', () => {
      // Set up profile with alias environment
      service.currentProfile = 'test-profile'
      service.currentEnvironment = 'alias'
      service.selectedAlias = 'TestAlias'
      service.selectedKey = 'TestAlias' // Set this to pass the selectedKey check

      // Set up a mock profile with aliases
      const mockProfile = {
        name: 'Test Profile',
        aliases: {
          TestAlias: { commands: '' }
        }
      }
      
      mockStorage.getProfile.mockReturnValue(mockProfile)
      mockStorage.loadProfile.mockReturnValue(mockProfile)

      // Mock a whole-tray command that returns an array of commands
      const wholeTrayCommands = [
        { command: '+STOTrayExecByTray 0 0', type: 'tray', icon: '⚡', text: 'Execute Whole Tray 1' },
        { command: '+STOTrayExecByTray 0 1', type: 'tray', icon: '⚡', text: '+STOTrayExecByTray 0 1' },
        { command: '+STOTrayExecByTray 0 2', type: 'tray', icon: '⚡', text: '+STOTrayExecByTray 0 2' }
      ]

      // Add the whole-tray command array
      const result = service.addCommand('TestAlias', wholeTrayCommands)
      expect(result).toBe(true)

      // Get the stored alias
      const profile = mockStorage.loadProfile('test-profile')
      const aliasCommands = profile.aliases.TestAlias.commands

      // Should not contain [object Object]
      expect(aliasCommands).not.toContain('[object Object]')
      
      // Should contain the actual command strings
      expect(aliasCommands).toBe('+STOTrayExecByTray 0 0 $$ +STOTrayExecByTray 0 1 $$ +STOTrayExecByTray 0 2')
    })

    it('should handle single commands normally', () => {
      service.currentProfile = 'test-profile'
      service.currentEnvironment = 'alias'
      service.selectedAlias = 'TestAlias2'
      service.selectedKey = 'TestAlias2' // Set this to pass the selectedKey check

      // Set up a mock profile with aliases
      const mockProfile = {
        name: 'Test Profile',
        aliases: {
          TestAlias2: { commands: '' }
        }
      }
      
      mockStorage.getProfile.mockReturnValue(mockProfile)
      mockStorage.loadProfile.mockReturnValue(mockProfile)

      const singleCommand = { command: 'Target_Enemy_Near', type: 'targeting', icon: '🎯', text: 'Target Nearest Enemy' }

      const result = service.addCommand('TestAlias2', singleCommand)
      expect(result).toBe(true)

      const profile = mockStorage.loadProfile('test-profile')
      const aliasCommands = profile.aliases.TestAlias2.commands

      expect(aliasCommands).toBe('Target_Enemy_Near')
    })
  })
})
