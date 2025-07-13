// Test to verify SelectionService filters out VFX Manager system aliases during auto-selection
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBasicTestEnvironment } from '../../fixtures'
import SelectionService from '../../../src/js/components/services/SelectionService.js'

describe('SelectionService VFX Alias Filtering', () => {
  let env, selectionService

  beforeEach(async () => {
    env = await createBasicTestEnvironment()
    
    selectionService = new SelectionService({ 
      eventBus: env.eventBus 
    })
    
    // Mock ComponentBase cache with test data including VFX aliases
    selectionService.cache = {
      currentProfile: 'test-profile',
      profile: {
        id: 'test-profile',
        selections: {}
      },
      aliases: {
        'UserAlias1': { commands: 'FireAll', type: 'alias', description: 'User created alias' },
        'UserAlias2': { commands: 'Shield', type: 'alias', description: 'Another user alias' },
        'dynFxSetFXExclusionList_Space': { 
          commands: 'some_vfx_command', 
          type: 'vfx-alias', 
          description: 'VFX Manager system alias' 
        },
        'dynFxSetFXExclusionList_Ground': { 
          commands: 'another_vfx_command', 
          type: 'vfx-alias', 
          description: 'Another VFX Manager system alias' 
        },
        'UserAlias3': { commands: 'TargetNearest', type: 'alias', description: 'Third user alias' }
      }
    }
    
    await selectionService.init()
  })

  afterEach(() => {
    env?.destroy?.()
  })

  describe('VFX Alias Filtering in Auto-Selection', () => {
    it('should only auto-select user-created aliases, not VFX Manager system aliases', async () => {
      const selectAliasSpy = vi.spyOn(selectionService, 'selectAlias')
      
      const result = await selectionService.autoSelectFirst('alias')
      
      // Should select one of the user aliases, not a VFX system alias
      expect(result).toBeTruthy()
      expect(result).not.toBe('dynFxSetFXExclusionList_Space')
      expect(result).not.toBe('dynFxSetFXExclusionList_Ground')
      expect(['UserAlias1', 'UserAlias2', 'UserAlias3']).toContain(result)
      
      expect(selectAliasSpy).toHaveBeenCalledWith(result)
    })

    it('should validate only user-created aliases, not VFX system aliases', () => {
      // User aliases should validate as existing
      expect(selectionService.validateAliasExists('UserAlias1')).toBe(true)
      expect(selectionService.validateAliasExists('UserAlias2')).toBe(true)
      expect(selectionService.validateAliasExists('UserAlias3')).toBe(true)
      
      // VFX system aliases should not validate (filtered out)
      expect(selectionService.validateAliasExists('dynFxSetFXExclusionList_Space')).toBe(false)
      expect(selectionService.validateAliasExists('dynFxSetFXExclusionList_Ground')).toBe(false)
    })

    it('should not restore cached VFX system alias selections', async () => {
      const selectAliasSpy = vi.spyOn(selectionService, 'selectAlias')
      const autoSelectSpy = vi.spyOn(selectionService, 'autoSelectFirst')
      
      // Try to restore a cached VFX system alias
      await selectionService.validateAndRestoreSelection('alias', 'dynFxSetFXExclusionList_Space')
      
      // Should NOT directly select the VFX alias, should auto-select instead
      expect(selectAliasSpy).not.toHaveBeenCalledWith('dynFxSetFXExclusionList_Space')
      expect(autoSelectSpy).toHaveBeenCalledWith('alias')
      
      // Auto-selection should pick a valid user alias
      const selectedAlias = selectAliasSpy.mock.calls[0]?.[0]
      expect(selectedAlias).toBeTruthy()
      expect(['UserAlias1', 'UserAlias2', 'UserAlias3']).toContain(selectedAlias)
    })

    it('should return null when only VFX aliases exist', async () => {
      // Remove all user aliases, leaving only VFX aliases
      selectionService.cache.aliases = {
        'dynFxSetFXExclusionList_Space': { 
          commands: 'some_vfx_command', 
          type: 'vfx-alias' 
        },
        'dynFxSetFXExclusionList_Ground': { 
          commands: 'another_vfx_command', 
          type: 'vfx-alias' 
        }
      }
      
      const result = await selectionService.autoSelectFirst('alias')
      
      // Should return null since no user aliases are available
      expect(result).toBe(null)
    })

    it('should correctly filter aliases in the same way as AliasBrowserService', () => {
      // Test the same filtering logic used by AliasBrowserService
      const aliases = selectionService.cache.aliases || {}
      const userAliases = Object.fromEntries(
        Object.entries(aliases).filter(([key, value]) => value.type !== 'vfx-alias')
      )
      
      // Should only contain user aliases
      expect(Object.keys(userAliases)).toEqual(['UserAlias1', 'UserAlias2', 'UserAlias3'])
      expect(userAliases).not.toHaveProperty('dynFxSetFXExclusionList_Space')
      expect(userAliases).not.toHaveProperty('dynFxSetFXExclusionList_Ground')
    })
  })

  describe('Edge Cases', () => {
    it('should handle missing type property gracefully', async () => {
      // Add an alias without type property (should be treated as user alias)
      selectionService.cache.aliases.LegacyAlias = {
        commands: 'FireAll',
        description: 'Legacy alias without type'
        // No type property
      }
      
      // Should still be considered valid (not VFX)
      expect(selectionService.validateAliasExists('LegacyAlias')).toBe(true)
      
      const result = await selectionService.autoSelectFirst('alias')
      // Should be able to select legacy alias or any user alias
      expect(result).toBeTruthy()
    })

    it('should handle null or undefined alias cache', () => {
      selectionService.cache.aliases = null
      
      expect(selectionService.validateAliasExists('UserAlias1')).toBe(false)
      
      selectionService.cache.aliases = undefined
      
      expect(selectionService.validateAliasExists('UserAlias1')).toBe(false)
    })
  })
})