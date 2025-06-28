import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import eventBus from '../../src/js/core/eventBus.js'
import DataCoordinator from '../../src/js/components/services/DataCoordinator.js'
import ProfileService from '../../src/js/components/services/ProfileService.js'
import StorageService from '../../src/js/components/services/StorageService.js'
import { request } from '../../src/js/core/requestResponse.js'

describe('DataCoordinator + ProfileService Migration Integration', () => {
  let dataCoordinator
  let profileService
  let storageService
  let mockI18n

  beforeEach(async () => {
    // Clear event bus
    eventBus.removeAllListeners()
    
    // Create mock i18n
    mockI18n = {
      t: vi.fn((key, params) => {
        // Simple mock translations
        const translations = {
          'profile_created': `Profile "${params?.name}" created`,
          'profile_renamed': `Profile renamed to "${params?.name}"`,
          'profile_deleted': `Profile "${params?.profileName}" deleted`,
          'switched_to_profile': `Switched to ${params?.name} (${params?.environment})`,
          'already_on_profile': 'Already on this profile',
          'profile_not_found': 'Profile not found',
          'failed_to_create_profile': 'Failed to create profile',
          'cannot_delete_the_last_profile': 'Cannot delete the last profile'
        }
        return translations[key] || key
      })
    }

    // Create storage service with empty data
    storageService = new StorageService({ 
      eventBus,
      storageKey: 'test_storage',
      backupKey: 'test_backup',
      settingsKey: 'test_settings'
    })
    
    // Clear localStorage for tests
    localStorage.removeItem('test_storage')
    localStorage.removeItem('test_backup') 
    localStorage.removeItem('test_settings')
    
    await storageService.init()

    // Create DataCoordinator
    dataCoordinator = new DataCoordinator({ 
      eventBus, 
      storage: storageService 
    })
    await dataCoordinator.init()

    // Create ProfileService with DataCoordinator
    profileService = new ProfileService({
      storage: storageService,
      eventBus,
      i18n: mockI18n,
      dataCoordinator
    })
    await profileService.init()
  })

  afterEach(() => {
    // Clean up
    localStorage.removeItem('test_storage')
    localStorage.removeItem('test_backup')
    localStorage.removeItem('test_settings')
    eventBus.removeAllListeners()
  })

  describe('Basic DataCoordinator Operations', () => {
    it('should load initial state from storage', async () => {
      const state = await request(eventBus, 'data:get-current-state')
      
      expect(state).toBeDefined()
      expect(state.currentProfile).toBeDefined()
      expect(state.profiles).toBeDefined()
      expect(Object.keys(state.profiles).length).toBeGreaterThan(0)
    })

    it('should get current profile with virtual build data', async () => {
      const profile = await request(eventBus, 'data:get-current-profile')
      
      expect(profile).toBeDefined()
      expect(profile.name).toBeDefined()
      expect(profile.keys).toBeDefined()
      expect(profile.aliases).toBeDefined()
      expect(profile.environment).toBeDefined()
    })

    it('should create new profile', async () => {
      const result = await request(eventBus, 'data:create-profile', {
        name: 'Test Profile',
        description: 'Test Description',
        mode: 'space'
      })

      expect(result.success).toBe(true)
      expect(result.profileId).toBeDefined()
      expect(result.profile.name).toBe('Test Profile')
      expect(result.profile.description).toBe('Test Description')
      expect(result.profile.currentEnvironment).toBe('space')
    })

    it('should switch profiles and emit events', async () => {
      // Create a test profile first
      const createResult = await request(eventBus, 'data:create-profile', {
        name: 'Switch Test Profile',
        description: 'For testing profile switching'
      })

      // Listen for events
      const profileSwitchedEvents = []
      const currentProfileChangedEvents = []
      
      eventBus.on('profile:switched', (event) => profileSwitchedEvents.push(event))
  

      // Switch to the new profile
      const switchResult = await request(eventBus, 'data:switch-profile', {
        profileId: createResult.profileId
      })

      expect(switchResult.success).toBe(true)
      expect(switchResult.switched).toBe(true)
      expect(profileSwitchedEvents).toHaveLength(1)
  
    })

    it('should update profile data and emit events', async () => {
      const currentState = await request(eventBus, 'data:get-current-state')
      const currentProfileId = currentState.currentProfile

      // Listen for events
      const profileUpdatedEvents = []
      eventBus.on('profile:updated', (event) => profileUpdatedEvents.push(event))

      // Update the profile
      const updateResult = await request(eventBus, 'data:update-profile', {
        profileId: currentProfileId,
        updates: {
          description: 'Updated description',
          aliases: {
            'test_alias': {
              command: 'test command',
              description: 'Test alias'
            }
          }
        }
      })

      expect(updateResult.success).toBe(true)
      expect(profileUpdatedEvents).toHaveLength(1)
      
      // Verify the update
      const updatedProfile = await request(eventBus, 'data:get-current-profile')
      expect(updatedProfile.description).toBe('Updated description')
      expect(updatedProfile.aliases.test_alias).toBeDefined()
    })
  })

  describe('ProfileService Backward Compatibility', () => {
    it('should maintain ProfileService API compatibility', async () => {
      // Test that old ProfileService methods still work
      const currentProfile = await profileService.getCurrentProfile()
      expect(currentProfile).toBeDefined()

      const allProfiles = await profileService.getAllProfiles()
      expect(allProfiles).toBeDefined()
      expect(Object.keys(allProfiles).length).toBeGreaterThan(0)
    })

    it('should handle profile creation through ProfileService', async () => {
      const result = await profileService.createProfile('Legacy Test Profile', 'Created via ProfileService')
      
      expect(result.success).toBe(true)
      expect(result.profile.name).toBe('Legacy Test Profile')
      expect(mockI18n.t).toHaveBeenCalledWith('profile_created', { name: 'Legacy Test Profile' })
    })

    it('should handle profile switching through ProfileService', async () => {
      // Create a profile to switch to
      const createResult = await profileService.createProfile('Switch Target Profile')
      
      // Switch to it
      const switchResult = await profileService.switchProfile(createResult.profileId)
      
      expect(switchResult.success).toBe(true)
      expect(switchResult.switched).toBe(true)
      expect(mockI18n.t).toHaveBeenCalledWith('switched_to_profile', expect.any(Object))
    })

    it('should handle profile deletion through ProfileService', async () => {
      // Create a profile to delete
      const createResult = await profileService.createProfile('Delete Test Profile')
      
      // Delete it
      const deleteResult = await profileService.deleteProfile(createResult.profileId)
      
      expect(deleteResult.success).toBe(true)
      expect(deleteResult.deletedProfile.name).toBe('Delete Test Profile')
      expect(mockI18n.t).toHaveBeenCalledWith('profile_deleted', expect.any(Object))
    })

    it('should handle profile cloning through ProfileService', async () => {
      const currentState = await request(eventBus, 'data:get-current-state')
      const sourceProfileId = currentState.currentProfile
      
      const cloneResult = await profileService.cloneProfile(sourceProfileId, 'Cloned Profile')
      
      expect(cloneResult.success).toBe(true)
      expect(cloneResult.profile.name).toBe('Cloned Profile')
    })

    it('should handle profile renaming through ProfileService', async () => {
      // Create a profile to rename
      const createResult = await profileService.createProfile('Original Name')
      
      // Rename it
      const renameResult = await profileService.renameProfile(createResult.profileId, 'New Name', 'New Description')
      
      expect(renameResult.success).toBe(true)
      expect(renameResult.profile.name).toBe('New Name')
      expect(renameResult.profile.description).toBe('New Description')
    })
  })

  describe('Late Join Support', () => {
    it('should support late join subscriber registration', async () => {
      const events = []
      eventBus.on('data:initial-state', (event) => events.push(event))

      // Register a late subscriber
      const result = await request(eventBus, 'data:register-subscriber', {
        componentName: 'TestComponent'
      })

      expect(result.success).toBe(true)
      expect(events).toHaveLength(1)
      expect(events[0].targetComponent).toBe('TestComponent')
      expect(events[0].state).toBeDefined()
      expect(events[0].currentProfile).toBeDefined()
    })
  })

  describe('Environment Management', () => {
    it('should handle environment changes', async () => {
      const events = []
      eventBus.on('environment:changed', (event) => events.push(event))

      const result = await request(eventBus, 'data:set-environment', {
        environment: 'ground'
      })

      expect(result.success).toBe(true)
      expect(result.environment).toBe('ground')
      expect(events).toHaveLength(1)
      expect(events[0].environment).toBe('ground')
    })

    it('should reject invalid environments', async () => {
      await expect(request(eventBus, 'data:set-environment', {
        environment: 'invalid'
      })).rejects.toThrow('Invalid environment')
    })
  })

  describe('Data Consistency', () => {
    it('should maintain data consistency between DataCoordinator and ProfileService', async () => {
      // Get profile through DataCoordinator
      const dataProfile = await request(eventBus, 'data:get-current-profile')
      
      // Get profile through ProfileService  
      const serviceProfile = await profileService.getCurrentProfile()
      
      // They should be equivalent
      expect(dataProfile.name).toBe(serviceProfile.name)
      expect(dataProfile.environment).toBe(serviceProfile.environment)
      expect(Object.keys(dataProfile.keys || {})).toEqual(Object.keys(serviceProfile.keys || {}))
    })

    it('should broadcast profile changes to all subscribers', async () => {
      const dataEvents = []
      const profileEvents = []
      
      eventBus.on('profile:updated', (event) => dataEvents.push(event))
  

      // Update through DataCoordinator
      const currentState = await request(eventBus, 'data:get-current-state')
      await request(eventBus, 'data:update-profile', {
        profileId: currentState.currentProfile,
        updates: { description: 'Broadcast test' }
      })

      expect(dataEvents).toHaveLength(1)
      expect(profileEvents).toHaveLength(1)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid profile operations gracefully', async () => {
      // Try to switch to non-existent profile
      await expect(request(eventBus, 'data:switch-profile', {
        profileId: 'non_existent'
      })).rejects.toThrow('Profile non_existent not found')

      // Try to delete non-existent profile
      await expect(request(eventBus, 'data:delete-profile', {
        profileId: 'non_existent'
      })).rejects.toThrow('Profile not found')
    })

    it('should prevent deletion of last profile', async () => {
      // Get all profiles and delete all but one
      const allProfiles = await request(eventBus, 'data:get-all-profiles')
      const profileIds = Object.keys(allProfiles)
      
      // Delete all but the last one
      for (let i = 0; i < profileIds.length - 1; i++) {
        await request(eventBus, 'data:delete-profile', { profileId: profileIds[i] })
      }
      
      // Try to delete the last one - should fail
      await expect(request(eventBus, 'data:delete-profile', {
        profileId: profileIds[profileIds.length - 1]
      })).rejects.toThrow('Cannot delete the last profile')
    })
  })

  describe('Settings Management', () => {
    it('should handle settings updates', async () => {
      const events = []
      eventBus.on('settings:changed', (event) => events.push(event))

      const result = await request(eventBus, 'data:update-settings', {
        settings: {
          theme: 'dark',
          language: 'en'
        }
      })

      expect(result.success).toBe(true)
      expect(events).toHaveLength(1)
      expect(events[0].settings.theme).toBe('dark')
      expect(events[0].settings.language).toBe('en')
    })

    it('should get current settings', async () => {
      // Update settings first
      await request(eventBus, 'data:update-settings', {
        settings: { testSetting: 'testValue' }
      })

      const settings = await request(eventBus, 'data:get-settings')
      expect(settings.testSetting).toBe('testValue')
    })
  })
}) 