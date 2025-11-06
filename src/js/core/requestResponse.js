// -------------------------------------------------------------
// Request/Response utility layer built on top of eventBus
// -------------------------------------------------------------
import eventBus from './eventBus.js'

/**
 * Generates a unique correlation ID for a request.
 * @returns {string}
 */
function makeRequestId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Format topic for error messages, handling undefined/null values.
 * @param {string|undefined|null} topic - The topic to format
 * @returns {string} - Formatted topic string
 */
function formatTopic(topic) {
  if (topic === undefined || topic === null) {
    return '[UNDEFINED_TOPIC]'
  }
  return typeof topic === 'string' ? topic : String(topic)
}

/**
 * Send an asynchronous request and await a response.
 *
 * @template TRequest
 * @template TResponse
 * @param {object} bus - The event bus instance to use.
 * @param {string} topic - The request event topic.
 * @param {TRequest} payload - The data to send with the request.
 * @param {number} [timeout=5000] - Time in milliseconds to wait before rejecting.
 * @returns {Promise<TResponse>}
 */
function request(bus = eventBus, topic, payload, timeout = 5000) {
  if (!bus) {
    throw new Error(`Request failed: eventBus is null/undefined for topic "${formatTopic(topic)}". Component may not be properly initialized.`)
  }

  // O(1) check using existing listeners Map - no iteration required
  const rpcTopic = `rpc:${topic}`
  const listeners = bus.listeners.get(rpcTopic)

  if (!listeners || listeners.size === 0) {
    throw new Error(`Request failed: No handler registered for topic "${formatTopic(topic)}". Component may not be properly initialized.`)
  }

  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    //console.log(`[requestResponse] request → ${formatTopic(topic)}`, payload)
  }
  const requestId = makeRequestId()
  const replyTopic = `${topic}::reply::${requestId}`

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
}

/**
 * Register an asynchronous handler that responds to requests on a given topic.
 *
 * @template TRequest
 * @template TResponse
 * @param {object} bus - The event bus instance to use.
 * @param {string} topic - The request topic to handle.
 * @param {(payload: TRequest) => Promise<TResponse>|TResponse} handler - Async handler function.
 * @returns {() => void} Detach function to unregister the handler.
 */
function respond(bus = eventBus, topic, handler) {
  async function internal(message) {
    if (!message) return
    const { requestId, replyTopic, payload } = message
    if (!replyTopic) return

    try {
      const result = await handler(payload)
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
       console.log(`[requestResponse] respond ← ${topic}`, result)
      }
      bus.emit(replyTopic, { requestId, data: result })
    } catch (err) {
      const errorMessage = err && err.message ? err.message : String(err)
      bus.emit(replyTopic, { requestId, error: errorMessage })
    }
  }

  bus.on(`rpc:${topic}`, internal)
  // Return a detach function so callers can unregister
  return () => bus.off(`rpc:${topic}`, internal)
}

export { request, respond } 