import { describe, it, beforeEach, afterEach, expect } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import AboutModalUI from '../../../src/js/components/ui/AboutModalUI.js'
import { DISPLAY_VERSION } from '../../../src/js/core/constants.js'

function createDomFixture () {
  const container = document.createElement('div')
  container.innerHTML = `
    <span id="aboutVersion"></span>
  `
  document.body.appendChild(container)
  return {
    container,
    cleanup: () => container.remove()
  }
}

describe('AboutModalUI', () => {
  let dom, fixture, eventBusFixture, ui

  beforeEach(() => {
    dom = createDomFixture()
    fixture = createServiceFixture()
    eventBusFixture = fixture.eventBusFixture

    ui = new AboutModalUI({ eventBus: eventBusFixture.eventBus, document })
    ui.init()
  })

  afterEach(() => {
    dom.cleanup()
    fixture.destroy()
  })

  it('should populate version element with DISPLAY_VERSION', () => {
    const versionEl = document.getElementById('aboutVersion')
    expect(versionEl.textContent).toContain(DISPLAY_VERSION)
  })

  it('should emit modal:show when showAboutModal called', () => {
    ui.showAboutModal()
    eventBusFixture.expectEvent('modal:show', { modalId: 'aboutModal' })
  })
}) 