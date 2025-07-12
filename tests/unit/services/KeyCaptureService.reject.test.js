import { describe, it, expect } from 'vitest'
import KeyCaptureService from '../../../src/js/components/services/KeyCaptureService.js'

// Minimal stub for document to satisfy service constructor
const createStubDocument = () => ({
  addEventListener: () => {},
  removeEventListener: () => {}
})

describe('KeyCaptureService – unsafe keybind rejection', () => {
  it('identifies unsafe key combinations', () => {
    const svc = new KeyCaptureService({ document: createStubDocument() })

    expect(svc.isRejectedChord('Alt+F4')).toBe(true)
    expect(svc.isRejectedChord('Ctrl+F4')).toBe(false)

    // Case insensitivity
    expect(svc.isRejectedChord('ALT+TAB')).toBe(true)
  })
}) 