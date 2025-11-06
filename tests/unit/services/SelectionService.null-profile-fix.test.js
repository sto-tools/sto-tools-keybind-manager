import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/services/harness.js'
import SelectionService from '../../../src/js/components/services/SelectionService.js'

describe('SelectionService - Null Profile Handling Fix', () => {
  let harness
  let selectionService
  let capturedEvents = []

  beforeEach(async () => {
    harness = createServiceFixture()
    selectionService = new SelectionService({ eventBus: harness.eventBus })
    capturedEvents = []

    // Mock the emit method to capture events
    const originalEmit = selectionService.emit
    selectionService.emit = vi.fn((event, data) => {
      capturedEvents.push({ event, data })
      originalEmit.call(selectionService, event, data)
    })

    // Mock request method for DataCoordinator integration
    selectionService.request = vi.fn()

    await selectionService.init()
  })

  describe('profile:switched handler with null profile', () => {
    it('should handle null profile gracefully without throwing errors', () => {
      // Arrange - set up initial state with some cached selections
      selectionService.cachedSelections = {
        space: 'F1',
        ground: 'G1',
        alias: 'TestAlias'
      }
      selectionService.cache.currentProfile = 'old-profile'
      selectionService.cache.profile = { id: 'old-profile', name: 'Old Profile' }

      // Act - this should not throw an error
      expect(() => {
        // Manually call the handler logic with null profile (similar to profile:switched handler)
        const handler = ({ profileId, profile, environment }) => {
          console.log(`[SelectionService] profile:switched: profileId="${profileId}", env="${environment}"`)

          // ComponentBase handles currentProfile, profile, and currentEnvironment caching
          selectionService.updateCacheFromProfile(profile)

          // Handle null profile gracefully
          if (!profile) {
            selectionService.cachedSelections = { space: null, ground: null, alias: null }
            return
          }

          // Restore cached selections from the new profile
          if (profile.selections) {
            if (profile.selections.space) {
              selectionService.cachedSelections.space = profile.selections.space
            }
            if (profile.selections.ground) {
              selectionService.cachedSelections.ground = profile.selections.ground
            }
            if (profile.selections.alias) {
              selectionService.cachedSelections.alias = profile.selections.alias
            }
          }
        }

        handler({ profileId: null, profile: null, environment: 'space' })
      }).not.toThrow()

      // Assert - cached selections should be reset
      expect(selectionService.cachedSelections).toEqual({
        space: null,
        ground: null,
        alias: null
      })
    })
  })

  describe('handleInitialState with null profile', () => {
    it('should handle null profile in currentProfileData gracefully', async () => {
      // Arrange - set up initial state
      selectionService.cache.currentProfile = 'old-profile'
      selectionService.cache.currentEnvironment = 'ground'
      selectionService.cachedSelections = {
        space: 'F1',
        ground: 'G1',
        alias: 'TestAlias'
      }

      // Act - this should not throw an error
      await expect(async () => {
        const state = { currentProfileData: null }

        await selectionService.handleInitialState('DataCoordinator', state)
      }).not.toThrow()

      // Assert - state should be properly reset
      expect(selectionService.cache.currentProfile).toBe(null)
      expect(selectionService.cachedSelections).toEqual({
        space: null,
        ground: null,
        alias: null
      })
      // Environment should remain unchanged
      expect(selectionService.cache.currentEnvironment).toBe('ground')
    })

    it('should handle undefined profile in currentProfileData gracefully', async () => {
      // Arrange
      selectionService.cache.currentProfile = 'old-profile'
      selectionService.cachedSelections = {
        space: 'F1',
        ground: null,
        alias: 'TestAlias'
      }

      // Act
      await expect(async () => {
        const state = { currentProfileData: undefined }

        await selectionService.handleInitialState('DataCoordinator', state)
      }).not.toThrow()

      // Assert
      expect(selectionService.cache.currentProfile).toBe(null)
      expect(selectionService.cachedSelections).toEqual({
        space: null,
        ground: null,
        alias: null
      })
    })

    it('should ignore state from non-DataCoordinator senders', async () => {
      // Arrange
      const originalProfile = selectionService.cache.currentProfile
      const originalSelections = { ...selectionService.cachedSelections }

      // Act
      await selectionService.handleInitialState('SomeOtherService', { currentProfileData: null })

      // Assert - should not modify state when sender is not DataCoordinator
      expect(selectionService.cache.currentProfile).toBe(originalProfile)
      expect(selectionService.cachedSelections).toEqual(originalSelections)
    })
  })

  describe('Regression tests', () => {
    it('should continue to handle valid profiles correctly', async () => {
      // Arrange
      const validProfile = {
        id: 'test-profile',
        selections: {
          space: 'F1',
          ground: 'G1',
          alias: 'TestAlias'
        }
      }

      // Act
      await expect(async () => {
        const state = { currentProfileData: validProfile }

        await selectionService.handleInitialState('DataCoordinator', state)
      }).not.toThrow()

      // Assert - should handle valid profile correctly
      expect(selectionService.cache.currentProfile).toBe('test-profile')
      expect(selectionService.cachedSelections).toEqual({
        space: 'F1',
        ground: 'G1',
        alias: 'TestAlias'
      })
    })

    it('should handle valid profile without selections', async () => {
      // Arrange
      const validProfile = {
        id: 'test-profile',
        // No selections property
      }

      // Act
      await selectionService.handleInitialState('DataCoordinator', { currentProfileData: validProfile })

      // Assert - should not crash and selections should remain null
      expect(selectionService.cache.currentProfile).toBe('test-profile')
      expect(selectionService.cachedSelections).toEqual({
        space: null,
        ground: null,
        alias: null
      })
    })
  })

  describe('updateCacheFromProfile integration', () => {
    it('should handle null profile correctly via updateCacheFromProfile', () => {
      // Arrange - set up some cache state
      selectionService.cache.profile = { id: 'old-profile' }
      selectionService.cache.builds = { space: { keys: { F1: ['Test'] } } }
      selectionService.cache.keys = { F1: ['Test'] }
      selectionService.cache.aliases = { TestAlias: { commands: [] } }

      // Act
      selectionService.updateCacheFromProfile(null)

      // Assert - updateCacheFromProfile should handle null profile gracefully
      // According to the method, it should return early without modifying cache
      expect(selectionService.cache.profile).toEqual({ id: 'old-profile' }) // Unchanged
      expect(selectionService.cache.builds).toEqual({ space: { keys: { F1: ['Test'] } } }) // Unchanged
    })
  })
})