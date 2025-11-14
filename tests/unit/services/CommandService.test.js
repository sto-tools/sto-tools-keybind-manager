import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import { respond } from '../../../src/js/core/requestResponse.js'
import CommandService from '../../../src/js/components/services/CommandService.js'
import { createProfileDataFixture } from '../../fixtures/data/profiles.js'

describe('CommandService mutations', () => {
  let fixture, busFixture, eventBus, service, profile, detachUpdate

  beforeEach(() => {
    fixture = createServiceFixture()
    busFixture = fixture.eventBusFixture
    eventBus = fixture.eventBus

    const profileFixture = createProfileDataFixture('basic')
    profileFixture.addKey('space', 'F1', ['FireAll', 'FirePhasers'])
    profile = { id: 'profile1', ...profileFixture.profile }

    // Mock DataCoordinator update-profile to actually update the profile object
    detachUpdate = respond(eventBus, 'data:update-profile', ({ profileId, add, modify, delete: del }) => {
      // Apply the actual updates to the profile object like DataCoordinator would
      if (add) {
        if (add.builds) {
          Object.entries(add.builds).forEach(([env, envData]) => {
            if (!profile.builds[env]) profile.builds[env] = { keys: {} }
            if (envData.keys) {
              Object.assign(profile.builds[env].keys, envData.keys)
            }
          })
        }
        if (add.aliases) {
          Object.assign(profile.aliases, add.aliases)
        }
      }
      
      if (modify) {
        if (modify.builds) {
          Object.entries(modify.builds).forEach(([env, envData]) => {
            if (!profile.builds[env]) profile.builds[env] = { keys: {} }
            if (envData.keys) {
              Object.assign(profile.builds[env].keys, envData.keys)
            }
          })
        }
        if (modify.aliases) {
          Object.assign(profile.aliases, modify.aliases)
        }
      }
      
      if (del) {
        if (del.builds) {
          Object.entries(del.builds).forEach(([env, envData]) => {
            if (profile.builds[env] && envData.keys) {
              envData.keys.forEach(key => {
                delete profile.builds[env].keys[key]
              })
            }
          })
        }
        if (del.aliases) {
          del.aliases.forEach(aliasName => {
            delete profile.aliases[aliasName]
          })
        }
      }
      
      return { success: true }
    })

    const i18nStub = { t: (k) => k }
    const uiStub = { showToast: vi.fn() }

    service = new CommandService({ eventBus, i18n: i18nStub, ui: uiStub })
    service.init()

    // seed cache and state via DataCoordinator broadcast simulation
    eventBus.emit('profile:switched', { profileId: profile.id, profile, environment: 'space' })
  })

  afterEach(() => {
    detachUpdate()
    fixture.destroy()
  })

  it('addCommand should append to existing key and emit event', async () => {
    const spy = vi.fn()
    eventBus.on('command-added', spy)

    const newCmd = { command: 'FireTorps' }
    const ok = await service.addCommand('F1', newCmd)
    expect(ok).toBe(true)

    await new Promise(r => setTimeout(r, 0))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ key: 'F1' }))
    // Simulate DataCoordinator profile update like ComponentBase would handle
    eventBus.emit('profile:switched', { profileId: profile.id, profile, environment: 'space' })
    expect(service.cache.keys['F1'].length).toBe(3)
  })

  it('deleteCommand should remove entry and emit command-deleted', async () => {
    // Ensure cache is fresh
    eventBus.emit('profile:switched', { profileId: profile.id, profile, environment: 'space' })

    const spy = vi.fn()
    eventBus.on('command-deleted', spy)

    const ok = await service.deleteCommand('F1', 0)
    expect(ok).toBe(true)

    await new Promise(r => setTimeout(r, 0))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ key: 'F1', index: 0 }))
    eventBus.emit('profile:switched', { profileId: profile.id, profile, environment: 'space' })
    expect(service.cache.keys['F1'].length).toBe(1)
  })

  it('moveCommand should reorder and emit command-moved', async () => {
    // Ensure cache fresh then add another command to have 3 entries
    eventBus.emit('profile:switched', { profileId: profile.id, profile, environment: 'space' })
    await service.addCommand('F1', { command: 'Cmd3' })

    const spy = vi.fn()
    eventBus.on('command-moved', spy)

    const ok = await service.moveCommand('F1', 0, 2)
    expect(ok).toBe(true)

    await new Promise(r => setTimeout(r, 0))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ key: 'F1', fromIndex: 0, toIndex: 2 }))
    eventBus.emit('profile:switched', { profileId: profile.id, profile, environment: 'space' })
    const cmds = service.cache.keys['F1']
    const val = cmds[2]
    if (typeof val === 'string') {
      expect(val).toBe('FireAll')
    } else {
      expect(val.command).toBe('FireAll')
    }
  })
}) 