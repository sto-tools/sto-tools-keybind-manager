import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import UIUtilityService from '../../../src/js/components/services/UIUtilityService.js'
import { createEventBusFixture } from '../../fixtures'

/**
 * Unit tests – UIUtilityService (pure helpers)
 */

describe('UIUtilityService', () => {
  let service

  beforeEach(() => {
    const { eventBus } = createEventBusFixture()
    service = new UIUtilityService(eventBus)
  })

  it('isValidEmail correctly validates email strings', () => {
    expect(service.isValidEmail('john.doe@example.com')).toBe(true)
    expect(service.isValidEmail('not-an-email')).toBe(false)
    expect(service.isValidEmail('bob@local')).toBe(false)
  })

  it('validateForm returns invalid when required field empty', () => {
    document.body.innerHTML = `<form id="testForm"><input id="name" name="name" required value="" /></form>`
    const formEl = document.getElementById('testForm')
    const result = service.validateForm(formEl)
    expect(result.isValid).toBe(false)
    expect(result.errors.length).toBe(1)
  })

  it('debounce delays function execution', () => {
    vi.useFakeTimers()

    const fn = vi.fn()
    const debounced = service.debounce(fn, 100)

    debounced()
    debounced()
    // At this point function should not have executed
    expect(fn).not.toHaveBeenCalled()

    // Fast-forward time
    vi.advanceTimersByTime(120)
    expect(fn).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
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
