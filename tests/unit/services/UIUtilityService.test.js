import { describe, it, expect, beforeEach, vi } from 'vitest'
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
}) 