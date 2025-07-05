// Sample integration test demonstrating fixture usage
import { describe, it, expect } from 'vitest'
import { 
  createServiceFixture, 
  createProfileDataFixture,
  createRequestResponseFixture 
} from '../fixtures'

describe('Profile Management Integration', () => {
  it('should save and load profiles through storage service', () => {
    const { storageService, expectOperation, destroy } = createServiceFixture()
    const { profile } = createProfileDataFixture('basic')

    // Save the profile
    const result = storageService.saveProfile('test-profile', profile)
    expect(result).toBe(true)
    expectOperation('setItem', 'sto_keybind_manager')

    // Load the profile
    const loadedProfile = storageService.getProfile('test-profile')
    expect(loadedProfile).toBeDefined()
    expect(loadedProfile.name).toBe(profile.name)
    expect(loadedProfile.builds).toEqual(profile.builds)
  })

  it('should handle profile switching with event notifications', async () => {
    const { eventBus, expectEvent, storageService, destroy } = createServiceFixture()
    const { request, respond } = createRequestResponseFixture(eventBus)

    // Set up multiple profiles
    const profile1 = createProfileDataFixture('basic').profile
    const profile2 = createProfileDataFixture('complex').profile

    storageService.saveProfile('profile1', profile1)
    storageService.saveProfile('profile2', profile2)

    // Mock a profile service that responds to switch requests
    respond(eventBus, 'profile:switch', async ({ profileId }) => {
      const profile = storageService.getProfile(profileId)
      if (profile) {
        eventBus.emit('profile:switched', { profileId, profile })
        return { success: true, profile }
      }
      throw new Error('Profile not found')
    })

    // Request profile switch
    const result = await request(eventBus, 'profile:switch', { profileId: 'profile2' })

    expect(result.success).toBe(true)
    expect(result.profile.name).toBe(profile2.name)
    expectEvent('profile:switched')
  })

  it('should maintain profile data integrity across operations', () => {
    const { storageService, destroy } = createServiceFixture()
    const profileData = createProfileDataFixture('complex')

    // Save original profile
    storageService.saveProfile('test-profile', profileData.profile)

    // Modify the profile data
    profileData.addKey('space', 'F5', ['NewCommand'])
    profileData.addAlias('TestAlias', ['say "test"'], 'Test alias description')

    // Save modified profile
    storageService.saveProfile('test-profile', profileData.profile)

    // Verify changes persisted
    const savedProfile = storageService.getProfile('test-profile')
    expect(savedProfile.builds.space.keys.F5).toBeDefined()
    expect(savedProfile.aliases.TestAlias).toEqual({
      commands: ['say "test"'],
      description: 'Test alias description'
    })

    // Original profile should still be valid
    expect(profileData.isValid()).toBe(true)
  })

  it('should handle concurrent profile operations', async () => {
    const { eventBus, storageService, destroy } = createServiceFixture()
    const { request, respond } = createRequestResponseFixture(eventBus)

    // Set up profiles
    const profiles = ['basic', 'complex', 'empty'].map((type, i) => {
      const profile = createProfileDataFixture(type).profile
      storageService.saveProfile(`profile${i}`, profile)
      return { id: `profile${i}`, profile }
    })

    // Mock profile service
    respond(eventBus, 'profile:get', async ({ profileId }) => {
      return storageService.getProfile(profileId)
    })

    // Request multiple profiles concurrently
    const requests = profiles.map(({ id }) => 
      request(eventBus, 'profile:get', { profileId: id })
    )

    const results = await Promise.all(requests)

    // All requests should succeed
    expect(results).toHaveLength(3)
    results.forEach((profile, i) => {
      expect(profile).toBeDefined()
      expect(profile.name).toBe(profiles[i].profile.name)
    })
  })
}) 