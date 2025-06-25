import { describe, it, expect } from 'vitest'

import { KeyService } from '../../src/js/components/services/index.js'

// Minimal profile mock with null command entry
const profileWithNull = {
  keys: {
    F1: [null, { command: 'say hello', type: 'communication' }],
  },
  aliases: {},
}

describe('KeyService.getProfileStats() regression', () => {
  const keyService = new KeyService({})

  it('should safely handle null command objects in key arrays', () => {
    const stats = keyService.getProfileStats(profileWithNull)
    expect(stats.totalKeys).toBe(1)
    // totalCommands should count both elements including the null originally (legacy behavior) or should ignore null? previous code counted array length; still 2
    expect(stats.totalCommands).toBe(2)
    // mostUsedCommands should include the valid command only and not throw
    expect(stats.mostUsedCommands['say hello']).toBe(1)
  })
}) 