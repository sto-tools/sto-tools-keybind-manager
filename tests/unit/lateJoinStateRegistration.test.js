import { describe, it, expect, beforeEach } from 'vitest'
import ComponentBase from '../../src/js/components/ComponentBase.js'

function createEventBus () {
  const listeners = {}
  return {
    on (event, handler) {
      if (!listeners[event]) listeners[event] = new Set()
      listeners[event].add(handler)
    },
    off (event, handler) {
      if (listeners[event]) listeners[event].delete(handler)
    },
    emit (event, payload) {
      if (!listeners[event]) return
      for (const handler of [...listeners[event]]) {
        handler(payload)
      }
    }
  }
}

describe('ComponentBase – Late-Join State Registration', () => {
  let bus

  beforeEach(() => {
    bus = createEventBus()
  })

  function makeComponent (name, state) {
    return new class extends ComponentBase {
      constructor () {
        super(bus)
        this._name = name
        this._state = state
        this.received = []
      }

      getComponentName () {
        return this._name
      }

      getCurrentState () {
        return this._state
      }

      handleInitialState (sender, st) {
        this.received.push({ sender, state: st })
      }
    }()
  }

  it('should send current state to components joining later', () => {
    const compA = makeComponent('A', { count: 1 })
    compA.init()

    const compB = makeComponent('B', { count: 2 })
    compB.init()

    // B should have received state from A
    expect(compB.received.length).toBe(1)
    expect(compB.received[0]).toEqual({ sender: 'A', state: { count: 1 } })
  })

  it('components joining first should not have any initial state received', () => {
    const compFirst = makeComponent('First', { foo: 'bar' })
    compFirst.init()
    expect(compFirst.received.length).toBe(0)
  })
}) 