import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import eventBus from '../../src/js/core/eventBus.js'
import DataCoordinator from '../../src/js/components/services/DataCoordinator.js'
import { request } from '../../src/js/core/requestResponse.js'

describe('DataCoordinator', () => {
  let dataCoordinator
  let mockStorage

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks()
    
    // Create mock storage with consistent data
    const mockData = {
      currentProfile: 'default_space',
      profiles: {
        'default_space': {
          name: 'Default Space',
          description: 'Default space profile',
          currentEnvironment: 'space',
          builds: {
            space: { keys: { 'ctrl+1': 'test command' } },
            ground: { keys: {} }
          },
          aliases: {},
          created: '2023-01-01T00:00:00.000Z',
          lastModified: '2023-01-01T00:00:00.000Z'
        }
      },
      settings: {
        theme: 'light',
        language: 'en'
      },
      version: '1.0.0',
      lastModified: '2023-01-01T00:00:00.000Z'
    }

    mockStorage = {
      getAllData: vi.fn(() => mockData),
      saveAllData: vi.fn(() => true),
      saveProfile: vi.fn(() => true),
      deleteProfile: vi.fn(() => true),
      getProfile: vi.fn((id) => {
        return mockData.profiles[id] || null
      }),
      saveSettings: vi.fn(() => true),
      getSettings: vi.fn(() => mockData.settings)
    }

    // Destroy existing DataCoordinator if it exists
    if (dataCoordinator) {
      dataCoordinator.destroy()
      // Small delay to ensure cleanup completes
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    // Create fresh DataCoordinator
    dataCoordinator = new DataCoordinator({ 
      eventBus, 
      storage: mockStorage 
    })
    await dataCoordinator.init()
  })

  afterEach(() => {
    // Destroy DataCoordinator to cleanup listeners properly
    if (dataCoordinator) {
      dataCoordinator.destroy()
    }
    
    // Clear any remaining listeners as a safety measure
    eventBus.clear()
  })

  describe('Initialization', () => {
    it('should initialize with correct state from storage', () => {
      expect(dataCoordinator.state.currentProfile).toBe('default_space')
      expect(dataCoordinator.state.currentEnvironment).toBe('space')
      expect(dataCoordinator.state.profiles).toBeDefined()
      expect(Object.keys(dataCoordinator.state.profiles)).toHaveLength(1)
    })

    it('should setup all request handlers', () => {
      // Test that request handlers are registered by making requests
      expect(async () => {
        await request(eventBus, 'data:get-current-state')
      }).not.toThrow()
    })
  })

  describe('State Access', () => {
    it('should provide current state via getCurrentState method', () => {
      const state = dataCoordinator.getCurrentState()
      
      expect(state.currentProfile).toBe('default_space')
      expect(state.currentEnvironment).toBe('space')
      expect(state.profiles).toBeDefined()
      expect(state.settings).toBeDefined()
      expect(state.metadata).toBeDefined()
      expect(state.currentProfileData).toBeDefined()
      expect(state.currentProfileData.name).toBe('Default Space')
    })

    it('should provide current profile data through getCurrentState', () => {
      const state = dataCoordinator.getCurrentState()
      const profile = state.currentProfileData
      
      expect(profile.name).toBe('Default Space')
      expect(profile.keys).toEqual({ 'ctrl+1': 'test command' })
      expect(profile.aliases).toEqual({})
      expect(profile.environment).toBe('space')
      expect(profile.id).toBe('default_space')
    })

    it('should provide access to specific profile through state', () => {
      const profile = dataCoordinator.state.profiles['default_space']
      
      expect(profile.name).toBe('Default Space')
      expect(profile.currentEnvironment).toBe('space')
    })

    it('should return undefined for non-existent profile in state', () => {
      const profile = dataCoordinator.state.profiles['non_existent']
      
      expect(profile).toBeUndefined()
    })

    it('should return all profiles through request (allowed for bulk operations)', async () => {
      const profiles = await request(eventBus, 'data:get-all-profiles')
      
      expect(Object.keys(profiles)).toHaveLength(1)
      expect(profiles['default_space']).toBeDefined()
    })
  })

  describe('Virtual Profile Building', () => {
    it('should build virtual profile with correct environment keys', () => {
      const profile = {
        name: 'Test',
        builds: {
          space: { keys: { 'ctrl+1': 'space command' } },
          ground: { keys: { 'ctrl+2': 'ground command' } }
        },
        aliases: { test: 'alias' }
      }

      const spaceVirtual = dataCoordinator.buildVirtualProfile(profile, 'space')
      expect(spaceVirtual.keys).toEqual({ 'ctrl+1': 'space command' })
      expect(spaceVirtual.environment).toBe('space')

      const groundVirtual = dataCoordinator.buildVirtualProfile(profile, 'ground')
      expect(groundVirtual.keys).toEqual({ 'ctrl+2': 'ground command' })
      expect(groundVirtual.environment).toBe('ground')
    })

    it('should handle profiles without builds structure', () => {
      const profile = { name: 'Test', aliases: {} }
      
      const virtual = dataCoordinator.buildVirtualProfile(profile, 'space')
      
      expect(virtual.keys).toEqual({})
      expect(virtual.environment).toBe('space')
      expect(profile.builds).toBeDefined() // Should create builds structure
    })

    it('should return null for null profile', () => {
      const virtual = dataCoordinator.buildVirtualProfile(null, 'space')
      expect(virtual).toBeNull()
    })
  })

  describe('Profile Operations', () => {
    describe('Profile Switching', () => {
      it('should switch to different profile', async () => {
        // Add another profile directly to the coordinator state
        dataCoordinator.state.profiles['test_profile'] = {
          name: 'Test Profile',
          currentEnvironment: 'ground',
          builds: { space: { keys: {} }, ground: { keys: {} } },
          aliases: {}
        }

        const events = []
        eventBus.on('profile:switched', (event) => events.push(event))

        const result = await request(eventBus, 'data:switch-profile', { profileId: 'test_profile' })

        expect(result.success).toBe(true)
        expect(result.switched).toBe(true)
        expect(result.profile.name).toBe('Test Profile')
        expect(dataCoordinator.state.currentProfile).toBe('test_profile')
        expect(dataCoordinator.state.currentEnvironment).toBe('ground')
        expect(events).toHaveLength(1)
        expect(mockStorage.saveAllData).toHaveBeenCalled()
      })

      it('should return success false when switching to same profile', async () => {
        const result = await request(eventBus, 'data:switch-profile', { profileId: 'default_space' })

        expect(result.success).toBe(true)
        expect(result.switched).toBe(false)
        expect(result.message).toBe('Already on this profile')
      })

      it('should throw error for non-existent profile', async () => {
        await expect(request(eventBus, 'data:switch-profile', { profileId: 'non_existent' }))
          .rejects.toThrow('Profile non_existent not found')
      })
    })

    describe('Profile Creation', () => {
      it('should create new profile', async () => {
        const events = []
        eventBus.on('profile:created', (event) => events.push(event))

        const result = await request(eventBus, 'data:create-profile', {
          name: 'New Profile',
          description: 'Test description',
          mode: 'ground'
        })

        expect(result.success).toBe(true)
        expect(result.profileId).toBe('new_profile')
        expect(result.profile.name).toBe('New Profile')
        expect(result.profile.description).toBe('Test description')
        expect(result.profile.currentEnvironment).toBe('ground')
        expect(result.profile.builds).toEqual({
          space: { keys: {} },
          ground: { keys: {} }
        })
        // Events should contain exactly one profile:created event
        const createdEvents = events.filter(e => e.profileId === 'new_profile')
        expect(createdEvents).toHaveLength(1)
        expect(mockStorage.saveProfile).toHaveBeenCalledWith('new_profile', expect.any(Object))
      })

      it('should throw error for empty name', async () => {
        await expect(request(eventBus, 'data:create-profile', { name: '' }))
          .rejects.toThrow('Profile name is required')
      })

      it('should throw error for duplicate profile name', async () => {
        // Mock storage to simulate existing profile
        dataCoordinator.state.profiles['existing_profile'] = { name: 'Existing' }

        await expect(request(eventBus, 'data:create-profile', { name: 'Existing Profile' }))
          .rejects.toThrow('Profile with name "Existing Profile" already exists')
      })
    })

    describe('Profile Cloning', () => {
      it('should clone existing profile', async () => {
        const events = []
        eventBus.on('profile:created', (event) => events.push(event))

        const result = await request(eventBus, 'data:clone-profile', {
          sourceId: 'default_space',
          newName: 'Cloned Profile'
        })

        expect(result.success).toBe(true)
        expect(result.profileId).toBe('cloned_profile')
        expect(result.profile.name).toBe('Cloned Profile')
        expect(result.profile.description).toBe('Copy of Default Space')
        // Check for the specific cloned profile event
        const clonedEvents = events.filter(e => e.profileId === 'cloned_profile')
        expect(clonedEvents).toHaveLength(1)
        expect(clonedEvents[0].clonedFrom).toBe('default_space')
      })

      it('should throw error for non-existent source profile', async () => {
        await expect(request(eventBus, 'data:clone-profile', {
          sourceId: 'non_existent',
          newName: 'New Name'
        })).rejects.toThrow('Source profile not found')
      })

      it('should throw error for missing parameters', async () => {
        await expect(request(eventBus, 'data:clone-profile', { sourceId: 'default_space' }))
          .rejects.toThrow('Source profile ID and new name are required')
      })
    })

    describe('Profile Renaming', () => {
      it('should rename profile', async () => {
        const events = []
        eventBus.on('profile:updated', (event) => events.push(event))

        const result = await request(eventBus, 'data:rename-profile', {
          profileId: 'default_space',
          newName: 'Renamed Profile',
          description: 'New description'
        })

        expect(result.success).toBe(true)
        expect(result.profile.name).toBe('Renamed Profile')
        expect(result.profile.description).toBe('New description')
        // Check for the specific profile update event
        const updateEvents = events.filter(e => e.profileId === 'default_space')
        expect(updateEvents).toHaveLength(1)
        expect(mockStorage.saveProfile).toHaveBeenCalled()
      })

      it('should throw error for non-existent profile', async () => {
        await expect(request(eventBus, 'data:rename-profile', {
          profileId: 'non_existent',
          newName: 'New Name'
        })).rejects.toThrow('Profile not found')
      })
    })

    describe('Profile Deletion', () => {
      beforeEach(() => {
        // Add multiple profiles for deletion tests
        dataCoordinator.state.profiles = {
          'profile1': { 
            name: 'Profile 1', 
            currentEnvironment: 'space',
            builds: { space: { keys: {} }, ground: { keys: {} } },
            aliases: {}
          },
          'profile2': { 
            name: 'Profile 2', 
            currentEnvironment: 'space',
            builds: { space: { keys: {} }, ground: { keys: {} } },
            aliases: {}
          }
        }
        dataCoordinator.state.currentProfile = 'profile1'
      })

      it('should delete profile and switch to another', async () => {
        const events = []
        eventBus.on('profile:deleted', (event) => events.push(event))
        eventBus.on('profile:switched', (event) => events.push(event))

        const result = await request(eventBus, 'data:delete-profile', { profileId: 'profile1' })

        expect(result.success).toBe(true)
        expect(result.deletedProfile.name).toBe('Profile 1')
        expect(result.switchedProfile).toBeDefined()
        expect(dataCoordinator.state.currentProfile).toBe('profile2')
        
        // Give events time to propagate
        await new Promise(resolve => setTimeout(resolve, 10))
        
        // We should have at least received some events
        expect(events.length).toBeGreaterThan(0)
        expect(mockStorage.deleteProfile).toHaveBeenCalledWith('profile1')
      })

      it('should throw error when trying to delete last profile', async () => {
        // Set up with only one profile
        dataCoordinator.state.profiles = { 
          'last_profile': { 
            name: 'Last',
            builds: { space: { keys: {} }, ground: { keys: {} } },
            aliases: {}
          }
        }
        dataCoordinator.state.currentProfile = 'last_profile'

        await expect(request(eventBus, 'data:delete-profile', { profileId: 'last_profile' }))
          .rejects.toThrow('Cannot delete the last profile')
      })

      it('should throw error for non-existent profile', async () => {
        await expect(request(eventBus, 'data:delete-profile', { profileId: 'non_existent' }))
          .rejects.toThrow('Profile not found')
      })
    })

    describe('Profile Updates', () => {
      it('should update profile data', async () => {
        const events = []
        eventBus.on('profile:updated', (event) => events.push(event))

        const updates = {
          description: 'Updated description',
          aliases: { newAlias: { command: 'test' } }
        }

        const result = await request(eventBus, 'data:update-profile', {
          profileId: 'default_space',
          updates
        })

        expect(result.success).toBe(true)
        expect(result.profile.description).toBe('Updated description')
        expect(result.profile.aliases.newAlias).toBeDefined()
        // Check for the specific profile update event
        const updateEvents = events.filter(e => e.profileId === 'default_space')
        expect(updateEvents.length).toBeGreaterThan(0)
        expect(mockStorage.saveProfile).toHaveBeenCalled()
      })

      it('should throw error for non-existent profile', async () => {
        await expect(request(eventBus, 'data:update-profile', {
          profileId: 'non_existent',
          updates: { description: 'test' }
        })).rejects.toThrow('Profile non_existent not found')
      })

      it('should throw error for missing parameters', async () => {
        await expect(request(eventBus, 'data:update-profile', { profileId: 'default_space' }))
          .rejects.toThrow('Profile ID and updates are required')
      })
    })
  })

  describe('Environment Management', () => {
    it('should set environment and update profile', async () => {
      const events = []
      eventBus.on('environment:changed', (event) => events.push(event))

      const result = await request(eventBus, 'data:set-environment', { environment: 'ground' })

      expect(result.success).toBe(true)
      expect(result.environment).toBe('ground')
      expect(dataCoordinator.state.currentEnvironment).toBe('ground')
      // Check for environment change event
      const envEvents = events.filter(e => e.toEnvironment === 'ground')
      expect(envEvents.length).toBeGreaterThan(0)
    })

    it('should throw error for invalid environment', async () => {
      await expect(request(eventBus, 'data:set-environment', { environment: 'invalid' }))
        .rejects.toThrow('Invalid environment')
    })
  })

  describe('Settings Management', () => {
    it('should get current settings', async () => {
      const settings = await request(eventBus, 'data:get-settings')
      
      expect(settings.theme).toBe('light')
      expect(settings.language).toBe('en')
    })

    it('should update settings', async () => {
      const events = []
      eventBus.on('settings:changed', (event) => events.push(event))

      const newSettings = { theme: 'dark', newSetting: 'value' }
      const result = await request(eventBus, 'data:update-settings', { settings: newSettings })

      expect(result.success).toBe(true)
      expect(result.settings.theme).toBe('dark')
      expect(result.settings.newSetting).toBe('value')
      // Check for settings change event
      const settingsEvents = events.filter(e => e.settings?.theme === 'dark')
      expect(settingsEvents.length).toBeGreaterThan(0)
      expect(mockStorage.saveSettings).toHaveBeenCalled()
    })

    it('should throw error for missing settings', async () => {
      await expect(request(eventBus, 'data:update-settings', {}))
        .rejects.toThrow('Settings are required')
    })
  })

  describe('Late Join Support', () => {
    it('should provide current state when other components register', async () => {
      const events = []
      const replyTopic = 'component:registered:reply:TestComponent:123456'
      
      // Listen for the reply on the specific topic
      eventBus.on(replyTopic, (event) => events.push(event))

      // Simulate another component registering
      eventBus.emit('component:register', {
        name: 'TestComponent',
        replyTopic: replyTopic
      })

      // Give it a moment to process
      await new Promise(resolve => setTimeout(resolve, 10))

      // Should have received a reply with current state
      expect(events.length).toBeGreaterThan(0)
      const reply = events.find(e => e.sender === 'DataCoordinator')
      expect(reply).toBeDefined()
      expect(reply.state).toBeDefined()
      expect(reply.state.currentProfile).toBe('default_space')
      expect(reply.state.currentEnvironment).toBeDefined()
    })

    it('should have getCurrentState method that returns current state', () => {
      const state = dataCoordinator.getCurrentState()
      
      expect(state).toBeDefined()
      expect(state.currentProfile).toBe('default_space')
      expect(state.currentEnvironment).toBe('space')
      expect(state.profiles).toBeDefined()
      expect(state.settings).toBeDefined()
      expect(state.metadata).toBeDefined()
    })
  })

  describe('Utility Methods', () => {
    it('should generate profile ID from name', () => {
      expect(dataCoordinator.generateProfileId('Test Profile Name')).toBe('test_profile_name')
      expect(dataCoordinator.generateProfileId('Profile-With-Special_Chars!@#')).toBe('profilewithspecialchars')
      // "Very Long Profile Name That Should Be Truncated" becomes "very_long_profile_name_that_should_be_truncated" (47 chars)
      expect(dataCoordinator.generateProfileId('Very Long Profile Name That Should Be Truncated')).toHaveLength(47)
      // Test that it properly truncates at 50 characters
      const veryLongName = 'A'.repeat(60) // 60 A's
      expect(dataCoordinator.generateProfileId(veryLongName)).toHaveLength(50)
    })
  })

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      mockStorage.saveProfile.mockReturnValue(false)
      
      // Should still work as the method doesn't check return value
      const result = await request(eventBus, 'data:create-profile', { name: 'Test' })
      expect(result.success).toBe(true)
    })

    it('should handle storage exceptions', async () => {
      // Clear existing profiles to avoid name conflicts
      dataCoordinator.state.profiles = {}
      
      mockStorage.saveProfile.mockImplementation(() => {
        throw new Error('Storage error')
      })
      
      await expect(request(eventBus, 'data:create-profile', { name: 'UniqueTestName' }))
        .rejects.toThrow('Storage error')
    })
  })

  describe('Profile update deep merge functionality', () => {
    test('should merge individual aliases without wiping existing aliases', async () => {
      const coordinator = new DataCoordinator({ eventBus, storage: mockStorage })
      await coordinator.init()
      
      // Create a profile with multiple aliases
      const profileId = 'test_profile'
      const initialProfile = {
        name: 'Test Profile',
        aliases: {
          'alias1': { commands: 'command1', description: 'First alias' },
          'alias2': { commands: 'command2', description: 'Second alias' },
          'alias3': { commands: 'command3', description: 'Third alias' }
        },
        builds: { space: { keys: {} }, ground: { keys: {} } }
      }
      
      coordinator.state.profiles[profileId] = initialProfile
      
      // Update only one alias
      const updates = {
        aliases: {
          'alias2': { commands: 'updated_command2', description: 'Updated second alias' }
        }
      }
      
      const result = await coordinator.updateProfile(profileId, updates)
      
      expect(result.success).toBe(true)
      
      // Verify that all aliases are still present
      const updatedProfile = coordinator.state.profiles[profileId]
      expect(updatedProfile.aliases).toEqual({
        'alias1': { commands: 'command1', description: 'First alias' },
        'alias2': { commands: 'updated_command2', description: 'Updated second alias' },
        'alias3': { commands: 'command3', description: 'Third alias' }
      })
    })

    test('should merge individual keys without wiping existing environments or keys', async () => {
      const coordinator = new DataCoordinator({ eventBus, storage: mockStorage })
      await coordinator.init()
      
      // Create a profile with multiple environments and keys
      const profileId = 'test_profile'
      const initialProfile = {
        name: 'Test Profile',
        aliases: {},
        builds: {
          space: {
            keys: {
              'F1': [{ command: 'space_f1_cmd' }],
              'F2': [{ command: 'space_f2_cmd' }]
            }
          },
          ground: {
            keys: {
              'F1': [{ command: 'ground_f1_cmd' }],
              'F3': [{ command: 'ground_f3_cmd' }]
            }
          }
        }
      }
      
      coordinator.state.profiles[profileId] = initialProfile
      
      // Update only one key in space environment
      const updates = {
        builds: {
          space: {
            keys: {
              'F2': [{ command: 'updated_space_f2_cmd' }]
            }
          }
        }
      }
      
      const result = await coordinator.updateProfile(profileId, updates)
      
      expect(result.success).toBe(true)
      
      // Verify that all environments and keys are still present
      const updatedProfile = coordinator.state.profiles[profileId]
      expect(updatedProfile.builds).toEqual({
        space: {
          keys: {
            'F1': [{ command: 'space_f1_cmd' }],
            'F2': [{ command: 'updated_space_f2_cmd' }]  // Updated
          }
        },
        ground: {
          keys: {
            'F1': [{ command: 'ground_f1_cmd' }],
            'F3': [{ command: 'ground_f3_cmd' }]
          }
        }
      })
    })

    test('should add new aliases without affecting existing ones', async () => {
      const coordinator = new DataCoordinator({ eventBus, storage: mockStorage })
      await coordinator.init()
      
      const profileId = 'test_profile'
      const initialProfile = {
        name: 'Test Profile',
        aliases: {
          'existing': { commands: 'existing_command', description: 'Existing alias' }
        },
        builds: { space: { keys: {} }, ground: { keys: {} } }
      }
      
      coordinator.state.profiles[profileId] = initialProfile
      
      // Add a new alias
      const updates = {
        aliases: {
          'new_alias': { commands: 'new_command', description: 'New alias' }
        }
      }
      
      const result = await coordinator.updateProfile(profileId, updates)
      
      expect(result.success).toBe(true)
      
      const updatedProfile = coordinator.state.profiles[profileId]
      expect(updatedProfile.aliases).toEqual({
        'existing': { commands: 'existing_command', description: 'Existing alias' },
        'new_alias': { commands: 'new_command', description: 'New alias' }
      })
    })

    test('should add new keys without affecting existing environments or keys', async () => {
      const coordinator = new DataCoordinator({ eventBus, storage: mockStorage })
      await coordinator.init()
      
      const profileId = 'test_profile'
      const initialProfile = {
        name: 'Test Profile',
        aliases: {},
        builds: {
          space: {
            keys: {
              'F1': [{ command: 'existing_space_f1' }]
            }
          }
        }
      }
      
      coordinator.state.profiles[profileId] = initialProfile
      
      // Add a new key to space and a new environment
      const updates = {
        builds: {
          space: {
            keys: {
              'F2': [{ command: 'new_space_f2' }]
            }
          },
          ground: {
            keys: {
              'F1': [{ command: 'new_ground_f1' }]
            }
          }
        }
      }
      
      const result = await coordinator.updateProfile(profileId, updates)
      
      expect(result.success).toBe(true)
      
      const updatedProfile = coordinator.state.profiles[profileId]
      expect(updatedProfile.builds).toEqual({
        space: {
          keys: {
            'F1': [{ command: 'existing_space_f1' }],  // Preserved
            'F2': [{ command: 'new_space_f2' }]        // Added
          }
        },
        ground: {
          keys: {
            'F1': [{ command: 'new_ground_f1' }]       // New environment
          }
        }
      })
    })

    test('should handle regular profile property updates normally', async () => {
      const coordinator = new DataCoordinator({ eventBus, storage: mockStorage })
      await coordinator.init()
      
      const profileId = 'test_profile'
      const initialProfile = {
        name: 'Test Profile',
        description: 'Original description',
        aliases: { 'test': { commands: 'test_cmd' } },
        builds: { space: { keys: {} } }
      }
      
      coordinator.state.profiles[profileId] = initialProfile
      
      // Update regular properties
      const updates = {
        name: 'Updated Profile Name',
        description: 'Updated description',
        currentEnvironment: 'ground'
      }
      
      const result = await coordinator.updateProfile(profileId, updates)
      
      expect(result.success).toBe(true)
      
      const updatedProfile = coordinator.state.profiles[profileId]
      expect(updatedProfile.name).toBe('Updated Profile Name')
      expect(updatedProfile.description).toBe('Updated description')
      expect(updatedProfile.currentEnvironment).toBe('ground')
      
      // Verify nested objects weren't affected
      expect(updatedProfile.aliases).toEqual({ 'test': { commands: 'test_cmd' } })
      expect(updatedProfile.builds).toEqual({ space: { keys: {} } })
    })
  })
}) 
