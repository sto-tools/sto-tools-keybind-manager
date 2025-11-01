// Test to verify KeyCaptureService mouse press gesture button capture fix
import { describe, it, expect, beforeEach, vi } from 'vitest'
import KeyCaptureService from '../../../src/js/components/services/KeyCaptureService.js'

// Minimal stub for document to satisfy service constructor
const createStubDocument = () => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
})

describe('KeyCaptureService – mouse press gesture button capture', () => {
  let service
  let mockDocument
  let capturedGestures = []

  beforeEach(() => {
    mockDocument = createStubDocument()
    service = new KeyCaptureService({ document: mockDocument })
    capturedGestures = []

    // Mock the emit method to capture events
    const originalEmit = service.emit
    service.emit = vi.fn((event, data) => {
      if (event === 'gesture-captured') {
        capturedGestures.push(data.gesture)
      }
      originalEmit.call(service, event, data)
    })

    service.startCapture('test')
  })

  const simulateMousePress = (button, timeout = 200) => {
    // Reset capture state for each test
    service.resetState()
    service.hasCapturedValidKey = false

    // Simulate mousedown with specific button
    const downEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleMouseDown(downEvent)

    // Wait for the timeout to complete
    vi.advanceTimersByTime(timeout)
  }

  const simulateMouseClick = (button) => {
    // Reset capture state for each test
    service.resetState()
    service.hasCapturedValidKey = false

    // Simulate mousedown with specific button
    const downEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleMouseDown(downEvent)

    // Simulate mouseup immediately (click)
    const upEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleMouseUp(upEvent)
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should capture mouse press gesture with left button', () => {
    simulateMousePress(0) // Left mouse button
    expect(service.mouseState.button).toBe(0)
  })

  it('should capture mouse press gesture with right button', () => {
    simulateMousePress(2) // Right mouse button
    expect(service.mouseState.button).toBe(2)
  })

  it('should capture mouse press gesture with middle button', () => {
    simulateMousePress(1) // Middle mouse button
    expect(service.mouseState.button).toBe(1)
  })

  it('should preserve button value in mouseState during press timeout', () => {
    simulateMousePress(0) // Left mouse button
    expect(service.mouseState.button).toBe(0)
    expect(service.mouseState.isDown).toBe(true)
  })

  it('should clear press timer on mouse up', () => {
    simulateMouseClick(0) // Left mouse button
    expect(service.mouseState.pressTimer).toBeNull()
    expect(service.mouseState.isDown).toBe(false)
  })

  it('should reset state correctly', () => {
    simulateMousePress(0)
    service.resetState()
    expect(service.mouseState.button).toBe(null)
    expect(service.mouseState.isDown).toBe(false)
    expect(service.mouseState.pressTimer).toBeNull()
  })

  it('should handle multiple mouse button presses correctly', () => {
    // First button press
    simulateMousePress(0)
    expect(service.mouseState.button).toBe(0)

    // Second button press after reset
    service.resetState()
    simulateMousePress(2)
    expect(service.mouseState.button).toBe(2)
  })

  it('should capture mouse coordinates correctly', () => {
    const downEvent = {
      button: 0,
      clientX: 150,
      clientY: 200,
      preventDefault: vi.fn()
    }
    service.handleMouseDown(downEvent)

    expect(service.mouseState.startX).toBe(150)
    expect(service.mouseState.startY).toBe(200)
  })

  it('should not capture gestures when not capturing', () => {
    service.stopCapture()
    const downEvent = {
      button: 0,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }

    service.handleMouseDown(downEvent)
    vi.advanceTimersByTime(200)

    expect(service.mouseState.isDown).toBe(false)
  })
})