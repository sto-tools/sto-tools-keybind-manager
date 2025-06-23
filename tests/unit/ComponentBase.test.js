import { describe, it, expect, beforeEach, vi } from 'vitest'
import ComponentBase from '../../src/js/components/ComponentBase.js'

describe('ComponentBase', () => {
  let component
  let mockEventBus

  beforeEach(() => {
    // Create a mock event bus
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn()
    }
    
    component = new ComponentBase(mockEventBus)
  })

  describe('Constructor', () => {
    it('should create an instance with default properties', () => {
      expect(component).toBeInstanceOf(ComponentBase)
      expect(component.eventBus).toBe(mockEventBus)
      expect(component.initialized).toBe(false)
      expect(component.destroyed).toBe(false)
      expect(component.eventListeners).toBeInstanceOf(Map)
    })

    it('should create an instance without eventBus', () => {
      const componentWithoutEventBus = new ComponentBase()
      expect(componentWithoutEventBus.eventBus).toBe(null)
    })
  })

  describe('Lifecycle Methods', () => {
    it('should have init method', () => {
      expect(typeof component.init).toBe('function')
    })

    it('should have destroy method', () => {
      expect(typeof component.destroy).toBe('function')
    })

    it('should initialize component correctly', () => {
      const onInitSpy = vi.spyOn(component, 'onInit')
      
      component.init()
      
      expect(component.initialized).toBe(true)
      expect(component.destroyed).toBe(false)
      expect(onInitSpy).toHaveBeenCalledOnce()
    })

    it('should not initialize twice', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const onInitSpy = vi.spyOn(component, 'onInit')
      
      component.init()
      component.init() // Second call
      
      expect(consoleSpy).toHaveBeenCalledWith('ComponentBase is already initialized')
      expect(onInitSpy).toHaveBeenCalledOnce()
      
      consoleSpy.mockRestore()
    })

    it('should destroy component correctly', () => {
      const onDestroySpy = vi.spyOn(component, 'onDestroy')
      const cleanupSpy = vi.spyOn(component, 'cleanupEventListeners')
      
      component.init()
      component.destroy()
      
      expect(component.destroyed).toBe(true)
      expect(component.initialized).toBe(false)
      expect(cleanupSpy).toHaveBeenCalledOnce()
      expect(onDestroySpy).toHaveBeenCalledOnce()
    })

    it('should not destroy twice', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const onDestroySpy = vi.spyOn(component, 'onDestroy')
      
      component.init()
      component.destroy()
      component.destroy() // Second call
      
      expect(consoleSpy).toHaveBeenCalledWith('ComponentBase is already destroyed')
      expect(onDestroySpy).toHaveBeenCalledOnce()
      
      consoleSpy.mockRestore()
    })
  })

  describe('Event Management', () => {
    it('should add event listener correctly', () => {
      const handler = vi.fn()
      const event = 'test-event'
      
      component.addEventListener(event, handler)
      
      expect(mockEventBus.on).toHaveBeenCalledWith(event, handler, null)
      expect(component.eventListeners.has(event)).toBe(true)
      expect(component.eventListeners.get(event)).toContainEqual({ handler, context: null })
    })

    it('should remove event listener correctly', () => {
      const handler = vi.fn()
      const event = 'test-event'
      
      component.addEventListener(event, handler)
      component.removeEventListener(event, handler)
      
      expect(mockEventBus.off).toHaveBeenCalledWith(event, handler)
    })

    it('should emit events correctly', () => {
      const event = 'test-event'
      const data = { test: 'data' }
      
      component.emit(event, data)
      
      expect(mockEventBus.emit).toHaveBeenCalledWith(event, data)
    })

    it('should handle missing eventBus gracefully', () => {
      const componentWithoutEventBus = new ComponentBase()
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      componentWithoutEventBus.addEventListener('test', vi.fn())
      componentWithoutEventBus.removeEventListener('test', vi.fn())
      componentWithoutEventBus.emit('test')
      
      expect(consoleSpy).toHaveBeenCalledTimes(3)
      consoleSpy.mockRestore()
    })

    it('should cleanup event listeners on destroy', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      
      component.addEventListener('event1', handler1)
      component.addEventListener('event2', handler2)
      
      component.destroy()
      
      expect(mockEventBus.off).toHaveBeenCalledWith('event1', handler1)
      expect(mockEventBus.off).toHaveBeenCalledWith('event2', handler2)
      expect(component.eventListeners.size).toBe(0)
    })
  })

  describe('State Methods', () => {
    it('should report initialization state correctly', () => {
      expect(component.isInitialized()).toBe(false)
      
      component.init()
      expect(component.isInitialized()).toBe(true)
      
      component.destroy()
      expect(component.isInitialized()).toBe(false)
    })

    it('should report destroyed state correctly', () => {
      expect(component.isDestroyed()).toBe(false)
      
      component.init()
      expect(component.isDestroyed()).toBe(false)
      
      component.destroy()
      expect(component.isDestroyed()).toBe(true)
    })

    it('should return component name', () => {
      expect(component.getComponentName()).toBe('ComponentBase')
    })
  })

  describe('Hook Methods', () => {
    it('should have onInit hook method', () => {
      expect(typeof component.onInit).toBe('function')
      expect(() => component.onInit()).not.toThrow()
    })

    it('should have onDestroy hook method', () => {
      expect(typeof component.onDestroy).toBe('function')
      expect(() => component.onDestroy()).not.toThrow()
    })
  })
}) 