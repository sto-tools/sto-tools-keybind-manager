import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import eventBus from '../../../src/js/core/eventBus.js'

describe('eventBus DOM event listener cleanup', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    // Clean up any remaining listeners after each test
    eventBus.cleanupDomListeners()
  })

  it('tracks DOM event listeners in eventBus', () => {
    document.body.innerHTML = '<button id="testBtn"></button>'
    const handler = vi.fn()
    
    // Create a DOM event listener
    const cleanup1 = eventBus.onDom('testBtn', 'click', 'test-event', handler)
    const cleanup2 = eventBus.onDom('testBtn', 'focus', 'test-focus', handler)
    
    // Both listeners should be tracked
    expect(typeof cleanup1).toBe('function')
    expect(typeof cleanup2).toBe('function')
    
    // Verify listeners work
    document.getElementById('testBtn').click()
    expect(handler).toHaveBeenCalledTimes(1)
    
    // Clean up
    cleanup1()
    cleanup2()
  })

  it('cleanupDomListeners removes all tracked DOM listeners', () => {
    document.body.innerHTML = '<button id="btn1"></button><button id="btn2"></button>'
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    
    // Create multiple DOM event listeners
    eventBus.onDom('btn1', 'click', 'event1', handler1)
    eventBus.onDom('btn2', 'click', 'event2', handler2)
    
    // Verify listeners work
    document.getElementById('btn1').click()
    document.getElementById('btn2').click()
    expect(handler1).toHaveBeenCalledTimes(1)
    expect(handler2).toHaveBeenCalledTimes(1)
    
    // Clean up all listeners
    eventBus.cleanupDomListeners()
    
    // Verify listeners are removed
    handler1.mockClear()
    handler2.mockClear()
    document.getElementById('btn1').click()
    document.getElementById('btn2').click()
    expect(handler1).not.toHaveBeenCalled()
    expect(handler2).not.toHaveBeenCalled()
  })

  it('removes cleanup function from tracking after manual cleanup', () => {
    document.body.innerHTML = '<button id="testBtn"></button>'
    const handler = vi.fn()
    
    // Create a DOM event listener
    const cleanup = eventBus.onDom('testBtn', 'click', 'test-event', handler)
    
    // Manually call cleanup
    cleanup()
    
    // Verify listener is removed
    document.getElementById('testBtn').click()
    expect(handler).not.toHaveBeenCalled()
    
    // cleanupDomListeners should not error even though this listener was already cleaned up
    expect(() => eventBus.cleanupDomListeners()).not.toThrow()
  })

  it('tracks delegated listeners (string selector)', () => {
    document.body.innerHTML = '<button id="testBtn"></button>'
    const handler = vi.fn()
    
    // Create a delegated listener using string selector
    eventBus.onDom('testBtn', 'click', 'test-event', handler)
    
    // Verify listener works
    document.getElementById('testBtn').click()
    expect(handler).toHaveBeenCalledTimes(1)
    
    // Clean up all listeners
    eventBus.cleanupDomListeners()
    
    // Verify listener is removed
    handler.mockClear()
    document.getElementById('testBtn').click()
    expect(handler).not.toHaveBeenCalled()
  })

  it('tracks direct element listeners', () => {
    document.body.innerHTML = '<button id="testBtn"></button>'
    const element = document.getElementById('testBtn')
    const handler = vi.fn()
    
    // Create a direct element listener
    eventBus.onDom(element, 'click', 'test-event', handler)
    
    // Verify listener works
    element.click()
    expect(handler).toHaveBeenCalledTimes(1)
    
    // Clean up all listeners
    eventBus.cleanupDomListeners()
    
    // Verify listener is removed
    handler.mockClear()
    element.click()
    expect(handler).not.toHaveBeenCalled()
  })

  it('handles CSS selector syntax', () => {
    document.body.innerHTML = '<button class="test-class"></button>'
    const handler = vi.fn()
    
    // Create a listener using CSS class selector
    eventBus.onDom('.test-class', 'click', 'test-event', handler)
    
    // Verify listener works
    document.querySelector('.test-class').click()
    expect(handler).toHaveBeenCalledTimes(1)
    
    // Clean up all listeners
    eventBus.cleanupDomListeners()
    
    // Verify listener is removed
    handler.mockClear()
    document.querySelector('.test-class').click()
    expect(handler).not.toHaveBeenCalled()
  })

  it('handles shorthand signature (no busEvent)', () => {
    document.body.innerHTML = '<button id="testBtn"></button>'
    const handler = vi.fn()
    
    // Create a listener using shorthand signature
    eventBus.onDom('testBtn', 'click', handler)
    
    // Verify listener works
    document.getElementById('testBtn').click()
    expect(handler).toHaveBeenCalledTimes(1)
    
    // Clean up all listeners
    eventBus.cleanupDomListeners()
    
    // Verify listener is removed
    handler.mockClear()
    document.getElementById('testBtn').click()
    expect(handler).not.toHaveBeenCalled()
  })

  it('handles listeners without handler (emit only)', () => {
    document.body.innerHTML = '<button id="testBtn"></button>'
    const busHandler = vi.fn()
    
    // Listen to the bus event
    eventBus.on('test-event', busHandler)
    
    // Create a listener that only emits to the bus
    eventBus.onDom('testBtn', 'click', 'test-event')
    
    // Verify bus event is emitted
    document.getElementById('testBtn').click()
    expect(busHandler).toHaveBeenCalledTimes(1)
    
    // Clean up all listeners
    eventBus.cleanupDomListeners()
    
    // Verify DOM listener is removed (bus event should not be emitted)
    busHandler.mockClear()
    document.getElementById('testBtn').click()
    expect(busHandler).not.toHaveBeenCalled()
    
    // Clean up bus listener
    eventBus.off('test-event', busHandler)
  })
})

