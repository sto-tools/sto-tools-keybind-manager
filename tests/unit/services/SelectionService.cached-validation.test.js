// Test to verify SelectionService validates cached selections exist before restoring
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBasicTestEnvironment } from '../../fixtures'
import SelectionService from '../../../src/js/components/services/SelectionService.js'

describe('SelectionService Cached Selection Validation', () => {
  let env, selectionService

  beforeEach(async () => {
    env = await createBasicTestEnvironment()
    
    selectionService = new SelectionService({ 
      eventBus: env.eventBus 
    })
    
    // Mock ComponentBase cache with test data
    selectionService.cache = {
      currentProfile: 'test-profile',
      profile: {
        id: 'test-profile',
        selections: {
          space: 'F1',
          ground: 'F2', 
          alias: 'TestAlias'
        },
        builds: {
          space: {
            keys: {
              'F1': ['FireAll'],
              'F3': ['Shield']
            }
          },
          ground: {
            keys: {
              'F2': ['Sprint'],
              'F4': ['Jump']
            }
          }
        }
      },
      builds: {
        space: {
          keys: {
            'F1': ['FireAll'],
            'F3': ['Shield']
          }
        },
        ground: {
          keys: {
            'F2': ['Sprint'],
            'F4': ['Jump']
          }
        }
      },
      keys: {
        'F1': ['FireAll'],
        'F3': ['Shield']
      },
      aliases: {
        'ValidAlias': { commands: 'FireAll', type: 'alias' }
        // Note: TestAlias is missing - it was deleted
      }
    }
    
    await selectionService.init()
  })

  afterEach(() => {
    env?.destroy?.()
  })

  describe('Key Validation', () => {
    it('should validate existing keys correctly', () => {
      expect(selectionService.validateKeyExists('F1', 'space')).toBe(true)
      expect(selectionService.validateKeyExists('F3', 'space')).toBe(true)
      expect(selectionService.validateKeyExists('F2', 'ground')).toBe(true)
      expect(selectionService.validateKeyExists('F4', 'ground')).toBe(true)
    })

    it('should detect non-existing keys correctly', () => {
      expect(selectionService.validateKeyExists('F99', 'space')).toBe(false)
      expect(selectionService.validateKeyExists('F1', 'ground')).toBe(false) // F1 not in ground
      expect(selectionService.validateKeyExists('F2', 'space')).toBe(false) // F2 not in space
    })

    it('should handle null/undefined keys', () => {
      expect(selectionService.validateKeyExists(null)).toBe(false)
      expect(selectionService.validateKeyExists(undefined)).toBe(false)
      expect(selectionService.validateKeyExists('')).toBe(false)
    })
  })

  describe('Alias Validation', () => {
    it('should validate existing aliases correctly', () => {
      expect(selectionService.validateAliasExists('ValidAlias')).toBe(true)
    })

    it('should detect non-existing aliases correctly', () => {
      expect(selectionService.validateAliasExists('TestAlias')).toBe(false) // This was deleted
      expect(selectionService.validateAliasExists('NonExistent')).toBe(false)
    })

    it('should handle null/undefined aliases', () => {
      expect(selectionService.validateAliasExists(null)).toBe(false)
      expect(selectionService.validateAliasExists(undefined)).toBe(false)
      expect(selectionService.validateAliasExists('')).toBe(false)
    })
  })

  describe('Validate and Restore Selection', () => {
    it('should restore valid cached key selection', async () => {
      // Spy on selection methods
      const selectKeySpy = vi.spyOn(selectionService, 'selectKey')
      const autoSelectSpy = vi.spyOn(selectionService, 'autoSelectFirst')
      
      // Test restoring valid key
      await selectionService.validateAndRestoreSelection('space', 'F1')
      
      expect(selectKeySpy).toHaveBeenCalledWith('F1', 'space')
      expect(autoSelectSpy).not.toHaveBeenCalled()
    })

    it('should auto-select when cached key no longer exists', async () => {
      // Spy on selection methods
      const selectKeySpy = vi.spyOn(selectionService, 'selectKey')
      const autoSelectSpy = vi.spyOn(selectionService, 'autoSelectFirst')
      
      // Test restoring invalid key
      await selectionService.validateAndRestoreSelection('space', 'F99')
      
      // Should NOT directly select the invalid key, but SHOULD call autoSelect which then selects first available
      expect(autoSelectSpy).toHaveBeenCalledWith('space')
      expect(selectKeySpy).toHaveBeenCalledWith('F1', 'space') // Auto-selected first available key
      expect(selectionService.cachedSelections.space).toBe('F1') // Cache updated with new selection
    })

    it('should restore valid cached alias selection', async () => {
      // Spy on selection methods
      const selectAliasSpy = vi.spyOn(selectionService, 'selectAlias')
      const autoSelectSpy = vi.spyOn(selectionService, 'autoSelectFirst')
      
      // Test restoring valid alias
      await selectionService.validateAndRestoreSelection('alias', 'ValidAlias')
      
      expect(selectAliasSpy).toHaveBeenCalledWith('ValidAlias')
      expect(autoSelectSpy).not.toHaveBeenCalled()
    })

    it('should auto-select when cached alias no longer exists', async () => {
      // Spy on selection methods
      const selectAliasSpy = vi.spyOn(selectionService, 'selectAlias')
      const autoSelectSpy = vi.spyOn(selectionService, 'autoSelectFirst')
      
      // Test restoring invalid alias (TestAlias was deleted)
      await selectionService.validateAndRestoreSelection('alias', 'TestAlias')
      
      // Should NOT directly select the invalid alias, but SHOULD call autoSelect which then selects first available
      expect(autoSelectSpy).toHaveBeenCalledWith('alias')
      expect(selectAliasSpy).toHaveBeenCalledWith('ValidAlias') // Auto-selected first available alias
      expect(selectionService.cachedSelections.alias).toBe('ValidAlias') // Cache updated with new selection
    })

    it('should auto-select when no cached selection provided', async () => {
      const autoSelectSpy = vi.spyOn(selectionService, 'autoSelectFirst')
      
      // Test with no cached selection
      await selectionService.validateAndRestoreSelection('space', null)
      
      expect(autoSelectSpy).toHaveBeenCalledWith('space')
    })
  })

  describe('Auto-selection using cached data', () => {
    it('should auto-select first available key from cached data', async () => {
      const selectKeySpy = vi.spyOn(selectionService, 'selectKey')
      
      const result = await selectionService.autoSelectFirst('space')
      
      expect(result).toBe('F1') // First key in space (alphabetically first in cached data)
      expect(selectKeySpy).toHaveBeenCalledWith('F1', 'space')
    })

    it('should auto-select first available alias from cached data', async () => {
      const selectAliasSpy = vi.spyOn(selectionService, 'selectAlias')
      
      const result = await selectionService.autoSelectFirst('alias')
      
      expect(result).toBe('ValidAlias') // Only valid alias in cached data
      expect(selectAliasSpy).toHaveBeenCalledWith('ValidAlias')
    })

    it('should return null when no items available for auto-selection', async () => {
      // Clear cached aliases
      selectionService.cache.aliases = {}
      
      const result = await selectionService.autoSelectFirst('alias')
      
      expect(result).toBe(null)
    })
  })

  describe('Environment switching with validation', () => {
    it('should validate cached selection when switching environments', async () => {
      // Set up cached selections (one valid, one invalid)
      selectionService.cachedSelections = {
        space: 'F1',      // Valid
        ground: 'F99',    // Invalid - doesn't exist
        alias: 'TestAlias' // Invalid - was deleted
      }
      
      const validateSpy = vi.spyOn(selectionService, 'validateAndRestoreSelection')
      
      // Switch to ground environment (has invalid cached selection)
      await selectionService.switchEnvironment('ground')
      
      expect(validateSpy).toHaveBeenCalledWith('ground', 'F99')
    })
  })

  describe('Initial state restoration with validation', () => {
    it('should validate restored selections from profile during handleInitialState', async () => {
      const validateSpy = vi.spyOn(selectionService, 'validateAndRestoreSelection')
      
      // Mock profile data with cached selections
      const profileData = {
        id: 'test-profile',
        environment: 'alias',
        selections: {
          space: 'F1',
          ground: 'F99', // Invalid key
          alias: 'TestAlias' // Invalid alias
        }
      }
      
      // Simulate handleInitialState call
      await selectionService.handleInitialState('DataCoordinator', {
        currentProfileData: profileData
      })
      
      // Wait for setTimeout to execute
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(validateSpy).toHaveBeenCalledWith('alias', 'TestAlias')
    })
  })
})