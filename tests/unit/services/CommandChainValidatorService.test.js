import { describe, it, expect, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import { respond } from '../../../src/js/core/requestResponse.js'
import CommandChainValidatorService from '../../../src/js/components/services/CommandChainValidatorService.js'

function createLongPreview(len) {
  return 'x'.repeat(len)
}

describe('CommandChainValidatorService', () => {
  let fixture, eventBus, service

  beforeEach(() => {
    fixture = createServiceFixture()
    eventBus = fixture.eventBus

    // Default stubs
    respond(eventBus, 'command:get-for-selected-key', () => ['cmd1'])
    respond(eventBus, 'command:generate-command-preview', ({ key, commands }) => createLongPreview(995))
    respond(eventBus, 'toast:show', () => {})

    service = new CommandChainValidatorService({ eventBus })
    service.init()
  })

  afterEach(() => {
    fixture.destroy()
  })

  it('emits validation-result with error when preview >= 990', async () => {
    const spy = vi.fn()
    eventBus.on('command-chain:validation-result', spy)

    eventBus.emit('command-chain:validate', { key: 'F1' })

    await new Promise(r => setTimeout(r, 0))

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }))
  })
}) 