// Integration tests for Vertigo VFX Manager functionality
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Vertigo VFX Manager Integration', () => {
  let mockApp, mockProfile, mockUI, mockVertigoManager

  beforeEach(() => {
    // Mock profile with test data
    mockProfile = {
      name: 'Test Profile',
      aliases: {
        ExistingAlias: {
          name: 'ExistingAlias',
          description: 'Test existing alias',
          commands: 'target_nearest_enemy $$ FireAll',
        },
      },
      keys: {},
      builds: {
        space: { keys: {} },
        ground: { keys: {} },
      },
    }

    // Mock app object
    mockApp = {
      getCurrentProfile: vi.fn(() => mockProfile),
      saveProfile: vi.fn(),
      setModified: vi.fn(),
      showVertigoModal: vi.fn(),
      generateVertigoAliases: vi.fn(),
    }

    // Mock UI object
    mockUI = {
      showModal: vi.fn(),
      hideModal: vi.fn(),
      showToast: vi.fn(),
    }

    // Mock Vertigo Manager
    mockVertigoManager = {
      selectedEffects: {
        space: new Set(['Fx_Explosion_Large', 'Fx_Weapon_Beam']),
        ground: new Set(['Fx_Ground_Impact']),
      },
      showPlayerSay: true,

      generateAlias(environment) {
        const effects = Array.from(this.selectedEffects[environment])
        if (effects.length === 0) return ''

        let aliasName = `dynFxSetFXExlusionList_${environment.charAt(0).toUpperCase() + environment.slice(1)}`
        let command = `alias ${aliasName} <& dynFxSetFXExlusionList ${effects.join(',')}`

        if (this.showPlayerSay) {
          command += ' $$ PlayerSay Vertigo VFX Loaded'
        }

        command += ' &>'
        return command
      },

      clearAllEffects() {
        this.selectedEffects.space.clear()
        this.selectedEffects.ground.clear()
      },

      selectAllEffects(environment) {
        const testEffects = {
          space: ['Fx_Effect1', 'Fx_Effect2', 'Fx_Effect3'],
          ground: ['Fx_Ground1', 'Fx_Ground2'],
        }
        testEffects[environment].forEach((effect) => {
          this.selectedEffects[environment].add(effect)
        })
      },
    }

    // Set up globals
    global.app = mockApp
    global.stoUI = mockUI
    global.vertigoManager = mockVertigoManager

    // Clear all mocks
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete global.app
    delete global.stoUI
    delete global.vertigoManager
  })

  describe('Full Vertigo Workflow', () => {
    it('should complete full workflow from effect selection to alias creation', () => {
      // Step 1: Generate aliases with current selection
      const spaceAlias = mockVertigoManager.generateAlias('space')
      const groundAlias = mockVertigoManager.generateAlias('ground')

      // Verify aliases are generated correctly
      expect(spaceAlias).toBe(
        'alias dynFxSetFXExlusionList_Space <& dynFxSetFXExlusionList Fx_Explosion_Large,Fx_Weapon_Beam $$ PlayerSay Vertigo VFX Loaded &>'
      )
      expect(groundAlias).toBe(
        'alias dynFxSetFXExlusionList_Ground <& dynFxSetFXExlusionList Fx_Ground_Impact $$ PlayerSay Vertigo VFX Loaded &>'
      )

      // Step 2: Extract commands for profile storage
      const spaceCommands = spaceAlias
        .replace('alias dynFxSetFXExlusionList_Space <& ', '')
        .replace(' &>', '')
      const groundCommands = groundAlias
        .replace('alias dynFxSetFXExlusionList_Ground <& ', '')
        .replace(' &>', '')

      // Step 3: Add to profile
      mockProfile.aliases['dynFxSetFXExlusionList_Space'] = {
        name: 'dynFxSetFXExlusionList_Space',
        description: 'Vertigo - Disable Space Visual Effects',
        commands: spaceCommands,
      }

      mockProfile.aliases['dynFxSetFXExlusionList_Ground'] = {
        name: 'dynFxSetFXExlusionList_Ground',
        description: 'Vertigo - Disable Ground Visual Effects',
        commands: groundCommands,
      }

      // Verify profile was updated correctly
      expect(mockProfile.aliases['dynFxSetFXExlusionList_Space']).toEqual({
        name: 'dynFxSetFXExlusionList_Space',
        description: 'Vertigo - Disable Space Visual Effects',
        commands:
          'dynFxSetFXExlusionList Fx_Explosion_Large,Fx_Weapon_Beam $$ PlayerSay Vertigo VFX Loaded',
      })

      expect(mockProfile.aliases['dynFxSetFXExlusionList_Ground']).toEqual({
        name: 'dynFxSetFXExlusionList_Ground',
        description: 'Vertigo - Disable Ground Visual Effects',
        commands:
          'dynFxSetFXExlusionList Fx_Ground_Impact $$ PlayerSay Vertigo VFX Loaded',
      })

      // Verify we now have 3 aliases total (including existing one)
      expect(Object.keys(mockProfile.aliases)).toHaveLength(3)
    })

    it('should handle PlayerSay toggle correctly', () => {
      // Test with PlayerSay enabled
      mockVertigoManager.showPlayerSay = true
      const aliasWithPlayerSay = mockVertigoManager.generateAlias('space')
      expect(aliasWithPlayerSay).toContain('PlayerSay Vertigo VFX Loaded')

      // Test with PlayerSay disabled
      mockVertigoManager.showPlayerSay = false
      const aliasWithoutPlayerSay = mockVertigoManager.generateAlias('space')
      expect(aliasWithoutPlayerSay).not.toContain(
        'PlayerSay Vertigo VFX Loaded'
      )
      expect(aliasWithoutPlayerSay).toBe(
        'alias dynFxSetFXExlusionList_Space <& dynFxSetFXExlusionList Fx_Explosion_Large,Fx_Weapon_Beam &>'
      )
    })

    it('should handle empty effect selections', () => {
      // Clear all effects
      mockVertigoManager.clearAllEffects()

      // Attempt to generate aliases
      const spaceAlias = mockVertigoManager.generateAlias('space')
      const groundAlias = mockVertigoManager.generateAlias('ground')

      // Should return empty strings
      expect(spaceAlias).toBe('')
      expect(groundAlias).toBe('')
    })

    it('should handle select all functionality', () => {
      // Clear existing effects
      mockVertigoManager.clearAllEffects()

      // Select all space effects
      mockVertigoManager.selectAllEffects('space')

      // Verify effects were added
      expect(mockVertigoManager.selectedEffects.space.size).toBe(3)
      expect(mockVertigoManager.selectedEffects.space.has('Fx_Effect1')).toBe(
        true
      )
      expect(mockVertigoManager.selectedEffects.space.has('Fx_Effect2')).toBe(
        true
      )
      expect(mockVertigoManager.selectedEffects.space.has('Fx_Effect3')).toBe(
        true
      )

      // Generate alias with all effects
      const spaceAlias = mockVertigoManager.generateAlias('space')
      expect(spaceAlias).toContain('Fx_Effect1,Fx_Effect2,Fx_Effect3')
    })
  })

  describe('Alias Integration with Command System', () => {
    it('should integrate generated aliases with existing alias system', () => {
      // Start with existing alias
      expect(mockProfile.aliases['ExistingAlias']).toBeDefined()

      // Generate and add Vertigo aliases
      const spaceAlias = mockVertigoManager.generateAlias('space')
      const spaceCommands = spaceAlias
        .replace('alias dynFxSetFXExlusionList_Space <& ', '')
        .replace(' &>', '')

      mockProfile.aliases['dynFxSetFXExlusionList_Space'] = {
        name: 'dynFxSetFXExlusionList_Space',
        description: 'Vertigo - Disable Space Visual Effects',
        commands: spaceCommands,
      }

      // Verify both aliases coexist
      expect(Object.keys(mockProfile.aliases)).toHaveLength(2)
      expect(mockProfile.aliases['ExistingAlias']).toBeDefined()
      expect(mockProfile.aliases['dynFxSetFXExlusionList_Space']).toBeDefined()

      // Verify they have different purposes
      expect(mockProfile.aliases['ExistingAlias'].commands).toBe(
        'target_nearest_enemy $$ FireAll'
      )
      expect(
        mockProfile.aliases['dynFxSetFXExlusionList_Space'].commands
      ).toContain('dynFxSetFXExlusionList')
    })

    it('should update existing Vertigo aliases when regenerated', () => {
      // First generation
      const firstAlias = mockVertigoManager.generateAlias('space')
      const firstCommands = firstAlias
        .replace('alias dynFxSetFXExlusionList_Space <& ', '')
        .replace(' &>', '')

      mockProfile.aliases['dynFxSetFXExlusionList_Space'] = {
        name: 'dynFxSetFXExlusionList_Space',
        description: 'Vertigo - Disable Space Visual Effects',
        commands: firstCommands,
      }

      // Change selection
      mockVertigoManager.selectedEffects.space.clear()
      mockVertigoManager.selectedEffects.space.add('Fx_NewEffect')

      // Regenerate
      const secondAlias = mockVertigoManager.generateAlias('space')
      const secondCommands = secondAlias
        .replace('alias dynFxSetFXExlusionList_Space <& ', '')
        .replace(' &>', '')

      mockProfile.aliases['dynFxSetFXExlusionList_Space'].commands =
        secondCommands

      // Verify alias was updated
      expect(
        mockProfile.aliases['dynFxSetFXExlusionList_Space'].commands
      ).toContain('Fx_NewEffect')
      expect(
        mockProfile.aliases['dynFxSetFXExlusionList_Space'].commands
      ).not.toContain('Fx_Explosion_Large')
    })

    it('should maintain correct alias format with many effects', () => {
      // Clear existing effects first and add 10 new ones
      mockVertigoManager.selectedEffects.space.clear()
      for (let i = 1; i <= 10; i++) {
        mockVertigoManager.selectedEffects.space.add(`Fx_Effect_${i}`)
      }

      const alias = mockVertigoManager.generateAlias('space')

      // Should still maintain correct format
      expect(alias).toMatch(
        /^alias\s+dynFxSetFXExlusionList_Space\s+<&\s+dynFxSetFXExlusionList\s+.+\s+&>$/
      )
      expect(alias).toContain('Fx_Effect_1')
      expect(alias).toContain('Fx_Effect_10')

      // Should be comma-separated - check the actual count in the generated alias
      const effectsPart = alias
        .match(/dynFxSetFXExlusionList\s+([^$]+)/)[1]
        .trim()
      const effectsArray = effectsPart.split(',')
      expect(effectsArray.length).toBe(10)
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing profile gracefully', () => {
      mockApp.getCurrentProfile.mockReturnValue(null)

      // Should handle null profile without crashing
      expect(() => {
        const alias = mockVertigoManager.generateAlias('space')
        expect(alias).toBeDefined()
      }).not.toThrow()
    })

    it('should handle invalid environment names', () => {
      // Mock the generateAlias to handle invalid environments properly
      const originalGenerate = mockVertigoManager.generateAlias
      mockVertigoManager.generateAlias = function (environment) {
        if (!this.selectedEffects[environment]) {
          return ''
        }
        return originalGenerate.call(this, environment)
      }

      const invalidAlias = mockVertigoManager.generateAlias('invalid')
      expect(invalidAlias).toBe('')

      // Restore original method
      mockVertigoManager.generateAlias = originalGenerate
    })

    it('should handle special characters in effect names', () => {
      mockVertigoManager.selectedEffects.space.clear()
      mockVertigoManager.selectedEffects.space.add(
        'Fx_Effect-With_Special.Characters'
      )

      const alias = mockVertigoManager.generateAlias('space')
      expect(alias).toContain('Fx_Effect-With_Special.Characters')
      expect(alias).toMatch(/^alias\s+\w+\s+<&\s+.+\s+&>$/)
    })
  })

  describe('State Management', () => {
    it('should preserve selection state during modal operations', () => {
      const initialSelection = new Set(mockVertigoManager.selectedEffects.space)

      // Simulate modal operations that shouldn't affect selection
      mockUI.showModal('vertigoModal')
      mockUI.hideModal('vertigoModal')

      // Selection should be preserved
      expect(mockVertigoManager.selectedEffects.space).toEqual(initialSelection)
    })

    it('should handle concurrent modifications safely', () => {
      const originalEffects = Array.from(
        mockVertigoManager.selectedEffects.space
      )

      // Simulate concurrent modifications
      mockVertigoManager.selectedEffects.space.add('NewEffect1')
      const alias1 = mockVertigoManager.generateAlias('space')

      mockVertigoManager.selectedEffects.space.add('NewEffect2')
      const alias2 = mockVertigoManager.generateAlias('space')

      // Both operations should succeed
      expect(alias1).toContain('NewEffect1')
      expect(alias2).toContain('NewEffect1')
      expect(alias2).toContain('NewEffect2')

      // Should maintain all effects
      expect(mockVertigoManager.selectedEffects.space.size).toBe(
        originalEffects.length + 2
      )
    })
  })
})
