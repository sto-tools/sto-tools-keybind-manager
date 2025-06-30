// -------------------------------------------------------------
// Request/Response utility layer built on top of eventBus
// -------------------------------------------------------------
import eventBus from './eventBus.js'

// Internal registry for synchronous command handlers
const commandHandlers = new Map()

/**
 * Generates a unique correlation ID for a request.
 * @returns {string}
 */
function makeRequestId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
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
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.log(`[requestResponse] request → ${topic}`, payload)
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

/**
 * Register a synchronous command handler. Useful for lightweight, CPU-bound tasks.
 *
 * @param {string} topic - Command topic.
 * @param {(payload: any) => any} handler - Synchronous handler.
 * @returns {() => void} Detach function to unregister the handler.
 */
function handleCommand(topic, handler) {
  if (typeof handler !== 'function') {
    throw new Error('Handler must be a function')
  }
  commandHandlers.set(topic, handler)
  return () => commandHandlers.delete(topic)
}

/**
 * Invoke a synchronous command.
 *
 * @param {string} topic - Command topic.
 * @param {any} payload - Command payload.
 * @returns {any} Result returned by the handler.
 */
function command(topic, payload) {
  const handler = commandHandlers.get(topic)
  if (!handler) {
    throw new Error(`No command handler registered for topic "${topic}"`)
  }
  return handler(payload)
}

export { makeRequestId, request, respond, handleCommand, command } 