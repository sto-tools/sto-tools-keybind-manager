// Test to verify standalone modifier key capture functionality
import { describe, it, expect, beforeEach, vi } from 'vitest'
import KeyCaptureService from '../../../src/js/components/services/KeyCaptureService.js'

// Minimal stub for document to satisfy service constructor
const createStubDocument = () => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
})

describe('KeyCaptureService – standalone modifier capture', () => {
  let service
  let mockDocument
  let capturedChords = []

  beforeEach(() => {
    mockDocument = createStubDocument()
    service = new KeyCaptureService({ document: mockDocument })
    capturedChords = []

    // Mock the emit method to capture events
    const originalEmit = service.emit
    service.emit = vi.fn((event, data) => {
      if (event === 'chord-captured') {
        capturedChords.push(data.chord)
      }
      originalEmit.call(service, event, data)
    })

    service.startCapture('test')
  })

  const simulateKeySequence = (downCode, upCode = downCode) => {
    // Reset capture state for each test
    service.resetState()
    service.hasCapturedValidKey = false
    
    // Simulate keydown
    const downEvent = { code: downCode, preventDefault: vi.fn() }
    service.handleKeyDown(downEvent)
    
    // Simulate keyup
    const upEvent = { code: upCode, preventDefault: vi.fn() }
    service.handleKeyUp(upEvent)
  }

  it('should capture standalone Shift keys', () => {
    simulateKeySequence('ShiftLeft')
    expect(capturedChords).toContain('Shift')

    capturedChords.length = 0 // Clear
    simulateKeySequence('ShiftRight')
    expect(capturedChords).toContain('Shift')
  })

  it('should capture standalone Ctrl keys', () => {
    simulateKeySequence('ControlLeft')
    expect(capturedChords).toContain('Ctrl')

    capturedChords.length = 0 // Clear
    simulateKeySequence('ControlRight')
    expect(capturedChords).toContain('Ctrl')
  })

  it('should capture standalone Alt keys', () => {
    simulateKeySequence('AltLeft')
    expect(capturedChords).toContain('Alt')

    capturedChords.length = 0 // Clear
    simulateKeySequence('AltRight')
    expect(capturedChords).toContain('Alt')
  })

  it('should capture standalone Meta keys', () => {
    simulateKeySequence('MetaLeft')
    expect(capturedChords).toContain('Meta')

    capturedChords.length = 0 // Clear
    simulateKeySequence('MetaRight')
    expect(capturedChords).toContain('Meta')
  })

  it('should capture location-specific modifier keys when enabled', () => {
    service.setLocationSpecific(true)
    
    simulateKeySequence('ControlLeft')
    expect(capturedChords).toContain('LCTRL')

    capturedChords.length = 0 // Clear
    simulateKeySequence('ControlRight')
    expect(capturedChords).toContain('RCTRL')

    capturedChords.length = 0 // Clear
    simulateKeySequence('AltLeft')
    expect(capturedChords).toContain('LALT')

    capturedChords.length = 0 // Clear
    simulateKeySequence('AltRight')
    expect(capturedChords).toContain('RALT')
  })

  it('should still capture modifier chords correctly', () => {
    // Simulate Ctrl+A
    const ctrlDownEvent = { code: 'ControlLeft', preventDefault: vi.fn() }
    service.handleKeyDown(ctrlDownEvent)
    
    const aDownEvent = { code: 'KeyA', preventDefault: vi.fn() }
    service.handleKeyDown(aDownEvent)
    
    expect(capturedChords).toContain('Ctrl+A')
  })

  it('should not capture modifier as standalone if other keys are pressed', () => {
    // Press Ctrl, then A, then release Ctrl first
    const ctrlDownEvent = { code: 'ControlLeft', preventDefault: vi.fn() }
    service.handleKeyDown(ctrlDownEvent)
    
    const aDownEvent = { code: 'KeyA', preventDefault: vi.fn() }
    service.handleKeyDown(aDownEvent)
    
    // This should capture Ctrl+A, not standalone Ctrl
    expect(capturedChords).toContain('Ctrl+A')
    expect(capturedChords).not.toContain('Ctrl')
  })
})