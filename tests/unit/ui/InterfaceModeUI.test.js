import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import { createEventBusFixture } from '../../fixtures/core/eventBus.js'
import InterfaceModeUI from '../../../src/js/components/ui/InterfaceModeUI.js'

function createDomFixture() {
  // Set up a minimal DOM structure with mode buttons
  const container = document.createElement('div')
  container.innerHTML = `
    <div class="mode-buttons">
      <button data-mode="space" class="mode-btn">Space</button>
      <button data-mode="ground" class="mode-btn">Ground</button>
      <button data-mode="alias" class="mode-btn">Alias</button>
    </div>
    <div class="key-selector-container">
      <div>Key selector content</div>
    </div>
    <div id="aliasSelectorContainer" style="display: none;">
      <div>Alias selector content</div>
    </div>
  `
  document.body.appendChild(container)
  return {
    container,
    cleanup: () => container.remove()
  }
}

describe('InterfaceModeUI', () => {
  let fixture, eventBusFixture, interfaceModeUI, dom

  beforeEach(() => {
    // DOM & eventBus
    dom = createDomFixture()
    fixture = createServiceFixture()

    // Create EventBus fixture with custom onDom mock that simulates real behavior
    eventBusFixture = createEventBusFixture({
      trackEvents: true,
      mockEmit: false
    })

    // Mock onDom to simulate real behavior
    eventBusFixture.eventBus.onDom = vi.fn((selector, event, busEvent, handler) => {
      if (typeof busEvent === 'function') {
        handler = busEvent
        busEvent = event
      }
      if (!busEvent) busEvent = event

      // Normalize selector like real EventBus - handle attribute selectors
      const finalSelector = /^[.#]/.test(selector) ? selector :
                           /^\[/.test(selector) ? selector : `#${selector}`

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

      return function detach() {
        document.removeEventListener(event, domHandler, true)
      }
    })

    interfaceModeUI = new InterfaceModeUI({
      eventBus: eventBusFixture.eventBus,
      document
    })
  })

  afterEach(() => {
    interfaceModeUI.destroy()
    dom.cleanup()
    fixture.destroy()
    eventBusFixture.destroy()
  })

  it('should initialize without errors', () => {
    expect(() => interfaceModeUI.init()).not.toThrow()
    expect(interfaceModeUI._uiListenersSetup).toBe(true)
    expect(interfaceModeUI.domEventListeners).toHaveLength(3) // space, ground, alias
  })

  it('should set up eventBus.onDom listeners for mode buttons exactly once', () => {
    interfaceModeUI.init()

    // Verify onDom was called exactly once for each mode button
    const spaceOnDomCalls = eventBusFixture.eventBus.onDom.mock.calls.filter(
      call => call[0] === '[data-mode="space"]'
    ).length
    const groundOnDomCalls = eventBusFixture.eventBus.onDom.mock.calls.filter(
      call => call[0] === '[data-mode="ground"]'
    ).length
    const aliasOnDomCalls = eventBusFixture.eventBus.onDom.mock.calls.filter(
      call => call[0] === '[data-mode="alias"]'
    ).length

    expect(spaceOnDomCalls).toBe(1)
    expect(groundOnDomCalls).toBe(1)
    expect(aliasOnDomCalls).toBe(1)
  })

  it('should not create duplicate listeners on multiple init calls', () => {
    interfaceModeUI.init()
    interfaceModeUI.init() // Second init call
    interfaceModeUI.init() // Third init call

    // Should still have exactly 3 detach functions (one per mode)
    expect(interfaceModeUI.domEventListeners).toHaveLength(3)

    // onDom should be called exactly 3 times (once per mode), because onInit() guard prevents duplicates
    expect(eventBusFixture.eventBus.onDom).toHaveBeenCalledTimes(3)
  })

  it('should handle mode button clicks correctly', () => {
    interfaceModeUI.init()

    // Mock the request method to avoid actual service calls
    const mockRequest = vi.fn().mockResolvedValue({ success: true, mode: 'ground' })
    interfaceModeUI.request = mockRequest

    // Click ground mode button
    const groundButton = document.querySelector('[data-mode="ground"]')
    groundButton.click()

    expect(mockRequest).toHaveBeenCalledWith('environment:switch', { mode: 'ground' })
  })

  it('should update UI when mode changes', () => {
    interfaceModeUI.init()

    // Simulate mode change event
    eventBusFixture.eventBus.emit('mode-changed', 'ground')

    // Check that ground button is active
    const groundButton = document.querySelector('[data-mode="ground"]')
    const spaceButton = document.querySelector('[data-mode="space"]')
    const aliasButton = document.querySelector('[data-mode="alias"]')

    expect(groundButton.classList.contains('active')).toBe(true)
    expect(spaceButton.classList.contains('active')).toBe(false)
    expect(aliasButton.classList.contains('active')).toBe(false)
  })

  it('should show/hide appropriate containers based on mode', () => {
    interfaceModeUI.init()

    const keySelectorContainer = document.querySelector('.key-selector-container')
    const aliasSelectorContainer = document.getElementById('aliasSelectorContainer')

    // Test alias mode
    interfaceModeUI.updateModeUI('alias')
    expect(keySelectorContainer.style.display).toBe('none')
    expect(aliasSelectorContainer.style.display).toBe('')

    // Test space mode
    interfaceModeUI.updateModeUI('space')
    expect(keySelectorContainer.style.display).toBe('')
    expect(aliasSelectorContainer.style.display).toBe('none')
  })

  it('should clean up listeners properly in onDestroy', () => {
    interfaceModeUI.init()

    // Store detach functions before cleanup
    const detachFunctions = [...interfaceModeUI.domEventListeners]
    expect(detachFunctions).toHaveLength(3)

    // Call destroy (which calls onDestroy and cleanupEventListeners)
    interfaceModeUI.destroy()

    // Verify automatic cleanup
    expect(interfaceModeUI.domEventListeners).toHaveLength(0)
    expect(interfaceModeUI._uiListenersSetup).toBe(false)
  })

  it('should handle missing mode buttons gracefully', () => {
    // Remove alias button from DOM
    const aliasButton = document.querySelector('[data-mode="alias"]')
    aliasButton.remove()

    expect(() => interfaceModeUI.init()).not.toThrow()

    // Should still have 3 detach functions (EventBus registers listeners even if DOM elements don't exist yet)
    expect(interfaceModeUI.domEventListeners).toHaveLength(3)

    // But clicking should still work for existing buttons
    const spaceButton = document.querySelector('[data-mode="space"]')
    expect(() => spaceButton.click()).not.toThrow()
  })

  it('should preserve existing EventBus event listeners after mode button cleanup', () => {
    interfaceModeUI.init()

    // Verify EventBus listeners are set up
    expect(eventBusFixture.eventBus.on).toHaveBeenCalledWith(
      'mode-changed',
      expect.any(Function)
    )
    expect(eventBusFixture.eventBus.on).toHaveBeenCalledWith(
      'environment:changed',
      expect.any(Function)
    )

    // Cleanup mode button listeners
    interfaceModeUI.onDestroy()

    // EventBus listeners should still be available until full destroy
    // (This tests that cleanup is targeted to DOM listeners only)
    expect(interfaceModeUI._modeChangedHandler).not.toBeNull()
    expect(interfaceModeUI._environmentChangedHandler).not.toBeNull()
  })
})