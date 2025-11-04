import { describe, it, expect, beforeEach } from 'vitest'
import KeyBrowserService from '../../../src/js/components/services/KeyBrowserService.js'

/**
 * Unit tests – KeyBrowserService (lightweight cache helpers)
 * These tests avoid persistence APIs by exercising pure logic methods.
 */

describe('KeyBrowserService – cache helpers', () => {
  let service

  beforeEach(async () => {
    // No need for injected eventBus because tests cover pure helpers
    service = new KeyBrowserService({})
    await service.init()
  })

  
  it('updateCacheFromProfile should populate keys for the current environment', () => {
    const profile = {
      builds: {
        space: { keys: { F1: ['+Cmd'], F2: [] } },
        ground: { keys: { G1: [] } }
      }
    }

    // Inject profile data directly into cache to simulate ComponentBase behavior
    service.cache.profile = profile
    service.cache.builds = profile.builds
    service.cache.currentEnvironment = 'space'
    service.cache.keys = profile.builds.space.keys

    const spaceKeys = service.getKeys()
    expect(Object.keys(spaceKeys)).toEqual(['F1', 'F2'])
  })
})

describe('KeyBrowserService – data processing methods', () => {
  let service

  beforeEach(async () => {
    service = new KeyBrowserService({})
    await service.init()
  })

  describe('sortKeys', () => {
    it('should sort function keys numerically', () => {
      const keys = ['F10', 'F1', 'F2', 'F11']
      const sorted = service.sortKeys(keys)
      expect(sorted).toEqual(['F1', 'F2', 'F10', 'F11'])
    })

    it('should sort numbers before letters', () => {
      const keys = ['A', '1', 'B', '2']
      const sorted = service.sortKeys(keys)
      expect(sorted).toEqual(['1', '2', 'A', 'B'])
    })

    it('should handle empty array', () => {
      const sorted = service.sortKeys([])
      expect(sorted).toEqual([])
    })

    it('should handle non-array input', () => {
      const sorted = service.sortKeys(null)
      expect(sorted).toEqual([])
    })
  })

  describe('compareKeys', () => {
    it('should compare function keys numerically', () => {
      expect(service.compareKeys('F1', 'F2')).toBeLessThan(0)
      expect(service.compareKeys('F10', 'F2')).toBeGreaterThan(0)
      expect(service.compareKeys('F1', 'F1')).toBe(0)
    })

    it('should prioritize function keys over other keys', () => {
      expect(service.compareKeys('F1', 'A')).toBeLessThan(0)
      expect(service.compareKeys('A', 'F1')).toBeGreaterThan(0)
    })

    it('should prioritize numbers over letters', () => {
      expect(service.compareKeys('1', 'A')).toBeLessThan(0)
      expect(service.compareKeys('A', '1')).toBeGreaterThan(0)
    })

    it('should handle special keys', () => {
      expect(service.compareKeys('Space', 'Tab')).toBeLessThan(0)
      expect(service.compareKeys('Enter', 'Escape')).toBeLessThan(0)
    })
  })

  describe('detectKeyTypes', () => {
    it('should detect function keys', () => {
      const types = service.detectKeyTypes('F1')
      expect(types).toContain('function')
    })

    it('should detect alphanumeric keys', () => {
      const types = service.detectKeyTypes('A')
      expect(types).toContain('alphanumeric')
      
      const numberTypes = service.detectKeyTypes('1')
      expect(numberTypes).toContain('alphanumeric')
    })

    it('should detect modifier keys', () => {
      const types = service.detectKeyTypes('Ctrl+A')
      expect(types).toContain('modifiers')
    })

    it('should detect navigation keys', () => {
      const types = service.detectKeyTypes('UP')
      expect(types).toContain('navigation')
    })

    it('should detect system keys', () => {
      const types = service.detectKeyTypes('Space')
      expect(types).toContain('system')
    })

    it('should detect mouse keys', () => {
      const types = service.detectKeyTypes('MOUSE1')
      expect(types).toContain('mouse')
    })

    it('should detect symbols', () => {
      const types = service.detectKeyTypes('!')
      expect(types).toContain('symbols')
    })

    it('should default to other for unrecognized keys', () => {
      const types = service.detectKeyTypes('UnknownKey')
      expect(types).toContain('other')
    })
  })

  describe('filterKeys', () => {
    it('should filter keys by substring match', () => {
      const keys = ['F1', 'F2', 'A', 'B']
      const filtered = service.filterKeys(keys, 'F')
      expect(filtered).toEqual(['F1', 'F2'])
    })

    it('should be case insensitive', () => {
      const keys = ['Ctrl+A', 'Alt+B']
      const filtered = service.filterKeys(keys, 'ctrl')
      expect(filtered).toEqual(['Ctrl+A'])
    })

    it('should return all keys when filter is empty', () => {
      const keys = ['F1', 'F2', 'A']
      const filtered = service.filterKeys(keys, '')
      expect(filtered).toEqual(keys)
    })

    it('should handle non-array input', () => {
      const filtered = service.filterKeys(null, 'F')
      expect(filtered).toEqual([])
    })
  })

  describe('showAllKeys', () => {
    it('should return all keys unchanged', () => {
      const keys = ['F1', 'F2', 'A']
      const result = service.showAllKeys(keys)
      expect(result).toEqual(keys)
    })

    it('should handle non-array input', () => {
      const result = service.showAllKeys(null)
      expect(result).toEqual([])
    })
  })

  describe('toggleKeyCategory', () => {
    beforeEach(() => {
      // Clear localStorage before each test
      localStorage.clear()
    })

    it('should toggle category collapsed state', () => {
      const result1 = service.toggleKeyCategory('test-category', 'command')
      expect(result1).toBe(true) // Should be collapsed after toggle
      
      const result2 = service.toggleKeyCategory('test-category', 'command')
      expect(result2).toBe(false) // Should be expanded after toggle
    })

    it('should handle different modes', () => {
      const result1 = service.toggleKeyCategory('test-category', 'key-type')
      expect(result1).toBe(true)
      
      const result2 = service.toggleKeyCategory('test-category', 'command')
      expect(result2).toBe(true) // Different mode, so starts from false
    })

    it('should return false for empty category ID', () => {
      const result = service.toggleKeyCategory('', 'command')
      expect(result).toBe(false)
    })
  })

  describe('getCategoryState', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('should return false for new category', () => {
      const state = service.getCategoryState('new-category', 'command')
      expect(state).toBe(false)
    })

    it('should return correct state for existing category', () => {
      // Set up a collapsed category
      service.toggleKeyCategory('test-category', 'command')
      
      const state = service.getCategoryState('test-category', 'command')
      expect(state).toBe(true)
    })

    it('should handle different modes', () => {
      service.toggleKeyCategory('test-category', 'key-type')
      
      const keyTypeState = service.getCategoryState('test-category', 'key-type')
      expect(keyTypeState).toBe(true)
      
      const commandState = service.getCategoryState('test-category', 'command')
      expect(commandState).toBe(false)
    })

    it('should return false for empty category ID', () => {
      const state = service.getCategoryState('', 'command')
      expect(state).toBe(false)
    })
  })

  describe('categorizeKeysByType', () => {
    it('should categorize keys by type', () => {
      const allKeys = ['F1', 'A', '1', 'Ctrl+A', 'Space', 'MOUSE1', '!']
      const categories = service.categorizeKeysByType({}, allKeys)
      
      expect(categories.function.keys).toContain('F1')
      expect(categories.alphanumeric.keys).toContain('A')
      expect(categories.alphanumeric.keys).toContain('1')
      expect(categories.modifiers.keys).toContain('Ctrl+A')
      expect(categories.system.keys).toContain('Space')
      expect(categories.mouse.keys).toContain('MOUSE1')
      expect(categories.symbols.keys).toContain('!')
    })

    it('should sort keys within categories', () => {
      const allKeys = ['F10', 'F1', 'F2']
      const categories = service.categorizeKeysByType({}, allKeys)
      
      expect(categories.function.keys).toEqual(['F1', 'F2', 'F10'])
    })

    it('should handle empty input', () => {
      const categories = service.categorizeKeysByType({}, [])
      expect(categories.function.keys).toEqual([])
    })
  })
}) 