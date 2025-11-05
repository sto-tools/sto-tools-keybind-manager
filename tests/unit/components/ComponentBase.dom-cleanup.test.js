import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ComponentBase from '../../../src/js/components/ComponentBase.js'
import eventBus from '../../../src/js/core/eventBus.js'

describe('ComponentBase DOM event listener automatic cleanup', () => {
  let component

  beforeEach(() => {
    document.body.innerHTML = ''
    component = new ComponentBase(eventBus)
  })

  afterEach(() => {
    if (component && !component.destroyed) {
      component.destroy()
    }
    // Clean up any remaining eventBus listeners
    eventBus.clear()
  })

  it('onDom wrapper automatically tracks cleanup function', () => {
    document.body.innerHTML = '<button id="testBtn"></button>'
    const handler = vi.fn()
    
    component.init()
    
    // Use component.onDom instead of eventBus.onDom
    component.onDom('testBtn', 'click', 'test-event', handler)
    
    // Verify listener works
    document.getElementById('testBtn').click()
    expect(handler).toHaveBeenCalledTimes(1)
    
    // Destroy component
    component.destroy()
    
    // Verify listener is automatically removed
    handler.mockClear()
    document.getElementById('testBtn').click()
    expect(handler).not.toHaveBeenCalled()
  })

  it('onDomDebounced wrapper automatically tracks cleanup function', () => {
    document.body.innerHTML = '<input id="testInput" />'
    const handler = vi.fn()
    
    component.init()
    
    // Use component.onDomDebounced
    component.onDomDebounced('testInput', 'input', 'test-input-event', handler, 100)
    
    // Trigger input event
    const input = document.getElementById('testInput')
    input.value = 'test'
    input.dispatchEvent(new Event('input'))
    
    // Wait for debounce
    return new Promise(resolve => {
      setTimeout(() => {
        expect(handler).toHaveBeenCalledTimes(1)
        
        // Destroy component
        component.destroy()
        
        // Verify listener is automatically removed
        handler.mockClear()
        input.value = 'test2'
        input.dispatchEvent(new Event('input'))
        
        setTimeout(() => {
          expect(handler).not.toHaveBeenCalled()
          resolve()
        }, 150)
      }, 150)
    })
  })

  it('cleanupEventListeners removes all tracked DOM listeners', () => {
    document.body.innerHTML = `
      <button id="btn1"></button>
      <button id="btn2"></button>
      <button id="btn3"></button>
    `
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    const handler3 = vi.fn()
    
    component.init()
    
    // Create multiple DOM listeners
    component.onDom('btn1', 'click', 'event1', handler1)
    component.onDom('btn2', 'click', 'event2', handler2)
    component.onDom('btn3', 'click', 'event3', handler3)
    
    // Verify all listeners work
    document.getElementById('btn1').click()
    document.getElementById('btn2').click()
    document.getElementById('btn3').click()
    expect(handler1).toHaveBeenCalledTimes(1)
    expect(handler2).toHaveBeenCalledTimes(1)
    expect(handler3).toHaveBeenCalledTimes(1)
    
    // Clean up all listeners
    component.cleanupEventListeners()
    
    // Verify all listeners are removed
    handler1.mockClear()
    handler2.mockClear()
    handler3.mockClear()
    document.getElementById('btn1').click()
    document.getElementById('btn2').click()
    document.getElementById('btn3').click()
    expect(handler1).not.toHaveBeenCalled()
    expect(handler2).not.toHaveBeenCalled()
    expect(handler3).not.toHaveBeenCalled()
  })

  it('destroy calls cleanupEventListeners for DOM listeners', () => {
    document.body.innerHTML = '<button id="testBtn"></button>'
    const handler = vi.fn()
    
    component.init()
    component.onDom('testBtn', 'click', 'test-event', handler)
    
    // Spy on cleanupEventListeners
    const cleanupSpy = vi.spyOn(component, 'cleanupEventListeners')
    
    // Destroy component
    component.destroy()
    
    // Verify cleanupEventListeners was called
    expect(cleanupSpy).toHaveBeenCalledTimes(1)
    
    // Verify listener is removed
    document.getElementById('testBtn').click()
    expect(handler).not.toHaveBeenCalled()
  })

  it('tracks both regular and DOM event listeners separately', () => {
    document.body.innerHTML = '<button id="testBtn"></button>'
    const busHandler = vi.fn()
    const domHandler = vi.fn()
    
    component.init()
    
    // Add regular event listener
    component.addEventListener('test-bus-event', busHandler)
    
    // Add DOM event listener
    component.onDom('testBtn', 'click', 'test-dom-event', domHandler)
    
    // Verify both listeners work
    eventBus.emit('test-bus-event', { data: 'test' })
    document.getElementById('testBtn').click()
    expect(busHandler).toHaveBeenCalledTimes(1)
    expect(domHandler).toHaveBeenCalledTimes(1)
    
    // Destroy component
    component.destroy()
    
    // Verify both listeners are removed
    busHandler.mockClear()
    domHandler.mockClear()
    eventBus.emit('test-bus-event', { data: 'test' })
    document.getElementById('testBtn').click()
    expect(busHandler).not.toHaveBeenCalled()
    expect(domHandler).not.toHaveBeenCalled()
  })

  it('onDom with no eventBus returns empty cleanup function', () => {
    const componentWithoutBus = new ComponentBase(null)
    componentWithoutBus.init()
    
    document.body.innerHTML = '<button id="testBtn"></button>'
    const handler = vi.fn()
    
    // Should not throw and should return a function
    const cleanup = componentWithoutBus.onDom('testBtn', 'click', 'test-event', handler)
    expect(typeof cleanup).toBe('function')
    expect(() => cleanup()).not.toThrow()
    
    componentWithoutBus.destroy()
  })

  it('supports CSS selector syntax', () => {
    document.body.innerHTML = '<button class="test-class"></button>'
    const handler = vi.fn()
    
    component.init()
    component.onDom('.test-class', 'click', 'test-event', handler)
    
    // Verify listener works
    document.querySelector('.test-class').click()
    expect(handler).toHaveBeenCalledTimes(1)
    
    // Destroy component
    component.destroy()
    
    // Verify listener is removed
    handler.mockClear()
    document.querySelector('.test-class').click()
    expect(handler).not.toHaveBeenCalled()
  })

  it('supports direct element reference', () => {
    document.body.innerHTML = '<button id="testBtn"></button>'
    const element = document.getElementById('testBtn')
    const handler = vi.fn()
    
    component.init()
    component.onDom(element, 'click', 'test-event', handler)
    
    // Verify listener works
    element.click()
    expect(handler).toHaveBeenCalledTimes(1)
    
    // Destroy component
    component.destroy()
    
    // Verify listener is removed
    handler.mockClear()
    element.click()
    expect(handler).not.toHaveBeenCalled()
  })

  it('manual cleanup removes listener from tracking', () => {
    document.body.innerHTML = '<button id="testBtn"></button>'
    const handler = vi.fn()
    
    component.init()
    
    // Store the cleanup function
    const cleanup = component.onDom('testBtn', 'click', 'test-event', handler)
    
    // Manually cleanup
    cleanup()
    
    // Verify listener is removed
    document.getElementById('testBtn').click()
    expect(handler).not.toHaveBeenCalled()
    
    // Destroying component should not error
    expect(() => component.destroy()).not.toThrow()
  })
})

