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

  const simulateDoubleClick = (button) => {
    // Reset capture state for each test
    service.resetState()
    service.hasCapturedValidKey = false

    // Simulate dblclick event with specific button
    const dblClickEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleDblClick(dblClickEvent)
  }

  const simulateDoubleClickWithModifiers = (button, modifiers) => {
    // Reset capture state for each test
    service.resetState()
    service.hasCapturedValidKey = false

    // Add modifier codes to pressed codes
    modifiers.forEach(code => service.pressedCodes.add(code))

    // Simulate dblclick event with specific button
    const dblClickEvent = {
      button,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    }
    service.handleDblClick(dblClickEvent)
  }

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
