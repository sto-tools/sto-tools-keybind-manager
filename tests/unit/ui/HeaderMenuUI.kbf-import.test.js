import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import { createEventBusFixture } from '../../fixtures/core/eventBus.js'
import HeaderMenuUI from '../../../src/js/components/ui/HeaderMenuUI.js'

function createDomFixture () {
  // Set up a minimal DOM structure including KBF import button
  const container = document.createElement('div')
  container.innerHTML = `
    <div class="dropdown" id="importDropdown">
      <button id="importMenuBtn">Import</button>
      <div class="dropdown-menu">
        <button id="importKeybindsBtn">Import Keybinds</button>
        <button id="importAliasesBtn">Import Aliases</button>
        <button id="importKbfBtn">Import KBF File</button>
        <button id="loadDefaultDataBtn">Load Default Data</button>
      </div>
    </div>`
  document.body.appendChild(container)
  return {
    container,
    cleanup: () => container.remove()
  }
}

describe('HeaderMenuUI - KBF Import Functionality (Task 36)', () => {
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

  describe('KBF Import Menu Implementation', () => {
    it('should have importKbfBtn button in DOM', () => {
      const kbfImportBtn = document.getElementById('importKbfBtn')
      expect(kbfImportBtn).toBeTruthy()
      expect(kbfImportBtn.textContent).toBe('Import KBF File')
    })

    it('should setup event listener for importKbfBtn during init', () => {
      // Verify onDom was called for importKbfBtn during init
      const kbfOnDomCalls = eventBusFixture.eventBus.onDom.mock.calls.filter(
        call => call[0] === 'importKbfBtn'
      )
      expect(kbfOnDomCalls).toHaveLength(1)
      
      // Verify the event listener parameters
      const kbfCall = kbfOnDomCalls[0]
      expect(kbfCall[1]).toBe('click') // event type
      expect(kbfCall[2]).toBe('kbf-import') // bus event name
      expect(typeof kbfCall[3]).toBe('function') // handler function
    })

    it('should emit keybinds:kbf-import event when KBF import button is clicked', () => {
      const kbfImportBtn = document.getElementById('importKbfBtn')

      // Click the button
      kbfImportBtn.click()

      // Verify the correct event was emitted exactly once
      eventBusFixture.expectEventCount('keybinds:kbf-import', 1)
      eventBusFixture.expectEvent('keybinds:kbf-import', null)
    })

    it('should follow existing menu patterns for KBF import', () => {
      // Check that all import buttons follow the same pattern
      const importButtonCalls = eventBusFixture.eventBus.onDom.mock.calls.filter(
        call => typeof call[0] === 'string' &&
                (call[0].includes('import') || call[0].includes('Btn'))
      )

      // Should have all import-related buttons
      const buttonIds = importButtonCalls.map(call => call[0])
      expect(buttonIds).toContain('importKeybindsBtn')
      expect(buttonIds).toContain('importAliasesBtn')
      expect(buttonIds).toContain('importKbfBtn')

      // All should use click events
      importButtonCalls.forEach(call => {
        expect(call[1]).toBe('click')
      })
    })

    it('should handle multiple clicks on KBF import button correctly', () => {
      const kbfImportBtn = document.getElementById('importKbfBtn')
      
      // Click multiple times
      kbfImportBtn.click()
      kbfImportBtn.click()
      kbfImportBtn.click()

      // Should emit event for each click
      eventBusFixture.expectEventCount('keybinds:kbf-import', 3)
    })

    it('should integrate with existing dropdown functionality', () => {
      const importDropdown = document.getElementById('importDropdown')
      const importMenuBtn = document.getElementById('importMenuBtn')
      
      // Open the import dropdown
      importMenuBtn.click()
      expect(importDropdown.classList.contains('active')).toBe(true)
      
      // KBF button should be visible and clickable
      const kbfImportBtn = document.getElementById('importKbfBtn')
      expect(kbfImportBtn).toBeTruthy()
      kbfImportBtn.click()
      
      // Should still emit the KBF import event
      eventBusFixture.expectEventCount('keybinds:kbf-import', 1)
    })
  })

  describe('Event Emission Validation', () => {
    it('should emit correct event type and payload', () => {
      const kbfImportBtn = document.getElementById('importKbfBtn')

      // Track the emitted event
      const emittedEvents = []
      ui.eventBus.on('keybinds:kbf-import', (data) => {
        emittedEvents.push(data)
      })

      kbfImportBtn.click()

      expect(emittedEvents).toHaveLength(1)
      expect(emittedEvents[0]).toBeNull() // HeaderMenuUI emits without data, which defaults to null
    })

    it('should not interfere with other import menu events', () => {
      const importKeybindsBtn = document.getElementById('importKeybindsBtn')
      const importAliasesBtn = document.getElementById('importAliasesBtn')
      const importKbfBtn = document.getElementById('importKbfBtn')
      
      // Click all import buttons
      importKeybindsBtn.click()
      importAliasesBtn.click()
      importKbfBtn.click()
      
      // All events should be emitted correctly
      eventBusFixture.expectEventCount('keybinds:import', 1)
      eventBusFixture.expectEventCount('aliases:import', 1)
      eventBusFixture.expectEventCount('keybinds:kbf-import', 1)
    })
  })

  describe('Integration with Existing Functionality', () => {
    it('should not break existing menu toggle functionality', () => {
      const importMenuBtn = document.getElementById('importMenuBtn')
      const importDropdown = document.getElementById('importDropdown')
      
      // Toggle menu should work
      importMenuBtn.click()
      expect(importDropdown.classList.contains('active')).toBe(true)
      
      importMenuBtn.click()
      expect(importDropdown.classList.contains('active')).toBe(false)
    })

    it('should maintain component lifecycle integrity', () => {
      // Component should initialize and destroy cleanly
      expect(ui.componentName).toBe('HeaderMenuUI')
      expect(ui.eventBus).toBeTruthy()
      
      // Destroy should not throw errors
      expect(() => ui.destroy()).not.toThrow()
    })
  })
})
