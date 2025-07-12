import { describe, it, expect } from 'vitest'
import KeyCaptureUI from '../../../src/js/components/ui/KeyCaptureUI.js'
import { createServiceFixture } from '../../fixtures/index.js'

function createStubDocument () {
  return {
    getElementById: () => null,
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  }
}

describe('KeyCaptureUI – unsafe key detection', () => {
  it('detects unsafe chord via isUnsafeChord', () => {
    const fixture = createServiceFixture()
    const ui = new KeyCaptureUI({ eventBus: fixture.eventBus, document: createStubDocument() })

    expect(ui.isUnsafeChord('Alt+F4')).toBe(true)
    expect(ui.isUnsafeChord('Ctrl+A')).toBe(false)

    fixture.destroy()
  })
}) 