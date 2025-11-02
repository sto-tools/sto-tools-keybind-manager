import { describe, it, expect, vi } from 'vitest'
import KeyCaptureService from '../../../src/js/components/services/KeyCaptureService.js'
import { createServiceFixture } from '../../fixtures/index.js'

// Minimal stub for document to satisfy service constructor
const createStubDocument = () => ({
  addEventListener: () => {},
  removeEventListener: () => {}
})

describe('KeyCaptureService – unsafe keybind rejection', () => {
  it('identifies unsafe key combinations', () => {
    const svc = new KeyCaptureService({ document: createStubDocument() })

    expect(svc.isRejectedChord('Alt+F4')).toBe(true)
    expect(svc.isRejectedChord('Ctrl+F4')).toBe(false)

    // Case insensitivity
    expect(svc.isRejectedChord('ALT+TAB')).toBe(true)
  })

  it('suppresses toast emission when rejecting unsafe chords', async () => {
    const fixture = createServiceFixture()
    const service = new KeyCaptureService({ eventBus: fixture.eventBus, document: createStubDocument() })
    fixture.eventBusFixture.clearEventHistory()

    service.isCapturing = true
    service.request = vi.fn().mockRejectedValue(new Error('no translator'))
    service.pressedCodes.add('AltLeft')

    const preventDefault = vi.fn()
    await service.handleKeyDown({ code: 'F4', preventDefault })

    const toastEvents = fixture.eventBusFixture.getEventsOfType('toast:show')
    expect(toastEvents).toHaveLength(0)
    expect(preventDefault).toHaveBeenCalled()

    fixture.destroy()
  })
})
