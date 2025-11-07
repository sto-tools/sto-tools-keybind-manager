import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import CommandUI from '../../../src/js/components/ui/CommandUI.js'
import { createUIComponentFixture } from '../../fixtures/ui/component.js'

describe('CommandUI Validation Toast Tests', () => {
  let fixture, component, showToastSpy

  beforeEach(() => {
    fixture = createUIComponentFixture(CommandUI, {
      i18n: {
        t: vi.fn((key, params) => {
          if (key === 'test_warning') return 'Test warning message'
          if (key === 'test_error') return 'Test error message'
          if (key === 'command_chain_is_valid') return 'Command chain is valid'
          return `${key}:${JSON.stringify(params)}`
        })
      },
      document: {
        getElementById: vi.fn((id) => {
          if (id === 'statusIndicator') {
            const mockElement = {
              querySelector: vi.fn((selector) => {
                if (selector === 'i') {
                  return {
                    className: 'fas fa-check-circle'
                  }
                }
                if (selector === 'span') {
                  return {
                    textContent: 'Valid',
                    setAttribute: vi.fn()
                  }
                }
                return {
                  classList: { add: vi.fn(), remove: vi.fn() },
                  setAttribute: vi.fn(),
                  className: 'fas fa-check-circle',
                  textContent: 'Valid'
                }
              }),
              classList: { add: vi.fn(), remove: vi.fn() },
              setAttribute: vi.fn(),
              onclick: null
            }
            console.log(`getElementById called with id: ${id}, returning:`, mockElement)
            return mockElement
          }
          console.log(`getElementById called with id: ${id}, returning null`)
          return null
        }),
        createElement: vi.fn(() => ({
          value: '',
          textContent: '',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          click: vi.fn(),
          focus: vi.fn(),
          blur: vi.fn()
        })),
        body: { appendChild: vi.fn(), removeChild: vi.fn() }
      },
      autoInit: false // Don't auto-init so we can set up spy first
    })

    component = fixture.component

    // Set up spy BEFORE initializing the component
    showToastSpy = vi.spyOn(component, 'showToast')

    // Now initialize the component
    component.init()

    // Mock i18n:translate requests
    fixture.mockResponse('i18n:translate', ({ key }) => {
      if (key === 'warning') return 'warning'
      if (key === 'error') return 'error'
      if (key === 'valid') return 'valid'
      return key
    })
    
    // Debug: Check if event listeners are set up
    console.log('Event listeners:', component.eventListeners)
    console.log('EventBus listeners:', component.eventBus.listeners)
  })

  afterEach(() => {
    if (component && component.destroy) {
      component.destroy()
    }
    vi.restoreAllMocks()
  })

  describe('validation result handling', () => {
    it('should show individual toasts for multiple warnings', () => {
      const warnings = [
        { key: 'test_warning', params: { count: 2 } },
        { key: 'test_warning', params: { count: 3 } }
      ]

      // Emit using the component's event bus
      component.eventBus.emit('command-chain:validation-result', {
        key: 'k',
        severity: 'warning',
        warnings,
        errors: []
      })

      // Should show toast for each warning
      expect(showToastSpy).toHaveBeenCalledTimes(2)
      expect(showToastSpy).toHaveBeenNthCalledWith(1, 'Test warning message', 'warning')
      expect(showToastSpy).toHaveBeenNthCalledWith(2, 'Test warning message', 'warning')
    })

    it('should show individual toasts for multiple errors', () => {
      const errors = [
        { key: 'test_error', params: { command: 'bad_cmd' } },
        { key: 'test_error', params: { command: 'another_bad_cmd' } }
      ]

      component.eventBus.emit('command-chain:validation-result', {
        key: 'k',
        severity: 'error',
        warnings: [],
        errors
      })

      // Should show toast for each error
      expect(showToastSpy).toHaveBeenCalledTimes(2)
      expect(showToastSpy).toHaveBeenNthCalledWith(1, 'Test error message', 'error')
      expect(showToastSpy).toHaveBeenNthCalledWith(2, 'Test error message', 'error')
    })

    it('should show toasts for both warnings and errors', () => {
      const warnings = [{ key: 'test_warning', params: {} }]
      const errors = [{ key: 'test_error', params: {} }]

      component.eventBus.emit('command-chain:validation-result', {
        key: 'k',
        severity: 'error',
        warnings,
        errors
      })

      // Should show toast for both warning and error
      expect(showToastSpy).toHaveBeenCalledTimes(2)
      expect(showToastSpy).toHaveBeenCalledWith('Test warning message', 'warning')
      expect(showToastSpy).toHaveBeenCalledWith('Test error message', 'error')
    })

    it('should only show toasts when severity changes for same key', () => {
      const warnings = [{ key: 'test_warning', params: {} }]

      // First validation result - should show toasts
      // Emit using the component's event bus
      component.eventBus.emit('command-chain:validation-result', {
        key: 'k',
        severity: 'warning',
        warnings,
        errors: []
      })
      expect(showToastSpy).toHaveBeenCalledTimes(1)

      // Second validation result with same severity - should not show toasts again
      showToastSpy.mockClear()
      // Emit using the component's event bus
      component.eventBus.emit('command-chain:validation-result', {
        key: 'k',
        severity: 'warning',
        warnings,
        errors: []
      })
      expect(showToastSpy).not.toHaveBeenCalled()
    })

    it('should show toasts again when severity changes from warning to error', () => {
      const warnings = [{ key: 'test_warning', params: {} }]
      const errors = [{ key: 'test_error', params: {} }]

      // First validation - warning severity
      // Emit using the component's event bus
      component.eventBus.emit('command-chain:validation-result', {
        key: 'k',
        severity: 'warning',
        warnings,
        errors: []
      })
      expect(showToastSpy).toHaveBeenCalledTimes(1)

      // Second validation - error severity (different from previous)
      showToastSpy.mockClear()
      component.eventBus.emit('command-chain:validation-result', {
        key: 'k',
        severity: 'error',
        warnings: [],
        errors
      })
      expect(showToastSpy).toHaveBeenCalledTimes(1)
    })

    it('should handle different keys independently', () => {
      const warnings1 = [{ key: 'test_warning', params: { key: 'k' } }]
      const warnings2 = [{ key: 'test_warning', params: { key: 'x' } }]

      // First validation for key 'k'
      component.eventBus.emit('command-chain:validation-result', {
        key: 'k',
        severity: 'warning',
        warnings: warnings1,
        errors: []
      })
      expect(showToastSpy).toHaveBeenCalledTimes(1)

      // Second validation for key 'x' - should show toasts since it's a different key
      showToastSpy.mockClear()
      component.eventBus.emit('command-chain:validation-result', {
        key: 'x',
        severity: 'warning',
        warnings: warnings2,
        errors: []
      })
      expect(showToastSpy).toHaveBeenCalledTimes(1)
    })

    it('should use fallback message when i18n key not found', () => {
      const warnings = [{
        key: 'missing_translation_key',
        defaultMessage: 'Fallback warning message',
        params: {}
      }]

      // Emit using the component's event bus
      component.eventBus.emit('command-chain:validation-result', {
        key: 'k',
        severity: 'warning',
        warnings,
        errors: []
      })

      expect(showToastSpy).toHaveBeenCalledWith('Fallback warning message', 'warning')
    })

    it('should show success toast when transitioning from warning to success', () => {
      // First validation with warning severity
      component.eventBus.emit('command-chain:validation-result', {
        key: 'k',
        severity: 'warning',
        warnings: [{ key: 'test_warning', params: {} }],
        errors: []
      })
      expect(showToastSpy).toHaveBeenCalledTimes(1)

      // Clear the spy for the next validation
      showToastSpy.mockClear()

      // Second validation with success severity - should show success toast
      component.eventBus.emit('command-chain:validation-result', {
        key: 'k',
        severity: 'success',
        warnings: [],
        errors: []
      })

      // Should show success toast
      expect(showToastSpy).toHaveBeenCalledTimes(1)
      expect(showToastSpy).toHaveBeenCalledWith('Command chain is valid', 'success')
    })

    it('should show success toast when loading a valid command chain', () => {
      // First validation with success severity (simulating loading a valid command chain)
      component.eventBus.emit('command-chain:validation-result', {
        key: 'k',
        severity: 'success',
        warnings: [],
        errors: []
      })

      // Should show success toast when loading a valid command chain
      expect(showToastSpy).toHaveBeenCalledTimes(1)
      expect(showToastSpy).toHaveBeenCalledWith('Command chain is valid', 'success')
    })

    it('should not show success toast when already in success state', () => {
      // First validation with success severity
      component.eventBus.emit('command-chain:validation-result', {
        key: 'k',
        severity: 'success',
        warnings: [],
        errors: []
      })

      expect(showToastSpy).toHaveBeenCalledTimes(1)
      expect(showToastSpy).toHaveBeenCalledWith('Command chain is valid', 'success')

      // Clear the spy for the next validation
      showToastSpy.mockClear()

      // Second validation with success severity - should not show success toast again
      component.eventBus.emit('command-chain:validation-result', {
        key: 'k',
        severity: 'success',
        warnings: [],
        errors: []
      })

      expect(showToastSpy).not.toHaveBeenCalled()
    })

    it('should store validation issues for modal display', () => {
      const warnings = [{ key: 'test_warning', params: {} }]
      const errors = [{ key: 'test_error', params: {} }]

      component.eventBus.emit('command-chain:validation-result', {
        key: 'k',
        severity: 'error',
        warnings,
        errors
      })

      // Should store issues for modal
      expect(component._lastValidation).toEqual({
        warnings,
        errors
      })
    })
  })

  describe('UIComponentBase integration', () => {
    it('should inherit showToast method from UIComponentBase', () => {
      expect(typeof component.showToast).toBe('function')
    })

    it('should not have custom toast implementation', () => {
      // The old showToast method should be removed
      expect(component.showToast).not.toContain('request')
      expect(component.showToast).not.toContain('ui.showToast')
    })
  })
})