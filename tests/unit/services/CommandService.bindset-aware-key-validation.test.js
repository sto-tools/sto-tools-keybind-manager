/**
 * CommandService Bindset-Aware Key Validation Tests
 *
 * Tests for the fix of bug js-bindset-command-chain-empty-state
 * where CommandService.getEmptyStateInfo() only checked primary bindset
 * for key existence, causing incorrect empty state messages for keys
 * that exist only in non-primary bindsets.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/services/harness.js'

describe('CommandService Bindset-Aware Key Validation', () => {
  let harness = null
  let commandService = null

  beforeEach(async () => {
    // Create test harness with proper eventBus and storage
    harness = createServiceFixture()

    // Mock i18n
    const mockI18n = {
      t: vi.fn((key, params) => {
        const translations = {
          'select_a_key_to_edit': 'Select a key to edit',
          'select_a_key_to_see_the_generated_command': 'Select a key to see the generated command',
          'no_key_selected': 'No key selected',
          'select_key_from_left_panel': 'Select key from left panel',
          'command_chain': 'Command Chain',
          'chain_for_key': '{{chainType}} for {{key}}',
          'no_commands': 'No commands',
          'click_add_command_to_start_building_your_command_chain': 'Click Add command to start building your command chain for',
          'space': 'Space',
          'ground': 'Ground'
        }
        let text = translations[key] || key
        if (params) {
          Object.keys(params).forEach(param => {
            text = text.replace(`{{${param}}}`, params[param])
          })
        }
        return text
      })
    }

    // Import and instantiate CommandService
    const CommandService = (await import('../../../src/js/components/services/CommandService.js')).default
    commandService = new CommandService({
      storage: harness.storage,
      eventBus: harness.eventBus,
      i18n: mockI18n,
      profileService: null,
      modalManager: null
    })

    // Mock request method to prevent actual requests
    commandService.request = vi.fn()

    // Set up cache with test data
    commandService.cache = {
      currentEnvironment: 'space',
      currentProfile: 'test-profile',
      selectedKey: 'F1',
      selectedAlias: null,
      keys: {
        // Primary bindset keys
        'F1': ['PowerLevel 1'],
        'F2': ['PowerLevel 2']
      },
      aliases: {},
      activeBindset: null, // Initially no active bindset
      profile: {
        bindsets: {
          'Custom Bindset': {
            space: {
              keys: {
                'F3': ['Custom Power'], // Key only in bindset
                'F1': ['Bindset Override'] // Key also in primary
              }
            }
          }
        }
      }
    }
  })

  afterEach(() => {
    if (commandService) {
      commandService.onDestroy()
    }
    if (harness) {
      harness.destroy()
    }
  })

  describe('validateKeyExistsInCurrentContext', () => {
    it('should return true for keys that exist in primary bindset', () => {
      // Test key that exists in primary bindset
      const exists = commandService.validateKeyExistsInCurrentContext('F1')
      expect(exists).toBe(true)
    })

    it('should return false for keys that do not exist anywhere', () => {
      // Test key that doesn't exist
      const exists = commandService.validateKeyExistsInCurrentContext('NonExistent')
      expect(exists).toBe(false)
    })

    it('should return true for keys that exist in active bindset when no active bindset is set', () => {
      // No active bindset, should only check primary
      commandService.cache.activeBindset = null
      const existsInPrimary = commandService.validateKeyExistsInCurrentContext('F1')
      const existsInBindsetOnly = commandService.validateKeyExistsInCurrentContext('F3')

      expect(existsInPrimary).toBe(true) // F1 is in primary
      expect(existsInBindsetOnly).toBe(false) // F3 is only in bindset, but no active bindset
    })

    it('should return true for keys that exist in active non-primary bindset', () => {
      // Set active bindset
      commandService.cache.activeBindset = 'Custom Bindset'

      // Test key that exists only in bindset
      const existsInBindsetOnly = commandService.validateKeyExistsInCurrentContext('F3')
      expect(existsInBindsetOnly).toBe(true)

      // Test key that exists in both primary and bindset
      const existsInBoth = commandService.validateKeyExistsInCurrentContext('F1')
      expect(existsInBoth).toBe(true)
    })

    it('should return true for keys that exist in primary bindset even when active bindset is set', () => {
      // Set active bindset
      commandService.cache.activeBindset = 'Custom Bindset'

      // Test key that exists in primary but not in active bindset
      // According to the analysis, keys are valid if they exist in either primary OR active bindset
      const existsInPrimaryOnly = commandService.validateKeyExistsInCurrentContext('F2')
      expect(existsInPrimaryOnly).toBe(true)
    })

    it('should return false for empty or null key names', () => {
      expect(commandService.validateKeyExistsInCurrentContext('')).toBe(false)
      expect(commandService.validateKeyExistsInCurrentContext(null)).toBe(false)
      expect(commandService.validateKeyExistsInCurrentContext(undefined)).toBe(false)
    })
  })

  describe('getEmptyStateInfo bindset-aware validation', () => {
    it('should return key info for keys in primary bindset when no active bindset', async () => {
      commandService.cache.activeBindset = null
      commandService.cache.selectedKey = 'F1'

      // Mock getCommandsForSelectedKey to return empty commands
      commandService.getCommandsForSelectedKey = () => []
      commandService.getCommandChainPreview = async () => 'F1 ""'

      const emptyStateInfo = await commandService.getEmptyStateInfo()

      // Should not be treated as empty selection since F1 exists in primary
      expect(emptyStateInfo.title).toContain('Command Chain for F1')
      expect(emptyStateInfo.emptyTitle).toBe('No commands')
    })

    it('should return key info for keys in active bindset', async () => {
      commandService.cache.activeBindset = 'Custom Bindset'
      commandService.cache.selectedKey = 'F3' // Key only exists in bindset

      // Mock getCommandsForSelectedKey to return empty commands
      commandService.getCommandsForSelectedKey = () => []
      commandService.getCommandChainPreview = async () => 'F3 ""'

      const emptyStateInfo = await commandService.getEmptyStateInfo()

      // Should not be treated as empty selection since F3 exists in active bindset
      expect(emptyStateInfo.title).toContain('Command Chain for F3')
      expect(emptyStateInfo.emptyTitle).toBe('No commands')
    })

    it('should return empty selection message for keys not in primary or active bindset', async () => {
      commandService.cache.activeBindset = 'Custom Bindset'
      commandService.cache.selectedKey = 'NonExistent' // Key doesn't exist anywhere

      const emptyStateInfo = await commandService.getEmptyStateInfo()

      // Should be treated as empty selection
      expect(emptyStateInfo.title).toBe('Select a key to edit')
      expect(emptyStateInfo.emptyTitle).toBe('No key selected')
    })

    it('should return key info for keys in primary bindset even when active bindset is set', async () => {
      commandService.cache.activeBindset = 'Custom Bindset'
      commandService.cache.selectedKey = 'F2' // Key exists in primary but not in active bindset

      // Mock the command chain methods
      commandService.getCommandsForSelectedKey = () => []
      commandService.getCommandChainPreview = async () => 'F2 ""'

      const emptyStateInfo = await commandService.getEmptyStateInfo()

      // According to the analysis, keys are valid if they exist in either primary OR active bindset
      // So F2 should still show as valid even though it's not in the active bindset
      expect(emptyStateInfo.title).toContain('Command Chain for F2')
      expect(emptyStateInfo.emptyTitle).toBe('No commands')
    })
  })

  describe('Regression tests for js-bindset-command-chain-empty-state', () => {
    it('should not show "Select a key to edit" for keys that exist in non-primary bindsets (regression test)', async () => {
      // This is the main bug scenario: key exists only in non-primary bindset
      // and should NOT show "Select a key to edit"
      commandService.cache.activeBindset = 'Custom Bindset'
      commandService.cache.selectedKey = 'F3' // F3 only exists in Custom Bindset

      // Mock the command chain methods
      commandService.getCommandsForSelectedKey = () => []
      commandService.getCommandChainPreview = async () => 'F3 ""'

      const emptyStateInfo = await commandService.getEmptyStateInfo()

      // This is the critical assertion - before the fix, this would return "Select a key to edit"
      expect(emptyStateInfo.title).not.toBe('Select a key to edit')
      expect(emptyStateInfo.title).toContain('Command Chain for F3')
      expect(emptyStateInfo.emptyTitle).toBe('No commands') // Shows key exists but has no commands
    })

    it('should preserve existing behavior for primary bindset keys', async () => {
      // Verify the fix doesn't break existing functionality
      commandService.cache.activeBindset = null
      commandService.cache.selectedKey = 'F1' // F1 exists in primary bindset

      commandService.getCommandsForSelectedKey = () => []
      commandService.getCommandChainPreview = async () => 'F1 ""'

      const emptyStateInfo = await commandService.getEmptyStateInfo()

      // Should work exactly as before
      expect(emptyStateInfo.title).toContain('Command Chain for F1')
      expect(emptyStateInfo.emptyTitle).toBe('No commands')
    })
  })
})