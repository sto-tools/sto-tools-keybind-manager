import { describe, it, expect, beforeEach } from 'vitest'

import { parameterCommands } from '../../src/js/features/parameterCommands.js'

// Minimal stubs for globals referenced inside parameterCommands
// eslint-disable-next-line no-undef
global.stoUI = { showToast: () => {} }
// eslint-disable-next-line no-undef
global.i18next = { t: (key) => key }

/**
 * Regression test for bug where editing a command that was added via the
 * Command Library caused a TypeError in the `tray` builder because
 * `profile.keys[this.selectedKey]` was undefined. The fix ensures the
 * builder falls back to `commandLibraryService.selectedKey`.
 */
describe('parameterCommands.buildParameterizedCommand (editing via command library)', () => {
  /**
   * Provide a minimal stub for the Command Library service that exposes the
   * `selectedKey` used by the parameterCommands module.
   */
  const commandLibraryServiceStub = {
    selectedKey: 'K',
  }

  /**
   * Fake profile containing a single TrayExec command under key "K". This is
   * returned by `parameterCommands.getCurrentProfile` inside the builder.
   */
  let profile

  /**
   * A minimal command definition object – only the properties accessed by the
   * builder are required for this test.
   */
  const commandDef = {
    icon: '',
    name: 'Execute Tray Slot',
  }

  beforeEach(() => {
    profile = {
      keys: {
        K: [
          {
            command: '+TrayExecByTray 0 0',
            type: 'tray',
          },
        ],
      },
    }

    // Set up parameterCommands state to simulate an edit action originating
    // from the Command Library UI.
    parameterCommands.currentParameterCommand = {
      isEditing: true,
      editIndex: 0,
    }

    // `selectedKey` is intentionally undefined to replicate the original bug
    parameterCommands.selectedKey = undefined
    parameterCommands.commandLibraryService = commandLibraryServiceStub

    // Stub the profile getter used inside the builder
    parameterCommands.getCurrentProfile = () => profile
  })

  it('does not throw when `selectedKey` is provided via commandLibraryService', () => {
    const builderFn = () => {
      parameterCommands.buildParameterizedCommand(
        'tray',
        'custom_tray',
        commandDef,
        { tray: 0, slot: 0 }
      )
    }

    // The test passes if no error is thrown
    expect(builderFn).not.toThrow()
  })
}) 