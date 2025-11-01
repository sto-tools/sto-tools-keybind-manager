import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import { createEventBusFixture } from '../../fixtures/core/eventBus.js'
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
  let fixture, eventBusFixture, ui, dom

  beforeEach(() => {
    // DOM & eventBus
    dom = createDomFixture()
    fixture = createServiceFixture()

    // Create EventBus fixture with custom onDom mock that simulates real behavior
    eventBusFixture = createEventBusFixture({
      trackEvents: true,
      mockEmit: false
    })

    // Mock onDom to actually trigger DOM events and emit to bus
    eventBusFixture.eventBus.onDom = vi.fn((target, event, busEvent, handler) => {
      if (typeof busEvent === 'function') {
        handler = busEvent
        busEvent = event
      }
      if (!busEvent) busEvent = event

      // Handle string selector (delegated)
      if (typeof target === 'string') {
        // Normalize selector like real EventBus - handle attribute selectors
        const finalSelector = /^[.#]/.test(target) ? target :
                             /^\[/.test(target) ? target : `#${target}`

        // Add actual DOM listener
        const domHandler = (e) => {
          const match = e.target.closest(finalSelector)
          if (match) {
            // Call handler (which will emit the actual event)
            if (handler) {
              try {
                handler(e)
              } catch (error) {
                console.error(error)
              }
            }
          }
        }

        document.addEventListener(event, domHandler, true)

        return () => {
          document.removeEventListener(event, domHandler, true)
        }
      }

      // Handle direct element/document reference
      if (target && target.addEventListener) {
        const domHandler = (e) => {
          if (handler) {
            try {
              handler(e)
            } catch (error) {
              console.error(error)
            }
          }
        }

        target.addEventListener(event, domHandler)

        return () => {
          target.removeEventListener(event, domHandler)
        }
      }

      return () => {}
    })

    ui = new HeaderMenuUI({ eventBus: eventBusFixture.eventBus, document })
    ui.init()
  })

  afterEach(() => {
    ui.destroy()
    dom.cleanup()
    fixture.destroy()
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

    eventBusFixture.expectEventCount('language:change', 1)
    eventBusFixture.expectEvent('language:change', { language: 'de' })

    // Verify onDom was called exactly once for [data-lang] during init
    const langOnDomCalls = eventBusFixture.eventBus.onDom.mock.calls.filter(
      call => call[0] === '[data-lang]'
    ).length
    expect(langOnDomCalls).toBe(1) // Should be called once during component init
  })
}) 