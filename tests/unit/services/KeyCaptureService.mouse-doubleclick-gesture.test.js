// Test to verify KeyCaptureService mouse double-click gesture button capture
import { describe, it, expect, beforeEach, vi } from 'vitest'
import KeyCaptureService from '../../../src/js/components/services/KeyCaptureService.js'

// Minimal stub for document to satisfy service constructor
const createStubDocument = () => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
})

describe('KeyCaptureService – mouse double-click gesture capture', () => {
  let service
  let mockDocument
  let capturedChords = []

  beforeEach(() => {
    mockDocument = createStubDocument()
    service = new KeyCaptureService({ document: mockDocument })
    capturedChords = []

    // Mock the emit method to capture chord-captured events
    service.emit = vi.fn((event, data) => {
      if (event === 'chord-captured') {
        capturedChords.push(data.chord)
      }
    })

    service.startCapture('test')
  })

  /**
   * Simulate a single click with the full event sequence
   * This test uses real timers to verify the debouncing behavior
   */
  const simulateSingleClick = (button) => {
    vi.useFakeTimers()

    // Reset capture state for each test
    service.resetState()
    service.hasCapturedValidKey = false

    // Simulate mousedown event
    const mouseDownEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleMouseDown(mouseDownEvent)

    // Simulate mouseup event
    const mouseUpEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleMouseUp(mouseUpEvent)

    // Fast-forward past the 500ms debounce delay
    vi.advanceTimersByTime(500)

    vi.useRealTimers()
  }

  /**
   * Simulate a double-click with the full event sequence
   * This follows the actual browser event sequence:
   * mousedown → mouseup → mousedown → mouseup → dblclick
   */
  const simulateDoubleClick = (button) => {
    vi.useFakeTimers()

    // Reset capture state for each test
    service.resetState()
    service.hasCapturedValidKey = false

    // First click sequence
    const firstMouseDownEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleMouseDown(firstMouseDownEvent)

    const firstMouseUpEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleMouseUp(firstMouseUpEvent)

    // Second click sequence (before 500ms timeout)
    const secondMouseDownEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleMouseDown(secondMouseDownEvent)

    const secondMouseUpEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleMouseUp(secondMouseUpEvent)

    // Double-click event
    const dblClickEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleDblClick(dblClickEvent)

    vi.useRealTimers()
  }

  /**
   * Simulate a double-click with modifiers
   */
  const simulateDoubleClickWithModifiers = (button, modifiers) => {
    vi.useFakeTimers()

    // Reset capture state for each test
    service.resetState()
    service.hasCapturedValidKey = false

    // Add modifier codes to pressed codes
    modifiers.forEach(code => service.pressedCodes.add(code))

    // First click sequence
    const firstMouseDownEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleMouseDown(firstMouseDownEvent)

    const firstMouseUpEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleMouseUp(firstMouseUpEvent)

    // Second click sequence (before 500ms timeout)
    const secondMouseDownEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleMouseDown(secondMouseDownEvent)

    const secondMouseUpEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleMouseUp(secondMouseUpEvent)

    // Double-click event
    const dblClickEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleDblClick(dblClickEvent)

    vi.useRealTimers()
  }

  describe('Single-click gestures (with debounce)', () => {
    it('should capture left button single click after debounce delay', () => {
      simulateSingleClick(0) // Left mouse button
      expect(capturedChords).toHaveLength(1)
      expect(capturedChords[0]).toBe('Lclick')
    })

    it('should capture middle button single click after debounce delay', () => {
      simulateSingleClick(1) // Middle mouse button
      expect(capturedChords).toHaveLength(1)
      expect(capturedChords[0]).toBe('Mclick')
    })

    it('should capture right button single click after debounce delay', () => {
      simulateSingleClick(2) // Right mouse button
      expect(capturedChords).toHaveLength(1)
      expect(capturedChords[0]).toBe('Rclick')
    })

    it('should not capture single click immediately (should wait for debounce)', () => {
      vi.useFakeTimers()

      service.resetState()
      service.hasCapturedValidKey = false

      // Simulate mousedown first (required to set isDown state)
      const mouseDownEvent = {
        button: 0,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn()
      }
      service.handleMouseDown(mouseDownEvent)

      // Simulate mouseup (which starts the debounce timer)
      const mouseUpEvent = {
        button: 0,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn()
      }
      service.handleMouseUp(mouseUpEvent)

      // Should NOT have captured yet (debounce delay not elapsed)
      expect(capturedChords).toHaveLength(0)

      // Fast-forward past the 500ms debounce delay
      vi.advanceTimersByTime(500)

      // Now it should have captured
      expect(capturedChords).toHaveLength(1)
      expect(capturedChords[0]).toBe('Lclick')

      vi.useRealTimers()
    })
  })

  describe('Double-click gestures', () => {
    it('should capture left button double-click gesture', () => {
      simulateDoubleClick(0) // Left mouse button
      expect(capturedChords).toHaveLength(1)
      expect(capturedChords[0]).toBe('Ldblclick')
    })

    it('should capture middle button double-click gesture', () => {
      simulateDoubleClick(1) // Middle mouse button
      expect(capturedChords).toHaveLength(1)
      expect(capturedChords[0]).toBe('Mdblclick')
    })

    it('should capture right button double-click gesture', () => {
      simulateDoubleClick(2) // Right mouse button
      expect(capturedChords).toHaveLength(1)
      expect(capturedChords[0]).toBe('Rdblclick')
    })

    it('should capture double-click with Ctrl modifier', () => {
      simulateDoubleClickWithModifiers(0, ['ControlLeft'])
      expect(capturedChords).toHaveLength(1)
      expect(capturedChords[0]).toBe('Control+Ldblclick')
    })

    it('should capture double-click with Shift modifier', () => {
      simulateDoubleClickWithModifiers(0, ['ShiftLeft'])
      expect(capturedChords).toHaveLength(1)
      expect(capturedChords[0]).toBe('Ldblclick+Shift')
    })

    it('should capture double-click with Alt modifier', () => {
      simulateDoubleClickWithModifiers(0, ['AltLeft'])
      expect(capturedChords).toHaveLength(1)
      expect(capturedChords[0]).toBe('Alt+Ldblclick')
    })

    it('should capture double-click with multiple modifiers', () => {
      simulateDoubleClickWithModifiers(0, ['ControlLeft', 'ShiftLeft'])
      expect(capturedChords).toHaveLength(1)
      expect(capturedChords[0]).toBe('Control+Ldblclick+Shift')
    })
  })

  describe('Pending click state management', () => {
    it('should create pending click timer on first mouseup', () => {
      vi.useFakeTimers()

      service.resetState()
      service.hasCapturedValidKey = false

      // Simulate mousedown first (required to set isDown state)
      const mouseDownEvent = {
        button: 0,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn()
      }
      service.handleMouseDown(mouseDownEvent)

      const mouseUpEvent = {
        button: 0,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn()
      }
      service.handleMouseUp(mouseUpEvent)

      // Should have a pending click timer
      expect(service.mouseState.pendingClickTimer).not.toBeNull()
      expect(service.mouseState.pendingClickButton).toBe(0)
      expect(service.mouseState.pendingClickGesture).toBe('Lclick')

      vi.useRealTimers()
    })

    it('should cancel pending click timer on second mousedown', () => {
      vi.useFakeTimers()

      service.resetState()
      service.hasCapturedValidKey = false

      // First mousedown
      const firstMouseDownEvent = {
        button: 0,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn()
      }
      service.handleMouseDown(firstMouseDownEvent)

      // First mouseup creates pending timer
      const firstMouseUpEvent = {
        button: 0,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn()
      }
      service.handleMouseUp(firstMouseUpEvent)

      const firstTimer = service.mouseState.pendingClickTimer
      expect(firstTimer).not.toBeNull()

      // Second mousedown should cancel the timer
      const secondMouseDownEvent = {
        button: 0,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn()
      }
      service.handleMouseDown(secondMouseDownEvent)

      // Timer should be cancelled
      expect(service.mouseState.pendingClickTimer).toBeNull()
      expect(service.mouseState.pendingClickGesture).toBeNull()

      vi.useRealTimers()
    })

    it('should clear pending click state when dblclick fires', () => {
      vi.useFakeTimers()

      service.resetState()
      service.hasCapturedValidKey = false

      // Simulate double-click sequence
      simulateDoubleClick(0)

      // Pending click state should be cleared
      expect(service.mouseState.pendingClickTimer).toBeNull()
      expect(service.mouseState.pendingClickButton).toBeNull()
      expect(service.mouseState.pendingClickGesture).toBeNull()

      vi.useRealTimers()
    })
  })

  describe('Drag gestures (no debounce)', () => {
    it('should capture drag gesture immediately without debounce', () => {
      vi.useFakeTimers()

      service.resetState()
      service.hasCapturedValidKey = false

      // Simulate mousedown
      const mouseDownEvent = {
        button: 0,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn()
      }
      service.handleMouseDown(mouseDownEvent)

      // Simulate mouseup with movement (drag)
      const mouseUpEvent = {
        button: 0,
        clientX: 110,  // Moved 10 pixels (exceeds dragThreshold of 5)
        clientY: 100,
        preventDefault: vi.fn()
      }
      service.handleMouseUp(mouseUpEvent)

      // Should capture immediately, no need to advance timers
      expect(capturedChords).toHaveLength(1)
      expect(capturedChords[0]).toBe('Ldrag')

      // Should not have a pending click timer
      expect(service.mouseState.pendingClickTimer).toBeNull()

      vi.useRealTimers()
    })
  })

  describe('Edge cases', () => {
    it('should cancel left pending click when right button is clicked', () => {
      vi.useFakeTimers()

      service.resetState()
      service.hasCapturedValidKey = false

      // Left mousedown
      const leftMouseDownEvent = {
        button: 0,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn()
      }
      service.handleMouseDown(leftMouseDownEvent)

      // Left click creates pending timer
      const leftMouseUpEvent = {
        button: 0,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn()
      }
      service.handleMouseUp(leftMouseUpEvent)

      expect(service.mouseState.pendingClickButton).toBe(0)

      // Right mousedown should NOT cancel left pending timer (different button)
      const rightMouseDownEvent = {
        button: 2,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn()
      }
      service.handleMouseDown(rightMouseDownEvent)

      // Left pending timer should still exist
      expect(service.mouseState.pendingClickButton).toBe(0)

      vi.useRealTimers()
    })

    it('should handle rapid clicks correctly', () => {
      vi.useFakeTimers()

      service.resetState()
      service.hasCapturedValidKey = false

      // Three rapid clicks
      for (let i = 0; i < 3; i++) {
        const mouseDownEvent = {
          button: 0,
          clientX: 100,
          clientY: 100,
          preventDefault: vi.fn()
        }
        service.handleMouseDown(mouseDownEvent)

        const mouseUpEvent = {
          button: 0,
          clientX: 100,
          clientY: 100,
          preventDefault: vi.fn()
        }
        service.handleMouseUp(mouseUpEvent)
      }

      // Trigger dblclick after third click
      const dblClickEvent = {
        button: 0,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn()
      }
      service.handleDblClick(dblClickEvent)

      // Should capture double-click
      expect(capturedChords).toContain('Ldblclick')

      vi.useRealTimers()
    })
  })

  describe('Legacy behavior', () => {
    it('should not capture double-click when not capturing', () => {
      service.stopCapture()

      const dblClickEvent = {
        button: 0,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn()
      }

      service.handleDblClick(dblClickEvent)

      expect(capturedChords).toHaveLength(0)
      expect(dblClickEvent.preventDefault).not.toHaveBeenCalled()
    })

    it('should prevent default behavior on double-click', () => {
      const dblClickEvent = {
        button: 0,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn()
      }

      service.handleDblClick(dblClickEvent)

      expect(dblClickEvent.preventDefault).toHaveBeenCalled()
    })

    it('should mark hasCapturedValidKey after double-click', () => {
      simulateDoubleClick(0)
      expect(service.hasCapturedValidKey).toBe(true)
    })

    it('should register dblclick event listener on startCapture', () => {
      const newService = new KeyCaptureService({ document: mockDocument })
      newService.startCapture('test')

      expect(mockDocument.addEventListener).toHaveBeenCalledWith(
        'dblclick',
        newService.boundHandleDblClick
      )
    })

    it('should remove dblclick event listener on stopCapture', () => {
      service.stopCapture()

      expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
        'dblclick',
        service.boundHandleDblClick
      )
    })
  })
})
