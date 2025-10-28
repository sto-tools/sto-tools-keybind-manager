import { describe, it, beforeEach, afterEach, expect } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import KeyCaptureUI from '../../../src/js/components/ui/KeyCaptureUI.js'

function createDomFixture () {
  document.body.innerHTML = `
    <div id="keySelectionModal" tabindex="-1">
      <div class="modal-body"></div>
    </div>
  `
  return {
    cleanup: () => (document.body.innerHTML = '')
  }
}

describe('KeyCaptureUI', () => {
  let fixture, eventBusFixture, ui, dom

  beforeEach(async () => {
    dom = createDomFixture()
    fixture = createServiceFixture()
    eventBusFixture = fixture.eventBusFixture
    ui = new KeyCaptureUI({ eventBus: eventBusFixture.eventBus, document })
    await ui.init()
  })

  afterEach(() => {
    dom.cleanup()
    fixture.destroy()
  })

  it('startCapture should prepare UI and emit keycapture:start', () => {
    // First initialize the modal to build the content
    ui.buildModalContent()

    ui.startCapture('keySelectionModal')

    // Check that capture indicator becomes active
    const captureIndicator = document.getElementById('captureIndicator')
    expect(captureIndicator).toBeTruthy()
    expect(captureIndicator.classList.contains('active')).toBe(true)

    // Check that confirm button is disabled initially
    const confirmBtn = document.getElementById('confirm-key-selection')
    expect(confirmBtn).toBeTruthy()
    expect(confirmBtn.disabled).toBe(true)

    // Check that virtual keyboard is disabled during capture
    const virtualKeyboard = document.getElementById('virtualKeyboard')
    expect(virtualKeyboard).toBeTruthy()
    expect(virtualKeyboard.classList.contains('disabled')).toBe(true)

    eventBusFixture.expectEvent('keycapture:start', { context: 'keySelectionModal' })
  })

  it('handleCaptureStop should restore UI', () => {
    // First initialize the modal to build the content
    ui.buildModalContent()

    // Simulate start first
    ui.startCapture('keySelectionModal')

    // Emit capture-stop event
    eventBusFixture.eventBus.emit('capture-stop', { context: 'keySelectionModal' })

    // Check that capture indicator is no longer active
    const captureIndicator = document.getElementById('captureIndicator')
    expect(captureIndicator).toBeTruthy()
    expect(captureIndicator.classList.contains('active')).toBe(false)

    // Check that virtual keyboard is enabled after capture stops
    const virtualKeyboard = document.getElementById('virtualKeyboard')
    expect(virtualKeyboard).toBeTruthy()
    expect(virtualKeyboard.classList.contains('disabled')).toBe(false)
  })
}) 