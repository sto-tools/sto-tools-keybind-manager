// EventBus fixture
// Provides a configured eventBus with testing utilities

import { vi } from 'vitest'
import { registerFixture, unregisterFixture, generateFixtureId } from './cleanup.js'

/**
 * Create an EventBus fixture for testing
 * @param {Object} options - Configuration options
 * @param {boolean} options.trackEvents - Whether to track events for assertions
 * @param {boolean} options.mockEmit - Whether to mock emit for spying
 * @param {boolean} options.realEventBus - Whether to use the real eventBus module
 * @returns {Object} EventBus fixture with testing utilities
 */
export function createEventBusFixture(options = {}) {
  const {
    trackEvents = true,
    mockEmit = false,
    realEventBus = false
  } = options

  const fixtureId = generateFixtureId('eventBus')
  const listeners = new Map()
  const eventHistory = []

  // Core eventBus implementation
  const eventBus = {
    on: vi.fn((event, callback) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set())
      }
      listeners.get(event).add(callback)
      
      // Return detach function
      return () => {
        const eventListeners = listeners.get(event)
        if (eventListeners) {
          eventListeners.delete(callback)
        }
      }
    }),

    off: vi.fn((event, callback) => {
      const eventListeners = listeners.get(event)
      if (eventListeners) {
        eventListeners.delete(callback)
      }
    }),

    emit: mockEmit ? vi.fn() : vi.fn((event, data) => {
      // Track event history
      if (trackEvents) {
        eventHistory.push({
          event,
          data,
          timestamp: Date.now()
        })
      }
      
      // Call listeners
      const eventListeners = listeners.get(event)
      if (eventListeners) {
        eventListeners.forEach(callback => {
          try {
            callback(data)
          } catch (error) {
            console.error(`Error in event listener for ${event}:`, error)
          }
        })
      }
    }),

    once: vi.fn((event, callback) => {
      const onceCallback = (data) => {
        eventBus.off(event, onceCallback)
        callback(data)
      }
      eventBus.on(event, onceCallback)
    }),

    clear: vi.fn(() => {
      listeners.clear()
      if (trackEvents) {
        eventHistory.length = 0
      }
    }),

    getListenerCount: vi.fn((event) => {
      const eventListeners = listeners.get(event)
      return eventListeners ? eventListeners.size : 0
    }),

    getAllListenerCounts: vi.fn(() => {
      const counts = {}
      for (const [event, listenerSet] of listeners) {
        counts[event] = listenerSet.size
      }
      return counts
    }),

    // DOM event handling (simplified for testing)
    onDom: vi.fn((target, domEvent, busEvent, handler) => {
      // Mock implementation that just tracks the call
      return vi.fn() // Return cleanup function
    }),

    onDomDebounced: vi.fn((target, domEvent, busEvent, handler, delay = 250) => {
      // Mock implementation
      return vi.fn() // Return cleanup function
    }),

    debounce: vi.fn((fn, delay = 250) => {
      // Return a simple debounced version for testing
      let timerId
      return (...args) => {
        clearTimeout(timerId)
        timerId = setTimeout(() => fn.apply(this, args), delay)
      }
    }),

    // Expose listeners for debugging
    get listeners() {
      return listeners
    }
  }

  // Add testing utilities
  const fixture = {
    eventBus,
    
    // Testing utilities
    getEventHistory: () => [...eventHistory],
    
    clearEventHistory: () => {
      eventHistory.length = 0
    },
    
    getEventsOfType: (eventType) => {
      return eventHistory.filter(entry => entry.event === eventType)
    },
    
    waitForEvent: (eventType, timeout = 1000) => {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Event '${eventType}' not received within ${timeout}ms`))
        }, timeout)
        
        const handler = (data) => {
          clearTimeout(timeoutId)
          eventBus.off(eventType, handler)
          resolve(data)
        }
        
        eventBus.on(eventType, handler)
      })
    },
    
    expectEvent: (eventType, data) => {
      const events = eventHistory.filter(entry => entry.event === eventType)
      if (events.length === 0) {
        throw new Error(`Expected event '${eventType}' but it was not emitted`)
      }
      
      if (data !== undefined) {
        const matchingEvent = events.find(event => 
          JSON.stringify(event.data) === JSON.stringify(data)
        )
        if (!matchingEvent) {
          throw new Error(`Expected event '${eventType}' with data ${JSON.stringify(data)} but it was not found`)
        }
      }
    },
    
    expectEventCount: (eventType, count) => {
      const events = eventHistory.filter(entry => entry.event === eventType)
      if (events.length !== count) {
        throw new Error(`Expected ${count} '${eventType}' events but got ${events.length}`)
      }
    },
    
    expectNoEvent: (eventType) => {
      const events = eventHistory.filter(entry => entry.event === eventType)
      if (events.length > 0) {
        throw new Error(`Expected no '${eventType}' events but got ${events.length}`)
      }
    },
    
    // Mock control
    mockReset: () => {
      Object.keys(eventBus).forEach(key => {
        if (vi.isMockFunction(eventBus[key])) {
          eventBus[key].mockReset()
        }
      })
      eventHistory.length = 0
    },
    
    // Cleanup
    destroy: () => {
      listeners.clear()
      eventHistory.length = 0
      unregisterFixture(fixtureId)
    }
  }

  // Register for cleanup
  registerFixture(fixtureId, fixture.destroy)

  return fixture
}

/**
 * Create a real EventBus fixture using the actual eventBus module
 * Useful for integration tests where you need the real behavior
 */
export async function createRealEventBusFixture() {
  const fixtureId = generateFixtureId('realEventBus')
  
  // Import the real eventBus
  const { default: eventBus } = await import('../../../src/js/core/eventBus.js')
  
  // Store original state
  const originalListeners = new Map(eventBus.listeners)
  
  const fixture = {
    eventBus,
    
    // Reset to clean state
    reset: () => {
      eventBus.clear()
    },
    
    // Restore original state
    restore: () => {
      eventBus.clear()
      for (const [event, listeners] of originalListeners) {
        for (const listener of listeners) {
          eventBus.on(event, listener)
        }
      }
    },
    
    destroy: () => {
      eventBus.clear()
      unregisterFixture(fixtureId)
    }
  }
  
  registerFixture(fixtureId, fixture.destroy)
  
  return fixture
} 