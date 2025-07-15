import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
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
  let fixture, busFixture, eventBus, service

  beforeEach(() => {
    fixture = createServiceFixture()
    busFixture = fixture.eventBusFixture
    eventBus = fixture.eventBus

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
    fixture.destroy()
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

describe('CommandChainService – bind-to-alias endpoints', () => {
  let fixture, eventBus, service

  beforeEach(() => {
    fixture = createServiceFixture()
    eventBus = fixture.eventBus

    // Mock preferences service endpoint
    respond(eventBus, 'preferences:get', ({ key }) => {
      if (key === 'bindToAliasMode') return false
      return null
    })

    service = new CommandChainService({ i18n: mockI18n, eventBus })
    service.init()
  })

  afterEach(() => {
    fixture.destroy()
  })

  describe('command-chain:get-bind-to-alias-mode', () => {
    it('should return current bind-to-alias mode', () => {
      const result = service.getBindToAliasMode()
      expect(result).toBe(false) // Default state
    })

    it('should update when preferences change', () => {
      // Simulate preferences change
      eventBus.emit('preferences:changed', { key: 'bindToAliasMode', value: true })
      
      const result = service.getBindToAliasMode()
      expect(result).toBe(true)
    })
  })

  describe('command-chain:generate-alias-name', () => {
    it('should generate alias name for key in environment', async () => {
      const result = await service.generateBindToAliasName('space', 'F1', null)
      expect(result).toBe('sto_kb_space_f1')
    })

    it('should generate alias name for key with bindset', async () => {
      const result = await service.generateBindToAliasName('space', 'F1', 'MyBindset')
      // The actual implementation generates: environment_bindsetname_keyname
      expect(result).toBe('sto_kb_space_mybindset_f1')
    })

    it('should handle ground environment', async () => {
      const result = await service.generateBindToAliasName('ground', 'F2', null)
      expect(result).toBe('sto_kb_ground_f2')
    })

    it('should return null for invalid input', async () => {
      const result = await service.generateBindToAliasName('space', '', null)
      expect(result).toBe(null)
    })
  })

  describe('command-chain:generate-alias-preview', () => {
    it('should generate alias preview for commands', () => {
      const commands = ['FireAll', 'FirePhasers']
      const result = service.generateAliasPreview('MyAlias', commands)
      expect(result).toBe('alias MyAlias <& FireAll $$ FirePhasers &>')
    })

    it('should handle empty commands', () => {
      const result = service.generateAliasPreview('MyAlias', [])
      expect(result).toBe('alias MyAlias <&  &>')
    })

    it('should handle single command', () => {
      const result = service.generateAliasPreview('MyAlias', ['FireAll'])
      expect(result).toBe('alias MyAlias <& FireAll &>')
    })

    it('should handle rich command objects', () => {
      const commands = [
        { command: 'FireAll' },
        { command: 'FirePhasers' }
      ]
      const result = service.generateAliasPreview('MyAlias', commands)
      expect(result).toBe('alias MyAlias <& FireAll $$ FirePhasers &>')
    })

    it('should filter empty commands', () => {
      const commands = ['FireAll', '', 'FirePhasers', null]
      const result = service.generateAliasPreview('MyAlias', commands)
      expect(result).toBe('alias MyAlias <& FireAll $$ FirePhasers &>')
    })

    it('should return empty alias for null input', () => {
      const result = service.generateAliasPreview('MyAlias', null)
      expect(result).toBe('alias MyAlias <&  &>')
    })
  })
}) 