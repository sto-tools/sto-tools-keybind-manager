import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import ToastService from '../../../src/js/components/services/ToastService.js'


describe('ToastService', () => {
  let fixture, service, eventBusFixture

  beforeEach(() => {
    // Provide a container element in the JSDOM
    document.body.innerHTML = '<div id="toastContainer"></div>'

    fixture = createServiceFixture()
    eventBusFixture = fixture.eventBusFixture
    service = new ToastService({ eventBus: eventBusFixture.eventBus })

    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    document.body.innerHTML = ''
    fixture.destroy()
  })

  it('should create and display a toast in the container', () => {
    service.showToast('Hello World', 'success', 1000)
    const toast = document.querySelector('#toastContainer .toast.toast-success')
    expect(toast).toBeTruthy()
  })

  it('should automatically remove a toast after the specified duration', () => {
    service.showToast('Goodbye', 'info', 500)
    expect(document.querySelector('#toastContainer .toast')).toBeTruthy()

    // Advance timers: 500ms display duration + 300ms removal animation
    vi.advanceTimersByTime(800)
    expect(document.querySelector('#toastContainer .toast')).toBeNull()
  })
}) 