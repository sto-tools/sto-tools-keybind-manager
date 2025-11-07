import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import KeyCaptureUI from '../../../src/js/components/ui/KeyCaptureUI.js'

function createDomFixture () {
  document.body.innerHTML = `
    <div id="keySelectionModal" tabindex="-1">
      <div class="modal-body"></div>
    </div>
  `
  return {
    cleanup: () => (document.body.innerHTML = '')
  }
}

describe('KeyCaptureUI', () => {
  let fixture, eventBusFixture, ui, dom

  beforeEach(async () => {
    dom = createDomFixture()
    fixture = createServiceFixture()
    eventBusFixture = fixture.eventBusFixture
    ui = new KeyCaptureUI({ eventBus: eventBusFixture.eventBus, document })
    await ui.init()
  })

  afterEach(() => {
    dom.cleanup()
    fixture.destroy()
  })

  it('startCaptureMode should prepare UI and emit keycapture:start', () => {
    // First initialize the modal to build the content
    ui.buildModalContent()

    ui.startCaptureMode('keySelectionModal')

    // Check that capture indicator becomes active
    const captureIndicator = document.getElementById('captureIndicator')
    expect(captureIndicator).toBeTruthy()
    expect(captureIndicator.classList.contains('active')).toBe(true)

    // Check that confirm button is disabled initially
    const confirmBtn = document.getElementById('confirm-key-selection')
    expect(confirmBtn).toBeTruthy()
    expect(confirmBtn.disabled).toBe(true)

    // Check that virtual keyboard is disabled during capture
    const virtualKeyboard = document.getElementById('virtualKeyboard')
    expect(virtualKeyboard).toBeTruthy()
    expect(virtualKeyboard.classList.contains('disabled')).toBe(true)

    eventBusFixture.expectEvent('keycapture:start', { context: 'keySelectionModal' })
  })

  it('handleCaptureStop should restore UI', () => {
    // First initialize the modal to build the content
    ui.buildModalContent()

    // Simulate start first
    ui.startCaptureMode('keySelectionModal')

    // Emit capture-stop event
    eventBusFixture.eventBus.emit('capture-stop', { context: 'keySelectionModal' })

    // Check that capture indicator is no longer active
    const captureIndicator = document.getElementById('captureIndicator')
    expect(captureIndicator).toBeTruthy()
    expect(captureIndicator.classList.contains('active')).toBe(false)

    // Check that virtual keyboard is enabled after capture stops
    const virtualKeyboard = document.getElementById('virtualKeyboard')
    expect(virtualKeyboard).toBeTruthy()
    expect(virtualKeyboard.classList.contains('disabled')).toBe(false)
  })

  describe('confirmSelection', () => {
    it('shows success toast and resets state after adding a key', async () => {
      ui.cache.selectedKey = 'K1'
      ui.modalManager = { hide: vi.fn() }
      ui.resetState = vi.fn()
      ui.i18n = { t: vi.fn((key, params) => {
        if (key === 'key_added') {
          return `key_added:${params?.keyName ?? ''}`
        }
        return key
      }) }
      ui.request = vi.fn().mockResolvedValue({ success: true })

      const toastSpy = vi.spyOn(ui, 'showToast')

      await ui.confirmSelection()

      expect(ui.request).toHaveBeenCalledWith('key:add', { key: 'K1' })
      expect(toastSpy).toHaveBeenCalledWith('key_added:K1', 'success')
      expect(ui.modalManager.hide).toHaveBeenCalledWith('keySelectionModal')
      expect(ui.resetState).toHaveBeenCalled()
    })

    it('shows error toast and keeps modal open when add fails', async () => {
      ui.cache.selectedKey = 'K2'
      ui.modalManager = { hide: vi.fn() }
      ui.resetState = vi.fn()
      ui.i18n = { t: vi.fn((key, params) => `${key}:${params?.keyName ?? ''}`) }
      ui.request = vi.fn().mockResolvedValue({
        success: false,
        error: 'key_already_exists',
        params: { keyName: 'K2' }
      })

      const toastSpy = vi.spyOn(ui, 'showToast')

      await ui.confirmSelection()

      expect(ui.request).toHaveBeenCalledWith('key:add', { key: 'K2' })
      expect(toastSpy).toHaveBeenCalledWith('key_already_exists:K2', 'error')
      expect(ui.modalManager.hide).not.toHaveBeenCalled()
      expect(ui.resetState).not.toHaveBeenCalled()
    })

    it('shows success toast when duplication succeeds', async () => {
      ui.isDuplicationMode = true
      ui.sourceKeyForDuplication = 'F1'
      ui.cache.selectedKey = 'F7'
      ui.modalManager = { hide: vi.fn() }
      ui.resetState = vi.fn()
      ui.i18n = { t: vi.fn((key, params) => `${key}:${params.from}->${params.to}`) }
      ui.request = vi.fn().mockResolvedValue({
        success: true,
        sourceKey: 'F1',
        newKey: 'F7'
      })

      const toastSpy = vi.spyOn(ui, 'showToast')

      await ui.confirmSelection()

      expect(ui.request).toHaveBeenCalledWith('key:duplicate-with-name', { sourceKey: 'F1', newKey: 'F7' })
      expect(toastSpy).toHaveBeenCalledWith('key_duplicated:F1->F7', 'success')
      expect(ui.modalManager.hide).toHaveBeenCalledWith('keySelectionModal')
      expect(ui.resetState).toHaveBeenCalled()
    })

    it('shows error toast when duplication fails', async () => {
      ui.isDuplicationMode = true
      ui.sourceKeyForDuplication = 'F1'
      ui.cache.selectedKey = 'F7'
      ui.modalManager = { hide: vi.fn() }
      ui.resetState = vi.fn()
      ui.i18n = { t: vi.fn((key) => key) }
      ui.request = vi.fn().mockResolvedValue({
        success: false,
        error: 'failed_to_duplicate_key'
      })

      const toastSpy = vi.spyOn(ui, 'showToast')

      await ui.confirmSelection()

      expect(toastSpy).toHaveBeenCalledWith('failed_to_duplicate_key', 'error')
      expect(ui.modalManager.hide).not.toHaveBeenCalled()
      expect(ui.resetState).not.toHaveBeenCalled()
      expect(ui.isDuplicationMode).toBe(true)
    })
  })
})
