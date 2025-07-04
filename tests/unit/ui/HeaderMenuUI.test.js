import { describe, it, beforeEach, afterEach, expect } from 'vitest'
import { createEventBusFixture } from '../../fixtures/index.js'
import HeaderMenuUI from '../../../src/js/components/ui/HeaderMenuUI.js'

function createDomFixture () {
  // Set up a minimal DOM structure similar to real header menus
  const container = document.createElement('div')
  container.innerHTML = `
    <div class="dropdown" id="settingsDropdown">
      <button id="settingsBtn">Settings</button>
    </div>
    <div class="dropdown" id="importDropdown">
      <button id="importMenuBtn">Import</button>
    </div>
    <div class="dropdown" id="languageDropdown">
      <button id="languageMenuBtn">Language</button>
      <button data-lang="en">EN</button>
      <button data-lang="de">DE</button>
    </div>`
  document.body.appendChild(container)
  return {
    container,
    cleanup: () => container.remove()
  }
}

describe('HeaderMenuUI', () => {
  let eventBusFixture, ui, dom

  beforeEach(() => {
    // DOM & eventBus
    dom = createDomFixture()
    eventBusFixture = createEventBusFixture()

    ui = new HeaderMenuUI({ eventBus: eventBusFixture.eventBus, document })
    ui.init()
  })

  afterEach(() => {
    dom.cleanup()
    eventBusFixture.destroy()
  })

  it('should toggle dropdown active state', () => {
    const settingsDropdown = document.getElementById('settingsDropdown')

    expect(settingsDropdown.classList.contains('active')).toBe(false)
    ui.toggleSettingsMenu()
    expect(settingsDropdown.classList.contains('active')).toBe(true)
    ui.toggleSettingsMenu()
    expect(settingsDropdown.classList.contains('active')).toBe(false)
  })

  it('should ensure only one dropdown is active at a time', () => {
    const settingsDropdown = document.getElementById('settingsDropdown')
    const importDropdown = document.getElementById('importDropdown')

    ui.toggleSettingsMenu()
    expect(settingsDropdown.classList.contains('active')).toBe(true)
    expect(importDropdown.classList.contains('active')).toBe(false)

    ui.toggleImportMenu()
    expect(importDropdown.classList.contains('active')).toBe(true)
    expect(settingsDropdown.classList.contains('active')).toBe(false)
  })

  it('should emit language:change event when language button clicked', () => {
    const deBtn = document.querySelector('[data-lang="de"]')
    deBtn.click()

    eventBusFixture.expectEvent('language:change', { language: 'de' })
  })
}) 