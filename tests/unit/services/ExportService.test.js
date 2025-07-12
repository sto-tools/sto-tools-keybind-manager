import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import ExportService from '../../../src/js/components/services/ExportService.js'
import { createServiceFixture, createProfileDataFixture } from '../../fixtures/index.js'
import { respond } from '../../../src/js/core/requestResponse.js'
import { vi } from 'vitest'

/**
 * Unit tests – ExportService – verify keybind file generation
 */

// Register a lightweight responder for parser:parse-command-string to avoid timeouts in unit tests
respond(undefined, 'parser:parse-command-string', ({ commandString }) => {
  // Return minimal parse result needed by normalizeToOptimizedString
  return {
    commands: [ { command: commandString } ]
  }
})

describe('ExportService', () => {
  let fixture, service, profile

  beforeEach(() => {
    fixture = createServiceFixture()
    service = new ExportService({ eventBus: fixture.eventBus, storage: fixture.storage })
    service.init && service.init()

    // Register responder for parser on the fixture event bus to avoid timeouts
    respond(fixture.eventBus, 'parser:parse-command-string', ({ commandString }) => ({ commands: [{ command: commandString }] }))

    // Build simple profile data
    const pFix = createProfileDataFixture('basic')
    pFix.addKey('space', 'F1', ['FireAll'])
    profile = { id: 'prof1', name: 'TestProfile', builds: pFix.profile.builds }
  })

  afterEach(() => {
    fixture.destroy()
  })

  it('generateSTOKeybindFile returns header and key lines', async () => {
    const txt = await service.generateSTOKeybindFile(profile, { environment: 'space' })
    expect(txt).toContain('STO Keybind Configuration')
    expect(txt).toMatch(/F1\s+"FireAll"/)
  })

  it('generateKeybindSection outputs empty quote line when no commands', async () => {
    const keys = {
      F4: []
    }

    const section = await service.generateKeybindSection(keys, { environment: 'space', profile: {} })
    expect(section).toContain('F4 ""')
  })

  describe('bind-to-alias mode – empty chains', () => {
    beforeEach(() => {
      // Mock preferences so bind-to-alias mode is enabled
      service.request = vi.fn().mockImplementation(async (action, payload) => {
        if (action === 'preferences:get-setting' && payload.key === 'bindToAliasMode') {
          return true
        }
        return false
      })
    })

    it('generates key line binding to alias even when command list empty', async () => {
      const keys = {
        F4: []
      }

      const section = await service.generateKeybindSection(keys, { environment: 'space', profile: {} })
      expect(section).toContain('F4 "space_f4"')
    })

    it('generates empty alias definition for empty chain', async () => {
      const profileData = {
        name: 'EmptyAliasTest',
        builds: {
          space: {
            keys: {
              F4: []
            }
          }
        }
      }

      const aliasFile = await service.generateAliasFile(profileData)
      expect(aliasFile).toMatch(/alias space_f4 <&\s*&>/)
    })
  })

  describe('primary bindset loader alias generation', () => {
    it('should generate primary bindset loader that resets custom bindset keys to primary', async () => {
      // Enable bindsets feature
      service.request = vi.fn().mockImplementation(async (action, payload) => {
        if (action === 'preferences:get-setting' && payload.key === 'bindsetsEnabled') {
          return true
        }
        if (action === 'preferences:get-setting' && payload.key === 'bindToAliasMode') {
          return true
        }
        return false
      })

      const profile = {
        name: 'Test Profile',
        builds: {
          space: {
            keys: {
              'F1': ['primary_command_f1'],
              'F2': ['primary_command_f2'],
              'F3': ['primary_command_f3']
            }
          }
        },
        bindsets: {
          'Custom Bindset': {
            space: {
              keys: {
                'F1': ['custom_command_f1'], // Overrides primary
                'F4': ['custom_command_f4']  // Only in custom
              }
            }
          }
        }
      }

      const result = await service.generateAliasFile(profile)

      // Should contain primary bindset loader alias
      expect(result).toContain('alias bindset_enable_space_primary_bindset')
      
      // Primary bindset loader should:
      // 1. Bind F1 to primary alias (resets from custom - F1 exists in both primary and custom)
      // 2. Skip F2 and F3 (they only exist in primary, never overridden, no need to reset)
      // 3. Unbind F4 (exists only in custom, not in primary)
      expect(result).toContain('bind F1 "space_f1"')
      expect(result).not.toContain('bind F2 "space_f2"') // F2 only in primary, not overridden
      expect(result).not.toContain('bind F3 "space_f3"') // F3 only in primary, not overridden
      expect(result).toContain('unbind F4')

      // Should also contain custom bindset loader
      expect(result).toContain('alias bindset_enable_space_custom_bindset')
      
      // Custom bindset loader should only bind keys that exist in the custom bindset
      expect(result).toContain('bind F1 "space_custom_bindset_f1"')
      expect(result).toContain('bind F4 "space_custom_bindset_f4"')
    })

    it('should generate primary bindset loader for ground environment', async () => {
      // Enable bindsets feature
      service.request = vi.fn().mockImplementation(async (action, payload) => {
        if (action === 'preferences:get-setting' && payload.key === 'bindsetsEnabled') {
          return true
        }
        if (action === 'preferences:get-setting' && payload.key === 'bindToAliasMode') {
          return true
        }
        return false
      })

      const profile = {
        name: 'Test Profile',
        builds: {
          ground: {
            keys: {
              'Q': ['primary_ground_q'],
              'W': ['primary_ground_w']
            }
          }
        },
        bindsets: {
          'Ground Combat': {
            ground: {
              keys: {
                'Q': ['combat_ground_q'],
                'E': ['combat_ground_e']
              }
            }
          }
        }
      }

      const result = await service.generateAliasFile(profile)

      // Should contain ground primary bindset loader alias
      expect(result).toContain('alias bindset_enable_ground_primary_bindset')
      
      // Primary bindset loader should:
      // 1. Bind Q to primary alias (resets from custom - Q exists in both primary and custom)
      // 2. Skip W (only exists in primary, never overridden, no need to reset)
      // 3. Unbind E (exists only in custom, not in primary)
      expect(result).toContain('bind Q "ground_q"')
      expect(result).not.toContain('bind W "ground_w"') // W only in primary, not overridden
      expect(result).toContain('unbind E')

      // Should also contain custom bindset loader
      expect(result).toContain('alias bindset_enable_ground_ground_combat')
    })
  })
}) 