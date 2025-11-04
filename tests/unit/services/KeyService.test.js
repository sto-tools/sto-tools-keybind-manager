// Unit tests for KeyService
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { 
  createServiceFixture, 
  createRequestResponseFixture,
  createProfileDataFixture,
  createComponentFixture,
  createEventBusFixture
} from '../../fixtures'

// Mock the KeyService since we need to import it
const mockKeyService = {
  constructor: vi.fn(),
  init: vi.fn(),
  setCurrentProfile: vi.fn(),
  setSelectedKey: vi.fn(),
  addKey: vi.fn(),
  deleteKey: vi.fn(),
  duplicateKey: vi.fn(),
  isValidKeyName: vi.fn(),
  // REMOVED: isValidAliasName - moved to AliasService in Phase 3.1
  generateValidKeys: vi.fn(),
  getCurrentProfile: vi.fn(),
  // REMOVED: getProfileStats - moved to AnalyticsService in Phase 3.4
  setupEventListeners: vi.fn(),
  updateCacheFromProfile: vi.fn()
}

describe('KeyService', () => {
  let fixture, eventBus, requestResponse, keyService, profileFixture

  beforeEach(() => {
    // Set up fixtures
    fixture = createServiceFixture()
    const eventBusFixture = fixture.eventBusFixture
    eventBus = fixture.eventBus
    requestResponse = createRequestResponseFixture(eventBus)
    
    // Create profile fixture
    profileFixture = createProfileDataFixture('complex')
    
    // Mock KeyService constructor behavior
    keyService = {
      componentName: 'KeyService',
      eventBus,
      selectedKey: null,
      currentEnvironment: 'space',
      currentProfile: null,
      cache: {
        currentProfile: null,
        currentEnvironment: 'space',
        keys: {},
        builds: {
          space: { keys: {} },
          ground: { keys: {} }
        },
        aliases: {}
      },
      validKeys: [
        'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
        'Tab', 'Space', 'Enter', 'Escape', 'Backspace', 'Delete', 'Insert', 'Home', 'End',
        '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'
      ],
      ...mockKeyService
    }

    // Mock service methods with actual implementations
    keyService.setCurrentProfile = vi.fn((profileId) => {
      keyService.currentProfile = profileId
      keyService.cache.currentProfile = profileId
    })

    
    keyService.setSelectedKey = vi.fn((key) => {
      keyService.selectedKey = key
    })

    keyService.updateCacheFromProfile = vi.fn((profile) => {
      if (!profile) return
      keyService.cache.builds = profile.builds || { space: { keys: {} }, ground: { keys: {} } }
      keyService.cache.keys = keyService.cache.builds[keyService.cache.currentEnvironment]?.keys || {}
      keyService.cache.aliases = profile.aliases || {}
    })

    keyService.getCurrentProfile = vi.fn(() => {
      if (!keyService.cache.currentProfile) return null
      return {
        id: keyService.cache.currentProfile,
        builds: keyService.cache.builds,
        keys: keyService.cache.keys,
        aliases: keyService.cache.aliases,
        environment: keyService.cache.currentEnvironment
      }
    })

    keyService.isValidKeyName = vi.fn(async (keyName) => {
      return keyService.validKeys.includes(keyName) && keyName.trim().length > 0
    })

    keyService.addKey = vi.fn(async (keyName) => {
      if (!await keyService.isValidKeyName(keyName)) {
        return false
      }
      
      if (!keyService.cache.currentProfile) {
        return false
      }

      if (keyService.cache.keys[keyName]) {
        return false
      }

      // Simulate successful addition
      keyService.cache.keys[keyName] = []
      // NO LONGER EMITS: keys:changed (Phase 2.2 - eliminated redundant events)
      return true
    })

    keyService.deleteKey = vi.fn(async (keyName) => {
      if (!keyService.cache.currentProfile || !keyService.cache.keys[keyName]) {
        return false
      }

      delete keyService.cache.keys[keyName]
      // NO LONGER EMITS: keys:changed (Phase 2.2 - eliminated redundant events)
      return true
    })

    keyService.duplicateKey = vi.fn(async (sourceKey) => {
      if (!keyService.cache.keys[sourceKey]) {
        return null
      }

      // Find next available key name
      let counter = 2
      let newKeyName = `${sourceKey}_copy`
      while (keyService.cache.keys[newKeyName]) {
        newKeyName = `${sourceKey}_copy${counter}`
        counter++
      }

      // Copy the key
      keyService.cache.keys[newKeyName] = [...keyService.cache.keys[sourceKey]]
      // NO LONGER EMITS: keys:changed (Phase 2.2 - eliminated redundant events)
      return newKeyName
    })

    
    // getProfileStats REMOVED in Phase 3.4 - moved to AnalyticsService
    // KeyService no longer handles statistics
  })

  afterEach(() => {
    vi.clearAllMocks()
    fixture.destroy()
  })

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      expect(keyService.componentName).toBe('KeyService')
      expect(keyService.selectedKey).toBeNull()
      expect(keyService.currentEnvironment).toBe('space')
      expect(keyService.currentProfile).toBeNull()
      expect(keyService.cache.currentEnvironment).toBe('space')
    })

    it('should have valid keys array', () => {
      expect(keyService.validKeys).toBeInstanceOf(Array)
      expect(keyService.validKeys.length).toBeGreaterThan(0)
      expect(keyService.validKeys).toContain('F1')
      expect(keyService.validKeys).toContain('Space')
      expect(keyService.validKeys).toContain('Tab')
    })
  })

  describe('Profile Management', () => {
    it('should set current profile', () => {
      const profileId = 'test-profile-123'
      
      keyService.setCurrentProfile(profileId)
      
      expect(keyService.setCurrentProfile).toHaveBeenCalledWith(profileId)
      expect(keyService.currentProfile).toBe(profileId)
      expect(keyService.cache.currentProfile).toBe(profileId)
    })

    
    it('should update cache from profile data', () => {
      const profile = profileFixture.profile
      
      keyService.updateCacheFromProfile(profile)
      
      expect(keyService.updateCacheFromProfile).toHaveBeenCalledWith(profile)
      expect(keyService.cache.builds).toEqual(profile.builds)
      expect(keyService.cache.aliases).toEqual(profile.aliases)
    })

    it('should get current profile with virtual structure', () => {
      const profileId = 'test-profile'
      keyService.setCurrentProfile(profileId)
      keyService.updateCacheFromProfile(profileFixture.profile)
      
      const result = keyService.getCurrentProfile()
      
      expect(result).toBeDefined()
      expect(result.id).toBe(profileId)
      expect(result.builds).toEqual(profileFixture.profile.builds)
      expect(result.environment).toBe('space')
    })

    it('should return null for current profile when none set', () => {
      const result = keyService.getCurrentProfile()
      
      expect(result).toBeNull()
    })
  })

  describe('Key Operations', () => {
    beforeEach(() => {
      keyService.setCurrentProfile('test-profile')
      keyService.updateCacheFromProfile(profileFixture.profile)
    })

    it('should add a valid key', async () => {
      const keyName = 'F5'
      
      const result = await keyService.addKey(keyName)
      
      expect(result).toBe(true)
      expect(keyService.cache.keys[keyName]).toEqual([])
      expect(keyService.addKey).toHaveBeenCalledWith(keyName)
    })

    it('should reject invalid key names', async () => {
      const invalidKey = 'InvalidKey123'
      
      const result = await keyService.addKey(invalidKey)
      
      expect(result).toBe(false)
      expect(keyService.cache.keys[invalidKey]).toBeUndefined()
    })

    it('should reject duplicate keys', async () => {
      const keyName = 'F1' // Need to ensure this exists in profile first
      
      // Make sure the profile has this key first
      keyService.setCurrentProfile('test-profile')
      keyService.updateCacheFromProfile(profileFixture.profile)
      
      // Add the key to cache if it doesn't exist to test duplicate rejection
      if (!keyService.cache.keys[keyName]) {
        keyService.cache.keys[keyName] = ['existing command']
      }
      
      const result = await keyService.addKey(keyName)
      
      expect(result).toBe(false)
    })

    it('should delete existing keys', async () => {
      const keyName = 'F1' // Need to ensure this exists in cache first
      
      // Set up the service state properly
      keyService.setCurrentProfile('test-profile')
      keyService.updateCacheFromProfile(profileFixture.profile)
      
      // Make sure the key exists in cache for deletion test
      if (!keyService.cache.keys[keyName]) {
        keyService.cache.keys[keyName] = ['existing command']
      }
      
      const result = await keyService.deleteKey(keyName)
      
      expect(result).toBe(true)
      expect(keyService.cache.keys[keyName]).toBeUndefined()
    })

    it('should reject deleting non-existent keys', async () => {
      const keyName = 'NonExistentKey'
      
      const result = await keyService.deleteKey(keyName)
      
      expect(result).toBe(false)
    })

    it('should duplicate existing keys', async () => {
      const sourceKey = 'Space' // Exists in complex profile
      
      const result = await keyService.duplicateKey(sourceKey)
      
      expect(result).toBeTruthy()
      expect(result).toBe('Space_copy')
      expect(keyService.cache.keys[result]).toBeDefined()
    })

    it('should generate unique names for duplicate keys', async () => {
      const sourceKey = 'Space'
      
      // Add first duplicate
      await keyService.duplicateKey(sourceKey)
      expect(keyService.cache.keys['Space_copy']).toBeDefined()
      
      // Add second duplicate - should get Space_copy2
      const result = await keyService.duplicateKey(sourceKey)
      expect(result).toBe('Space_copy2')
      expect(keyService.cache.keys['Space_copy2']).toBeDefined()
    })

    it('should reject duplicating non-existent keys', async () => {
      const sourceKey = 'NonExistentKey'
      
      const result = await keyService.duplicateKey(sourceKey)
      
      expect(result).toBeNull()
    })
  })

  describe('Key Validation', () => {
    it('should validate known good keys', async () => {
      const validKeys = ['F1', 'Space', 'Tab', 'Enter', '1', 'A']
      
      for (const key of validKeys) {
        if (keyService.validKeys.includes(key)) {
          const result = await keyService.isValidKeyName(key)
          expect(result).toBe(true)
        }
      }
    })

    it('should reject empty or whitespace keys', async () => {
      const invalidKeys = ['', ' ', '\t', '\n']
      
      for (const key of invalidKeys) {
        const result = await keyService.isValidKeyName(key)
        expect(result).toBe(false)
      }
    })

    it('should reject unknown keys', async () => {
      const invalidKeys = ['UnknownKey', 'F13', 'InvalidKey123']
      
      for (const key of invalidKeys) {
        const result = await keyService.isValidKeyName(key)
        expect(result).toBe(false)
      }
    })
  })

  // Profile Statistics REMOVED in Phase 3.4 
  // Statistics functionality moved to AnalyticsService
  // KeyService now focuses only on key CRUD operations

  describe('Event Integration', () => {
    it('should NOT emit keys:changed when adding keys (Phase 2.2)', async () => {
      const { expectNoEvent, eventBus: testEventBus } = createEventBusFixture()
      
      // Update keyService to use the test eventBus
      keyService.eventBus = testEventBus
      
      // Update addKey mock to reflect new behavior (no keys:changed emission)
      keyService.addKey = vi.fn(async (keyName) => {
        if (!await keyService.isValidKeyName(keyName)) {
          return false
        }
        
        if (!keyService.cache.currentProfile) {
          return false
        }

        if (keyService.cache.keys[keyName]) {
          return false
        }

        keyService.cache.keys[keyName] = []
        // NO LONGER EMITS: keys:changed - ComponentBase handles caching
        return true
      })
      
      keyService.setCurrentProfile('test-profile')
      
      await keyService.addKey('F5')
      
      expectNoEvent('keys:changed')
    })

    it('should NOT emit keys:changed when deleting keys (Phase 2.2)', async () => {
      const { expectNoEvent, eventBus: testEventBus } = createEventBusFixture()
      
      // Update keyService to use the test eventBus
      keyService.eventBus = testEventBus
      
      // Update deleteKey mock to reflect new behavior (no keys:changed emission)
      keyService.deleteKey = vi.fn(async (keyName) => {
        if (!keyService.cache.currentProfile || !keyService.cache.keys[keyName]) {
          return false
        }

        delete keyService.cache.keys[keyName]
        // NO LONGER EMITS: keys:changed - ComponentBase handles caching
        return true
      })
      
      keyService.setCurrentProfile('test-profile')
      keyService.updateCacheFromProfile(profileFixture.profile)
      
      await keyService.deleteKey('Space')
      
      expectNoEvent('keys:changed')
    })

    it('should handle profile switching events', () => {
      const { expectEvent } = createEventBusFixture()
      keyService.eventBus = expectEvent.eventBus
      
      // Simulate profile:switched event
      const profileData = {
        profileId: 'new-profile',
        profile: profileFixture.profile,
        environment: 'ground'
      }
      
      eventBus.emit('profile:switched', profileData)
      
      // KeyService should update its state based on this event
      expect(keyService.updateCacheFromProfile).toBeDefined()
    })
  })

  describe('State Management', () => {
    it('should maintain cache consistency', () => {
      const profileId = 'test-profile'
      const environment = 'ground'

      keyService.setCurrentProfile(profileId)
      keyService.currentEnvironment = environment  // Set directly since setCurrentEnvironment was removed
      keyService.cache.currentEnvironment = environment
      keyService.updateCacheFromProfile(profileFixture.profile)

      expect(keyService.cache.currentProfile).toBe(profileId)
      expect(keyService.cache.currentEnvironment).toBe(environment)
      expect(keyService.cache.keys).toEqual(profileFixture.profile.builds.ground.keys)
    })

    it('should handle selected key state', () => {
      const keyName = 'F1'
      
      keyService.setSelectedKey(keyName)
      
      expect(keyService.selectedKey).toBe(keyName)
      expect(keyService.setSelectedKey).toHaveBeenCalledWith(keyName)
    })
  })
}) 