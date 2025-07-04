// Sample unit test demonstrating fixture usage
import { describe, it, expect, vi } from 'vitest'
import { createEventBusFixture } from '../fixtures'

describe('EventBus Core Functionality', () => {
  it('should register and emit events to handlers', () => {
    const { eventBus, expectEvent, expectEventCount } = createEventBusFixture()

    const handler = vi.fn()
    eventBus.on('test-event', handler)

    const payload = { message: 'hello' }
    eventBus.emit('test-event', payload)

    expect(handler).toHaveBeenCalledWith(payload)
    expectEvent('test-event', payload)
    expectEventCount('test-event', 1)
  })

  it('should remove handlers using off', () => {
    const { eventBus, expectEventCount } = createEventBusFixture()

    const handler = vi.fn()
    eventBus.on('test-event', handler)
    eventBus.off('test-event', handler)

    eventBus.emit('test-event', { test: true })
    
    expect(handler).not.toHaveBeenCalled()
    expectEventCount('test-event', 1) // Event was emitted but handler wasn't called
  })

  it('should handle once events correctly', async () => {
    const { eventBus, waitForEvent } = createEventBusFixture()

    const handler = vi.fn()
    eventBus.once('once-event', handler)

    // Set up the wait first, then emit
    const eventPromise = waitForEvent('once-event')
    eventBus.emit('once-event', { data: 'test' })
    
    // Wait for the event and verify handler was called
    await eventPromise
    expect(handler).toHaveBeenCalledTimes(1)

    // Emit again - handler should not be called
    eventBus.emit('once-event', { data: 'test2' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('should provide event history for debugging', () => {
    const { eventBus, getEventHistory, getEventsOfType } = createEventBusFixture()

    eventBus.emit('event1', { data: 1 })
    eventBus.emit('event2', { data: 2 })
    eventBus.emit('event1', { data: 3 })

    const history = getEventHistory()
    expect(history).toHaveLength(3)

    const event1History = getEventsOfType('event1')
    expect(event1History).toHaveLength(2)
    expect(event1History[0].data).toEqual({ data: 1 })
    expect(event1History[1].data).toEqual({ data: 3 })
  })
}) 