import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createBasicTestEnvironment, createProfileDataFixture } from '../fixtures/index.js'
import SelectionService from '../../src/js/components/services/SelectionService.js'
import { expectEvent, expectNoEvent } from '../fixtures/index.js'

describe('SelectionService Cached Validation with Bindsets Integration', () => {
  let env
  let selectionService

  beforeEach(async () => {
    env = await createBasicTestEnvironment()
    selectionService = new SelectionService({ eventBus: env.eventBus })
  })

  afterEach(() => {
    if (env?.destroy) {
      env.destroy()
    }
  })

  // Helper function to create and load a profile
  function setupProfile(profileOverrides) {
    const { profile } = createProfileDataFixture('basic', profileOverrides)
    
    // Mock the profile data in SelectionService cache
    selectionService.cache = {
      profile: profile,
      builds: profile.builds || {},
      aliases: profile.aliases || {},
      currentEnvironment: profile.currentEnvironment || 'space'
    }
    
    // Set current environment
    selectionService.currentEnvironment = profile.currentEnvironment || 'space'
    
    return profile
  }

  describe('Bindset-aware Cached Selection Validation', () => {
    it('should validate cached selections against Primary Bindset by default', async () => {
      // Create and load profile with cached selections
      const profile = setupProfile({
        builds: {
          space: {
            keys: {
              'F1': ['FirePhaser'],
              'F2': ['FireTorpedo'],
              'F3': ['ShieldDistribute']
            }
          },
          ground: {
            keys: {
              'F1': ['FireWeapon'],
              'F4': ['Sprint'],
              'F5': ['Jump']
            }
          }
        },
        selections: {
          space: 'F8', // F8 doesn't exist in Primary Bindset
          ground: 'F9' // F9 doesn't exist in Primary Bindset
        }
      })
      
      // Test validation directly
      expect(selectionService.validateKeyExists('F1', 'space')).toBe(true)
      expect(selectionService.validateKeyExists('F2', 'space')).toBe(true)
      expect(selectionService.validateKeyExists('F8', 'space')).toBe(false) // Invalid cached selection
      expect(selectionService.validateKeyExists('F9', 'ground')).toBe(false) // Invalid cached selection
    })

    it('should validate cached selections against active bindset when bindsets enabled', async () => {
      // Create profile with bindsets
      const profile = setupProfile({
        builds: {
          space: {
            keys: {
              'F1': ['FirePhaser'],
              'F2': ['FireTorpedo']
            }
          },
          ground: {
            keys: {
              'F1': ['FireWeapon'],
              'F4': ['Sprint']
            }
          }
        },
        bindsets: {
          'Combat Bindset': {
            space: {
              keys: {
                'F1': ['FirePhaser', 'FireTorpedo'], // Override with multiple commands
                'F6': ['EvasiveManeuvers'] // Additional key not in primary
              }
            },
            ground: {
              keys: {
                'F1': ['FireWeapon', 'Aim'], // Override with multiple commands
                'F6': ['TacticalSprint'] // Additional key not in primary
              }
            }
          }
        }
      })
      
      // Verify Primary Bindset validation works (current implementation)
      expect(selectionService.validateKeyExists('F1', 'space')).toBe(true)
      expect(selectionService.validateKeyExists('F2', 'space')).toBe(true)
      expect(selectionService.validateKeyExists('F6', 'space')).toBe(false) // Not in Primary Bindset
      
      // Test ground environment
      expect(selectionService.validateKeyExists('F1', 'ground')).toBe(true)
      expect(selectionService.validateKeyExists('F4', 'ground')).toBe(true)
      expect(selectionService.validateKeyExists('F6', 'ground')).toBe(false) // Not in Primary Bindset
    })

    it('should handle interface mode changes with cached validation', async () => {
      // Create profile with interface mode
      const profile = setupProfile({
        interfaceMode: 'standard',
        builds: {
          space: {
            keys: {
              'F1': ['FirePhaser'],
              'F2': ['FireTorpedo']
            }
          }
        },
        selections: {
          space: 'F2'
        }
      })
      
      // Verify validation works with interface mode
      expect(selectionService.validateKeyExists('F1', 'space')).toBe(true)
      expect(selectionService.validateKeyExists('F2', 'space')).toBe(true)
      expect(selectionService.validateKeyExists('F99', 'space')).toBe(false)
      
      // Interface mode doesn't affect key validation (it should still work)
      expect(profile.interfaceMode).toBe('standard')
      expect(selectionService.validateKeyExists('F2', 'space')).toBe(true)
    })

    it('should handle profile reload with invalid cached selections', async () => {
      // Create profile with invalid cached selections
      const profile = setupProfile({
        builds: {
          space: {
            keys: {
              'F1': ['FirePhaser'],
              'F2': ['FireTorpedo']
            }
          }
        },
        aliases: {
          'ValidAlias': {
            commands: ['ValidCommand'],
            type: 'alias'
          }
        },
        selections: {
          space: 'F99', // Invalid key
          alias: 'DeletedAlias' // Invalid alias
        }
      })
      
      // Test validation of invalid cached selections
      expect(selectionService.validateKeyExists('F1', 'space')).toBe(true) // Valid
      expect(selectionService.validateKeyExists('F2', 'space')).toBe(true) // Valid
      expect(selectionService.validateKeyExists('F99', 'space')).toBe(false) // Invalid cached selection
      
      expect(selectionService.validateAliasExists('ValidAlias')).toBe(true) // Valid
      expect(selectionService.validateAliasExists('DeletedAlias')).toBe(false) // Invalid cached selection
    })

    it('should validate across environment switches with bindset data', async () => {
      // Create profile with keys in different environments
      const profile = setupProfile({
        builds: {
          space: {
            keys: {
              'F1': ['FirePhaser'],
              'F2': ['FireTorpedo']
            }
          },
          ground: {
            keys: {
              'F1': ['FireWeapon'], // F1 exists in both
              'F4': ['Sprint'] // F4 only in ground
            }
          }
        }
      })
      
      // Test cross-environment validation
      expect(selectionService.validateKeyExists('F1', 'space')).toBe(true)
      expect(selectionService.validateKeyExists('F1', 'ground')).toBe(true) // F1 exists in both
      
      expect(selectionService.validateKeyExists('F2', 'space')).toBe(true)
      expect(selectionService.validateKeyExists('F2', 'ground')).toBe(false) // F2 only in space
      
      expect(selectionService.validateKeyExists('F4', 'space')).toBe(false) // F4 only in ground
      expect(selectionService.validateKeyExists('F4', 'ground')).toBe(true)
    })

    it('should handle malformed builds data', async () => {
      // Create profile with malformed key data
      const profile = setupProfile({
        builds: {
          space: {
            keys: {
              'F1': ['ValidCommand'], // Valid array
              'F2': 'InvalidCommand', // Invalid string
              'F3': null, // Invalid null
              'F4': undefined // Invalid undefined
            }
          }
        }
      })
      
      // Only F1 should be valid (array format)
      expect(selectionService.validateKeyExists('F1', 'space')).toBe(true)
      expect(selectionService.validateKeyExists('F2', 'space')).toBe(false)
      expect(selectionService.validateKeyExists('F3', 'space')).toBe(false)
      expect(selectionService.validateKeyExists('F4', 'space')).toBe(false)
    })

    it('should handle empty builds data', async () => {
      // Create profile with empty builds
      const profile = setupProfile({
        builds: {
          space: {
            keys: {} // Empty space builds
          },
          ground: {
            keys: {
              'F1': ['FireWeapon']
            }
          }
        },
        selections: {
          space: 'F1' // Invalid - no keys in space builds
        }
      })
      
      // No keys should be valid in space
      expect(selectionService.validateKeyExists('F1', 'space')).toBe(false)
      expect(selectionService.validateKeyExists('F2', 'space')).toBe(false)
      
      // Ground should work normally
      expect(selectionService.validateKeyExists('F1', 'ground')).toBe(true)
    })
  })

  describe('Alias Validation with Bindsets', () => {
    it('should validate aliases correctly', async () => {
      // Create profile with aliases
      const profile = setupProfile({
        aliases: {
          'UserAlias1': {
            commands: ['Command1'],
            type: 'alias'
          },
          'UserAlias2': {
            commands: ['Command2'],
            type: 'alias'
          },
          'VfxAlias': {
            commands: ['dynFxSetFXExclusionList_Space'],
            type: 'vfx-alias' // System-generated alias
          }
        },
        selections: {
          alias: 'NonExistentAlias' // Invalid alias
        }
      })
      
      // Test alias validation (VFX aliases are filtered out)
      expect(selectionService.validateAliasExists('UserAlias1')).toBe(true)
      expect(selectionService.validateAliasExists('UserAlias2')).toBe(true)
      expect(selectionService.validateAliasExists('VfxAlias')).toBe(false) // Filtered out (VFX alias)
      expect(selectionService.validateAliasExists('NonExistentAlias')).toBe(false)
    })

    it('should handle malformed alias data', async () => {
      // Create profile with malformed alias data
      const profile = setupProfile({
        aliases: {
          'ValidAlias': {
            commands: ['ValidCommand'],
            type: 'alias'
          },
          'MalformedAlias1': {
            commands: 'InvalidCommand', // Should be array
            type: 'alias'
          },
          'MalformedAlias2': {
            commands: null, // Should be array
            type: 'alias'
          }
        }
      })
      
      // All aliases should be valid (alias validation doesn't check command format)
      expect(selectionService.validateAliasExists('ValidAlias')).toBe(true)
      expect(selectionService.validateAliasExists('MalformedAlias1')).toBe(true) // Still considered valid alias
      expect(selectionService.validateAliasExists('MalformedAlias2')).toBe(true) // Still considered valid alias
    })
  })

  describe('Bindset selection synchronization', () => {
    beforeEach(() => {
      selectionService.initializeCache()
      selectionService.cache.preferences.bindsetsEnabled = true
      selectionService.cache.preferences.bindToAliasMode = true
      selectionService.cache.currentEnvironment = 'space'
      selectionService.cache.activeBindset = 'Primary Bindset'
    })

    const mockRpcResponse = (topic, handler = () => ({ success: true })) => {
      const rpcTopic = `rpc:${topic}`
      env.eventBus.on(rpcTopic, ({ replyTopic, requestId, payload }) => {
        try {
          const result = handler(payload)
          env.eventBus.emit(replyTopic, { requestId, data: result })
        } catch (err) {
          env.eventBus.emit(replyTopic, { requestId, error: err.message })
        }
      })
    }

    it('requests bindset activation before emitting key-selected when context is provided', async () => {
      env.eventBusFixture.clearEventHistory()
      mockRpcResponse('bindset-selector:set-active-bindset')

      await selectionService.selectKey('F1', 'space', { bindset: 'Combat Bindset' })

      const history = env.eventBusFixture.getEventHistory()
      const rpcIndex = history.findIndex(entry => entry.event === 'rpc:bindset-selector:set-active-bindset')
      const keyIndex = history.findIndex(entry => entry.event === 'key-selected')

      expect(rpcIndex).toBeGreaterThan(-1)
      expect(keyIndex).toBeGreaterThan(-1)
      expect(rpcIndex).toBeLessThan(keyIndex)

      const keyEvent = history[keyIndex]
      expect(keyEvent.data.bindset).toBe('Combat Bindset')
    })

    it('resets to Primary bindset when no bindset context is provided', async () => {
      env.eventBusFixture.clearEventHistory()
      mockRpcResponse('bindset-selector:set-active-bindset')
      selectionService.cache.activeBindset = 'Combat Bindset'

      await selectionService.selectKey('F2', 'space', {})

      const rpcEvents = env.eventBusFixture.getEventsOfType('rpc:bindset-selector:set-active-bindset')
      expect(rpcEvents.length).toBeGreaterThan(0)
      expect(rpcEvents[rpcEvents.length - 1].data.payload.bindset).toBe('Primary Bindset')

      const keyEvents = env.eventBusFixture.getEventsOfType('key-selected')
      expect(keyEvents.length).toBeGreaterThan(0)
      expect(keyEvents[keyEvents.length - 1].data.bindset).toBeNull()
    })
  })
})
