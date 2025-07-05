import { describe, it, beforeEach, afterEach, expect } from 'vitest'
import { createRealServiceFixture } from '../fixtures'
import DataCoordinator from '../../src/js/components/services/DataCoordinator.js'
import { request } from '../../src/js/core/requestResponse.js'

// Helper profile data for tests
function createProfileWithKey() {
  return {
    name: 'Test Profile',
    description: 'Profile for regression test',
    currentEnvironment: 'space',
    builds: {
      space: {
        keys: {
          F1: ['FireAll']
        }
      },
      ground: {
        keys: {}
      }
    },
    aliases: {},
    created: '2021-01-01T00:00:00Z',
    lastModified: '2021-01-01T00:00:00Z'
  }
}

describe('Regression: Import from Key or Alias — requestResponse timeouts', () => {
  let fixture, eventBus, dataCoordinator

  beforeEach(async () => {
    // Seed storage with a profile containing one key/command
    const initialStorageData = {
      sto_keybind_manager: {
        currentProfile: 'testProfile',
        profiles: {
          testProfile: createProfileWithKey()
        },
        settings: {},
        version: '1.0.0',
        lastModified: '2021-01-01T00:00:00Z'
      },
      sto_keybind_settings: {}
    }

    fixture = await createRealServiceFixture({ initialStorageData })
    eventBus = fixture.eventBus

    // Spin up DataCoordinator so it can register respond handlers
    dataCoordinator = new DataCoordinator({ eventBus, storage: fixture.storage })
    await dataCoordinator.init()
  })

  afterEach(() => {
    fixture.destroy()
  })

  it('responds to data:get-keys without timing out', async () => {
    const keys = await request(eventBus, 'data:get-keys', { environment: 'space' })
    expect(keys).toHaveProperty('F1')
  })

  it('responds to data:get-key-commands without timing out', async () => {
    const commands = await request(eventBus, 'data:get-key-commands', { environment: 'space', key: 'F1' })
    expect(commands).toEqual(['FireAll'])
  })
}) 