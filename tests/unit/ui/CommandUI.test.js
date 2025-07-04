import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createEventBusFixture } from '../../fixtures/core/index.js'
import { respond } from '../../../src/js/core/requestResponse.js'
import CommandUI from '../../../src/js/components/ui/CommandUI.js'

function createStubUI() {
  return {
    showToast: vi.fn()
  }
}

describe('CommandUI', () => {
  let busFixture, eventBus, uiStub, commandUI

  beforeEach(async () => {
    busFixture = createEventBusFixture()
    eventBus = busFixture.eventBus
    uiStub = createStubUI()
    commandUI = new CommandUI({ eventBus, ui: uiStub, modalManager: { show: vi.fn() } })
    commandUI.init()
    // Stub i18n translation requests
    respond(eventBus, 'i18n:translate', ({ key }) => {
      const defaults = {
        please_select_a_key_first: 'Please select a key first'
      }
      return defaults[key] || key
    })
  })

  afterEach(() => {
    busFixture.destroy()
    vi.restoreAllMocks()
  })

  it('should show warning toast when adding static command without key selected', async () => {
    eventBus.emit('command-add', { commandDef: { command: 'FireAll', name: 'Fire All' } })

    // microtask queue flush
    await new Promise(r => setTimeout(r, 0))

    expect(uiStub.showToast).toHaveBeenCalled()
  })

  it('should emit command:add event when key is selected', async () => {
    // Select a key first
    eventBus.emit('key-selected', { key: 'F1' })

    const cmdDef = { command: 'FireAll', name: 'Fire All' }
    eventBus.emit('command-add', { commandDef: cmdDef })

    await new Promise(r => setTimeout(r, 0))

    // showToast should not be called this time
    expect(uiStub.showToast).not.toHaveBeenCalledWith(expect.stringMatching(/select.*key/i), 'warning')

    // Verify command:add emitted with correct payload
    const events = busFixture.getEventsOfType('command:add')
    const match = events.find(e => e.data?.key === 'F1' && e.data?.command?.command === 'FireAll')
    expect(match).toBeDefined()
  })
}) 