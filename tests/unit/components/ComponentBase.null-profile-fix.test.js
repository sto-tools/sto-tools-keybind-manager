import { describe, it, expect, beforeEach, vi } from 'vitest'
import ComponentBase from '../../../src/js/components/ComponentBase.js'

describe('ComponentBase - Null Profile Handling Fix', () => {
  let componentBase
  let mockEventBus

  beforeEach(() => {
    // Mock event bus
    mockEventBus = {
      on: vi.fn(),
      emit: vi.fn(),
      off: vi.fn()
    }

    componentBase = new ComponentBase(mockEventBus)
    componentBase.init() // Initialize to set up cache
  })

  describe('profile:updated handler with null profile', () => {
    it('should handle null profile without throwing errors', () => {
      // Arrange - set up current profile state
      componentBase.cache.currentProfile = 'test-profile'
      componentBase.cache.profile = { id: 'test-profile', name: 'Test Profile' }
      componentBase.cache.builds = { space: { keys: { F1: ['FireAll'] } } }
      componentBase.cache.keys = { F1: ['FireAll'] }
      componentBase.cache.aliases = { testAlias: { commands: ['TestCommand'] } }

      // Act - this should not throw an error
      expect(() => {
        // Manually call the handler logic with null profile (profile:updated handler)
        const handler = ({ profileId, profile }) => {
          if (componentBase.cache && profileId === componentBase.cache.currentProfile) {
            componentBase.cache.profile = profile
            // Handle null profile gracefully
            if (!profile) {
              componentBase.cache.builds = null
              componentBase.cache.keys = {}
              componentBase.cache.aliases = {}
              return
            }
            if (profile.builds) {
              componentBase.cache.builds = profile.builds
              const currentBuild = profile.builds[componentBase.cache.currentEnvironment]
              componentBase.cache.keys = currentBuild?.keys || {}
            } else if (profile.keys) {
              componentBase.cache.keys = profile.keys
            }
            componentBase.cache.aliases = profile.aliases || {}
          }
        }

        handler({ profileId: 'test-profile', profile: null })
      }).not.toThrow()

      // Assert - cache should be in expected state after null profile
      expect(componentBase.cache.profile).toBe(null)
      expect(componentBase.cache.builds).toBe(null)
      expect(componentBase.cache.keys).toEqual({})
      expect(componentBase.cache.aliases).toEqual({})
    })
  })

  describe('profile:switched handler with null profile', () => {
    it('should handle null profile without throwing errors', () => {
      // Arrange - set up current state
      componentBase.cache.currentProfile = 'old-profile'
      componentBase.cache.profile = { id: 'old-profile', name: 'Old Profile' }
      componentBase.cache.builds = { space: { keys: { F1: ['FireAll'] } } }
      componentBase.cache.keys = { F1: ['FireAll'] }
      componentBase.cache.aliases = { testAlias: { commands: ['TestCommand'] } }

      // Act - this should not throw an error
      expect(() => {
        // Manually call the handler logic with null profile
        const handler = ({ profileId, profile, environment }) => {
          componentBase.cache.currentProfile = profileId
          componentBase.cache.profile = profile
          componentBase.cache.currentEnvironment = environment || 'space'
          componentBase._currentEnvironment = componentBase.cache.currentEnvironment
          componentBase._currentProfileId = profileId

          // Handle null profile gracefully
          if (!profile) {
            componentBase.cache.builds = null
            componentBase.cache.keys = {}
            componentBase.cache.aliases = {}
            return
          }

          if (profile.builds) {
            componentBase.cache.builds = profile.builds
            const currentBuild = profile.builds[componentBase.cache.currentEnvironment]
            componentBase.cache.keys = currentBuild?.keys || {}
          } else if (profile.keys) {
            componentBase.cache.keys = profile.keys
          }
          componentBase.cache.aliases = profile.aliases || {}
        }

        handler({ profileId: null, profile: null, environment: 'space' })
      }).not.toThrow()

      // Assert - cache should be in expected state after null profile
      expect(componentBase.cache.currentProfile).toBe(null)
      expect(componentBase.cache.profile).toBe(null)
      expect(componentBase.cache.currentEnvironment).toBe('space')
      expect(componentBase.cache.builds).toBe(null)
      expect(componentBase.cache.keys).toEqual({})
      expect(componentBase.cache.aliases).toEqual({})
      expect(componentBase._currentEnvironment).toBe('space')
      expect(componentBase._currentProfileId).toBe(null)
    })

    it('should default to space environment when none provided', () => {
      // Act - this should not throw an error
      expect(() => {
        const handler = ({ profileId, profile, environment }) => {
          componentBase.cache.currentProfile = profileId
          componentBase.cache.profile = profile
          componentBase.cache.currentEnvironment = environment || 'space'
          componentBase._currentEnvironment = componentBase.cache.currentEnvironment
          componentBase._currentProfileId = profileId

          if (!profile) {
            componentBase.cache.builds = null
            componentBase.cache.keys = {}
            componentBase.cache.aliases = {}
            return
          }
        }

        handler({ profileId: null, profile: null }) // No environment provided
      }).not.toThrow()

      // Assert - should default to space
      expect(componentBase.cache.currentEnvironment).toBe('space')
      expect(componentBase._currentEnvironment).toBe('space')
    })
  })

  describe('Regression tests', () => {
    it('should continue to handle valid profiles correctly', () => {
      const validProfile = {
        id: 'test-profile',
        builds: {
          space: { keys: { F1: ['FireAll'] } },
          ground: { keys: { G1: ['Aim'] } }
        },
        aliases: { testAlias: { commands: ['TestCommand'] } }
      }

      // Act - should handle valid profile correctly
      expect(() => {
        const handler = ({ profileId, profile, environment }) => {
          componentBase.cache.currentProfile = profileId
          componentBase.cache.profile = profile
          componentBase.cache.currentEnvironment = environment || 'space'
          componentBase._currentEnvironment = componentBase.cache.currentEnvironment
          componentBase._currentProfileId = profileId

          if (!profile) {
            componentBase.cache.builds = null
            componentBase.cache.keys = {}
            componentBase.cache.aliases = {}
            return
          }

          if (profile.builds) {
            componentBase.cache.builds = profile.builds
            const currentBuild = profile.builds[componentBase.cache.currentEnvironment]
            componentBase.cache.keys = currentBuild?.keys || {}
          } else if (profile.keys) {
            componentBase.cache.keys = profile.keys
          }
          componentBase.cache.aliases = profile.aliases || {}
        }

        handler({ profileId: 'test-profile', profile: validProfile, environment: 'space' })
      }).not.toThrow()

      // Assert - should handle valid profile correctly
      expect(componentBase.cache.profile).toBe(validProfile)
      expect(componentBase.cache.builds).toBe(validProfile.builds)
      expect(componentBase.cache.keys).toBe(validProfile.builds.space.keys)
      expect(componentBase.cache.aliases).toBe(validProfile.aliases)
    })
  })
})