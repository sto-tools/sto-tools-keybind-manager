import { describe, it, expect, beforeEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import KeyBrowserUI from '../../../src/js/components/ui/KeyBrowserUI.js'

describe('KeyBrowserUI Bindset Selection Tests', () => {
  let keyBrowserUI
  let mockEventBus
  let mockI18n

  beforeEach(() => {
    const dom = new JSDOM('<!DOCTYPE html><div id="key-browser"></div>')
    global.document = dom.window.document
    global.window = dom.window

    mockEventBus = {
      request: vi.fn(),
      respond: vi.fn(),
      on: vi.fn(),
      off: vi.fn()
    }

    mockI18n = {
      t: vi.fn((key) => key)
    }

    keyBrowserUI = new KeyBrowserUI(mockEventBus, dom.window.document.getElementById('key-browser'))
    keyBrowserUI.i18n = mockI18n

    // Initialize cache with test data
    keyBrowserUI.cache = {
      selectedKey: 'F1',
      activeBindset: 'Primary Bindset',
      currentEnvironment: 'space',
      profile: {
        bindsets: {
          'Primary Bindset': {
            space: {
              keys: {
                'F1': ['attack'],
                'F2': ['defend']
              }
            }
          },
          'Custom Bindset': {
            space: {
              keys: {
                'F1': ['custom_attack'],
                'F3': ['custom_defend']
              }
            }
          }
        }
      }
    }
  })

  describe('createKeyElement with bindset context', () => {
    it('should show key as selected when both key name and bindset context match active selection', () => {
      // Test: key F1 in Primary Bindset should be selected
      const keyElement = keyBrowserUI.createKeyElement('F1', 'Primary Bindset')

      expect(keyElement.classList.contains('active')).toBe(true)
    })

    it('should NOT show key as selected when key name matches but bindset context differs', () => {
      // Test: key F1 in Custom Bindset should NOT be selected
      // even though F1 is the selected key, because activeBindset is 'Primary Bindset'
      const keyElement = keyBrowserUI.createKeyElement('F1', 'Custom Bindset')

      expect(keyElement.classList.contains('active')).toBe(false)
    })

    it('should show key as selected when key name and bindset context both match active selection', () => {
      // Change active bindset to Custom Bindset
      keyBrowserUI.cache.activeBindset = 'Custom Bindset'

      // Test: key F1 in Custom Bindset should now be selected
      const keyElement = keyBrowserUI.createKeyElement('F1', 'Custom Bindset')

      expect(keyElement.classList.contains('active')).toBe(true)
    })

    it('should maintain backward compatibility when no bindset context provided', () => {
      // Test: when no bindset context provided, should use global selection behavior
      const keyElement = keyBrowserUI.createKeyElement('F1')

      expect(keyElement.classList.contains('active')).toBe(true)
    })

    it('should NOT show key as selected when key name differs from selected key', () => {
      // Test: key F2 should not be selected regardless of bindset context
      const keyElement1 = keyBrowserUI.createKeyElement('F2', 'Primary Bindset')
      const keyElement2 = keyBrowserUI.createKeyElement('F2', 'Custom Bindset')
      const keyElement3 = keyBrowserUI.createKeyElement('F2')

      expect(keyElement1.classList.contains('active')).toBe(false)
      expect(keyElement2.classList.contains('active')).toBe(false)
      expect(keyElement3.classList.contains('active')).toBe(false)
    })
  })

  describe('bindset selection isolation regression tests', () => {
    it('should prevent selection bleeding between bindsets (regression: js-bindset-selection-state)', () => {
      // This test reproduces the original bug condition
      // Key F1 exists in both Primary Bindset and Custom Bindset
      // It should only appear selected in the currently active bindset

      // Test with Primary Bindset active
      keyBrowserUI.cache.activeBindset = 'Primary Bindset'
      const primaryBindsetElement = keyBrowserUI.createKeyElement('F1', 'Primary Bindset')
      const customBindsetElement = keyBrowserUI.createKeyElement('F1', 'Custom Bindset')

      expect(primaryBindsetElement.classList.contains('active')).toBe(true)
      expect(customBindsetElement.classList.contains('active')).toBe(false)

      // Test with Custom Bindset active
      keyBrowserUI.cache.activeBindset = 'Custom Bindset'
      const primaryBindsetElement2 = keyBrowserUI.createKeyElement('F1', 'Primary Bindset')
      const customBindsetElement2 = keyBrowserUI.createKeyElement('F1', 'Custom Bindset')

      expect(primaryBindsetElement2.classList.contains('active')).toBe(false)
      expect(customBindsetElement2.classList.contains('active')).toBe(true)
    })

    it('should maintain independent selection state across multiple bindsets', () => {
      // Test multiple keys across multiple bindsets
      const primaryF1 = keyBrowserUI.createKeyElement('F1', 'Primary Bindset')
      const primaryF2 = keyBrowserUI.createKeyElement('F2', 'Primary Bindset')
      const customF1 = keyBrowserUI.createKeyElement('F1', 'Custom Bindset')
      const customF3 = keyBrowserUI.createKeyElement('F3', 'Custom Bindset')

      // Only F1 should be selected, and only in Primary Bindset
      expect(primaryF1.classList.contains('active')).toBe(true)
      expect(primaryF2.classList.contains('active')).toBe(false)
      expect(customF1.classList.contains('active')).toBe(false)
      expect(customF3.classList.contains('active')).toBe(false)

      // Switch to Custom Bindset
      keyBrowserUI.cache.activeBindset = 'Custom Bindset'

      const primaryF1_2 = keyBrowserUI.createKeyElement('F1', 'Primary Bindset')
      const customF1_2 = keyBrowserUI.createKeyElement('F1', 'Custom Bindset')

      // Now F1 should only be selected in Custom Bindset
      expect(primaryF1_2.classList.contains('active')).toBe(false)
      expect(customF1_2.classList.contains('active')).toBe(true)
    })

    it('should handle bindset context changes gracefully', () => {
      // Test rapid bindset switching
      const scenarios = [
        { activeBindset: 'Primary Bindset', context: 'Primary Bindset', expected: true },
        { activeBindset: 'Primary Bindset', context: 'Custom Bindset', expected: false },
        { activeBindset: 'Custom Bindset', context: 'Primary Bindset', expected: false },
        { activeBindset: 'Custom Bindset', context: 'Custom Bindset', expected: true }
      ]

      scenarios.forEach(scenario => {
        keyBrowserUI.cache.activeBindset = scenario.activeBindset
        const element = keyBrowserUI.createKeyElement('F1', scenario.context)
        expect(element.classList.contains('active')).toBe(scenario.expected)
      })
    })
  })

  describe('context-aware selection helper method', () => {
    it('isKeySelectedInContext should return correct boolean values', () => {
      // Test with null context (backward compatibility)
      expect(keyBrowserUI.isKeySelectedInContext('F1', null)).toBe(true)
      expect(keyBrowserUI.isKeySelectedInContext('F2', null)).toBe(false)

      // Test with matching bindset context
      expect(keyBrowserUI.isKeySelectedInContext('F1', 'Primary Bindset')).toBe(true)
      expect(keyBrowserUI.isKeySelectedInContext('F1', 'Custom Bindset')).toBe(false)

      // Test with non-matching key
      expect(keyBrowserUI.isKeySelectedInContext('F2', 'Primary Bindset')).toBe(false)
      expect(keyBrowserUI.isKeySelectedInContext('F2', 'Custom Bindset')).toBe(false)

      // Switch active bindset and test again
      keyBrowserUI.cache.activeBindset = 'Custom Bindset'
      expect(keyBrowserUI.isKeySelectedInContext('F1', 'Primary Bindset')).toBe(false)
      expect(keyBrowserUI.isKeySelectedInContext('F1', 'Custom Bindset')).toBe(true)
    })

    it('should handle edge cases gracefully', () => {
      // Test with undefined context
      expect(keyBrowserUI.isKeySelectedInContext('F1', undefined)).toBe(true)

      // Test with empty string context
      expect(keyBrowserUI.isKeySelectedInContext('F1', '')).toBe(true)

      // Test with non-existent selected key
      keyBrowserUI.cache.selectedKey = null
      expect(keyBrowserUI.isKeySelectedInContext('F1', 'Primary Bindset')).toBe(false)
      expect(keyBrowserUI.isKeySelectedInContext('F1', null)).toBe(false)

      // Test with non-existent active bindset
      keyBrowserUI.cache.selectedKey = 'F1'
      keyBrowserUI.cache.activeBindset = null
      expect(keyBrowserUI.isKeySelectedInContext('F1', 'Primary Bindset')).toBe(false)
      expect(keyBrowserUI.isKeySelectedInContext('F1', null)).toBe(true)
    })
  })
})