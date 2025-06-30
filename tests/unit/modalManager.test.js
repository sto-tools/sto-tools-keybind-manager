import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import ModalManagerService from '../../src/js/components/services/ModalManagerService.js'
import eventBus from '../../src/js/core/eventBus.js'

describe('ModalManagerService - Language Change Callbacks', () => {
  let modalManager

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <div id="modalOverlay"></div>
      <div class="modal" id="testModal">
        <div class="modal-content">
          <h3>Test Modal</h3>
          <p>Test content</p>
        </div>
      </div>
    `

    // Mock i18next if not available
    if (!window.i18next) {
      window.i18next = {
        on: (event, callback) => {
          window.i18next.callbacks = window.i18next.callbacks || {}
          window.i18next.callbacks[event] = callback
        },
        emit: (event) => {
          if (window.i18next.callbacks && window.i18next.callbacks[event]) {
            window.i18next.callbacks[event]()
          }
        },
        off: (event) => {
          if (window.i18next.callbacks) {
            delete window.i18next.callbacks[event]
          }
        }
      }
    }

    modalManager = new ModalManagerService(eventBus)
  })

  afterEach(() => {
    // Clean up
    if (window.i18next && window.i18next.off) {
      window.i18next.off('languageChanged')
    }
  })

  it('should register and call regenerate callbacks', async () => {
    let callbackCalled = false
    const testCallback = () => {
      callbackCalled = true
    }

    // Register a test callback
    modalManager.registerRegenerateCallback('testModal', testCallback)

    // Verify callback is registered
    expect(modalManager.regenerateCallbacks['testModal']).toBe(testCallback)

    // Simulate language change with modal open
    const modal = document.getElementById('testModal')
    modal.classList.add('active')

    // Trigger language change event
    if (window.i18next && window.i18next.emit) {
      window.i18next.emit('languageChanged')
    }

    // Wait for the event loop to process
    await new Promise(resolve => setTimeout(resolve, 10))

    // Verify callback was called
    expect(callbackCalled).toBe(true)
  })

  it('should not call callback if modal is not open', () => {
    let callbackCalled = false
    const testCallback = () => {
      callbackCalled = true
    }

    // Register a test callback
    modalManager.registerRegenerateCallback('testModal', testCallback)

    // Modal is not open (no 'active' class)

    // Trigger language change event
    if (window.i18next && window.i18next.emit) {
      window.i18next.emit('languageChanged')
    }

    // Verify callback was not called
    expect(callbackCalled).toBe(false)
  })

  it('should unregister callbacks', () => {
    const testCallback = () => {}

    // Register a test callback
    modalManager.registerRegenerateCallback('testModal', testCallback)
    expect(modalManager.regenerateCallbacks['testModal']).toBe(testCallback)

    // Unregister the callback
    modalManager.unregisterRegenerateCallback('testModal')
    expect(modalManager.regenerateCallbacks['testModal']).toBeUndefined()
  })

  it('should handle missing callback gracefully', () => {
    // No callback registered for this modal

    // Simulate language change with modal open
    const modal = document.getElementById('testModal')
    modal.classList.add('active')

    // This should not throw an error
    expect(() => {
      if (window.i18next && window.i18next.emit) {
        window.i18next.emit('languageChanged')
      }
    }).not.toThrow()
  })

  it('should register all modal callbacks during initialization', () => {
    // Verify that all expected modal callbacks are registered
    const expectedModals = [
      'addCommandModal',
      'parameterModal',
      'keySelectionModal',
      'vertigoModal',
      'profileModal',
      'preferencesModal',
      'fileExplorerModal',
      'exportModal',
      'aboutModal',
      'addKeyModal'
    ]

    expectedModals.forEach(modalId => {
      expect(modalManager.regenerateCallbacks[modalId]).toBeDefined()
      expect(typeof modalManager.regenerateCallbacks[modalId]).toBe('function')
    })
  })
}) 