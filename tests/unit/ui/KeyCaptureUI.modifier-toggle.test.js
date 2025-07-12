import { describe, it, beforeEach, afterEach, expect } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import KeyCaptureUI from '../../../src/js/components/ui/KeyCaptureUI.js'

function createDomFixture () {
  // Minimal DOM structure required for KeyCaptureUI interactions used in this test
  document.body.innerHTML = `
    <div id="keySelectionModal">
      <div id="keyPreviewDisplay"></div>
      <div data-key-code="ShiftLeft" class="vkey"></div>
      <div data-key-code="ShiftRight" class="vkey"></div>
    </div>
    <input id="distinguishModifierSide" type="checkbox" />
  `
  return {
    cleanup: () => (document.body.innerHTML = '')
  }
}

describe('KeyCaptureUI – modifier toggle behaviour', () => {
  let fixture, eventBusFixture, ui, dom

  beforeEach(() => {
    dom = createDomFixture()
    fixture = createServiceFixture()
    eventBusFixture = fixture.eventBusFixture
    // Instantiate UI with fixture event bus and jsdom document
    ui = new KeyCaptureUI({ eventBus: eventBusFixture.eventBus, document })
    ui.init()
  })

  afterEach(() => {
    dom.cleanup()
    fixture.destroy()
  })

  it('should keep previously selected key in preview when a modifier is toggled off', () => {
    // Simulate selecting a main key via capture
    ui.selectKey('G')
    const preview = document.getElementById('keyPreviewDisplay')
    expect(preview.textContent).toContain('G')

    // Toggle modifier on then off
    ui.toggleVirtualModifier('ShiftLeft') // activate
    ui.toggleVirtualModifier('ShiftLeft') // deactivate

    // The preview should still display the originally selected key
    expect(preview.textContent).toContain('G')
    expect(preview.textContent).not.toContain('No key selected')
  })
}) 