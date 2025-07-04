// Component fixture
// Provides utilities for testing components that extend ComponentBase

import { vi } from 'vitest'
import { registerFixture, unregisterFixture, generateFixtureId } from './cleanup.js'
import { createEventBusFixture } from './eventBus.js'

/**
 * Create a ComponentBase fixture for testing
 * @param {Class} ComponentClass - The component class to instantiate
 * @param {Object} options - Configuration options
 * @param {Object} options.eventBus - EventBus to use (will create one if not provided)
 * @param {Object} options.constructorArgs - Additional constructor arguments
 * @param {boolean} options.autoInit - Whether to automatically initialize the component
 * @returns {Object} Component fixture with testing utilities
 */
export function createComponentFixture(ComponentClass, options = {}) {
  const {
    eventBus = null,
    constructorArgs = {},
    autoInit = false
  } = options

  const fixtureId = generateFixtureId('component')
  
  // Create eventBus if not provided
  const eventBusFixture = eventBus || createEventBusFixture()
  const actualEventBus = eventBus || eventBusFixture.eventBus
  
  // Create component instance
  const component = new ComponentClass(actualEventBus, constructorArgs)
  
  // Track initialization state
  let isInitialized = false
  let isDestroyed = false
  
  // Spy on lifecycle methods
  const originalInit = component.init.bind(component)
  const originalDestroy = component.destroy.bind(component)
  
  component.init = vi.fn((...args) => {
    const result = originalInit(...args)
    isInitialized = true
    isDestroyed = false
    return result
  })
  
  component.destroy = vi.fn((...args) => {
    const result = originalDestroy(...args)
    isInitialized = false
    isDestroyed = true
    return result
  })
  
  // Auto-initialize if requested
  if (autoInit) {
    component.init()
  }
  
  const fixture = {
    component,
    eventBus: actualEventBus,
    eventBusFixture: eventBus ? null : eventBusFixture,
    
    // Component state
    isInitialized: () => isInitialized,
    isDestroyed: () => isDestroyed,
    
    // Lifecycle helpers
    init: () => {
      if (!isInitialized) {
        component.init()
      }
    },
    
    destroy: () => {
      if (!isDestroyed) {
        component.destroy()
      }
    },
    
    // Event testing utilities
    expectEvent: (eventType, data) => {
      if (eventBusFixture) {
        eventBusFixture.expectEvent(eventType, data)
      } else {
        throw new Error('Event expectations require eventBusFixture')
      }
    },
    
    waitForEvent: (eventType, timeout = 1000) => {
      if (eventBusFixture) {
        return eventBusFixture.waitForEvent(eventType, timeout)
      } else {
        throw new Error('Event waiting requires eventBusFixture')
      }
    },
    
    getEventHistory: () => {
      if (eventBusFixture) {
        return eventBusFixture.getEventHistory()
      } else {
        return []
      }
    },
    
    // Component inspection
    getListenerCount: () => {
      return component.eventListeners ? component.eventListeners.size : 0
    },
    
    getRegisteredEvents: () => {
      return component.eventListeners ? Array.from(component.eventListeners.keys()) : []
    },
    
    // Mock control
    mockReset: () => {
      component.init.mockReset()
      component.destroy.mockReset()
      if (eventBusFixture) {
        eventBusFixture.mockReset()
      }
    },
    
    // Cleanup
    destroy: () => {
      if (!isDestroyed) {
        component.destroy()
      }
      if (eventBusFixture) {
        eventBusFixture.destroy()
      }
      unregisterFixture(fixtureId)
    }
  }
  
  // Register for cleanup
  registerFixture(fixtureId, fixture.destroy)
  
  return fixture
}

/**
 * Create a mock component that implements ComponentBase interface
 * Useful for testing component interactions without real implementations
 */
export function createMockComponent(name = 'MockComponent') {
  const fixtureId = generateFixtureId('mockComponent')
  const eventBusFixture = createEventBusFixture()
  
  const component = {
    componentName: name,
    eventBus: eventBusFixture.eventBus,
    initialized: false,
    destroyed: false,
    eventListeners: new Map(),
    
    init: vi.fn(() => {
      component.initialized = true
      component.destroyed = false
    }),
    
    destroy: vi.fn(() => {
      component.initialized = false
      component.destroyed = true
      component.eventListeners.clear()
    }),
    
    onInit: vi.fn(),
    onDestroy: vi.fn(),
    
    addEventListener: vi.fn((event, handler) => {
      if (!component.eventListeners.has(event)) {
        component.eventListeners.set(event, [])
      }
      component.eventListeners.get(event).push(handler)
      return eventBusFixture.eventBus.on(event, handler)
    }),
    
    removeEventListener: vi.fn((event, handler) => {
      const listeners = component.eventListeners.get(event)
      if (listeners) {
        const index = listeners.indexOf(handler)
        if (index > -1) {
          listeners.splice(index, 1)
        }
      }
      return eventBusFixture.eventBus.off(event, handler)
    }),
    
    emit: vi.fn((event, data) => {
      return eventBusFixture.eventBus.emit(event, data)
    }),
    
    isInitialized: vi.fn(() => component.initialized && !component.destroyed),
    isDestroyed: vi.fn(() => component.destroyed),
    
    getComponentName: vi.fn(() => name),
    
    // Mock-specific methods
    mockReset: () => {
      Object.keys(component).forEach(key => {
        if (vi.isMockFunction(component[key])) {
          component[key].mockReset()
        }
      })
      eventBusFixture.mockReset()
    },
    
    // Test utilities
    expectEvent: (eventType, data) => {
      eventBusFixture.expectEvent(eventType, data)
    },
    
    waitForEvent: (eventType, timeout = 1000) => {
      return eventBusFixture.waitForEvent(eventType, timeout)
    }
  }
  
  const fixture = {
    component,
    eventBus: eventBusFixture.eventBus,
    eventBusFixture,
    
    destroy: () => {
      component.destroy()
      eventBusFixture.destroy()
      unregisterFixture(fixtureId)
    }
  }
  
  registerFixture(fixtureId, fixture.destroy)
  
  return fixture
} 