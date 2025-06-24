import { describe, it, expect, beforeEach, vi } from 'vitest'

// Import parameterCommands mixin
import { parameterCommands } from '../../src/js/features/parameterCommands.js'

// Stub i18next so parameterCommands can resolve translations in a test
beforeEach(() => {
  global.i18next = {
    t: (key) => key,
  }
})

describe('parameterCommands alias support', () => {
  it('should resolve command definition for alias commands', () => {
    const ctx = {}
    const command = {
      command: 'TestAlias',
      type: 'alias',
      parameters: { alias_name: 'TestAlias' },
    }

    const commandDef = parameterCommands.findCommandDefinition.call(ctx, command)
    expect(commandDef).toBeTruthy()
    expect(commandDef.customizable).toBe(true)
    expect(commandDef.commandId).toBe('alias')
  })

  it('should build updated alias command via builder', () => {
    const ctx = {
      generateCommandId: () => 'testId',
    }

    const params = { alias_name: 'MyNewAlias' }
    const commandDef = {
      commandId: 'alias',
      icon: '📝',
      name: 'Alias',
      parameters: {
        alias_name: { type: 'text' },
      },
    }

    const built = parameterCommands.buildParameterizedCommand.call(
      ctx,
      'alias',
      'alias',
      commandDef,
      params,
    )

    expect(built).toBeTruthy()
    expect(built.command).toBe('MyNewAlias')
    expect(built.text).toContain('Alias')
    expect(built.type).toBe('alias')
  })
}) 