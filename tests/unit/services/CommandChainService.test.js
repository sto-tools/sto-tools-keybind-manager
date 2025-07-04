import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createEventBusFixture } from '../../fixtures/core/index.js'
import { respond } from '../../../src/js/core/requestResponse.js'
import CommandChainService from '../../../src/js/components/services/CommandChainService.js'

const mockI18n = { t: (k) => k }

function baseProfile() {
  return {
    id: 'profile1',
    builds: {
      space: {
        keys: {
          F1: [{ command: 'FireAll' }]
        }
      },
      ground: { keys: {} }
    },
    aliases: {}
  }
}

describe('CommandChainService', () => {
  let busFixture, eventBus, service

  beforeEach(() => {
    busFixture = createEventBusFixture()
    eventBus = busFixture.eventBus

    // stub request endpoints used internally
    respond(eventBus, 'command:get-for-selected-key', () => [])
    respond(eventBus, 'command:get-empty-state-info', () => ({ title: 'Empty' }))
    respond(eventBus, 'command:find-definition', () => null)
    respond(eventBus, 'command:get-warning', () => null)

    service = new CommandChainService({ i18n: mockI18n, eventBus })
    service.init()

    const profile = baseProfile()
    // seed cache via profile:switched broadcast
    eventBus.emit('profile:switched', { profileId: profile.id, profile, environment: 'space' })
  })

  afterEach(() => {
    busFixture.destroy()
  })

  it('should emit chain-data-changed when key-selected', async () => {
    const handler = vi.fn()
    eventBus.on('chain-data-changed', handler)

    eventBus.emit('key-selected', { key: 'F1' })

    await new Promise(r => setTimeout(r, 0))

    expect(handler).toHaveBeenCalled()
  })

  it.skip('should update environment and clear selection on environment change', async () => {
    // select key first
    eventBus.emit('key-selected', { key: 'F1' })
    await new Promise(r => setTimeout(r, 0))

    expect(service.selectedKey).toBe('F1')
    expect(service.currentEnvironment).toBe('space')

    eventBus.emit('environment:changed', { environment: 'ground' })
    await new Promise(r => setTimeout(r, 0))

    expect(service.currentEnvironment).toBe('ground')
    expect(service.selectedKey).toBe(null)
  })

  it('should emit chain-data-changed after command-added event', async () => {
    const spy = vi.fn()
    eventBus.on('chain-data-changed', spy)

    // select key
    eventBus.emit('key-selected', { key: 'F1' })
    await new Promise(r => setTimeout(r, 0))
    spy.mockReset()

    // simulate command-added from CommandService
    eventBus.emit('command-added', { key: 'F1', command: { command: 'FireAll' } })
    await new Promise(r => setTimeout(r, 0))

    expect(spy).toHaveBeenCalled()
  })
}) 