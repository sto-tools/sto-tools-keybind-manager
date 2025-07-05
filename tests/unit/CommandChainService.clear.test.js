import { describe, it, beforeEach, afterEach, expect } from 'vitest'
import { createRealServiceFixture } from '../fixtures'
import DataCoordinator from '../../src/js/components/services/DataCoordinator.js'
import CommandChainService from '../../src/js/components/services/CommandChainService.js'
import { request } from '../../src/js/core/requestResponse.js'

function createProfileWithKey() {
  return {
    name: 'Test Profile',
    description: '',
    currentEnvironment: 'space',
    builds: {
      space: {
        keys: {
          F1: ['Attack']
        }
      },
      ground: { keys: {} }
    },
    aliases: {},
    created: new Date().toISOString(),
    lastModified: new Date().toISOString()
  }
}

describe('CommandChainService request/response – command-chain:clear', () => {
  let fixture, eventBus, dataCoordinator, chainService

  beforeEach(async () => {
    const initialStorageData = {
      sto_keybind_manager: {
        currentProfile: 'testProfile',
        profiles: {
          testProfile: createProfileWithKey()
        },
        settings: {},
        version: '1.0.0',
        lastModified: new Date().toISOString()
      },
      sto_keybind_settings: {}
    }

    fixture = await createRealServiceFixture({ initialStorageData })
    eventBus = fixture.eventBus

    dataCoordinator = new DataCoordinator({ eventBus, storage: fixture.storage })
    await dataCoordinator.init()

    chainService = new CommandChainService({ eventBus })
    await chainService.init()

    // Simulate profile switched broadcast so CommandChainService caches profile
    eventBus.emit('profile:switched', {
      profileId: 'testProfile',
      profile: createProfileWithKey(),
      environment: 'space'
    })

    // Select key to set internal state (not strictly needed for clear but realistic)
    eventBus.emit('key-selected', { key: 'F1', name: 'F1' })
  })

  afterEach(() => {
    fixture.destroy()
  })

  it('clears command chain successfully through request/response', async () => {
    const ok = await request(eventBus, 'command-chain:clear', { key: 'F1' })
    expect(ok).toBe(true)

    // Verify key commands now empty
    const cmds = await request(eventBus, 'data:get-key-commands', { environment: 'space', key: 'F1' })
    expect(cmds).toEqual([])
  })
}) 