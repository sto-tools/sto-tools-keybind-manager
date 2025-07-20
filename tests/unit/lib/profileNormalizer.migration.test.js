// Test suite for Profile Migration System
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { normalizeProfile, needsNormalization } from '../../../src/js/lib/profileNormalizer.js'

describe('Profile Migration System', () => {
  let consoleLogSpy

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  describe('Migration Version Detection', () => {
    it('should detect profiles without migrationVersion as needing migration', () => {
      const profile = {
        name: 'Test Profile',
        aliases: {
          'normalAlias': { commands: ['Command1'], type: 'alias' }
        }
      }
      
      expect(needsNormalization(profile)).toBe(true)
    })

    it('should detect profiles with version 2.0.0 as needing migration', () => {
      const profile = {
        name: 'Test Profile',
        migrationVersion: '2.0.0',
        aliases: {
          'normalAlias': { commands: ['Command1'], type: 'alias' }
        }
      }
      
      expect(needsNormalization(profile)).toBe(true)
    })

    it('should not migrate profiles already on version 2.1.0', () => {
      const profile = {
        name: 'Test Profile',
        migrationVersion: '2.1.0',
        aliases: {
          'normalAlias': { commands: ['Command1'], type: 'alias' }
        }
      }
      
      expect(needsNormalization(profile)).toBe(false)
    })
  })

  describe('VFX Alias Migration (2.0.0 -> 2.1.0)', () => {
    it('should remove VFX aliases with type vfx-alias', () => {
      const profile = {
        name: 'Test Profile',
        migrationVersion: '2.0.0',
        aliases: {
          'normalAlias': { 
            commands: ['Command1'], 
            type: 'alias',
            description: 'Normal alias'
          },
          'vfxAlias1': { 
            commands: ['dynFxSetFXExclusionList effect1,effect2'], 
            type: 'vfx-alias',
            description: 'VFX alias'
          }
        }
      }

      const result = normalizeProfile(profile)

      expect(result.aliases).toHaveProperty('normalAlias')
      expect(result.aliases).not.toHaveProperty('vfxAlias1')
      expect(result.migrationVersion).toBe('2.1.0')
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Migrating from 2.0.0 to 2.1.0')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Removing old VFX alias: vfxAlias1')
      )
    })

    it('should remove VFX aliases with dynFxSetFXExclusionList names', () => {
      const profile = {
        name: 'Test Profile',
        migrationVersion: '2.0.0',
        aliases: {
          'normalAlias': { 
            commands: ['Command1'], 
            type: 'alias'
          },
          'dynFxSetFXExclusionList_Space': { 
            commands: ['dynFxSetFXExclusionList effect1,effect2'], 
            type: 'alias'
          },
          'dynFxSetFXExclusionList_Ground': { 
            commands: ['dynFxSetFXExclusionList effect3'], 
            type: 'alias'
          },
          'dynFxSetFXExclusionList_Combined': { 
            commands: ['dynFxSetFXExclusionList effect1,effect2,effect3'], 
            type: 'alias'
          }
        }
      }

      const result = normalizeProfile(profile)

      expect(result.aliases).toHaveProperty('normalAlias')
      expect(result.aliases).not.toHaveProperty('dynFxSetFXExclusionList_Space')
      expect(result.aliases).not.toHaveProperty('dynFxSetFXExclusionList_Ground')
      expect(result.aliases).not.toHaveProperty('dynFxSetFXExclusionList_Combined')
      expect(result.migrationVersion).toBe('2.1.0')
    })

    it('should preserve other aliases during VFX migration', () => {
      const profile = {
        name: 'Test Profile',
        migrationVersion: '2.0.0',
        aliases: {
          'userAlias1': { 
            commands: ['Command1', 'Command2'], 
            type: 'alias',
            description: 'User created alias'
          },
          'userAlias2': { 
            commands: ['Command3'], 
            type: 'alias'
          },
          'dynFxSetFXExclusionList_Space': { 
            commands: ['dynFxSetFXExclusionList effect1'], 
            type: 'vfx-alias'
          }
        }
      }

      const result = normalizeProfile(profile)

      expect(result.aliases).toHaveProperty('userAlias1')
      expect(result.aliases).toHaveProperty('userAlias2')
      expect(result.aliases.userAlias1.commands).toEqual(['Command1', 'Command2'])
      expect(result.aliases.userAlias2.commands).toEqual(['Command3'])
      expect(result.aliases).not.toHaveProperty('dynFxSetFXExclusionList_Space')
    })

    it('should handle profiles with no aliases gracefully', () => {
      const profile = {
        name: 'Test Profile',
        migrationVersion: '2.0.0',
        builds: {
          space: { keys: { 'F1': ['Command1'] } }
        }
      }

      const result = normalizeProfile(profile)

      expect(result.migrationVersion).toBe('2.1.0')
      expect(result.aliases).toBeUndefined()
    })

    it('should handle profiles with empty aliases object', () => {
      const profile = {
        name: 'Test Profile',
        migrationVersion: '2.0.0',
        aliases: {}
      }

      const result = normalizeProfile(profile)

      expect(result.migrationVersion).toBe('2.1.0')
      expect(result.aliases).toEqual({})
    })
  })

  describe('Migration Path System', () => {
    it('should update migrationVersion even if no changes were made', () => {
      const profile = {
        name: 'Test Profile',
        migrationVersion: '2.0.0',
        aliases: {
          'normalAlias': { commands: ['Command1'], type: 'alias' }
        }
      }

      const result = normalizeProfile(profile)

      expect(result.migrationVersion).toBe('2.1.0')
      expect(result.lastModified).toBeDefined()
    })

    it('should handle profiles without migrationVersion (defaults to 2.0.0)', () => {
      const profile = {
        name: 'Test Profile',
        aliases: {
          'dynFxSetFXExclusionList_Space': { 
            commands: ['dynFxSetFXExclusionList effect1'], 
            type: 'vfx-alias'
          }
        }
      }

      const result = normalizeProfile(profile)

      expect(result.migrationVersion).toBe('2.1.0')
      expect(result.aliases).not.toHaveProperty('dynFxSetFXExclusionList_Space')
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Migrating from 2.0.0 to 2.1.0')
      )
    })
  })

  describe('Legacy Command Normalization', () => {
    it('should still normalize legacy commands alongside migration', () => {
      const profile = {
        name: 'Test Profile',
        migrationVersion: '2.0.0',
        aliases: {
          'legacyAlias': { 
            commands: 'Command1 $$ Command2', // Legacy string format
            type: 'alias'
          },
          'vfxAlias': { 
            commands: ['dynFxSetFXExclusionList effect1'], 
            type: 'vfx-alias'
          }
        }
      }

      const result = normalizeProfile(profile)

      expect(result.aliases.legacyAlias.commands).toEqual(['Command1', 'Command2'])
      expect(result.aliases).not.toHaveProperty('vfxAlias')
      expect(result.migrationVersion).toBe('2.1.0')
    })
  })

  describe('Real-world Migration Scenarios', () => {
    it('should handle a typical user profile with VFX aliases', () => {
      const profile = {
        name: 'My STO Profile',
        description: 'Main character keybinds',
        migrationVersion: '2.0.0',
        builds: {
          space: {
            keys: {
              'F1': ['FireAll'],
              'F2': ['TargetEnemyNear', 'FireAll']
            }
          },
          ground: {
            keys: {
              'F1': ['Sprint'],
              'F2': ['Aim']
            }
          }
        },
        aliases: {
          'AttackSequence': {
            commands: ['TargetEnemyNear', 'FireAll'],
            type: 'alias',
            description: 'Target and attack'
          },
          'dynFxSetFXExclusionList_Space': {
            commands: ['dynFxSetFXExclusionList Plasma_Torpedo_Explosion,Phaser_Beam'],
            type: 'vfx-alias',
            description: 'VFX suppression for space'
          },
          'dynFxSetFXExclusionList_Ground': {
            commands: ['dynFxSetFXExclusionList Explosion_Large'],
            type: 'vfx-alias', 
            description: 'VFX suppression for ground'
          }
        }
      }

      const result = normalizeProfile(profile)

      // VFX aliases should be removed
      expect(result.aliases).not.toHaveProperty('dynFxSetFXExclusionList_Space')
      expect(result.aliases).not.toHaveProperty('dynFxSetFXExclusionList_Ground')
      
      // User aliases should be preserved
      expect(result.aliases).toHaveProperty('AttackSequence')
      expect(result.aliases.AttackSequence.commands).toEqual(['TargetEnemyNear', 'FireAll'])
      
      // Profile should be migrated
      expect(result.migrationVersion).toBe('2.1.0')
      expect(result.lastModified).toBeDefined()
      
      // Migration logs should appear
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Migrating from 2.0.0 to 2.1.0')
      )
    })
  })
})