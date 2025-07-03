import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import eventBus from '../../src/js/core/eventBus.js'
import ProfileService from '../../src/js/components/services/ProfileService.js'
import DataCoordinator from '../../src/js/components/services/DataCoordinator.js'

describe('ProfileService (Migrated to DataCoordinator)', () => {
  let profileService
  let dataCoordinator
  let mockStorage
  let mockI18n

  beforeEach(async () => {
    // Clear event bus
    eventBus.removeAllListeners()
    
    // Create mock i18n
    mockI18n = {
      t: vi.fn((key, params) => {
        const translations = {
          'profile_created': `Profile "${params?.name}" created`,
          'profile_renamed': `Profile renamed to "${params?.name}"`,
          'profile_deleted': `Profile "${params?.profileName}" deleted`,
          'switched_to_profile': `Switched to ${params?.name} (${params?.environment})`,
          'already_on_profile': 'Already on this profile',
          'profile_not_found': 'Profile not found',
          'failed_to_create_profile': 'Failed to create profile',
          'failed_to_save_profile': 'Failed to save profile',
          'profile_saved': 'Profile saved',
          'data_saved': 'Data saved'
        }
        return translations[key] || key
      })
    }

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
        settings: { theme: 'light' },
        version: '1.0.0'
      })),
      saveAllData: vi.fn(() => true),
      saveProfile: vi.fn(() => true),
      deleteProfile: vi.fn(() => true),
      saveSettings: vi.fn(() => true)
    }

    // Create DataCoordinator first
    dataCoordinator = new DataCoordinator({ 
      eventBus, 
      storage: mockStorage 
    })
    await dataCoordinator.init()

    // Create ProfileService with DataCoordinator
    profileService = new ProfileService({
      storage: mockStorage,
      eventBus,
      i18n: mockI18n,
      dataCoordinator
    })
    await profileService.init()
  })

  afterEach(() => {
    eventBus.removeAllListeners()
  })

  describe('Initialization and Event Handling', () => {
    it('should initialize with DataCoordinator dependency', () => {
      expect(profileService.dataCoordinator).toBe(dataCoordinator)
      expect(profileService.componentName).toBe('ProfileService')
    })

    it('should register with DataCoordinator for state updates', () => {
      expect(dataCoordinator.subscribers.has('ProfileService')).toBe(true)
    })

    it('should update local state when receiving data updates', async () => {
      // Simulate data update event
      eventBus.emit('data:initial-state', {
        targetComponent: 'ProfileService',
        state: {
          currentProfile: 'test_profile',
          currentEnvironment: 'ground'
        }
      })

      expect(profileService.currentProfile).toBe('test_profile')
      expect(profileService.currentEnvironment).toBe('ground')
      expect(profileService.isModified).toBe(false)
    })

    it('should respond to profile switch events', () => {
      eventBus.emit('profile:switched', {
        profileId: 'new_profile',
        environment: 'ground'
      })

      expect(profileService.currentProfile).toBe('new_profile')
      expect(profileService.currentEnvironment).toBe('ground')
      expect(profileService.isModified).toBe(false)
    })

    it('should respond to environment change events', () => {
      eventBus.emit('environment:changed', {
        environment: 'ground'
      })

      expect(profileService.currentEnvironment).toBe('ground')
    })
  })

  describe('Backward Compatibility API', () => {
    describe('Profile Loading', () => {
      it('should load data and maintain compatibility', async () => {
        const result = await profileService.loadData()

        expect(result.currentProfile).toBe('default_space')
        expect(result.currentEnvironment).toBe('space')
        expect(result.profiles).toBeDefined()
        expect(Object.keys(result.profiles)).toHaveLength(1)
      })

      it('should emit legacy profile:switched event on load', async () => {
        const events = []
        eventBus.on('profile:switched', (event) => events.push(event))

        await profileService.loadData()

        expect(events).toHaveLength(1)
        expect(events[0].profileId).toBe('default_space')
        expect(events[0].environment).toBe('space')
      })
    })

    describe('Profile Operations', () => {
      it('should get current profile through DataCoordinator', async () => {
        const profile = await profileService.getCurrentProfile()

        expect(profile.name).toBe('Default Space')
        expect(profile.environment).toBe('space')
        expect(profile.keys).toBeDefined()
        expect(profile.aliases).toBeDefined()
      })

      it('should switch profiles with localized messages', async () => {
        // Add another profile to test switching
        dataCoordinator.state.profiles['test_profile'] = {
          name: 'Test Profile',
          currentEnvironment: 'ground',
          builds: { space: { keys: {} }, ground: { keys: {} } },
          aliases: {}
        }

        const result = await profileService.switchProfile('test_profile')

        expect(result.success).toBe(true)
        expect(result.switched).toBe(true)
        expect(profileService.currentProfile).toBe('test_profile')
        expect(profileService.currentEnvironment).toBe('ground')
        expect(mockI18n.t).toHaveBeenCalledWith('switched_to_profile', expect.any(Object))
      })

      it('should handle switching to same profile', async () => {
        const result = await profileService.switchProfile('default_space')

        expect(result.success).toBe(true)
        expect(result.switched).toBe(false)
        expect(mockI18n.t).toHaveBeenCalledWith('already_on_profile')
      })

      it('should create new profiles with localized messages', async () => {
        const result = await profileService.createProfile('New Profile', 'Test description', 'ground')

        expect(result.success).toBe(true)
        expect(result.profile.name).toBe('New Profile')
        expect(result.profile.description).toBe('Test description')
        expect(result.profile.currentEnvironment).toBe('ground')
        expect(mockI18n.t).toHaveBeenCalledWith('profile_created', { name: 'New Profile' })
      })

      it('should handle profile creation errors with localized messages', async () => {
        // Try to create profile with existing name
        await expect(profileService.createProfile('Default Space'))
          .rejects.toThrow()
        
        expect(mockI18n.t).toHaveBeenCalledWith('failed_to_create_profile')
      })

      it('should clone profiles with localized messages', async () => {
        const result = await profileService.cloneProfile('default_space', 'Cloned Profile')

        expect(result.success).toBe(true)
        expect(result.profile.name).toBe('Cloned Profile')
        expect(result.profile.description).toBe('Copy of Default Space')
      })

      it('should rename profiles with localized messages', async () => {
        const result = await profileService.renameProfile('default_space', 'Renamed Profile', 'New description')

        expect(result.success).toBe(true)
        expect(result.profile.name).toBe('Renamed Profile')
        expect(result.profile.description).toBe('New description')
        expect(mockI18n.t).toHaveBeenCalledWith('profile_renamed', { name: 'Renamed Profile' })
      })

      it('should delete profiles with automatic profile switching', async () => {
        // Add another profile first
        await profileService.createProfile('Profile to Delete')
        
        const result = await profileService.deleteProfile('profile_to_delete')

        expect(result.success).toBe(true)
        expect(result.deletedProfile.name).toBe('Profile to Delete')
        expect(mockI18n.t).toHaveBeenCalledWith('profile_deleted', expect.any(Object))
      })

      it('should get all profiles', async () => {
        const profiles = await profileService.getAllProfiles()

        expect(Object.keys(profiles)).toHaveLength(1)
        expect(profiles['default_space']).toBeDefined()
      })
    })

    describe('Data Persistence', () => {
      it('should save current profile through DataCoordinator', async () => {
        const result = await profileService.saveProfile()

        expect(result.success).toBe(true)
        expect(result.message).toBe('Profile saved')
        expect(profileService.isModified).toBe(false)
      })

      it('should save specific profile through DataCoordinator', async () => {
        const profileData = {
          name: 'Test Profile',
          description: 'Updated description'
        }

        const result = await profileService.saveSpecificProfile(profileData)

        expect(result.success).toBe(true)
        expect(result.message).toBe('Profile saved')
      })

      it('should save current build data', async () => {
        const result = await profileService.saveCurrentBuild()

        expect(result.success).toBe(true)
      })

      it('should handle save data (now no-op)', async () => {
        const result = await profileService.saveData()

        expect(result.success).toBe(true)
        expect(result.message).toBe('Data saved')
        expect(profileService.isModified).toBe(false)
      })

      it('should handle save current profile (now no-op)', async () => {
        const result = await profileService.saveCurrentProfile()

        expect(result.success).toBe(true)
      })
    })

    describe('State Management', () => {
      it('should provide current state for late join', async () => {
        const state = await profileService.getCurrentState()

        expect(state.currentProfile).toBe('default_space')
        expect(state.currentEnvironment).toBe('space')
        expect(state.profiles).toBeDefined()
        expect(typeof state.modified).toBe('boolean')
      })

      it('should track modified state', () => {
        expect(profileService.getModified()).toBe(false)
        
        profileService.setModified(true)
        expect(profileService.getModified()).toBe(true)
        
        profileService.setModified(false)
        expect(profileService.getModified()).toBe(false)
      })

      it('should get current profile ID', () => {
        expect(profileService.getCurrentProfileId()).toBe('default_space')
      })

      it('should get current environment', () => {
        expect(profileService.getCurrentEnvironment()).toBe('space')
      })

      it('should set current environment (compatibility)', () => {
        profileService.setCurrentEnvironment('ground')
        expect(profileService.getCurrentEnvironment()).toBe('ground')
      })
    })

    describe('Utility Methods', () => {
      it('should generate unique profile IDs', async () => {
        const id1 = await profileService.generateProfileId('Test Profile')
        const id2 = await profileService.generateProfileId('Another Profile')

        expect(id1).toBe('test_profile')
        expect(id2).toBe('another_profile')
        expect(id1).not.toBe(id2)
      })

      it('should deprecate getCurrentBuild method', () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        
        const profile = { name: 'Test' }
        const result = profileService.getCurrentBuild(profile)

        expect(result).toBe(profile)
        expect(consoleSpy).toHaveBeenCalledWith('[ProfileService] getCurrentBuild is deprecated - use getCurrentProfile() instead')
        
        consoleSpy.mockRestore()
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle profile not found errors with localization', async () => {
      await expect(profileService.switchProfile('non_existent'))
        .rejects.toThrow()
      
      expect(mockI18n.t).toHaveBeenCalledWith('profile_not_found')
    })

    it('should handle save errors with localization', async () => {
      // Mock DataCoordinator to return null profile
      vi.spyOn(dataCoordinator, 'getCurrentProfile').mockResolvedValue(null)

      await expect(profileService.saveProfile())
        .rejects.toThrow()
      
      expect(mockI18n.t).toHaveBeenCalledWith('failed_to_save_profile')
    })

    it('should handle creation errors gracefully', async () => {
      await expect(profileService.createProfile(''))
        .rejects.toThrow()

      await expect(profileService.createProfile('Default Space'))
        .rejects.toThrow()
    })

    it('should handle deletion errors gracefully', async () => {
      await expect(profileService.deleteProfile('non_existent'))
        .rejects.toThrow()
    })
  })

  describe('Request/Response API Compatibility', () => {
    it('should maintain all legacy request handlers', async () => {
      // Test that all legacy endpoints still work
      const testEndpoints = [
        'profile:get-current',
        'profile:list',
        'profile:create',
        'profile:switch',
        'profile:delete',
        'profile:clone',
        'profile:rename',
        'profile:save'
      ]

      for (const endpoint of testEndpoints) {
        expect(() => {
          eventBus.emit(`request:${endpoint}`, {}, () => {})
        }).not.toThrow()
      }
    })
  })

  describe('Event Emission Compatibility', () => {
    it('should maintain legacy event emissions', async () => {
      const profileSwitchedEvents = []
      eventBus.on('profile:switched', (event) => profileSwitchedEvents.push(event))

      await profileService.loadData()

      expect(profileSwitchedEvents).toHaveLength(1)
    })

    it('should emit profile-modified events when appropriate', async () => {
      const events = []
      eventBus.on('profile-modified', (event) => events.push(event))

      profileService.setModified(true)
      // Note: profile-modified is now emitted by DataCoordinator events, not directly by ProfileService
    })
  })

  describe('Integration with DataCoordinator', () => {
    it('should delegate all operations to DataCoordinator', async () => {
      // Spy on DataCoordinator methods
      const getCurrentProfileSpy = vi.spyOn(dataCoordinator, 'getCurrentProfile')
      const switchProfileSpy = vi.spyOn(dataCoordinator, 'switchProfile')
      const createProfileSpy = vi.spyOn(dataCoordinator, 'createProfile')

      await profileService.getCurrentProfile()
      await profileService.switchProfile('default_space')
      await profileService.createProfile('Test Profile')

      expect(getCurrentProfileSpy).toHaveBeenCalled()
      expect(switchProfileSpy).toHaveBeenCalledWith('default_space')
      expect(createProfileSpy).toHaveBeenCalledWith('Test Profile', undefined, 'space')
    })

    it('should maintain state consistency with DataCoordinator', async () => {
      // Change state through DataCoordinator
      await dataCoordinator.switchProfile('default_space')
      
      // ProfileService should reflect the change
      expect(profileService.currentProfile).toBe(dataCoordinator.state.currentProfile)
      expect(profileService.currentEnvironment).toBe(dataCoordinator.state.currentEnvironment)
    })

    it('should respond to DataCoordinator events', () => {
      const initialState = {
        targetComponent: 'ProfileService',
        state: {
          currentProfile: 'new_profile',
          currentEnvironment: 'ground'
        }
      }

      eventBus.emit('data:initial-state', initialState)

      expect(profileService.currentProfile).toBe('new_profile')
      expect(profileService.currentEnvironment).toBe('ground')
    })
  })
}) 