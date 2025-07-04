import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createEventBusFixture } from '../../fixtures/core/index.js'
import { respond } from '../../../src/js/core/requestResponse.js'
import CommandService from '../../../src/js/components/services/CommandService.js'
import { createProfileDataFixture } from '../../fixtures/data/profiles.js'

describe('CommandService mutations', () => {
  let busFixture, eventBus, service, profile, detachUpdate

  beforeEach(() => {
    busFixture = createEventBusFixture()
    eventBus = busFixture.eventBus

    const fixture = createProfileDataFixture('basic')
    fixture.addKey('space', 'F1', ['FireAll', 'FirePhasers'])
    profile = { id: 'profile1', ...fixture.profile }

    // Stub DataCoordinator update-profile
    detachUpdate = respond(eventBus, 'data:update-profile', () => ({ success: true }))

    const i18nStub = { t: (k) => k }
    const uiStub = { showToast: vi.fn() }

    service = new CommandService({ eventBus, i18n: i18nStub, ui: uiStub })
    service.init()

    // seed cache and state via DataCoordinator broadcast simulation
    eventBus.emit('profile:switched', { profileId: profile.id, profile, environment: 'space' })
  })

  afterEach(() => {
    detachUpdate()
    busFixture.destroy()
  })

  it('addCommand should append to existing key and emit event', async () => {
    const spy = vi.fn()
    eventBus.on('command-added', spy)

    const newCmd = { command: 'FireTorps' }
    const ok = await service.addCommand('F1', newCmd)
    expect(ok).toBe(true)

    await new Promise(r => setTimeout(r, 0))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ key: 'F1' }))
    // Manually sync cache like DataCoordinator would
    service.updateCacheFromProfile(profile)
    expect(service.cache.keys['F1'].length).toBe(3)
  })

  it('deleteCommand should remove entry and emit command-deleted', async () => {
    // Ensure cache is fresh
    service.updateCacheFromProfile(profile)

    const spy = vi.fn()
    eventBus.on('command-deleted', spy)

    const ok = await service.deleteCommand('F1', 0)
    expect(ok).toBe(true)

    await new Promise(r => setTimeout(r, 0))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ key: 'F1', index: 0 }))
    service.updateCacheFromProfile(profile)
    expect(service.cache.keys['F1'].length).toBe(1)
  })

  it('moveCommand should reorder and emit command-moved', async () => {
    // Ensure cache fresh then add another command to have 3 entries
    service.updateCacheFromProfile(profile)
    await service.addCommand('F1', { command: 'Cmd3' })

    const spy = vi.fn()
    eventBus.on('command-moved', spy)

    const ok = await service.moveCommand('F1', 0, 2)
    expect(ok).toBe(true)

    await new Promise(r => setTimeout(r, 0))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ key: 'F1', fromIndex: 0, toIndex: 2 }))
    service.updateCacheFromProfile(profile)
    const cmds = service.cache.keys['F1']
    const val = cmds[2]
    if (typeof val === 'string') {
      expect(val).toBe('FireAll')
    } else {
      expect(val.command).toBe('FireAll')
    }
  })
}) 