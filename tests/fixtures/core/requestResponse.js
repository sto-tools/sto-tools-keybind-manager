// Request/Response fixture
// Provides mock request/response system for testing async service communication

import { vi } from 'vitest'
import { registerFixture, unregisterFixture, generateFixtureId } from './cleanup.js'

/**
 * Create a Request/Response fixture for testing
 * @param {Object} eventBus - EventBus instance to use
 * @param {Object} options - Configuration options
 * @param {boolean} options.trackRequests - Whether to track requests for debugging
 * @param {number} options.defaultTimeout - Default timeout for requests
 * @returns {Object} Request/Response fixture with testing utilities
 */
export function createRequestResponseFixture(eventBus, options = {}) {
  const {
    trackRequests = true,
    defaultTimeout = 5000
  } = options

  const fixtureId = generateFixtureId('requestResponse')
  
  // Track requests and responses
  const requests = []
  const responses = []
  const handlers = new Map()

  // Generate unique request ID
  const makeRequestId = () => {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }

  // Mock request function
  const request = vi.fn((bus, topic, payload, timeout = defaultTimeout) => {
    const requestId = makeRequestId()
    const replyTopic = `${topic}::reply::${requestId}`
    
    if (trackRequests) {
      requests.push({
        requestId,
        topic,
        payload,
        timestamp: Date.now(),
        timeout
      })
    }

    return new Promise((resolve, reject) => {
      // Timeout handling
      const timeoutId = setTimeout(() => {
        cleanup()
        reject(new Error('Request timed out'))
      }, timeout)

      // One-time response handler
      function onReply(message) {
        cleanup()
        if (message && Object.prototype.hasOwnProperty.call(message, 'error')) {
          reject(new Error(message.error))
        } else {
          resolve(message ? message.data : undefined)
        }
      }

      function cleanup() {
        clearTimeout(timeoutId)
        bus.off(replyTopic, onReply)
      }

      // Subscribe to the ephemeral reply topic
      bus.on(replyTopic, onReply)

      // Emit the request
      bus.emit(`rpc:${topic}`, { requestId, replyTopic, payload })
    })
  })

  // Mock respond function
  const respond = vi.fn((bus, topic, handler) => {
    handlers.set(topic, handler)
    
    async function internal(message) {
      if (!message) return
      const { requestId, replyTopic, payload } = message
      if (!replyTopic) return

      try {
        const result = await handler(payload)
        
        if (trackRequests) {
          responses.push({
            requestId,
            topic,
            payload,
            result,
            timestamp: Date.now()
          })
        }
        
        bus.emit(replyTopic, { requestId, data: result })
      } catch (err) {
        const errorMessage = err && err.message ? err.message : String(err)
        
        if (trackRequests) {
          responses.push({
            requestId,
            topic,
            payload,
            error: errorMessage,
            timestamp: Date.now()
          })
        }
        
        bus.emit(replyTopic, { requestId, error: errorMessage })
      }
    }

    bus.on(`rpc:${topic}`, internal)
    
    // Return detach function
    return () => {
      bus.off(`rpc:${topic}`, internal)
      handlers.delete(topic)
    }
  })

  const fixture = {
    request,
    respond,
    makeRequestId,
    
    // Testing utilities
    getRequests: () => [...requests],
    getResponses: () => [...responses],
    getHandlers: () => new Map(handlers),
    
    clearHistory: () => {
      requests.length = 0
      responses.length = 0
    },
    
    getRequestsForTopic: (topic) => {
      return requests.filter(req => req.topic === topic)
    },
    
    getResponsesForTopic: (topic) => {
      return responses.filter(res => res.topic === topic)
    },
    
    expectRequest: (topic, payload) => {
      const reqs = requests.filter(req => req.topic === topic)
      if (reqs.length === 0) {
        throw new Error(`Expected request for topic '${topic}' but it was not found`)
      }
      
      if (payload !== undefined) {
        const matchingRequest = reqs.find(req => 
          JSON.stringify(req.payload) === JSON.stringify(payload)
        )
        if (!matchingRequest) {
          throw new Error(`Expected request for topic '${topic}' with payload ${JSON.stringify(payload)} but it was not found`)
        }
      }
    },
    
    expectResponse: (topic, result) => {
      const responses = fixture.getResponsesForTopic(topic)
      if (responses.length === 0) {
        throw new Error(`Expected response for topic '${topic}' but it was not found`)
      }
      
      if (result !== undefined) {
        const matchingResponse = responses.find(res => 
          JSON.stringify(res.result) === JSON.stringify(result)
        )
        if (!matchingResponse) {
          throw new Error(`Expected response for topic '${topic}' with result ${JSON.stringify(result)} but it was not found`)
        }
      }
    },
    
    expectHandlerRegistered: (topic) => {
      if (!handlers.has(topic)) {
        throw new Error(`Expected handler for topic '${topic}' but it was not registered`)
      }
    },
    
    // Mock helper: Register a simple handler that returns a value
    mockHandler: (topic, returnValue) => {
      return respond(eventBus, topic, async () => returnValue)
    },
    
    // Mock helper: Register a handler that throws an error
    mockErrorHandler: (topic, error) => {
      return respond(eventBus, topic, async () => {
        throw new Error(error)
      })
    },
    
    // Mock helper: Register a handler that delays response
    mockDelayedHandler: (topic, returnValue, delay = 100) => {
      return respond(eventBus, topic, async () => {
        await new Promise(resolve => setTimeout(resolve, delay))
        return returnValue
      })
    },
    
    // Simulate a request/response cycle for testing
    simulateRequest: async (topic, payload, responseData) => {
      const requestPromise = request(eventBus, topic, payload)
      
      // Wait a tick for the request to be emitted
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Find the latest request for this topic
      const recentRequests = requests.filter(req => req.topic === topic)
      const latestRequest = recentRequests[recentRequests.length - 1]
      
      if (latestRequest) {
        const replyTopic = `${topic}::reply::${latestRequest.requestId}`
        
        // Emit the response
        if (responseData instanceof Error) {
          eventBus.emit(replyTopic, { 
            requestId: latestRequest.requestId, 
            error: responseData.message 
          })
        } else {
          eventBus.emit(replyTopic, { 
            requestId: latestRequest.requestId, 
            data: responseData 
          })
        }
      }
      
      return requestPromise
    },
    
    // Mock control
    mockReset: () => {
      request.mockReset()
      respond.mockReset()
      requests.length = 0
      responses.length = 0
      handlers.clear()
    },

    // Cleanup
    destroy: () => {
      // Clear all handlers
      handlers.clear()
      requests.length = 0
      responses.length = 0
      unregisterFixture(fixtureId)
    }
  }

  // Register for cleanup
  registerFixture(fixtureId, fixture.destroy)

  return fixture
}

/**
 * Create a real Request/Response fixture using the actual module
 * Useful for integration tests that need real behavior
 */
export async function createRealRequestResponseFixture(eventBus) {
  const fixtureId = generateFixtureId('realRequestResponse')
  
  // Import the real request/response module
  const { request, respond } =
    await import('../../../src/js/core/requestResponse.js')

  const fixture = {
    request,
    respond,
    
    // No testing utilities for real implementation
    destroy: () => {
      // Nothing to clean up for real implementation
      unregisterFixture(fixtureId)
    }
  }
  
  registerFixture(fixtureId, fixture.destroy)
  
  return fixture
} 