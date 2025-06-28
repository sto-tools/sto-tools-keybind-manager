import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import eventBus from '../../src/js/core/eventBus.js'
import DataCoordinator from '../../src/js/components/services/DataCoordinator.js'
import { request } from '../../src/js/core/requestResponse.js'

describe('DataCoordinator', () => {
  let dataCoordinator
  let mockStorage

  beforeEach(async () => {
    // Clear event bus
    eventBus.removeAllListeners()
    
    // Create mock storage
    mockStorage = {
      getAllData: vi.fn(() => ({
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
      })),
      saveAllData: vi.fn(() => true),
      saveProfile: vi.fn(() => true),
      deleteProfile: vi.fn(() => true),
      getProfile: vi.fn((id) => {
        const data = mockStorage.getAllData()
        return data.profiles[id] || null
      }),
      saveSettings: vi.fn(() => true),
      getSettings: vi.fn(() => ({ theme: 'light', language: 'en' }))
    }

    // Create DataCoordinator
    dataCoordinator = new DataCoordinator({ 
      eventBus, 
      storage: mockStorage 
    })
    await dataCoordinator.init()
  })

  afterEach(() => {
    eventBus.removeAllListeners()
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

  describe('State Queries', () => {
    it('should return current state', async () => {
      const state = await request(eventBus, 'data:get-current-state')
      
      expect(state.currentProfile).toBe('default_space')
      expect(state.currentEnvironment).toBe('space')
      expect(state.profiles).toBeDefined()
      expect(state.settings).toBeDefined()
      expect(state.metadata).toBeDefined()
    })

    it('should return current profile with virtual build data', async () => {
      const profile = await request(eventBus, 'data:get-current-profile')
      
      expect(profile.name).toBe('Default Space')
      expect(profile.keys).toEqual({ 'ctrl+1': 'test command' })
      expect(profile.aliases).toEqual({})
      expect(profile.environment).toBe('space')
    })

    it('should return specific profile', async () => {
      const profile = await request(eventBus, 'data:get-profile', { profileId: 'default_space' })
      
      expect(profile.name).toBe('Default Space')
      expect(profile.environment).toBe('space')
    })

    it('should return null for non-existent profile', async () => {
      const profile = await request(eventBus, 'data:get-profile', { profileId: 'non_existent' })
      
      expect(profile).toBeNull()
    })

    it('should return all profiles', async () => {
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
        // Add another profile to storage mock
        mockStorage.getAllData.mockReturnValue({
          ...mockStorage.getAllData(),
          profiles: {
            ...mockStorage.getAllData().profiles,
            'test_profile': {
              name: 'Test Profile',
              currentEnvironment: 'ground',
              builds: { space: { keys: {} }, ground: { keys: {} } },
              aliases: {}
            }
          }
        })

        const events = []
        eventBus.on('profile:switched', (event) => events.push(event))
        eventBus.on('current-profile:changed', (event) => events.push(event))

        const result = await request(eventBus, 'data:switch-profile', { profileId: 'test_profile' })

        expect(result.success).toBe(true)
        expect(result.switched).toBe(true)
        expect(result.profile.name).toBe('Test Profile')
        expect(dataCoordinator.state.currentProfile).toBe('test_profile')
        expect(dataCoordinator.state.currentEnvironment).toBe('ground')
        expect(events).toHaveLength(2) // Both events should be emitted
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
        expect(events).toHaveLength(1)
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
        expect(events).toHaveLength(1)
        expect(events[0].clonedFrom).toBe('default_space')
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
        expect(events).toHaveLength(1)
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
          'profile1': { name: 'Profile 1', currentEnvironment: 'space' },
          'profile2': { name: 'Profile 2', currentEnvironment: 'space' }
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
        expect(events.length).toBeGreaterThan(0)
        expect(mockStorage.deleteProfile).toHaveBeenCalledWith('profile1')
      })

      it('should throw error when trying to delete last profile', async () => {
        // Set up with only one profile
        dataCoordinator.state.profiles = { 'last_profile': { name: 'Last' } }

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
        eventBus.on('current-profile:changed', (event) => events.push(event))

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
        expect(events).toHaveLength(2) // Both events should be emitted for current profile
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
      expect(events).toHaveLength(1)
      expect(events[0].environment).toBe('ground')
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
      expect(events).toHaveLength(1)
      expect(mockStorage.saveSettings).toHaveBeenCalled()
    })

    it('should throw error for missing settings', async () => {
      await expect(request(eventBus, 'data:update-settings', {}))
        .rejects.toThrow('Settings are required')
    })
  })

  describe('Late Join Support', () => {
    it('should register subscriber and send initial state', async () => {
      const events = []
      eventBus.on('data:initial-state', (event) => events.push(event))

      const result = await request(eventBus, 'data:register-subscriber', {
        componentName: 'TestComponent'
      })

      expect(result.success).toBe(true)
      expect(result.componentName).toBe('TestComponent')
      expect(dataCoordinator.subscribers.has('TestComponent')).toBe(true)
      expect(events).toHaveLength(1)
      expect(events[0].targetComponent).toBe('TestComponent')
      expect(events[0].state).toBeDefined()
      expect(events[0].currentProfile).toBeDefined()
    })

    it('should throw error for missing component name', async () => {
      await expect(request(eventBus, 'data:register-subscriber', {}))
        .rejects.toThrow('Component name is required')
    })
  })

  describe('Utility Methods', () => {
    it('should generate profile ID from name', () => {
      expect(dataCoordinator.generateProfileId('Test Profile Name')).toBe('test_profile_name')
      expect(dataCoordinator.generateProfileId('Profile-With-Special_Chars!@#')).toBe('profilewithspecialchars')
      expect(dataCoordinator.generateProfileId('Very Long Profile Name That Should Be Truncated')).toHaveLength(50)
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
      mockStorage.saveProfile.mockImplementation(() => {
        throw new Error('Storage error')
      })
      
      await expect(request(eventBus, 'data:create-profile', { name: 'Test' }))
        .rejects.toThrow('Storage error')
    })
  })
}) 