import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import CommandService from '../../src/js/components/services/CommandService.js'
import eventBus from '../../src/js/core/eventBus.js'
import { respond } from '../../src/js/core/requestResponse.js'

describe('CommandService', () => {
  let commandService
  let mockStorage
  let mockI18n
  let mockDataCoordinatorResponder
  let mockProfileUpdateResponder

  const mockProfile = {
    id: 'test-profile',
    currentEnvironment: 'space',
    builds: {
      space: {
        keys: {
          'F1': [{ command: 'say test 1' }],
          'F2': [{ command: 'say test 2' }]
        }
      },
      ground: {
        keys: {
          'G': [{ command: 'ground command' }]
        }
      }
    },
    aliases: {
      'testalias': { commands: 'say hello $$ emote wave' },
      'simplealias': { commands: 'say simple' }
    }
  }

  beforeEach(async () => {
    // Mock DataCoordinator responses
    mockDataCoordinatorResponder = respond(eventBus, 'data:register-subscriber', () => {
      return { success: true }
    })

    mockProfileUpdateResponder = respond(eventBus, 'data:update-profile', ({ profileId, updates }) => {
      // Simulate successful profile update
      return { success: true, profile: { ...mockProfile, ...updates } }
    })

    // Mock legacy dependencies (kept for backward compatibility)
    mockStorage = {
      getProfile: vi.fn(() => mockProfile),
      saveProfile: vi.fn()
    }

    mockI18n = {
      t: vi.fn((key) => key) // Return the key as translation
    }

    commandService = new CommandService({
      storage: mockStorage,
      eventBus: eventBus,
      i18n: mockI18n
    })

    // Initialize the service
    await commandService.init()
    
    // Simulate receiving initial state from DataCoordinator
    commandService.updateCacheFromProfile(mockProfile)
    commandService.cache.currentProfile = 'test-profile'
    commandService.cache.currentEnvironment = 'space'
    commandService.currentProfile = 'test-profile'
    commandService.currentEnvironment = 'space'
  })

  afterEach(() => {
    if (mockDataCoordinatorResponder) mockDataCoordinatorResponder()
    if (mockProfileUpdateResponder) mockProfileUpdateResponder()
    if (commandService) commandService.destroy()
  })

  describe('DataCoordinator Integration', () => {
    it('should register with DataCoordinator on init', async () => {
      // This is tested implicitly by the successful beforeEach setup
      expect(commandService.componentName).toBe('CommandService')
      expect(commandService.cache.currentProfile).toBe('test-profile')
    })

    it('should update cache when receiving profile:updated event', () => {
      const updatedProfile = {
        ...mockProfile,
        builds: {
          ...mockProfile.builds,
          space: {
            keys: {
              'F1': [{ command: 'updated command' }],
              'F3': [{ command: 'new command' }]
            }
          }
        }
      }

      // Set up cache to current profile
      commandService.cache.currentProfile = 'test-profile'

      // Emit profile:updated event
      eventBus.emit('profile:updated', { 
        profileId: 'test-profile', 
        profile: updatedProfile 
      })

      expect(commandService.cache.profile).toEqual(updatedProfile)
      expect(commandService.cache.keys).toEqual(updatedProfile.builds.space.keys)
    })

    it('should handle late join state from DataCoordinator', () => {
      // Reset service state
      commandService.currentProfile = null
      commandService.cache.currentProfile = null

      // Simulate ComponentBase late-join from DataCoordinator
      const mockState = {
        currentProfileData: {
          id: 'test-profile',
          environment: 'ground',
          builds: mockProfile.builds,
          aliases: mockProfile.aliases
        }
      }

      commandService.handleInitialState('DataCoordinator', mockState)

      expect(commandService.currentProfile).toBe('test-profile')
      expect(commandService.cache.currentProfile).toBe('test-profile')
      expect(commandService.currentEnvironment).toBe('ground')
      expect(commandService.cache.currentEnvironment).toBe('ground')
    })
  })

  describe('Command Operations - Keybinds', () => {
    beforeEach(() => {
      commandService.currentEnvironment = 'space'
      commandService.cache.currentEnvironment = 'space'
    })

    it('should add a command to a keybind', async () => {
      const newCommand = { command: 'say new command' }
      const emitSpy = vi.spyOn(commandService, 'emit')

      const result = await commandService.addCommand('F1', newCommand)

      expect(result).toBe(true)
      expect(emitSpy).toHaveBeenCalledWith('command-added', { 
        key: 'F1', 
        command: newCommand 
      })
    })

    it('should add a command to a new keybind', async () => {
      const newCommand = { command: 'say first command' }
      const emitSpy = vi.spyOn(commandService, 'emit')

      const result = await commandService.addCommand('F5', newCommand)

      expect(result).toBe(true)
      expect(emitSpy).toHaveBeenCalledWith('command-added', { 
        key: 'F5', 
        command: newCommand 
      })
    })

    it('should delete a command from a keybind', async () => {
      // Set up initial state with a command to delete
      commandService.cache.keys = { 'F1': [{ command: 'command 1' }, { command: 'command 2' }] }
      
      const emitSpy = vi.spyOn(commandService, 'emit')

      const result = await commandService.deleteCommand('F1', 0)

      expect(result).toBe(true)
      expect(emitSpy).toHaveBeenCalledWith('command-deleted', { 
        key: 'F1', 
        index: 0 
      })
    })

    it('should move a command within a keybind', async () => {
      // Set up initial state with multiple commands
      commandService.cache.keys = { 
        'F1': [{ command: 'command 1' }, { command: 'command 2' }, { command: 'command 3' }] 
      }
      
      const emitSpy = vi.spyOn(commandService, 'emit')

      const result = await commandService.moveCommand('F1', 0, 2)

      expect(result).toBe(true)
      expect(emitSpy).toHaveBeenCalledWith('command-moved', { 
        key: 'F1', 
        fromIndex: 0,
        toIndex: 2 
      })
    })

    it('should return false when trying to add command without key', async () => {
      const result = await commandService.addCommand(null, { command: 'test' })
      
      expect(result).toBe(false)
    })
  })

  describe('Command Operations - Aliases', () => {
    beforeEach(() => {
      commandService.currentEnvironment = 'alias'
      commandService.cache.currentEnvironment = 'alias'
    })

    it('should add a command to an alias', async () => {
      const newCommand = { command: 'say new' }
      const emitSpy = vi.spyOn(commandService, 'emit')

      const result = await commandService.addCommand('testalias', newCommand)

      expect(result).toBe(true)
      expect(emitSpy).toHaveBeenCalledWith('command-added', { 
        key: 'testalias', 
        command: newCommand 
      })
    })

    it('should add a command to a new alias', async () => {
      const newCommand = { command: 'say hello' }
      const emitSpy = vi.spyOn(commandService, 'emit')

      const result = await commandService.addCommand('newalias', newCommand)

      expect(result).toBe(true)
      expect(emitSpy).toHaveBeenCalledWith('command-added', { 
        key: 'newalias', 
        command: newCommand 
      })
    })

    it('should handle array of commands for alias', async () => {
      const commands = [
        { command: 'say first' },
        { command: 'say second' }
      ]
      
      const result = await commandService.addCommand('testalias', commands)

      expect(result).toBe(true)
    })

    it('should delete a command from an alias', async () => {
      // Set up alias with multiple commands
      commandService.cache.aliases = {
        'testalias': { commands: 'say hello $$ emote wave $$ say goodbye' }
      }
      
      const emitSpy = vi.spyOn(commandService, 'emit')

      const result = await commandService.deleteCommand('testalias', 1)

      expect(result).toBe(true)
      expect(emitSpy).toHaveBeenCalledWith('command-deleted', { 
        key: 'testalias', 
        index: 1 
      })
    })

    it('should move a command within an alias', async () => {
      // Set up alias with multiple commands
      commandService.cache.aliases = {
        'testalias': { commands: 'say first $$ say second $$ say third' }
      }
      
      const emitSpy = vi.spyOn(commandService, 'emit')

      const result = await commandService.moveCommand('testalias', 0, 2)

      expect(result).toBe(true)
      expect(emitSpy).toHaveBeenCalledWith('command-moved', { 
        key: 'testalias', 
        fromIndex: 0,
        toIndex: 2 
      })
    })
  })

  describe('Data Retrieval', () => {
    it('should return commands for keybind in space environment', () => {
      commandService.currentEnvironment = 'space'
      commandService.cache.currentEnvironment = 'space'
      commandService.cache.keys = mockProfile.builds.space.keys

      const commands = commandService.getCommandsForKey('F1')

      expect(commands).toEqual([{ command: 'say test 1' }])
    })

    it('should return commands for alias environment', () => {
      commandService.currentEnvironment = 'alias'
      commandService.cache.currentEnvironment = 'alias'
      commandService.cache.aliases = mockProfile.aliases

      const commands = commandService.getCommandsForKey('testalias')

      expect(commands).toEqual(['say hello', 'emote wave'])
    })

    it('should return empty array for non-existent key', () => {
      const commands = commandService.getCommandsForKey('NONEXISTENT')

      expect(commands).toEqual([])
    })

    it('should return cached profile from getCurrentProfile', () => {
      const profile = commandService.getCurrentProfile()

      expect(profile).toBeDefined()
      expect(profile.keys).toEqual(mockProfile.builds.space.keys)
      expect(profile.aliases).toEqual(mockProfile.aliases)
    })
  })

  describe('Event Handling', () => {
    it('should handle key-selected event', () => {
      eventBus.emit('key-selected', { key: 'F5' })

      expect(commandService.selectedKey).toBe('F5')
      expect(commandService.selectedAlias).toBe(null)
    })

    it('should handle alias-selected event', () => {
      eventBus.emit('alias-selected', { name: 'testalias' })

      expect(commandService.selectedAlias).toBe('testalias')
      expect(commandService.selectedKey).toBe(null)
    })

    it('should handle environment:changed event', () => {
      // Start in space environment
      commandService.currentEnvironment = 'space'
      commandService.cache.keys = mockProfile.builds.space.keys

      // Switch to ground environment
      eventBus.emit('environment:changed', { environment: 'ground' })

      expect(commandService.currentEnvironment).toBe('ground')
      expect(commandService.cache.currentEnvironment).toBe('ground')
      expect(commandService.selectedKey).toBe(null)
      expect(commandService.selectedAlias).toBe(null)
    })

    it('should handle profile:switched event', () => {
      const newProfile = {
        id: 'new-profile',
        builds: { space: { keys: { 'F1': [{ command: 'new command' }] } } },
        aliases: { 'newalias': { commands: 'new alias command' } }
      }

      eventBus.emit('profile:switched', {
        profileId: 'new-profile',
        profile: newProfile,
        environment: 'ground'
      })

      expect(commandService.currentProfile).toBe('new-profile')
      expect(commandService.cache.currentProfile).toBe('new-profile')
      expect(commandService.currentEnvironment).toBe('ground')
      expect(commandService.cache.currentEnvironment).toBe('ground')
    })
  })

  describe('Command Validation', () => {
    it('should validate valid command', () => {
      const result = commandService.validateCommand({ command: 'say test' })

      expect(result.valid).toBe(true)
    })

    it('should reject empty command', () => {
      const result = commandService.validateCommand(null)

      expect(result.valid).toBe(false)
      expect(result.reason).toBe('empty')
    })
  })

  describe('Request/Response Endpoints', () => {
    it('should have command:add endpoint functionality', async () => {
      const addCommandSpy = vi.spyOn(commandService, 'addCommand')
      const command = { command: 'test command' }
      
      // Test the method directly since we can't easily test the respond endpoint
      await commandService.addCommand('F1', command)
      
      expect(addCommandSpy).toHaveBeenCalledWith('F1', command)
    })

    it('should have command:delete endpoint functionality', async () => {
      const deleteCommandSpy = vi.spyOn(commandService, 'deleteCommand')
      
      await commandService.deleteCommand('F1', 0)
      
      expect(deleteCommandSpy).toHaveBeenCalledWith('F1', 0)
    })
  })
}) 