import { describe, it, beforeEach, afterEach, expect } from 'vitest'
import { createEventBusFixture } from '../../fixtures/index.js'
import KeyCaptureUI from '../../../src/js/components/ui/KeyCaptureUI.js'

function createDomFixture () {
  document.body.innerHTML = `
    <div id="keySelectionModal" tabindex="-1">
      <div id="keyCaptureStatus" style="display:none"></div>
      <span id="capturedKeys"></span>
      <button id="keySelectionCaptureBtn">Capture</button>
    </div>
  `
  return {
    cleanup: () => (document.body.innerHTML = '')
  }
}

describe('KeyCaptureUI', () => {
  let eventBusFixture, ui, dom

  beforeEach(() => {
    dom = createDomFixture()
    eventBusFixture = createEventBusFixture()
    ui = new KeyCaptureUI({ eventBus: eventBusFixture.eventBus, document })
    ui.init()
  })

  afterEach(() => {
    dom.cleanup()
    eventBusFixture.destroy()
  })

  it('startCapture should prepare UI and emit keycapture:start', () => {
    ui.startCapture('keySelectionModal')

    const status = document.getElementById('keyCaptureStatus')
    const keys   = document.getElementById('capturedKeys')
    const btn    = document.getElementById('keySelectionCaptureBtn')

    expect(status.style.display).toBe('block')
    expect(keys.getAttribute('data-placeholder')).toBe('Press keys...')
    expect(btn.disabled).toBe(true)

    eventBusFixture.expectEvent('keycapture:start', { context: 'keySelectionModal' })
  })

  it('handleCaptureStop should restore UI', () => {
    // Simulate start first
    ui.startCapture('keySelectionModal')

    // Emit capture-stop event
    eventBusFixture.eventBus.emit('capture-stop', { context: 'keySelectionModal' })

    const status = document.getElementById('keyCaptureStatus')
    const btn    = document.getElementById('keySelectionCaptureBtn')

    expect(status.style.display).toBe('none')
    expect(btn.disabled).toBe(false)
  })
}) 