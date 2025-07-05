import { describe, it, expect, beforeEach } from 'vitest'
import KeyBrowserService from '../../../src/js/components/services/KeyBrowserService.js'

/**
 * Unit tests – KeyBrowserService (lightweight cache helpers)
 * These tests avoid persistence APIs by exercising pure logic methods.
 */

describe('KeyBrowserService – cache helpers', () => {
  let service

  beforeEach(() => {
    // No need for injected eventBus because tests cover pure helpers
    service = new KeyBrowserService({})
    if (typeof service.init === 'function') service.init()
  })

  it('getValidKeys should include common keys and modifiers', () => {
    const keys = service.getValidKeys()
    expect(keys).toContain('F1')
    expect(keys).toContain('Ctrl+F1')
    expect(keys).toContain('Space')
  })

  it('updateCacheFromProfile should populate keys for the current environment', () => {
    const profile = {
      builds: {
        space: { keys: { F1: ['+Cmd'], F2: [] } },
        ground: { keys: { G1: [] } }
      }
    }
    service.updateCacheFromProfile(profile)

    const spaceKeys = service.getKeys()
    expect(Object.keys(spaceKeys)).toEqual(['F1', 'F2'])
  })
}) 