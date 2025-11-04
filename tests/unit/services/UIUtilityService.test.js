import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import UIUtilityService from '../../../src/js/components/services/UIUtilityService.js'
import { createEventBusFixture } from '../../fixtures'

/**
 * Unit tests – UIUtilityService (clipboard and drag-drop utilities)
 */

describe('UIUtilityService', () => {
  let service

  beforeEach(() => {
    const { eventBus } = createEventBusFixture()
    service = new UIUtilityService(eventBus)
  })

  it('should have drag state initialized', () => {
    expect(service.dragState).toEqual({
      isDragging: false,
      dragElement: null,
      dragData: null,
    })
  })

  it('should initialize drag and drop functionality', () => {
    // Create a mock container element
    const container = document.createElement('div')
    container.id = 'test-container'
    document.body.appendChild(container)

    // Mock event listener to verify it's called
    const addEventListenerSpy = vi.spyOn(container, 'addEventListener')

    // Call initDragAndDrop
    service.initDragAndDrop(container, {
      draggableSelector: '.draggable',
      onDragStart: vi.fn(),
      onDragEnd: vi.fn(),
    })

    // Verify event listeners were added
    expect(addEventListenerSpy).toHaveBeenCalledWith('dragstart', expect.any(Function))
    expect(addEventListenerSpy).toHaveBeenCalledWith('dragend', expect.any(Function))
    expect(addEventListenerSpy).toHaveBeenCalledWith('dragover', expect.any(Function))
    expect(addEventListenerSpy).toHaveBeenCalledWith('drop', expect.any(Function))

    // Cleanup
    document.body.removeChild(container)
    addEventListenerSpy.mockRestore()
  })

  describe('Event Handlers', () => {
    it('should handle copy to clipboard events', async () => {
      const emitSpy = vi.spyOn(service, 'emit')
      const copyToClipboardSpy = vi.spyOn(service, 'copyToClipboard').mockResolvedValue({ success: true })

      await service.handleCopyToClipboard({ text: 'test text' })

      expect(copyToClipboardSpy).toHaveBeenCalledWith('test text')
      expect(emitSpy).toHaveBeenCalledWith('ui:clipboard-result', {
        success: { success: true },
        text: 'test text'
      })

      copyToClipboardSpy.mockRestore()
      emitSpy.mockRestore()
    })

    it('should handle init drag drop events', async () => {
      const emitSpy = vi.spyOn(service, 'emit')
      const container = document.createElement('div')
      container.id = 'drag-container'
      document.body.appendChild(container)

      await service.handleInitDragDrop({ containerId: 'drag-container', options: { test: true } })

      expect(emitSpy).toHaveBeenCalledWith('ui:drag-drop-initialized', {
        containerId: 'drag-container',
        options: { test: true }
      })

      document.body.removeChild(container)
      emitSpy.mockRestore()
    })
  })

  describe('copyToClipboard', () => {
    let originalClipboard
    let originalExecCommand

    beforeEach(() => {
      originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
      originalExecCommand = document.execCommand
    })

    afterEach(() => {
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', originalClipboard)
      } else {
        delete navigator.clipboard
      }
      document.execCommand = originalExecCommand
      vi.restoreAllMocks()
    })

    it('returns success payload when clipboard API is available', async () => {
      const writeText = vi.fn().mockResolvedValue()
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true
      })

      const result = await service.copyToClipboard('hello world')

      expect(writeText).toHaveBeenCalledWith('hello world')
      expect(result).toEqual({ success: true, message: 'content_copied_to_clipboard' })
    })

    it('falls back to execCommand when clipboard API rejects', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockRejectedValue(new Error('no clipboard')) },
        configurable: true
      })
      document.execCommand = vi.fn().mockReturnValue(true)

      const result = await service.copyToClipboard('fallback text')

      expect(document.execCommand).toHaveBeenCalledWith('copy')
      expect(result).toEqual({ success: true, message: 'content_copied_to_clipboard' })
    })

    it('returns failure payload when fallback copy fails', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockRejectedValue(new Error('no clipboard')) },
        configurable: true
      })
      document.execCommand = vi.fn(() => { throw new Error('exec fail') })

      const result = await service.copyToClipboard('cannot copy')

      expect(document.execCommand).toHaveBeenCalledWith('copy')
      expect(result).toEqual({ success: false, message: 'failed_to_copy_to_clipboard' })
    })
  })
})
