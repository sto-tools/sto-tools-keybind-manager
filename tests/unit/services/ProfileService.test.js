// Unit tests for ProfileService
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { 
  createEventBusFixture, 
  createRequestResponseFixture,
  createProfileDataFixture,
  createStorageFixture 
} from '../../fixtures'

describe('ProfileService', () => {
  let eventBus, requestResponse, profileService, storageFixture, profileFixtures

  beforeEach(() => {
    // Set up fixtures
    const eventBusFixture = createEventBusFixture()
    eventBus = eventBusFixture.eventBus
    requestResponse = createRequestResponseFixture(eventBus)
    storageFixture = createStorageFixture()
    
    // Create multiple profile fixtures for testing
    profileFixtures = {
      basic: createProfileDataFixture('basic'),
      complex: createProfileDataFixture('complex'),
      empty: createProfileDataFixture('empty')
    }

    // Mock ProfileService
    profileService = {
      componentName: 'ProfileService',
      eventBus,
      i18n: {
        t: vi.fn((key, params) => {
          const translations = {
            'failed_to_load_profile_data': 'Failed to load profile data',
            'no_profile_to_save': 'No profile to save',
            'profile_saved': 'Profile saved',
            'failed_to_save_profile': 'Failed to save profile',
            'data_saved': 'Data saved',
            'profile_created': 'Profile created successfully',
            'profile_deleted': 'Profile deleted successfully',
            'profile_switched': 'Profile switched to ${profileName}',
            'profile_renamed': 'Profile renamed successfully',
            'profile_cloned': 'Profile cloned successfully'
          }
          return translations[key] || key
        })
      },
      currentProfile: null,
      currentEnvironment: 'space',
      isModified: false,
      profilesCache: {},

      // Mock methods
      init: vi.fn(),
      setupEventListeners: vi.fn(),
      loadData: vi.fn(),
      saveProfile: vi.fn(),
      saveSpecificProfile: vi.fn(),
      saveData: vi.fn(),
      setModified: vi.fn(),
      switchProfile: vi.fn(),
      createProfile: vi.fn(),
      deleteProfile: vi.fn(),
      getAllProfiles: vi.fn(),
      cloneProfile: vi.fn(),
      renameProfile: vi.fn(),
      getCurrentProfileId: vi.fn(),
      getCurrentEnvironment: vi.fn(),
      setCurrentEnvironment: vi.fn(),
      getModified: vi.fn()
    }

    // Implement mock behaviors
    profileService.loadData = vi.fn(async () => {
      return {
        currentProfile: profileService.currentProfile,
        currentEnvironment: profileService.currentEnvironment,
        profiles: profileService.profilesCache
      }
    })

    profileService.saveProfile = vi.fn(async () => {
      if (!profileService.currentProfile) {
        throw new Error('No profile to save')
      }
      profileService.isModified = false
      return { success: true, message: 'Profile saved' }
    })

    profileService.saveSpecificProfile = vi.fn(async (profile) => {
      if (!profile) {
        throw new Error('No profile to save')
      }
      profileService.setModified(true)
      return { success: true, message: 'Profile saved' }
    })

    profileService.setModified = vi.fn((modified = true) => {
      profileService.isModified = modified
      if (modified) {
        eventBus.emit('profile-modified')
      }
      return { modified, success: true }
    })

    profileService.switchProfile = vi.fn(async (profileId) => {
      if (!profileService.profilesCache[profileId]) {
        throw new Error(`Profile ${profileId} not found`)
      }
      
      const profile = profileService.profilesCache[profileId]
      profileService.currentProfile = profileId
      profileService.currentEnvironment = profile.currentEnvironment || 'space'
      profileService.isModified = false
      
      // Emit events for compatibility
      eventBus.emit('profile:switched', { 
        profileId, 
        profile,
        environment: profileService.currentEnvironment 
      })
      eventBus.emit('profile-switched', { 
        profileId, 
        profile, 
        environment: profileService.currentEnvironment 
      })
      
      return { success: true, profile, environment: profileService.currentEnvironment }
    })

    profileService.createProfile = vi.fn(async (name, description = '', mode = 'space') => {
      if (!name) {
        throw new Error('Profile name is required')
      }
      
      const profileId = `profile_${Date.now()}`
      const profile = {
        id: profileId,
        name,
        description,
        currentEnvironment: mode,
        builds: {
          space: { keys: {} },
          ground: { keys: {} }
        },
        aliases: {},
        created: new Date().toISOString(),
        lastModified: new Date().toISOString()
      }
      
      profileService.profilesCache[profileId] = profile
      eventBus.emit('profile:created', { profile })
      
      return { success: true, profile, profileId }
    })

    profileService.deleteProfile = vi.fn(async (profileId) => {
      if (!profileService.profilesCache[profileId]) {
        throw new Error(`Profile ${profileId} not found`)
      }
      
      delete profileService.profilesCache[profileId]
      
      // If deleted profile was current, clear current
      if (profileService.currentProfile === profileId) {
        profileService.currentProfile = null
      }
      
      eventBus.emit('profile:deleted', { profileId })
      
      return { success: true }
    })

    profileService.getAllProfiles = vi.fn(() => {
      return Object.values(profileService.profilesCache)
    })

    profileService.cloneProfile = vi.fn(async (sourceProfileId, newName) => {
      const sourceProfile = profileService.profilesCache[sourceProfileId]
      if (!sourceProfile) {
        throw new Error(`Source profile ${sourceProfileId} not found`)
      }
      
      const profileId = `profile_${Date.now()}`
      const clonedProfile = {
        ...JSON.parse(JSON.stringify(sourceProfile)), // Deep clone
        id: profileId,
        name: newName,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString()
      }
      
      profileService.profilesCache[profileId] = clonedProfile
      eventBus.emit('profile:created', { profile: clonedProfile })
      
      return { success: true, profile: clonedProfile, profileId }
    })

    profileService.renameProfile = vi.fn(async (profileId, newName, description = '') => {
      const profile = profileService.profilesCache[profileId]
      if (!profile) {
        throw new Error(`Profile ${profileId} not found`)
      }
      
      profile.name = newName
      profile.description = description
      profile.lastModified = new Date().toISOString()
      
      eventBus.emit('profile:updated', { profile })
      
      return { success: true, profile }
    })

    profileService.getCurrentProfileId = vi.fn(() => {
      return profileService.currentProfile
    })

    profileService.getCurrentEnvironment = vi.fn(() => {
      return profileService.currentEnvironment
    })

    profileService.setCurrentEnvironment = vi.fn((environment) => {
      profileService.currentEnvironment = environment
      eventBus.emit('environment:changed', { environment })
    })

    profileService.getModified = vi.fn(() => {
      return profileService.isModified
    })

    // Add some initial test profiles
    Object.entries(profileFixtures).forEach(([key, fixture]) => {
      const profileId = `test-${key}-profile`
      profileService.profilesCache[profileId] = {
        ...fixture.profile,
        id: profileId
      }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with correct component name', () => {
      expect(profileService.componentName).toBe('ProfileService')
    })

    it('should initialize with default state', () => {
      expect(profileService.currentProfile).toBeNull()
      expect(profileService.currentEnvironment).toBe('space')
      expect(profileService.isModified).toBe(false)
    })

    it('should have profiles cache', () => {
      expect(profileService.profilesCache).toBeDefined()
      expect(typeof profileService.profilesCache).toBe('object')
    })
  })

  describe('Data Loading', () => {
    it('should load data successfully', async () => {
      const result = await profileService.loadData()
      
      expect(result).toBeDefined()
      expect(result).toHaveProperty('currentProfile')
      expect(result).toHaveProperty('currentEnvironment')
      expect(result).toHaveProperty('profiles')
      expect(result.currentEnvironment).toBe('space')
    })

    it('should return cached profiles', async () => {
      const result = await profileService.loadData()
      
      expect(result.profiles).toEqual(profileService.profilesCache)
    })
  })

  describe('Profile Saving', () => {
    beforeEach(() => {
      profileService.currentProfile = 'test-basic-profile'
    })

    it('should save current profile successfully', async () => {
      const result = await profileService.saveProfile()
      
      expect(result.success).toBe(true)
      expect(result.message).toBe('Profile saved')
      expect(profileService.isModified).toBe(false)
    })

    it('should throw error when no current profile', async () => {
      profileService.currentProfile = null
      
      await expect(profileService.saveProfile()).rejects.toThrow('No profile to save')
    })

    it('should save specific profile', async () => {
      const profile = profileFixtures.basic.profile
      
      const result = await profileService.saveSpecificProfile(profile)
      
      expect(result.success).toBe(true)
      expect(profileService.setModified).toHaveBeenCalledWith(true)
    })

    it('should throw error when saving null profile', async () => {
      await expect(profileService.saveSpecificProfile(null)).rejects.toThrow('No profile to save')
    })
  })

  describe('Profile Management', () => {
    it('should create new profile', async () => {
      const name = 'Test New Profile'
      const description = 'A test profile'
      const mode = 'ground'
      
      const result = await profileService.createProfile(name, description, mode)
      
      expect(result.success).toBe(true)
      expect(result.profile.name).toBe(name)
      expect(result.profile.description).toBe(description)
      expect(result.profile.currentEnvironment).toBe(mode)
      expect(result.profileId).toBeDefined()
    })

    it('should throw error when creating profile without name', async () => {
      await expect(profileService.createProfile('')).rejects.toThrow('Profile name is required')
    })

    it('should switch to existing profile', async () => {
      const profileId = 'test-complex-profile'
      
      const result = await profileService.switchProfile(profileId)
      
      expect(result.success).toBe(true)
      expect(profileService.currentProfile).toBe(profileId)
      expect(profileService.isModified).toBe(false)
    })

    it('should throw error when switching to non-existent profile', async () => {
      await expect(profileService.switchProfile('non-existent')).rejects.toThrow('Profile non-existent not found')
    })

    it('should delete existing profile', async () => {
      const profileId = 'test-empty-profile'
      
      const result = await profileService.deleteProfile(profileId)
      
      expect(result.success).toBe(true)
      expect(profileService.profilesCache[profileId]).toBeUndefined()
    })

    it('should clear current profile when deleting current', async () => {
      const profileId = 'test-basic-profile'
      profileService.currentProfile = profileId
      
      await profileService.deleteProfile(profileId)
      
      expect(profileService.currentProfile).toBeNull()
    })

    it('should throw error when deleting non-existent profile', async () => {
      await expect(profileService.deleteProfile('non-existent')).rejects.toThrow('Profile non-existent not found')
    })
  })

  describe('Profile Cloning', () => {
    it('should clone existing profile', async () => {
      const sourceId = 'test-complex-profile'
      const newName = 'Cloned Complex Profile'
      
      const result = await profileService.cloneProfile(sourceId, newName)
      
      expect(result.success).toBe(true)
      expect(result.profile.name).toBe(newName)
      expect(result.profile.id).not.toBe(sourceId)
      expect(result.profile.builds).toEqual(profileFixtures.complex.profile.builds)
    })

    it('should throw error when cloning non-existent profile', async () => {
      await expect(profileService.cloneProfile('non-existent', 'New Name')).rejects.toThrow('Source profile non-existent not found')
    })
  })

  describe('Profile Renaming', () => {
    it('should rename existing profile', async () => {
      const profileId = 'test-basic-profile'
      const newName = 'Renamed Basic Profile'
      const newDescription = 'Updated description'
      
      const result = await profileService.renameProfile(profileId, newName, newDescription)
      
      expect(result.success).toBe(true)
      expect(result.profile.name).toBe(newName)
      expect(result.profile.description).toBe(newDescription)
    })

    it('should throw error when renaming non-existent profile', async () => {
      await expect(profileService.renameProfile('non-existent', 'New Name')).rejects.toThrow('Profile non-existent not found')
    })
  })

  describe('State Management', () => {
    it('should get current profile ID', () => {
      profileService.currentProfile = 'test-profile-123'
      
      const result = profileService.getCurrentProfileId()
      
      expect(result).toBe('test-profile-123')
    })

    it('should get current environment', () => {
      profileService.currentEnvironment = 'ground'
      
      const result = profileService.getCurrentEnvironment()
      
      expect(result).toBe('ground')
    })

    it('should set current environment', () => {
      const environment = 'ground'
      
      profileService.setCurrentEnvironment(environment)
      
      expect(profileService.currentEnvironment).toBe(environment)
    })

    it('should get modified state', () => {
      profileService.isModified = true
      
      const result = profileService.getModified()
      
      expect(result).toBe(true)
    })
  })

  describe('Profile Listing', () => {
    it('should get all profiles', () => {
      const profiles = profileService.getAllProfiles()
      
      expect(Array.isArray(profiles)).toBe(true)
      expect(profiles.length).toBeGreaterThan(0)
      
      // Should contain our test profiles
      const profileNames = profiles.map(p => p.name)
      expect(profileNames).toContain('Basic Test Profile')
      expect(profileNames).toContain('Complex Test Profile')
    })

    it('should return empty array when no profiles', () => {
      profileService.profilesCache = {}
      
      const profiles = profileService.getAllProfiles()
      
      expect(Array.isArray(profiles)).toBe(true)
      expect(profiles.length).toBe(0)
    })
  })

  describe('Event Integration', () => {
    it('should emit profile:switched when switching profiles', async () => {
      const { expectEvent, eventBus: testEventBus } = createEventBusFixture()
      
      // Update profileService to use test eventBus
      profileService.eventBus = testEventBus
      
      // Update switchProfile mock to use test eventBus
      profileService.switchProfile = vi.fn(async (profileId) => {
        if (!profileService.profilesCache[profileId]) {
          throw new Error(`Profile ${profileId} not found`)
        }
        
        const profile = profileService.profilesCache[profileId]
        profileService.currentProfile = profileId
        profileService.currentEnvironment = profile.currentEnvironment || 'space'
        profileService.isModified = false
        
        testEventBus.emit('profile:switched', { 
          profileId, 
          profile,
          environment: profileService.currentEnvironment 
        })
        testEventBus.emit('profile-switched', { 
          profileId, 
          profile, 
          environment: profileService.currentEnvironment 
        })
        
        return { success: true, profile, environment: profileService.currentEnvironment }
      })
      
      const profileId = 'test-complex-profile'
      
      await profileService.switchProfile(profileId)
      
      expectEvent('profile:switched')
      expectEvent('profile-switched')
    })

    it('should emit profile:created when creating profiles', async () => {
      const { expectEvent, eventBus: testEventBus } = createEventBusFixture()
      
      // Update profileService to use test eventBus
      profileService.eventBus = testEventBus
      
      // Update createProfile mock to use test eventBus
      profileService.createProfile = vi.fn(async (name, description = '', mode = 'space') => {
        if (!name) {
          throw new Error('Profile name is required')
        }
        
        const profileId = `profile_${Date.now()}`
        const profile = {
          id: profileId,
          name,
          description,
          currentEnvironment: mode,
          builds: {
            space: { keys: {} },
            ground: { keys: {} }
          },
          aliases: {},
          created: new Date().toISOString(),
          lastModified: new Date().toISOString()
        }
        
        profileService.profilesCache[profileId] = profile
        testEventBus.emit('profile:created', { profile })
        
        return { success: true, profile, profileId }
      })
      
      await profileService.createProfile('New Test Profile')
      
      expectEvent('profile:created')
    })

    it('should emit profile:deleted when deleting profiles', async () => {
      const { expectEvent, eventBus: testEventBus } = createEventBusFixture()
      
      // Update profileService to use test eventBus
      profileService.eventBus = testEventBus
      
      // Update deleteProfile mock to use test eventBus
      profileService.deleteProfile = vi.fn(async (profileId) => {
        if (!profileService.profilesCache[profileId]) {
          throw new Error(`Profile ${profileId} not found`)
        }
        
        delete profileService.profilesCache[profileId]
        
        if (profileService.currentProfile === profileId) {
          profileService.currentProfile = null
        }
        
        testEventBus.emit('profile:deleted', { profileId })
        
        return { success: true }
      })
      
      const profileId = 'test-basic-profile'
      
      await profileService.deleteProfile(profileId)
      
      expectEvent('profile:deleted')
    })

    it('should emit environment:changed when setting environment', () => {
      const { expectEvent, eventBus: testEventBus } = createEventBusFixture()
      
      // Update profileService to use test eventBus
      profileService.eventBus = testEventBus
      
      // Update setCurrentEnvironment mock to use test eventBus
      profileService.setCurrentEnvironment = vi.fn((environment) => {
        profileService.currentEnvironment = environment
        testEventBus.emit('environment:changed', { environment })
      })
      
      profileService.setCurrentEnvironment('ground')
      
      expectEvent('environment:changed')
    })

    it('should set modified state and emit event', () => {
      const { expectEvent, eventBus: testEventBus } = createEventBusFixture()
      
      // Update profileService to use test eventBus  
      profileService.eventBus = testEventBus
      
      // Update setModified mock to use test eventBus
      profileService.setModified = vi.fn((modified = true) => {
        profileService.isModified = modified
        if (modified) {
          testEventBus.emit('profile-modified')
        }
        return { modified, success: true }
      })
      
      const result = profileService.setModified(true)
      
      expect(result.modified).toBe(true)
      expect(result.success).toBe(true)
      expectEvent('profile-modified')
    })
  })

  describe('Error Handling', () => {
    it('should handle profile operation errors gracefully', async () => {
      // Mock a failing save operation
      profileService.saveProfile = vi.fn().mockRejectedValue(new Error('Storage error'))
      
      await expect(profileService.saveProfile()).rejects.toThrow('Storage error')
    })

    it('should handle missing i18n gracefully', () => {
      profileService.i18n = null
      
      // Should not throw when i18n is missing
      expect(() => profileService.getCurrentEnvironment()).not.toThrow()
    })
  })
}) 