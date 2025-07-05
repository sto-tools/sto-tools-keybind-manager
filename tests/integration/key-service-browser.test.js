import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createRealServiceFixture } from '../fixtures'
import KeyService from '../../src/js/components/services/KeyService.js'
import KeyBrowserService from '../../src/js/components/services/KeyBrowserService.js'
import { respond } from '../../src/js/core/requestResponse.js'

/** Helper to clone deep */
const deepClone = (obj) => JSON.parse(JSON.stringify(obj))

describe('Integration: KeyService ↔ KeyBrowserService', () => {
  let fixture, eventBus, keyService, keyBrowserService, profile, detachUpdateProfile

  beforeEach(async () => {
    fixture = await createRealServiceFixture()
    eventBus = fixture.eventBus

    // Base profile with two keys
    profile = {
      id: 'testProfile',
      builds: {
        space: {
          keys: {
            F1: [{ command: 'FireAll', id: 'c1' }],
            F2: [{ command: 'Target_Enemy_Near', id: 'c2' }]
          }
        },
        ground: { keys: {} }
      },
      aliases: {}
    }

    // Stub DataCoordinator update-profile handler – mutates in-memory profile and emits broadcast
    detachUpdateProfile = respond(eventBus, 'data:update-profile', async ({ profileId, add, delete: del }) => {
      if (profileId !== profile.id) return { success: false }

      // Handle additions
      if (add?.builds?.space?.keys) {
        const newKeys = add.builds.space.keys
        Object.assign(profile.builds.space.keys, deepClone(newKeys))
      }
      // Handle deletions (array of key names)
      if (del?.builds?.space?.keys) {
        for (const k of del.builds.space.keys) {
          delete profile.builds.space.keys[k]
        }
      }

      // Emit profile:updated broadcast
      eventBus.emit('profile:updated', { profileId: profile.id, profile: deepClone(profile) })
      return { success: true }
    })

    // KeyService needs get-key-name-pattern respond stub
    respond(eventBus, 'data:get-key-name-pattern', () => /^[A-Za-z0-9_]+$/)

    // Instantiate services
    keyService = new KeyService({ eventBus, ui: { showToast: vi.fn() } })
    await keyService.init()
    // seed cache
    keyService.setCurrentProfile(profile.id)
    keyService.updateCacheFromProfile(profile)

    keyBrowserService = new KeyBrowserService({})
    await keyBrowserService.init()

    // seed browser cache via profile:switched
    eventBus.emit('profile:switched', { profileId: profile.id, profile: deepClone(profile), environment: 'space' })
  })

  afterEach(() => {
    detachUpdateProfile && detachUpdateProfile()
    fixture.destroy()
  })

  it('deleteKey should remove key and KeyBrowserService reflects change', async () => {
    const ok = await keyService.deleteKey('F2')
    expect(ok).toBe(true)

    // Wait a tick for profile:updated broadcast handling
    await new Promise(r => setTimeout(r, 0))

    const keys = keyBrowserService.getKeys()
    expect(keys).not.toHaveProperty('F2')
    expect(keys).toHaveProperty('F1')
  })

  it('duplicateKey should create new key and KeyBrowserService reflects change', async () => {
    const ok = await keyService.duplicateKey('F1')
    expect(ok).toBe(true)

    await new Promise(r => setTimeout(r, 0))

    const keys = keyBrowserService.getKeys()
    const duplicatedKeyName = Object.keys(keys).find(k => k.startsWith('F1_copy'))
    expect(duplicatedKeyName).toBeDefined()
    expect(keys).toHaveProperty(duplicatedKeyName)
  })
}) 