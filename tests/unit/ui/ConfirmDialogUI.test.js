import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import ConfirmDialogUI from '../../../src/js/components/ui/ConfirmDialogUI.js'
import eventBus from '../../../src/js/core/eventBus.js'

// Simple stub for modalManager with show/hide tracking
function createModalManagerStub () {
  return {
    show: vi.fn(),
    hide: vi.fn(),
    registerRegenerateCallback: vi.fn(),
    unregisterRegenerateCallback: vi.fn()
  }
}

describe('ConfirmDialogUI', () => {
  let modalStub, ui

  beforeEach(() => {
    // Provide global requestAnimationFrame stub for immediate execution
    vi.stubGlobal('requestAnimationFrame', (cb) => cb())

    modalStub = createModalManagerStub()
    ui = new ConfirmDialogUI({ modalManager: modalStub, eventBus })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('should resolve true when user clicks yes', async () => {
    const promise = ui.confirm('Proceed?', 'Confirm Test')

    // Modal should be appended to body
    const modalElement = document.querySelector('.confirm-modal')
    expect(modalElement).toBeTruthy()

    // Simulate click on yes button
    modalElement.querySelector('.confirm-yes').dispatchEvent(new MouseEvent('click', { bubbles: true }))

    const result = await promise
    expect(result).toBe(true)
    expect(modalStub.hide).toHaveBeenCalled()
  })

  it('should resolve false when user clicks no', async () => {
    const promise = ui.confirm('Proceed?', 'Confirm Test')

    const modalElement = document.querySelector('.confirm-modal')
    expect(modalElement).toBeTruthy()

    // Simulate click on no button
    modalElement.querySelector('.confirm-no').dispatchEvent(new MouseEvent('click', { bubbles: true }))

    const result = await promise
    expect(result).toBe(false)
    expect(modalStub.hide).toHaveBeenCalled()
  })

  it('should handle safe DOM removal when modal already removed from DOM (confirm)', async () => {
    const promise = ui.confirm('Proceed?', 'Confirm Test')

    const modalElement = document.querySelector('.confirm-modal')
    expect(modalElement).toBeTruthy()

    // Simulate external process removing the modal from DOM
    document.body.removeChild(modalElement)

    // Verify modal is no longer in DOM
    expect(document.querySelector('.confirm-modal')).toBeNull()

    // Simulate click on yes button - should not throw DOMException
    expect(() => {
      modalElement.querySelector('.confirm-yes').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }).not.toThrow()

    const result = await promise
    expect(result).toBe(true)
    expect(modalStub.hide).toHaveBeenCalled()
  })

  it('should handle safe DOM removal when modal already removed from DOM (inform)', async () => {
    const promise = ui.inform('Information message', 'Info Test')

    const modalElement = document.querySelector('.inform-modal')
    expect(modalElement).toBeTruthy()

    // Simulate external process removing the modal from DOM
    document.body.removeChild(modalElement)

    // Verify modal is no longer in DOM
    expect(document.querySelector('.inform-modal')).toBeNull()

    // Simulate click on OK button - should not throw DOMException
    expect(() => {
      modalElement.querySelector('.inform-ok').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }).not.toThrow()

    const result = await promise
    expect(result).toBe(true)
    expect(modalStub.hide).toHaveBeenCalled()
  })

  it('should handle safe DOM removal when modal parent is null', async () => {
    const promise = ui.confirm('Proceed?', 'Confirm Test')

    const modalElement = document.querySelector('.confirm-modal')
    expect(modalElement).toBeTruthy()

    // Simulate modal being removed by setting parentNode to null
    modalElement.parentNode?.removeChild(modalElement)

    // Simulate click on yes button - should not throw DOMException
    expect(() => {
      modalElement.querySelector('.confirm-yes').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }).not.toThrow()

    const result = await promise
    expect(result).toBe(true)
    expect(modalStub.hide).toHaveBeenCalled()
  })
}) 