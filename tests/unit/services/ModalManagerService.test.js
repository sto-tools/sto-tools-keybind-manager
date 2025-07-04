import { describe, it, beforeEach, afterEach, expect } from 'vitest'
import { createEventBusFixture } from '../../fixtures/index.js'
import ModalManagerService from '../../../src/js/components/services/ModalManagerService.js'

function createDomFixture () {
  const overlay = document.createElement('div')
  overlay.id = 'modalOverlay'
  document.body.appendChild(overlay)

  const modal = document.createElement('div')
  modal.id = 'testModal'
  modal.className = 'modal'
  modal.innerHTML = '<button data-modal="testModal">Close</button>'
  document.body.appendChild(modal)

  return {
    cleanup: () => {
      overlay.remove()
      modal.remove()
    }
  }
}

describe('ModalManagerService', () => {
  let eventBusFixture, service, dom

  beforeEach(() => {
    dom = createDomFixture()
    eventBusFixture = createEventBusFixture()
    service = new ModalManagerService(eventBusFixture.eventBus)
    service.init()
  })

  afterEach(() => {
    dom.cleanup()
    eventBusFixture.destroy()
  })

  it('should show and hide modal via event bus', () => {
    eventBusFixture.eventBus.emit('modal:show', { modalId: 'testModal' })

    const modal = document.getElementById('testModal')
    const overlay = document.getElementById('modalOverlay')
    expect(modal.classList.contains('active')).toBe(true)
    expect(overlay.classList.contains('active')).toBe(true)

    eventBusFixture.eventBus.emit('modal:hide', { modalId: 'testModal' })
    expect(modal.classList.contains('active')).toBe(false)
    expect(overlay.classList.contains('active')).toBe(false)
  })

  it('should toggle modal via click on data-modal element', () => {
    // Show first
    service.show('testModal')
    const modal = document.getElementById('testModal')
    expect(modal.classList.contains('active')).toBe(true)

    // Click close button (has data-modal attr)
    modal.querySelector('[data-modal="testModal"]').click()
    expect(modal.classList.contains('active')).toBe(false)
  })
}) 