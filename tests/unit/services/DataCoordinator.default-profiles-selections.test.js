import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import DataCoordinator from '../../../src/js/components/services/DataCoordinator.js'

describe('DataCoordinator default profiles - selections propagation', () => {
  let fixture
  let eventBus
  let storage
  let dataCoordinator

  beforeEach(() => {
    // Seed storage as first-run with no profiles
    fixture = createServiceFixture({
      initialStorageData: {
        sto_keybind_manager: {
          currentProfile: null,
          profiles: {},
          settings: {}
        },
        sto_keybind_settings: {}
      }
    })
    eventBus = fixture.eventBus
    storage = fixture.storage
    dataCoordinator = new DataCoordinator({ eventBus, storage })
  })

  afterEach(() => {
    fixture.destroy()
  })

  it('copies selections from defaultProfiles into created profile', async () => {
    const defaultProfilesData = {
      default: {
        name: 'Default',
        description: 'Default keybind configuration',
        currentEnvironment: 'space',
        builds: {
          space: { keys: { F1: ['+TrayExecByTray 9 0'] } },
          ground: { keys: { F1: ['+TrayExecByTray 6 0'] } }
        },
        aliases: { toggle_combatlog: { commands: ['combatlog'] } },
        selections: { space: 'F1', ground: 'F1', alias: 'toggle_combatlog' }
      }
    }

    await dataCoordinator.createDefaultProfilesFromData(defaultProfilesData)

    // Verify state contains selections copied over
    const created = dataCoordinator.state.profiles['default']
    expect(created).toBeDefined()
    expect(created.selections).toEqual({ space: 'F1', ground: 'F1', alias: 'toggle_combatlog' })

    // Also verify persistence happened with selections present
    const persisted = storage.getAllData()
    expect(persisted.profiles['default']).toBeDefined()
    expect(persisted.profiles['default'].selections).toEqual({ space: 'F1', ground: 'F1', alias: 'toggle_combatlog' })
  })
})


