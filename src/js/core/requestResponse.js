// -------------------------------------------------------------
// Request/Response utility layer built on top of eventBus
// -------------------------------------------------------------
import eventBus from "./eventBus.js";

/** @typedef {typeof eventBus} EventBus */
/** @typedef {import("../types/rpc/index.js").RawRpcMessage} RawRpcMessage */
/** @typedef {import("../types/rpc/index.js").RpcEmptyPayload} RpcEmptyPayload */
/** @typedef {import("../types/rpc/index.js").RpcNoPayloadTopic} RpcNoPayloadTopic */
/** @typedef {import("../types/rpc/index.js").RpcOptionalTopic} RpcOptionalTopic */
/** @typedef {import("../types/rpc/index.js").RpcReadyTopic} RpcReadyTopic */
/** @typedef {import("../types/rpc/index.js").RpcRequiredTopic} RpcRequiredTopic */
/** @typedef {(message?: RawRpcMessage) => unknown} RawTransportHandler */
/**
 * Internal transport erasure. Public callers are governed by the overloads
 * below; only this adapter handles generated request and reply event names.
 *
 * @typedef {{
 *   hasListeners: (topic: string) => boolean,
 *   on: (topic: string, handler: RawTransportHandler) => () => void,
 *   off: (topic: string, handler: RawTransportHandler) => void,
 *   emit: (topic: string, message: RawRpcMessage) => Promise<unknown>
 * }} RawTransportBus
 */

/**
 * Generates a unique correlation ID for a request.
 * @returns {string}
 */
function makeRequestId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Format topic for error messages, handling undefined/null values.
 * @param {string|undefined|null} topic - The topic to format
 * @returns {string} - Formatted topic string
 */
function formatTopic(topic) {
  if (topic === undefined || topic === null) {
    return "[UNDEFINED_TOPIC]";
  }
  return typeof topic === "string" ? topic : String(topic);
}

/**
 * Send an asynchronous request and await a response.
 *
 * @template {RpcRequiredTopic} KRequired
 * @overload
 * @param {EventBus | undefined} bus
 * @param {KRequired} topic
 * @param {import("../types/rpc/index.js").RpcRequest<KRequired>} payload
 * @param {number} [timeout] - Milliseconds before rejection; `0` disables the transport timeout.
 * @returns {Promise<import("../types/rpc/index.js").RpcResult<KRequired>>}
 */
/**
 * @template {RpcOptionalTopic} KOptional
 * @overload
 * @param {EventBus | undefined} bus
 * @param {KOptional} topic
 * @param {import("../types/rpc/index.js").RpcRequest<KOptional>} [payload]
 * @param {number} [timeout] - Milliseconds before rejection; `0` disables the transport timeout.
 * @returns {Promise<import("../types/rpc/index.js").RpcResult<KOptional>>}
 */
/**
 * @template {RpcNoPayloadTopic} KNone
 * @overload
 * @param {EventBus | undefined} bus
 * @param {KNone} topic
 * @param {RpcEmptyPayload} [payload]
 * @param {number} [timeout] - Milliseconds before rejection; `0` disables the transport timeout.
 * @returns {Promise<import("../types/rpc/index.js").RpcResult<KNone>>}
 */
/**
 * @template Request, Result
 * @overload
 * @param {EventBus | undefined} bus
 * @param {import("../types/rpc/index.js").DynamicRpcTopic<Request, Result>} topic
 * @param {Request} payload
 * @param {number} [timeout] - Milliseconds before rejection; `0` disables the transport timeout.
 * @returns {Promise<Result>}
 */
/**
 * @param {EventBus | null | undefined} bus - The event bus instance to use.
 * @param {string | null | undefined} topic - The request event topic.
 * @param {unknown} [payload] - The data to send with the request.
 * @param {number} [timeout=5000] - Time in milliseconds to wait before rejecting; `0` disables the transport timeout.
 * @returns {Promise<unknown>}
 */
function request(bus = eventBus, topic, payload, timeout = 5000) {
  if (!bus) {
    throw new Error(
      `Request failed: eventBus is null/undefined for topic "${formatTopic(topic)}". Component may not be properly initialized.`,
    );
  }
  const activeBus = /** @type {RawTransportBus} */ (
    /** @type {unknown} */ (bus)
  );

  // O(1) readiness check without exposing invokable listener collections.
  const rpcTopic = `rpc:${topic}`;
  if (!activeBus.hasListeners(rpcTopic)) {
    throw new Error(
      `Request failed: No handler registered for topic "${formatTopic(topic)}". Component may not be properly initialized.`,
    );
  }

  const requestId = makeRequestId();
  const replyTopic = `${topic}::reply::${requestId}`;

  return new Promise((resolve, reject) => {
    // Exactly zero is the explicit no-timeout contract. Positive values and
    // omitted values retain the established timer behavior.
    const timeoutId =
      timeout === 0
        ? null
        : setTimeout(() => {
            cleanup();
            reject(new Error("Request timed out"));
          }, timeout);

    // One-time response handler
    /** @param {RawRpcMessage | undefined} message */
    function onReply(message) {
      cleanup();
      if (message && Object.prototype.hasOwnProperty.call(message, "error")) {
        reject(new Error(message.error));
      } else {
        resolve(message ? message.data : undefined);
      }
    }

    function cleanup() {
      if (timeoutId !== null) clearTimeout(timeoutId);
      activeBus.off(replyTopic, onReply);
    }

    // Subscribe to the ephemeral reply topic
    activeBus.on(replyTopic, onReply);

    // Emit the request
    activeBus.emit(`rpc:${topic}`, { requestId, replyTopic, payload });
  });
}

/**
 * Register an asynchronous handler that responds to requests on a given topic.
 *
 * @template {RpcReadyTopic} K
 * @overload
 * @param {EventBus | undefined} bus
 * @param {K} topic
 * @param {import("../types/rpc/index.js").RpcHandler<K>} handler
 * @returns {() => void}
 */
/**
 * @template Request, Result
 * @overload
 * @param {EventBus | undefined} bus
 * @param {import("../types/rpc/index.js").DynamicRpcTopic<Request, Result>} topic
 * @param {(payload: Request) => import("../types/rpc/index.js").MaybePromise<Result>} handler
 * @returns {() => void}
 */
/**
 * @param {EventBus | undefined} bus - The event bus instance to use.
 * @param {string} topic - The request topic to handle.
 * @param {(payload: unknown) => unknown | PromiseLike<unknown>} handler - Async handler function.
 * @returns {() => void} Detach function to unregister the handler.
 */
function respond(bus = eventBus, topic, handler) {
  const activeBus = /** @type {RawTransportBus} */ (
    /** @type {unknown} */ (bus)
  );

  /** @param {RawRpcMessage | undefined} message */
  async function internal(message) {
    if (!message) return;
    const { requestId, replyTopic, payload } = message;
    if (!replyTopic) return;

    try {
      const result = await handler(payload);
      if (typeof window !== "undefined") {
        console.log(`[requestResponse] respond ← ${topic}`, result);
      }
      activeBus.emit(replyTopic, { requestId, data: result });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      activeBus.emit(replyTopic, { requestId, error: errorMessage });
    }
  }

  activeBus.on(`rpc:${topic}`, internal);
  // Return a detach function so callers can unregister
  return () => activeBus.off(`rpc:${topic}`, internal);
}

export { request, respond };
