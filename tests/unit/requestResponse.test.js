import { describe, it, expect } from 'vitest'
import eventBus from '../../src/js/core/eventBus.js'
import { request, respond, handleCommand, command } from '../../src/js/core/requestResponse.js'

describe('requestResponse message bus utilities', () => {
  it('handles successful async request/response cycle', async () => {
    const topic = 'unit-rpc-success'

    // Register responder
    respond(eventBus, topic, async (payload) => {
      return payload * 2
    })

    const result = await request(eventBus, topic, 21, 200)
    expect(result).toBe(42)
  })

  it('propagates handler errors back to requester', async () => {
    const topic = 'unit-rpc-error'
    const errorMsg = 'expected failure'

    respond(eventBus, topic, async () => {
      throw new Error(errorMsg)
    })

    await expect(request(eventBus, topic, null, 200)).rejects.toThrow(errorMsg)
  })

  it('rejects when no responder replies within timeout', async () => {
    const topic = 'unit-rpc-timeout'
    await expect(request(eventBus, topic, null, 50)).rejects.toThrow('timed out')
  })

  it('supports synchronous command handlers', () => {
    const topic = 'unit-command'
    handleCommand(topic, (n) => n + 5)

    const res = command(topic, 10)
    expect(res).toBe(15)
  })
}) 