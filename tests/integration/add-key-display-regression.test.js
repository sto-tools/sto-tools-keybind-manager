/**
 * Regression test for command chain display bug when adding new keys/aliases
 *
 * BUG: When adding a new key (e.g., F7) while another key (e.g., Space) is selected,
 * CommandChainService unnecessarily re-renders the OLD key's commands, which then
 * overwrites the NEW key's correct empty state.
 *
 * Root Cause: CommandChainService.profile:updated handler (line 59-75) calls
 * refreshCommands() for the currently selected key. When adding F7:
 * 1. key:add updates profile → profile:updated emitted
 * 2. CommandChainService receives profile:updated → refreshCommands() for Space
 * 3. Space's commands fetched & chain-data-changed emitted (10 commands)
 * 4. CommandChainUI renders Space (UNNECESSARY!)
 * 5. key:add auto-selects F7 → selection:select-key
 * 6. F7's commands fetched & chain-data-changed emitted (0 commands)
 * 7. CommandChainUI renders F7 correctly
 * 8. Space's slow async work (parsing, mirroring) completes
 * 9. Space's render completes, overwriting F7's UI (BUG!)
 *
 * Expected: Only F7 should render when F7 is added (Space's commands haven't changed)
 * Actual: Both Space and F7 render, with Space's render potentially winning the race
 */

import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createRealServiceFixture } from '../fixtures'
import CommandChainService from '../../src/js/components/services/CommandChainService.js'
import { respond } from '../../src/js/core/requestResponse.js'

describe('Integration: Add Key/Alias Display Regression', () => {
  let fixture, eventBus, chainService
  let detachGetCommands, currentProfile

  beforeEach(async () => {
    // Profile that will be mutated during tests
    currentProfile = {
      name: 'Default',
      currentEnvironment: 'space',
      builds: {
        space: {
          keys: {
            Space: [
              '+TrayExecByTray 8 0',
              '+TrayExecByTray 8 1',
              '+TrayExecByTray 8 2',
              '+TrayExecByTray 8 3',
              '+TrayExecByTray 8 4'
            ]
          }
        },
        ground: { keys: {} }
      },
      aliases: {}
    }

    fixture = await createRealServiceFixture({
      initialStorageData: {
        profiles: {
          default: currentProfile
        },
        currentProfile: 'default'
      }
    })
    eventBus = fixture.eventBus

    // Stub command:get-for-selected-key to return commands from currentProfile
    detachGetCommands = respond(eventBus, 'command:get-for-selected-key', ({ key, environment }) => {
      const env = environment || 'space'
      const commands = currentProfile.builds?.[env]?.keys?.[key] || []
      return commands
    })

    // Create CommandChainService
    chainService = new CommandChainService({ eventBus })
    await chainService.init()

    // Emit initial profile to populate caches
    eventBus.emit('profile:updated', {
      profileId: 'default',
      profile: {
        name: 'Default',
        currentEnvironment: 'space',
        builds: {
          space: {
            keys: {
              Space: [
                '+TrayExecByTray 8 0',
                '+TrayExecByTray 8 1',
                '+TrayExecByTray 8 2',
                '+TrayExecByTray 8 3',
                '+TrayExecByTray 8 4'
              ]
            }
          },
          ground: { keys: {} }
        },
        aliases: {}
      }
    })

    // Select Space
    eventBus.emit('key-selected', { key: 'Space' })
    await new Promise(resolve => setTimeout(resolve, 10))
  })

  afterEach(() => {
    detachGetCommands?.()
    chainService?.destroy?.()
    fixture?.destroy?.()
  })

  it('FIXED: adding new key does NOT trigger unnecessary render of old key', async () => {
    // Track chain-data-changed emissions
    const chainDataEmissions = []
    eventBus.on('chain-data-changed', ({ commands }) => {
      chainDataEmissions.push({
        commandCount: commands?.length ?? 0,
        timestamp: Date.now()
      })
    })

    // Verify initial state: Space is selected
    expect(chainService.cache.selectedKey).toBe('Space')

    // Add a new key F7 (simulates what happens when user adds a key)
    // This should NOT trigger a render of Space's commands

    // Update profile to add F7
    currentProfile.builds.space.keys.F7 = []

    eventBus.emit('profile:updated', {
      profileId: 'default',
      profile: JSON.parse(JSON.stringify(currentProfile))
    })

    // Wait for any potential async operations
    await new Promise(resolve => setTimeout(resolve, 50))

    console.log('Chain data emissions:', chainDataEmissions)

    // FIXED: No chain-data-changed emission when adding F7
    expect(chainDataEmissions.length).toBe(0)

    // The profile cache is updated, but UI refresh will happen when:
    // - key-selected event fires (when F7 is auto-selected after adding)
    // - User manually selects F7
  })

  it('profile:updated only updates cache, does not trigger UI refresh', async () => {
    // This verifies the fix: profile:updated should ONLY update the cache,
    // not trigger refreshCommands(). UI refreshes are triggered by specific
    // events like key-selected, command-added, etc.

    const chainDataEmissions = []
    eventBus.on('chain-data-changed', ({ commands }) => {
      chainDataEmissions.push({
        commandCount: commands?.length ?? 0
      })
    })

    // Modify Space's commands (currently selected key)
    currentProfile.builds.space.keys.Space = ['+TrayExecByTray 8 0'] // Reduced from 5 to 1

    // Emit profile:updated - this should ONLY update the cache
    eventBus.emit('profile:updated', {
      profileId: 'default',
      profile: JSON.parse(JSON.stringify(currentProfile))
    })

    await new Promise(resolve => setTimeout(resolve, 50))

    // No chain-data-changed emission from profile:updated
    expect(chainDataEmissions.length).toBe(0)

    // The cache is updated internally, but UI refresh doesn't happen automatically.
    // UI refresh happens through explicit events:
    // - When CommandService.editCommand() is called, it emits command-edited
    // - When key selection changes, key-selected event is emitted
    // - When environment changes, environment:changed is emitted
    // These events trigger refreshCommands(), not profile:updated
  })
})
