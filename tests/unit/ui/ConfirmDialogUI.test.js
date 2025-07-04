import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import ConfirmDialogUI from '../../../src/js/components/ui/ConfirmDialogUI.js'

// Simple stub for modalManager with show/hide tracking
function createModalManagerStub () {
  return {
    show: vi.fn(),
    hide: vi.fn()
  }
}

describe('ConfirmDialogUI', () => {
  let modalStub, ui

  beforeEach(() => {
    // Provide global requestAnimationFrame stub for immediate execution
    vi.stubGlobal('requestAnimationFrame', (cb) => cb())

    modalStub = createModalManagerStub()
    ui = new ConfirmDialogUI({ modalManager: modalStub })
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
    modalElement.querySelector('.confirm-yes').click()

    const result = await promise
    expect(result).toBe(true)
    expect(modalStub.hide).toHaveBeenCalled()
  })

  it('should resolve false when user clicks no', async () => {
    const promise = ui.confirm('Proceed?', 'Confirm Test')

    const modalElement = document.querySelector('.confirm-modal')
    expect(modalElement).toBeTruthy()

    // Simulate click on no button
    modalElement.querySelector('.confirm-no').click()

    const result = await promise
    expect(result).toBe(false)
    expect(modalStub.hide).toHaveBeenCalled()
  })
}) 