import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('CommandWarnRule', () => {
  let originalCommands

  beforeEach(() => {
    // Preserve existing global COMMANDS map
    originalCommands = window.COMMANDS

    // Setup minimal COMMANDS map with warning
    window.COMMANDS = {
      fire_all: {
        command: 'FireAll',
        name: 'Fire All Weapons',
        warning: 'test_warning_key'
      }
    }

    // Add translation key for the warning
    if (global.i18next && typeof global.i18next.addResource === 'function') {
      global.i18next.addResource('en', 'translation', 'test_warning_key', 'Translated warning')
    }
  })

  it('returns aggregated warning with correct translation key and params', async () => {
    const { default: CommandWarnRule } = await import('../../../src/js/components/services/validators/CommandWarnRule.js')
    const rule = new CommandWarnRule()
    const ctx = { commands: ['FireAll'] }

    const result = rule.run(ctx)

    expect(result).not.toBeNull()
    expect(result.key).toBe('commands_with_internal_warnings')
    expect(result.params).toBeDefined()
    expect(result.params.list).toContain('Fire All Weapons')
    expect(result.params.list).toContain('Translated warning')
  })

  afterEach(() => {
    // Restore original COMMANDS map
    if (originalCommands !== undefined) {
      window.COMMANDS = originalCommands
    } else {
      delete window.COMMANDS
    }
  })
}) 