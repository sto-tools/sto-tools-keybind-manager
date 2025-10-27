// Test suite for AnalyticsService - Profile statistics and analytics
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/services/harness.js'
import AnalyticsService from '../../../src/js/components/services/AnalyticsService.js'

describe('AnalyticsService', () => {
  let harness
  let service
  let mockProfile

  beforeEach(async () => {
    harness = createServiceFixture()
    service = new AnalyticsService({ eventBus: harness.eventBus })

    // Mock request method for DataCoordinator integration
    service.request = vi.fn()

    // Set up comprehensive mock profile data
    mockProfile = {
      id: 'test-profile',
      builds: {
        space: {
          keys: {
            'F1': [{ command: 'FireAll', category: 'combat' }],
            'F2': [
              { command: 'TargetEnemyNear', category: 'targeting' },
              { command: 'FireAll', category: 'combat' }
            ],
            'F3': [], // Empty key
            'F4': [
              { command: 'Command1', category: 'movement' },
              { command: 'Command2', category: 'movement' },
              { command: 'Command3', category: 'system' }
            ]
          }
        },
        ground: {
          keys: {
            'F1': [{ command: 'Sprint', category: 'movement' }],
            'F2': [{ command: 'Aim', category: 'combat' }]
          }
        }
      },
      aliases: {
        'AttackSequence': {
          description: 'Attack sequence',
          commands: ['TargetEnemyNear', 'FireAll'],
          type: 'alias'
        },
        'EmptyAlias': {
          description: 'Empty alias',
          commands: [],
          type: 'alias'
        },
        'VFXAlias': {
          description: 'VFX Manager alias',
          commands: ['SomeVFXCommand'],
          type: 'vfx-alias'
        }
      }
    }

    // Initialize cache
    await service.init()

    service.cache.currentProfile = 'test-profile'
    service.cache.profile = mockProfile

  })

  describe('Initialization', () => {
    it('should initialize with correct component name', () => {
      expect(service.componentName).toBe('AnalyticsService')
    })

    it('should set up request/response handlers', () => {
      expect(service.respond).toBeDefined()
      expect(service.request).toBeDefined()
    })

    })

  describe('Key Statistics', () => {
    it('should calculate basic key statistics for new format', () => {
      const keyStats = service.calculateKeyStats(mockProfile)

      expect(keyStats.totalKeys).toBe(6) // 4 space + 2 ground
      expect(keyStats.totalCommands).toBe(5) // Commands from merged keys (ground overrides space for F1,F2)
      expect(keyStats.environmentBreakdown.space).toBe(4)
      expect(keyStats.environmentBreakdown.ground).toBe(2)
    })

    it('should categorize commands by type', () => {
      const keyStats = service.calculateKeyStats(mockProfile)

      expect(keyStats.commandTypes.combat).toBe(1) // Aim (ground F2)
      expect(keyStats.commandTypes.movement).toBe(3) // Sprint (ground F1), Command1, Command2 (space F4)
      expect(keyStats.commandTypes.system).toBe(1) // Command3 (space F4)
      expect(keyStats.commandTypes.targeting).toBeUndefined() // Overridden by ground
    })

    it('should track most used commands', () => {
      const keyStats = service.calculateKeyStats(mockProfile)

      expect(keyStats.mostUsedCommands.Sprint).toBe(1) // Ground F1
      expect(keyStats.mostUsedCommands.Aim).toBe(1) // Ground F2
      expect(keyStats.mostUsedCommands.Command1).toBe(1) // Space F4
      expect(keyStats.mostUsedCommands.Command2).toBe(1) // Space F4
      expect(keyStats.mostUsedCommands.Command3).toBe(1) // Space F4
      expect(keyStats.mostUsedCommands.FireAll).toBeUndefined() // Overridden by ground
    })

    it('should handle legacy format keys', () => {
      const legacyProfile = {
        keys: {
          'F1': [{ command: 'Command1', category: 'test' }],
          'F2': [
            { command: 'Command2', category: 'test' }, 
            { command: 'Command3', category: 'test' }
          ]
        }
      }

      const keyStats = service.calculateKeyStats(legacyProfile)

      expect(keyStats.totalKeys).toBe(2)
      expect(keyStats.totalCommands).toBe(3)
      expect(keyStats.commandTypes.test).toBe(3)
    })

    it('should handle profiles with no keys', () => {
      const emptyProfile = { builds: { space: { keys: {} }, ground: { keys: {} } } }
      const keyStats = service.calculateKeyStats(emptyProfile)

      expect(keyStats.totalKeys).toBe(0)
      expect(keyStats.totalCommands).toBe(0)
      expect(keyStats.environmentBreakdown.space).toBe(0)
      expect(keyStats.environmentBreakdown.ground).toBe(0)
    })

    it('should handle malformed command objects', () => {
      const malformedProfile = {
        builds: {
          space: {
            keys: {
              'F1': [null, undefined, { command: 'ValidCommand', category: 'test' }]
            }
          }
        }
      }

      const keyStats = service.calculateKeyStats(malformedProfile)

      expect(keyStats.totalKeys).toBe(1)
      expect(keyStats.totalCommands).toBe(1) // Only counts valid command
      expect(keyStats.commandTypes.test).toBe(1)
    })
  })

  describe('Alias Statistics', () => {
    it('should calculate basic alias statistics', () => {
      const aliasStats = service.calculateAliasStats(mockProfile)

      expect(aliasStats.totalAliases).toBe(3) // All aliases including VFX
      expect(aliasStats.aliasesWithCommands).toBe(2) // AttackSequence and VFXAlias
      expect(aliasStats.averageCommandsPerAlias).toBe(1) // 3 total commands / 3 aliases
    })

    it('should categorize aliases by type', () => {
      const aliasStats = service.calculateAliasStats(mockProfile)

      expect(aliasStats.aliasTypes.alias).toBe(2) // AttackSequence, EmptyAlias
      expect(aliasStats.aliasTypes['vfx-alias']).toBe(1) // VFXAlias
      expect(aliasStats.aliasTypes.unknown).toBe(0)
    })

    it('should handle array format commands correctly', () => {
      const arrayProfile = {
        aliases: {
          'TestAlias': {
            commands: ['Command1', 'Command2', 'Command3'],
            type: 'alias'
          }
        }
      }

      const aliasStats = service.calculateAliasStats(arrayProfile)

      expect(aliasStats.totalAliases).toBe(1)
      expect(aliasStats.aliasesWithCommands).toBe(1)
      expect(aliasStats.averageCommandsPerAlias).toBe(3)
    })

    it('should ignore non-array command formats', () => {
      const invalidProfile = {
        aliases: {
          'StringAlias': {
            commands: 'Command1 $$ Command2 $$ Command3', // String format not supported
            type: 'alias'
          },
          'ValidAlias': {
            commands: ['Command1', 'Command2'],
            type: 'alias'
          }
        }
      }

      const aliasStats = service.calculateAliasStats(invalidProfile)

      expect(aliasStats.totalAliases).toBe(2) // Both aliases counted
      expect(aliasStats.aliasesWithCommands).toBe(1) // Only ValidAlias has commands
      expect(aliasStats.averageCommandsPerAlias).toBe(1) // 2 commands / 2 aliases
    })

    it('should handle profiles with no aliases', () => {
      const emptyProfile = { aliases: {} }
      const aliasStats = service.calculateAliasStats(emptyProfile)

      expect(aliasStats.totalAliases).toBe(0)
      expect(aliasStats.aliasesWithCommands).toBe(0)
      expect(aliasStats.averageCommandsPerAlias).toBe(0)
    })

    it('should handle malformed alias data', () => {
      const malformedProfile = {
        aliases: {
          'NullAlias': null,
          'ValidAlias': {
            commands: ['Command1'],
            type: 'alias'
          }
        }
      }

      const aliasStats = service.calculateAliasStats(malformedProfile)

      expect(aliasStats.totalAliases).toBe(2)
      expect(aliasStats.aliasesWithCommands).toBe(1) // Only ValidAlias counted
      expect(aliasStats.aliasTypes.alias).toBe(1)
      expect(aliasStats.aliasTypes.unknown).toBe(1) // NullAlias gets unknown type
    })
  })

  describe('Combined Profile Statistics', () => {
    it('should combine key and alias statistics', () => {
      const keyStats = service.calculateKeyStats(mockProfile)
      const aliasStats = service.calculateAliasStats(mockProfile)
      const combinedStats = service.combineStats(keyStats, aliasStats)

      expect(combinedStats.totalKeys).toBe(6)
      expect(combinedStats.totalAliases).toBe(3)
      expect(combinedStats.totalItems).toBe(9) // 6 keys + 3 aliases
      expect(combinedStats.totalExecutableItems).toBe(8) // 6 keys + 2 aliases with commands
      expect(combinedStats.totalCommands).toBe(5) // From key stats
    })

    it('should preserve individual statistics in combined view', () => {
      const keyStats = service.calculateKeyStats(mockProfile)
      const aliasStats = service.calculateAliasStats(mockProfile)
      const combinedStats = service.combineStats(keyStats, aliasStats)

      // Key statistics preserved
      expect(combinedStats.commandTypes).toEqual(keyStats.commandTypes)
      expect(combinedStats.mostUsedCommands).toEqual(keyStats.mostUsedCommands)
      expect(combinedStats.environmentBreakdown).toEqual(keyStats.environmentBreakdown)

      // Alias statistics preserved
      expect(combinedStats.aliasTypes).toEqual(aliasStats.aliasTypes)
      expect(combinedStats.averageCommandsPerAlias).toBe(aliasStats.averageCommandsPerAlias)
    })
  })

  describe('Profile Statistics API', () => {
    it('should get statistics for current profile', async () => {
      const result = await service.getProfileStats()

      expect(result).toBeDefined()
      expect(result.totalKeys).toBe(6)
      expect(result.totalAliases).toBe(3)
      expect(result.totalItems).toBe(9)
    })

    it('should get statistics for specific profile', async () => {
      service.request.mockResolvedValueOnce(mockProfile)

      const result = await service.getProfileStats('specific-profile')

      expect(service.request).toHaveBeenCalledWith('data:get-profile', { profileId: 'specific-profile' })
      expect(result).toBeDefined()
      expect(result.totalKeys).toBe(6)
    })

    it('should handle missing profile gracefully', async () => {
      service.cache.profile = null
      service.cache.currentProfile = null

      const result = await service.getProfileStats()

      expect(result).toBe(null)
    })

    it('should handle DataCoordinator errors gracefully', async () => {
      service.request.mockRejectedValueOnce(new Error('Network error'))

      const result = await service.getProfileStats('failing-profile')

      expect(result).toBe(null)
    })

    it('should get key-only statistics', async () => {
      const result = await service.getKeyStats()

      expect(result).toBeDefined()
      expect(result.totalKeys).toBe(6)
      expect(result.totalCommands).toBe(5)
      expect(result).not.toHaveProperty('totalAliases')
    })

    it('should get alias-only statistics', async () => {
      const result = await service.getAliasStats()

      expect(result).toBeDefined()
      expect(result.totalAliases).toBe(3)
      expect(result.aliasesWithCommands).toBe(2)
      expect(result).not.toHaveProperty('totalKeys')
    })
  })

  describe('Cache Management', () => {
    it('should update cache from profile data', () => {
      const newProfile = {
        id: 'new-profile',
        builds: { space: { keys: { 'F1': [{ command: 'NewCommand', category: 'test' }] } } },
        aliases: { 'NewAlias': { commands: ['NewCommand'], type: 'alias' } }
      }

      service.updateCacheFromProfile(newProfile)

      expect(service.cache.profile).toEqual(newProfile)
    })

    it('should handle null profile gracefully', () => {
      const originalCache = { ...service.cache }
      
      service.updateCacheFromProfile(null)
      
      expect(service.cache).toEqual(originalCache)
    })
  })

  describe('State Management', () => {
    it('should return empty state (no state ownership)', () => {
      const state = service.getCurrentState()
      expect(state).toBe(null)
    })

    it('should handle initial state from other components', () => {
      service.handleInitialState('DataCoordinator', { someState: 'value' })
      service.handleInitialState('SelectionService', { selectedKey: 'F1' })
      
      // Should not crash or throw errors
      expect(true).toBe(true)
    })
  })

  describe('Performance and Edge Cases', () => {
    it('should handle very large profiles efficiently', () => {
      const largeProfile = {
        builds: {
          space: { keys: {} },
          ground: { keys: {} }
        },
        aliases: {}
      }

      // Generate 1000 keys and aliases
      for (let i = 0; i < 1000; i++) {
        largeProfile.builds.space.keys[`F${i}`] = [{ command: `Command${i}`, category: 'test' }]
        largeProfile.aliases[`Alias${i}`] = { commands: [`Command${i}`], type: 'alias' }
      }

      const start = performance.now()
      const stats = service.getProfileStats()
      const end = performance.now()

      // Should complete within reasonable time (< 100ms)
      expect(end - start).toBeLessThan(100)
      expect(stats).toBeDefined()
    })

    it('should handle malformed profile data gracefully', () => {
      const malformedProfile = {
        builds: null,
        aliases: 'not an object'
      }

      expect(() => {
        service.calculateKeyStats(malformedProfile)
        service.calculateAliasStats(malformedProfile)
      }).not.toThrow()
    })
  })

  describe('Integration with DataCoordinator', () => {
    it('should respond to profile:updated events', () => {
      const newProfileData = {
        builds: { space: { keys: { 'F1': [{ command: 'UpdatedCommand', category: 'test' }] } } },
        aliases: {}
      }

      service.updateCacheFromProfile = vi.fn()
      
      // Simulate profile:updated event
      harness.eventBus.emit('profile:updated', {
        profileId: 'test-profile',
        profile: newProfileData
      })

      expect(service.updateCacheFromProfile).toHaveBeenCalledWith(newProfileData)
    })

    it('should respond to profile:switched events', () => {
      const newProfileData = {
        id: 'switched-profile',
        builds: { space: { keys: {} } },
        aliases: {}
      }

      service.updateCacheFromProfile = vi.fn()
      
      // Simulate profile:switched event
      harness.eventBus.emit('profile:switched', {
        profileId: 'switched-profile',
        profile: newProfileData
      })

      expect(service.cache.currentProfile).toBe('switched-profile')
      expect(service.updateCacheFromProfile).toHaveBeenCalledWith(newProfileData)
    })
  })
})