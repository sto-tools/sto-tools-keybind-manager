import { describe, it, expect, beforeEach } from 'vitest'
import { createServiceFixture } from '../fixtures/services/index.js'
import PreferencesService from '../../src/js/components/services/PreferencesService.js'
import ExportService from '../../src/js/components/services/ExportService.js'
import { respond } from '../../src/js/core/requestResponse.js'
import DataCoordinator from '../../src/js/components/services/DataCoordinator.js'
import CommandChainService from '../../src/js/components/services/CommandChainService.js'

describe('Bind-to-Alias Mode Integration', () => {
  let fixture
  let dataCoordinator
  let commandChainService

  beforeEach(async () => {
    const serviceFixture = createServiceFixture()
    
    // Mock parser service to avoid timeouts during command optimization
    respond(serviceFixture.eventBus, 'parser:parse-command-string', ({ commandString }) => ({
      commands: [{ command: commandString }]
    }))
    
    // Create PreferencesService with bind-to-alias mode setting
    const preferencesService = new PreferencesService({
      storage: serviceFixture.storage,
      eventBus: serviceFixture.eventBus
    })
    preferencesService.defaultSettings.bindToAliasMode = false
    preferencesService.init()
    
    // Create ExportService
    const exportService = new ExportService({
      storage: serviceFixture.storage,
      eventBus: serviceFixture.eventBus
    })
    exportService.onInit()
    
    dataCoordinator = new DataCoordinator({
      storage: serviceFixture.storage,
      eventBus: serviceFixture.eventBus
    })
    dataCoordinator.updateProfile = vi.fn().mockResolvedValue({ success: true, profile: {} })
    
    commandChainService = new CommandChainService({
      storage: serviceFixture.storage,
      eventBus: serviceFixture.eventBus
    })
    commandChainService.request = vi.fn().mockResolvedValue({ success: true, profile: {} })
    
    fixture = {
      ...serviceFixture,
      preferencesService,
      exportService,
      dataCoordinator,
      commandChainService
    }
  })

  describe('Preference Management', () => {
    it('should store and retrieve bind-to-alias mode setting', async () => {
      const { preferencesService } = fixture

      // Default should be false
      expect(preferencesService.getSetting('bindToAliasMode')).toBe(false)

      // Should be able to set to true
      preferencesService.setSetting('bindToAliasMode', true)
      expect(preferencesService.getSetting('bindToAliasMode')).toBe(true)

      // Should persist across save/load
      preferencesService.saveSettings()
      preferencesService.loadSettings()
      expect(preferencesService.getSetting('bindToAliasMode')).toBe(true)
    })
  })

  describe('Alias Name Generation', () => {
    it('should generate valid alias names for keybinds', async () => {
      const { generateBindToAliasName } = await import('../../src/js/lib/aliasNameValidator.js')

      // Test various key formats
      const testCases = [
        { env: 'space', key: 'Q', expected: 'sto_kb_space_q' },
        { env: 'ground', key: 'F1', expected: 'sto_kb_ground_f1' },
        { env: 'space', key: 'Ctrl+A', expected: 'sto_kb_space_ctrl_a' },
        { env: 'space', key: 'Shift+Space', expected: 'sto_kb_space_shift_space' },
        { env: 'ground', key: 'Alt+F4', expected: 'sto_kb_ground_alt_f4' },
        { env: 'space', key: '1', expected: 'sto_kb_space_k1' }, // Numeric keys get 'k' prefix
        { env: 'space', key: 'NumPad1', expected: 'sto_kb_space_numpad1' },
        { env: 'space', key: 'Mouse4', expected: 'sto_kb_space_mouse4' },
        { env: 'ground', key: 'Control+[', expected: 'sto_kb_ground_control_leftbracket' }, // Special characters
        { env: 'space', key: 'Shift+]', expected: 'sto_kb_space_shift_rightbracket' },
        { env: 'space', key: 'Alt+=', expected: 'sto_kb_space_alt_equals' },
      ]

      testCases.forEach(({ env, key, expected }) => {
        const result = generateBindToAliasName(env, key)
        expect(result).toBe(expected)
      })
    })

    it('should handle invalid key names gracefully', async () => {
      const { generateBindToAliasName } = await import('../../src/js/lib/aliasNameValidator.js')

      // Test edge cases
      expect(generateBindToAliasName('space', '')).toBe(null)
      expect(generateBindToAliasName('space', '   ')).toBe(null)
      expect(generateBindToAliasName('space', '!!!')).toBe('sto_kb_space_exclamationexclamationexclamation') // Special characters converted to names
    })
  })

  describe('Export Generation', () => {
    it('should generate normal keybind export when bind-to-alias mode is disabled', async () => {
      const { preferencesService, exportService, dataService } = fixture

      // Ensure bind-to-alias mode is disabled
      preferencesService.setSetting('bindToAliasMode', false)

      // Create test profile with keybinds
      const profile = {
        name: 'Test Profile',
        builds: {
          space: {
            keys: {
              'Q': [{ command: 'FireAll' }],
              'F1': [
                { command: '+STOTrayExecByTray 0 0' },
                { command: '+power_exec Distribute_Shields' }
              ]
            }
          }
        }
      }

      const result = await exportService.generateKeybindSection(profile.builds.space.keys, {
        environment: 'space',
        profile
      })

      expect(result).toContain('Q "FireAll"')
      expect(result).toContain('F1 "+STOTrayExecByTray 0 0 $$ +power_exec Distribute_Shields"')
      expect(result).not.toContain('alias sto_kb_space_q')
      expect(result).not.toContain('alias sto_kb_space_f1')
    })

    it('should generate bind-to-alias export when mode is enabled', async () => {
      const { preferencesService, exportService } = fixture

      // Enable bind-to-alias mode
      preferencesService.setSetting('bindToAliasMode', true)

      // Create test profile with keybinds
      const profile = {
        name: 'Test Profile',
        builds: {
          space: {
            keys: {
              'Q': [{ command: 'FireAll' }],
              'F1': [
                { command: '+STOTrayExecByTray 0 0' },
                { command: '+power_exec Distribute_Shields' }
              ]
            }
          }
        }
      }

      const keybindResult = await exportService.generateKeybindSection(profile.builds.space.keys, {
        environment: 'space',
        profile
      })

      // Keybind file should only contain keybind lines that call the aliases
      expect(keybindResult).toContain('Q "sto_kb_space_q"')
      expect(keybindResult).toContain('F1 "sto_kb_space_f1"')
      expect(keybindResult).toContain('Keybind lines that call generated aliases')
      expect(keybindResult).toContain('(Alias definitions are in the alias file)')
      
      // Should NOT contain alias definitions in keybind file
      expect(keybindResult).not.toContain('alias sto_kb_space_q "FireAll"')
      expect(keybindResult).not.toContain('alias sto_kb_space_f1')

      // Alias file should contain the alias definitions
      const aliasResult = await exportService.generateAliasFile(profile)
      expect(aliasResult).toContain('alias sto_kb_space_q <& FireAll &>')
      expect(aliasResult).toContain('alias sto_kb_space_f1 <& +STOTrayExecByTray 0 0 $$ +power_exec Distribute_Shields &>')
    })

    it('should handle different environments correctly in bind-to-alias mode', async () => {
      const { preferencesService, exportService } = fixture

      preferencesService.setSetting('bindToAliasMode', true)

      const profile = {
        name: 'Test Profile',
        builds: {
          ground: {
            keys: {
              'Q': [{ command: 'target_enemy_near' }],
              'R': [{ command: '+forward 1' }]
            }
          }
        }
      }

      const keybindResult = await exportService.generateKeybindSection(profile.builds.ground.keys, {
        environment: 'ground',
        profile
      })

      // Keybind file should only contain calls to aliases
      expect(keybindResult).toContain('Q "sto_kb_ground_q"')
      expect(keybindResult).toContain('R "sto_kb_ground_r"')
      
      // Alias file should contain the alias definitions
      const aliasResult = await exportService.generateAliasFile(profile)
      expect(aliasResult).toContain('alias sto_kb_ground_q <& target_enemy_near &>')
      expect(aliasResult).toContain('alias sto_kb_ground_r <& +forward 1 &>')
    })

    it('should handle empty keybind chains in bind-to-alias mode', async () => {
      const { preferencesService, exportService } = fixture

      preferencesService.setSetting('bindToAliasMode', true)

      const profile = {
        name: 'Test Profile',
        builds: {
          space: {
            keys: {
              'Q': [],
              'F1': [{ command: 'FireAll' }]
            }
          }
        }
      }

      const keybindResult = await exportService.generateKeybindSection(profile.builds.space.keys, {
        environment: 'space',
        profile
      })

      // Keybind file should only contain keybinds for non-empty chains
      expect(keybindResult).to.toContain('Q "sto_kb_space_q"') // Empty chain
      expect(keybindResult).toContain('F1 "sto_kb_space_f1"') // Non-empty chain
      
      // Alias file should only contain aliases for non-empty chains
      const aliasResult = await exportService.generateAliasFile(profile)
      expect(aliasResult).to.toContain('alias sto_kb_space_q <&  &>') // Empty chain
      expect(aliasResult).toContain('alias sto_kb_space_f1 <& FireAll &>') // Non-empty chain
    })

    it('should handle stabilization in bind-to-alias mode', async () => {
      const { preferencesService, exportService } = fixture

      preferencesService.setSetting('bindToAliasMode', true)

      const profile = {
        name: 'Test Profile',
        builds: {
          space: {
            keys: {
              'Q': [
                { command: 'FireAll' },
                { command: '+power_exec Distribute_Shields' }
              ]
            }
          }
        },
        keybindMetadata: {
          space: {
            'Q': { stabilizeExecutionOrder: true }
          }
        }
      }

      const keybindResult = await exportService.generateKeybindSection(profile.builds.space.keys, {
        environment: 'space',
        profile
      })

      // Keybind file should call the alias
      expect(keybindResult).toContain('Q "sto_kb_space_q"')
      
      // Alias file should contain mirrored commands
      const aliasResult = await exportService.generateAliasFile(profile)
      // Check for the actual mirrored pattern (commands + reverse of first n-1)
      // Original: [FireAll, +power_exec Distribute_Shields]
      // Mirrored: [FireAll, +power_exec Distribute_Shields, FireAll] (reverse of first 1)
      expect(aliasResult).toContain('alias sto_kb_space_q <& FireAll $$ +power_exec Distribute_Shields $$ FireAll &>')
    })

    it('should properly disable stabilization for bindset keys', async () => {
      // Create a custom bindset with a stabilized key
      let profileData = {
        id: 'test_profile',
        name: 'Test Profile',
        currentEnvironment: 'space',
        builds: {
          space: {
            'F1': ['command1', 'command2']
          }
        },
        bindsets: {
          'Custom Bindset': {
            space: {
              'F1': ['command1', 'command2']
            }
          }
        },
        bindsetMetadata: {
          'Custom Bindset': {
            space: {
              'F1': { stabilizeExecutionOrder: true }
            }
          }
        }
      }

      // Mock the request to return updated profile data based on the modify payload
      commandChainService.request = vi.fn().mockImplementation(async (action, payload) => {
        if (action === 'data:update-profile' && payload.modify) {
          // Deep merge the modify payload into the profile data
          if (payload.modify.bindsetMetadata) {
            const updatedBindsetMetadata = { ...profileData.bindsetMetadata }
            for (const [bindsetName, bindsetData] of Object.entries(payload.modify.bindsetMetadata)) {
              if (!updatedBindsetMetadata[bindsetName]) {
                updatedBindsetMetadata[bindsetName] = {}
              }
              for (const [environment, envData] of Object.entries(bindsetData)) {
                if (!updatedBindsetMetadata[bindsetName][environment]) {
                  updatedBindsetMetadata[bindsetName][environment] = {}
                }
                updatedBindsetMetadata[bindsetName][environment] = {
                  ...updatedBindsetMetadata[bindsetName][environment],
                  ...envData
                }
              }
            }
            profileData = {
              ...profileData,
              bindsetMetadata: updatedBindsetMetadata
            }
          }
          return { success: true, profile: profileData }
        }
        return { success: true, profile: profileData }
      })

      // Initialize services with the profile
      await dataCoordinator.updateProfile(profileData)
      commandChainService.updateCacheFromProfile(profileData)
      commandChainService.currentProfile = 'test_profile'
      commandChainService.currentEnvironment = 'space'

      // Verify initial state - should be stabilized
      expect(commandChainService.isStabilized('F1', 'Custom Bindset')).toBe(true)

      // Disable stabilization
      const result = await commandChainService.setStabilize('F1', false, 'Custom Bindset')
      expect(result.success).toBe(true)

      // Verify the request was made with stabilizeExecutionOrder: false (not deleted)
      const requestCalls = commandChainService.request.mock.calls
      const disableCall = requestCalls[requestCalls.length - 1]
      const disablePayload = disableCall[1].modify

      expect(disablePayload).toEqual({
        bindsetMetadata: {
          'Custom Bindset': {
            space: {
              'F1': { stabilizeExecutionOrder: false }
            }
          }
        }
      })

      // Verify stabilization is now disabled
      expect(commandChainService.isStabilized('F1', 'Custom Bindset')).toBe(false)

      // Re-enable stabilization to ensure it still works
      const enableResult = await commandChainService.setStabilize('F1', true, 'Custom Bindset')
      expect(enableResult.success).toBe(true)
      
      // Verify the enable request payload
      const enableCall = requestCalls[requestCalls.length - 1]
      const enablePayload = enableCall[1].modify
      
      expect(enablePayload).toEqual({
        bindsetMetadata: {
          'Custom Bindset': {
            space: {
              'F1': { stabilizeExecutionOrder: true }
            }
          }
        }
      })
      
      expect(commandChainService.isStabilized('F1', 'Custom Bindset')).toBe(true)
    })
  })

  describe('Mode Switching', () => {
    it('should handle switching bind-to-alias mode on and off', async () => {
      const { preferencesService, exportService } = fixture

      const profile = {
        name: 'Test Profile',
        builds: {
          space: {
            keys: {
              'Q': [{ command: 'FireAll' }]
            }
          }
        }
      }

      // Test with mode disabled
      preferencesService.setSetting('bindToAliasMode', false)
      const normalResult = await exportService.generateKeybindSection(profile.builds.space.keys, {
        environment: 'space',
        profile
      })
      expect(normalResult).toContain('Q "FireAll"')
      expect(normalResult).not.toContain('alias sto_kb_space_q')

      // Test with mode enabled
      preferencesService.setSetting('bindToAliasMode', true)
      const aliasKeybindResult = await exportService.generateKeybindSection(profile.builds.space.keys, {
        environment: 'space',
        profile
      })
      expect(aliasKeybindResult).toContain('Q "sto_kb_space_q"')
      expect(aliasKeybindResult).not.toContain('alias sto_kb_space_q "FireAll"') // Aliases go to alias file
      
      const aliasFileResult = await exportService.generateAliasFile(profile)
      expect(aliasFileResult).toContain('alias sto_kb_space_q <& FireAll &>')

      // Test switching back to disabled
      preferencesService.setSetting('bindToAliasMode', false)
      const backToNormalResult = await exportService.generateKeybindSection(profile.builds.space.keys, {
        environment: 'space',
        profile
      })
      expect(backToNormalResult).toContain('Q "FireAll"')
      expect(backToNormalResult).not.toContain('Q "sto_kb_space_q"')
    })
  })
}) 