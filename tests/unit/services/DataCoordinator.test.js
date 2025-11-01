import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import DataCoordinator from '../../../src/js/components/services/DataCoordinator.js'

describe('DataCoordinator Service', () => {
  let dataCoordinator
  let fixture, mockStorage, mockEventBus, eventBusFixture, storageFixture

  beforeEach(() => {
    // Create aggregated fixture
    fixture = createServiceFixture()
    eventBusFixture = fixture.eventBusFixture
    storageFixture = fixture.storageFixture
    mockEventBus = fixture.eventBus
    mockStorage = fixture.storage
    
    // Setup default storage responses
    mockStorage.getAllData.mockReturnValue({
      currentProfile: null,
      profiles: {},
      settings: {}
    })
    
    mockStorage.saveAllData.mockResolvedValue()
    
    dataCoordinator = new DataCoordinator({ 
      eventBus: mockEventBus, 
      storage: mockStorage 
    })
  })

  afterEach(() => {
    fixture.destroy()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with correct component name', () => {
      expect(dataCoordinator.componentName).toBe('DataCoordinator')
    })

    it('should initialize with empty state', () => {
      expect(dataCoordinator.state).toEqual({
        currentProfile: null,
        currentEnvironment: 'space',
        profiles: {},
        settings: {},
        metadata: {
          lastModified: null,
          version: '1.0.0'
        }
      })
    })

    it('should load initial state from storage', async () => {
      const mockData = {
        currentProfile: 'test-profile',
        profiles: {
          'test-profile': {
            name: 'Test Profile',
            description: 'Test Description'
          }
        },
        settings: { theme: 'dark' }
      }
      
      mockStorage.getAllData.mockReturnValue(mockData)
      
      await dataCoordinator.init()
      
      expect(dataCoordinator.state.currentProfile).toBe('test-profile')
      expect(dataCoordinator.state.profiles).toEqual(mockData.profiles)
      expect(dataCoordinator.state.settings).toEqual(mockData.settings)
    })

    it('should set first profile as current if none specified', async () => {
      const mockData = {
        currentProfile: null,
        profiles: {
          'profile1': { name: 'Profile 1' },
          'profile2': { name: 'Profile 2' }
        },
        settings: {}
      }
      
      mockStorage.getAllData.mockReturnValue(mockData)
      
      await dataCoordinator.init()
      
      expect(dataCoordinator.state.currentProfile).toBe('profile1')
      expect(mockStorage.saveAllData).toHaveBeenCalledWith(
        expect.objectContaining({
          currentProfile: 'profile1'
        })
      )
    })
  })

  describe('State Management', () => {
    it('should return current state', () => {
      const state = dataCoordinator.getCurrentState()
      
      expect(state).toEqual({
        currentProfile: null,
        currentEnvironment: 'space',
        currentProfileData: null,
        profiles: {},
        settings: {},
        metadata: {
          lastModified: null,
          version: '1.0.0'
        }
      })
    })

    it('should return all profiles', async () => {
      dataCoordinator.state.profiles = {
        'profile1': { name: 'Profile 1' },
        'profile2': { name: 'Profile 2' }
      }
      
      const profiles = await dataCoordinator.getAllProfiles()
      
      expect(profiles).toEqual(dataCoordinator.state.profiles)
    })

    it('should return current profile data in state', () => {
      dataCoordinator.state.currentProfile = 'test-profile'
      dataCoordinator.state.profiles['test-profile'] = { name: 'Test Profile' }
      
      const state = dataCoordinator.getCurrentState()
      
      expect(state.currentProfile).toBe('test-profile')
      expect(state.currentProfileData).toBeTruthy()
      expect(state.currentProfileData.name).toBe('Test Profile')
    })

    it('should return null for non-existent current profile', () => {
      dataCoordinator.state.currentProfile = 'non-existent'
      
      const state = dataCoordinator.getCurrentState()
      
      expect(state.currentProfile).toBe('non-existent')
      expect(state.currentProfileData).toBeNull()
    })
  })

  describe('Profile Operations', () => {
    it('should create new profile', async () => {
      const result = await dataCoordinator.createProfile('New Profile', 'Test Description', 'space')
      
      expect(result).toHaveProperty('profileId')
      expect(result.success).toBe(true)
      expect(dataCoordinator.state.profiles[result.profileId]).toBeDefined()
      expect(dataCoordinator.state.profiles[result.profileId].name).toBe('New Profile')
      expect(dataCoordinator.state.profiles[result.profileId].description).toBe('Test Description')
    })

    it('should switch to existing profile', async () => {
      // Setup existing profile
      dataCoordinator.state.profiles['test-profile'] = { name: 'Test Profile' }
      
      const result = await dataCoordinator.switchProfile('test-profile')
      
      expect(result.success).toBe(true)
      expect(dataCoordinator.state.currentProfile).toBe('test-profile')
    })

    it('should fail to switch to non-existent profile', async () => {
      await expect(dataCoordinator.switchProfile('non-existent')).rejects.toThrow('Profile non-existent not found')
    })

    it('should clone existing profile', async () => {
      // Setup source profile
      dataCoordinator.state.profiles['source-profile'] = {
        name: 'Source Profile',
        description: 'Source Description',
        aliases: { test: { commands: ['command1'], description: 'Test alias' } }
      }
      
      const result = await dataCoordinator.cloneProfile('source-profile', 'Cloned Profile')
      
      expect(result.success).toBe(true)
      expect(result).toHaveProperty('profileId')
      
      const clonedProfile = dataCoordinator.state.profiles[result.profileId]
      expect(clonedProfile.name).toBe('Cloned Profile')
      expect(clonedProfile.aliases).toEqual({ test: { commands: ['command1'], description: 'Test alias' } })
    })

    it('should rename existing profile', async () => {
      // Setup existing profile
      dataCoordinator.state.profiles['test-profile'] = { name: 'Old Name' }
      
      const result = await dataCoordinator.renameProfile('test-profile', 'New Name', 'New Description')
      
      expect(result.success).toBe(true)
      expect(dataCoordinator.state.profiles['test-profile'].name).toBe('New Name')
      expect(dataCoordinator.state.profiles['test-profile'].description).toBe('New Description')
    })

    it('should delete existing profile', async () => {
      // Setup profiles
      dataCoordinator.state.profiles['profile1'] = { name: 'Profile 1' }
      dataCoordinator.state.profiles['profile2'] = { name: 'Profile 2' }
      dataCoordinator.state.currentProfile = 'profile1'
      
      const result = await dataCoordinator.deleteProfile('profile1')
      
      expect(result.success).toBe(true)
      expect(dataCoordinator.state.profiles['profile1']).toBeUndefined()
      expect(dataCoordinator.state.currentProfile).toBe('profile2') // Should switch to remaining profile
    })

    it('should not delete last remaining profile', async () => {
      // Setup only one profile
      dataCoordinator.state.profiles['profile1'] = { name: 'Profile 1' }
      dataCoordinator.state.currentProfile = 'profile1'
      
      await expect(dataCoordinator.deleteProfile('profile1')).rejects.toThrow('Cannot delete the last profile')
      expect(dataCoordinator.state.profiles['profile1']).toBeDefined()
    })
  })

  describe('Environment Management', () => {
    it('should set environment', async () => {
      const result = await dataCoordinator.setEnvironment('ground')
      
      expect(result.success).toBe(true)
      expect(dataCoordinator.state.currentEnvironment).toBe('ground')
    })

    it('should emit environment change event', async () => {
      await dataCoordinator.setEnvironment('ground')

      expect(mockEventBus.emit).toHaveBeenCalledWith('environment:changed',
        expect.objectContaining({
          environment: 'ground',
          toEnvironment: 'ground',
          fromEnvironment: 'space',
          timestamp: expect.any(Number)
        }),
        { synchronous: true }
      )
    })
  })

  describe('Settings Management', () => {
    it('should get settings', async () => {
      dataCoordinator.state.settings = { theme: 'dark', language: 'en' }
      
      const settings = await dataCoordinator.getSettings()
      
      expect(settings).toEqual({ theme: 'dark', language: 'en' })
    })

    it('should update settings', async () => {
      const newSettings = { theme: 'light', language: 'es' }
      
      const result = await dataCoordinator.updateSettings(newSettings)
      
      expect(result.success).toBe(true)
      expect(dataCoordinator.state.settings).toEqual(newSettings)
    })

    it('should emit settings change event', async () => {
      const newSettings = { theme: 'light' }

      await dataCoordinator.updateSettings(newSettings)

      expect(mockEventBus.emit).toHaveBeenCalledWith('settings:changed',
        expect.objectContaining({
          settings: newSettings,
          updates: newSettings,
          timestamp: expect.any(Number)
        }),
        {}
      )
    })
  })

  describe('Storage Operations', () => {
    it('should save data to storage on profile update', async () => {
      dataCoordinator.state.profiles['test-profile'] = { name: 'Test Profile' }
      
      await dataCoordinator.updateProfile('test-profile', {
        properties: { description: 'Updated' }
      })
      
      expect(mockStorage.saveAllData).toHaveBeenCalledWith(
        expect.objectContaining({
          profiles: expect.objectContaining({
            'test-profile': expect.objectContaining({
              description: 'Updated'
            })
          })
        })
      )
    })

    it('should reload state from storage', async () => {
      const newData = {
        currentProfile: 'reloaded-profile',
        profiles: { 'reloaded-profile': { name: 'Reloaded' } },
        settings: { newSetting: 'value' }
      }
      
      mockStorage.getAllData.mockReturnValue(newData)
      
      const result = await dataCoordinator.reloadState()
      
      expect(result.success).toBe(true)
      expect(dataCoordinator.state.currentProfile).toBe('reloaded-profile')
      expect(dataCoordinator.state.profiles).toEqual(newData.profiles)
      expect(dataCoordinator.state.settings).toEqual(newData.settings)
    })
  })

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      mockStorage.saveProfile = vi.fn().mockRejectedValue(new Error('Storage error'))

      await expect(dataCoordinator.createProfile('Test Profile')).rejects.toThrow('Failed to create profile')
    })

    it('should handle invalid profile operations', async () => {
      await expect(dataCoordinator.updateProfile('non-existent', {
        properties: { description: 'Updated' }
      })).rejects.toThrow('Profile non-existent not found')
    })

    it('should handle null updates parameter correctly', async () => {
      // Setup a test profile first
      dataCoordinator.state.profiles['test-profile'] = { name: 'Test Profile' }

      // Test that null updates throws the correct error, not TypeError
      await expect(dataCoordinator.updateProfile('test-profile', null))
        .rejects.toThrow('Updates are required')
    })

    it('should handle undefined updates parameter correctly', async () => {
      // Setup a test profile first
      dataCoordinator.state.profiles['test-profile'] = { name: 'Test Profile' }

      // Test that undefined updates throws the correct error
      await expect(dataCoordinator.updateProfile('test-profile', undefined))
        .rejects.toThrow('Updates are required')
    })

    it('should handle empty object updates parameter correctly', async () => {
      // Setup a test profile first
      dataCoordinator.state.profiles['test-profile'] = { name: 'Test Profile' }

      // Test that empty object updates throws the correct error
      await expect(dataCoordinator.updateProfile('test-profile', {}))
        .rejects.toThrow('Explicit operations (add/delete/modify/properties) required')
    })

    it('should handle null profile ID correctly', async () => {
      // Test that null profile ID throws the correct error
      await expect(dataCoordinator.updateProfile(null, {
        properties: { description: 'Updated' }
      })).rejects.toThrow('Profile ID is required')
    })

    it('should handle undefined profile ID correctly', async () => {
      // Test that undefined profile ID throws the correct error
      await expect(dataCoordinator.updateProfile(undefined, {
        properties: { description: 'Updated' }
      })).rejects.toThrow('Profile ID is required')
    })
  })
}) 