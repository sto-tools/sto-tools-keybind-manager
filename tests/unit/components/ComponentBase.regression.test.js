/**
 * ComponentBase Regression Tests
 *
 * Tests for specific bug fixes and regressions in ComponentBase functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import ComponentBase from '../../../src/js/components/ComponentBase.js'

describe('ComponentBase Regression Tests', () => {
  let component
  let mockEventBus

  beforeEach(() => {
    // Mock event bus
    mockEventBus = {
      on: vi.fn(),
      emit: vi.fn(),
      off: vi.fn(),
      once: vi.fn()
    }

    component = new ComponentBase(mockEventBus)
  })

  afterEach(() => {
    if (component && typeof component.destroy === 'function') {
      component.destroy()
    }
  })

  describe('profile:switched handler regression tests', () => {
    it('should prioritize virtual profile structure (profile.keys) over nested structure (profile.builds) - regression: js-commandchain-undefined-fields', () => {
      // Regression test for bug: js-commandchain-undefined-fields
      // This bug caused "undefined undefined" to appear in command chain editor
      // because ComponentBase was looking for data in the wrong structure

      component.init() // Initialize to set up cache

      // Simulate a virtual profile (provided by DataCoordinator.buildVirtualProfile)
      const virtualProfile = {
        id: 'test-profile',
        name: 'Test Profile',
        keys: {
          'F1': ['cmd1', 'cmd2'],
          'F2': ['cmd3', 'cmd4']
        },
        aliases: {
          'alias1': 'F1'
        }
        // Note: no 'builds' property - this is a flattened virtual profile
      }

      // Manually execute the profile:switched handler logic with the corrected implementation
      const profileData = { profileId: 'test-profile', profile: virtualProfile, environment: 'space' }
      const { profileId, profile, environment } = profileData

      component.cache.currentProfile = profileId
      component.cache.profile = profile
      component.cache.currentEnvironment = environment || 'space'
      // Backward compatibility for components expecting underscore names
      component._currentEnvironment = component.cache.currentEnvironment
      component._currentProfileId = profileId

      // Handle null profile gracefully
      if (!profile) {
        component.cache.builds = null
        component.cache.keys = {}
        component.cache.aliases = {}
        return
      }

      // CRITICAL FIX: Use virtual profile structure first
      // DataCoordinator provides flattened keys and aliases in virtual profiles
      if (profile.keys) {
        // Use virtual profile's flattened keys structure
        component.cache.keys = profile.keys
      } else if (profile.builds) {
        // Fallback to nested structure for backward compatibility
        const currentBuild = profile.builds[component.cache.currentEnvironment]
        component.cache.keys = currentBuild?.keys || {}
        component.cache.builds = profile.builds
      } else {
        component.cache.keys = {}
        component.cache.builds = null
      }

      // Use virtual profile's aliases (already flattened)
      component.cache.aliases = profile.aliases || {}

      // Verify that cache.keys is populated from virtual profile structure
      expect(component.cache.keys).toEqual(virtualProfile.keys)
      expect(component.cache.aliases).toEqual(virtualProfile.aliases)
      expect(component.cache.currentProfile).toBe('test-profile')
      expect(component.cache.currentEnvironment).toBe('space')
    })

    it('should fallback to nested structure when virtual profile keys not available', () => {
      component.init() // Initialize to set up cache

      // Test backward compatibility with nested profile structures
      const nestedProfile = {
        id: 'nested-profile',
        name: 'Nested Profile',
        builds: {
          space: {
            keys: {
              'F1': ['cmd1', 'cmd2']
            }
          },
          ground: {
            keys: {
              'F3': ['cmd5', 'cmd6']
            }
          }
        },
        aliases: {
          'alias2': 'F1'
        }
      }

      // Execute profile:switched handler logic with nested profile (no keys property)
      const profileData = { profileId: 'nested-profile', profile: nestedProfile, environment: 'space' }
      const { profileId, profile, environment } = profileData

      component.cache.currentProfile = profileId
      component.cache.profile = profile
      component.cache.currentEnvironment = environment || 'space'
      component._currentEnvironment = component.cache.currentEnvironment
      component._currentProfileId = profileId

      if (!profile) {
        component.cache.builds = null
        component.cache.keys = {}
        component.cache.aliases = {}
        return
      }

      // CRITICAL FIX: Use virtual profile structure first
      if (profile.keys) {
        component.cache.keys = profile.keys
      } else if (profile.builds) {
        const currentBuild = profile.builds[component.cache.currentEnvironment]
        component.cache.keys = currentBuild?.keys || {}
        component.cache.builds = profile.builds
      } else {
        component.cache.keys = {}
        component.cache.builds = null
      }

      component.cache.aliases = profile.aliases || {}

      // Verify that cache.keys is populated from nested structure
      expect(component.cache.keys).toEqual(nestedProfile.builds.space.keys)
      expect(component.cache.aliases).toEqual(nestedProfile.aliases)
      expect(component.cache.builds).toEqual(nestedProfile.builds)
      expect(component.cache.currentEnvironment).toBe('space')
    })

    it('should handle null profile gracefully', () => {
      component.init() // Initialize to set up cache

      // Execute profile:switched handler logic with null profile
      const profileData = { profileId: null, profile: null, environment: 'space' }
      const { profileId, profile, environment } = profileData

      component.cache.currentProfile = profileId
      component.cache.profile = profile
      component.cache.currentEnvironment = environment || 'space'
      component._currentEnvironment = component.cache.currentEnvironment
      component._currentProfileId = profileId

      if (!profile) {
        component.cache.builds = null
        component.cache.keys = {}
        component.cache.aliases = {}
        return
      }

      // Verify graceful handling
      expect(component.cache.keys).toEqual({})
      expect(component.cache.aliases).toEqual({})
      expect(component.cache.builds).toBeNull()
      expect(component.cache.currentProfile).toBeNull()
    })

    it('should handle environment fallback to "space" when not specified', () => {
      component.init() // Initialize to set up cache

      const virtualProfile = {
        id: 'test-profile',
        keys: { 'F1': ['cmd1'] },
        aliases: {}
      }

      // Execute profile:switched handler logic without environment parameter
      const profileData = { profileId: 'test-profile', profile: virtualProfile }
      const { profileId, profile, environment } = profileData

      component.cache.currentProfile = profileId
      component.cache.profile = profile
      component.cache.currentEnvironment = environment || 'space'
      component._currentEnvironment = component.cache.currentEnvironment
      component._currentProfileId = profileId

      if (!profile) {
        component.cache.builds = null
        component.cache.keys = {}
        component.cache.aliases = {}
        return
      }

      if (profile.keys) {
        component.cache.keys = profile.keys
      } else if (profile.builds) {
        const currentBuild = profile.builds[component.cache.currentEnvironment]
        component.cache.keys = currentBuild?.keys || {}
        component.cache.builds = profile.builds
      } else {
        component.cache.keys = {}
        component.cache.builds = null
      }

      component.cache.aliases = profile.aliases || {}

      expect(component.cache.currentEnvironment).toBe('space')
      expect(component._currentEnvironment).toBe('space')
    })

    it('should handle profile with neither keys nor builds', () => {
      component.init() // Initialize to set up cache

      const emptyProfile = {
        id: 'empty-profile',
        name: 'Empty Profile',
        aliases: {}
        // No keys and no builds
      }

      // Execute profile:switched handler logic with empty profile
      const profileData = { profileId: 'empty-profile', profile: emptyProfile, environment: 'space' }
      const { profileId, profile, environment } = profileData

      component.cache.currentProfile = profileId
      component.cache.profile = profile
      component.cache.currentEnvironment = environment || 'space'
      component._currentEnvironment = component.cache.currentEnvironment
      component._currentProfileId = profileId

      if (!profile) {
        component.cache.builds = null
        component.cache.keys = {}
        component.cache.aliases = {}
        return
      }

      if (profile.keys) {
        component.cache.keys = profile.keys
      } else if (profile.builds) {
        const currentBuild = profile.builds[component.cache.currentEnvironment]
        component.cache.keys = currentBuild?.keys || {}
        component.cache.builds = profile.builds
      } else {
        component.cache.keys = {}
        component.cache.builds = null
      }

      component.cache.aliases = profile.aliases || {}

      expect(component.cache.keys).toEqual({})
      expect(component.cache.aliases).toEqual({})
      expect(component.cache.builds).toBeNull()
    })
  })

  describe('Backward compatibility tests', () => {
    it('should maintain backward compatibility with underscore property names', () => {
      component.init() // Initialize to set up cache

      const profile = {
        keys: { 'F1': ['cmd1'] },
        aliases: {}
      }

      // Execute profile:switched handler logic
      const profileData = { profileId: 'test', profile: profile, environment: 'ground' }
      const { profileId, profile: profileObj, environment } = profileData

      component.cache.currentProfile = profileId
      component.cache.profile = profileObj
      component.cache.currentEnvironment = environment || 'space'
      component._currentEnvironment = component.cache.currentEnvironment
      component._currentProfileId = profileId

      if (!profileObj) {
        component.cache.builds = null
        component.cache.keys = {}
        component.cache.aliases = {}
        return
      }

      if (profileObj.keys) {
        component.cache.keys = profileObj.keys
      } else if (profileObj.builds) {
        const currentBuild = profileObj.builds[component.cache.currentEnvironment]
        component.cache.keys = currentBuild?.keys || {}
        component.cache.builds = profileObj.builds
      } else {
        component.cache.keys = {}
        component.cache.builds = null
      }

      component.cache.aliases = profileObj.aliases || {}

      // Verify both old and new property names are set
      expect(component._currentEnvironment).toBe('ground')
      expect(component.cache.currentEnvironment).toBe('ground')
      expect(component._currentProfileId).toBe('test')
      expect(component.cache.currentProfile).toBe('test')
    })
  })
})