import { describe, it, expect, vi } from 'vitest'
import eventBus from '../../src/js/core/eventBus.js'

describe('eventBus core functionality', () => {
  it('registers and emits events to handlers', () => {
    const handler = vi.fn()
    eventBus.on('unit-event-register', handler)

    const payload = { foo: 'bar' }
    eventBus.emit('unit-event-register', payload)

    expect(handler).toHaveBeenCalledWith(payload)

    eventBus.off('unit-event-register', handler)
  })

  it('removes handlers using off', () => {
    const handler = vi.fn()
    eventBus.on('unit-event-remove', handler)
    eventBus.off('unit-event-remove', handler)

    eventBus.emit('unit-event-remove', { test: true })
    expect(handler).not.toHaveBeenCalled()
  })

  it('onDom emits specified bus event and cleans up', () => {
    document.body.innerHTML = '<button id="domBtn"></button>'
    const handler = vi.fn()
    const cleanup = eventBus.onDom('domBtn', 'click', 'unit-dom-event', handler)

    document.getElementById('domBtn').click()
    expect(handler).toHaveBeenCalledTimes(1)

    cleanup()
    handler.mockClear()
    document.getElementById('domBtn').click()
    expect(handler).not.toHaveBeenCalled()
  })

  it('onDom uses domEvent as busEvent when omitted', () => {
    document.body.innerHTML = '<button id="domBtn2"></button>'
    const handler = vi.fn()
    const cleanup = eventBus.onDom('domBtn2', 'click', handler)

    document.getElementById('domBtn2').click()
    expect(handler).toHaveBeenCalledTimes(1)

    cleanup()
    handler.mockClear()
    document.getElementById('domBtn2').click()
    expect(handler).not.toHaveBeenCalled()
  })
})
