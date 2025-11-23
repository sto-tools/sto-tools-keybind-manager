// FieldParser.test.js - Tests for KBF Field Parser normalization functionality
// Tests specifically for key token normalization bug fix

import { describe, it, expect } from 'vitest'
import { FieldParser } from '../../../src/js/lib/kbf/parsers/FieldParser.js'

describe('FieldParser - Key Token Normalization', () => {
  let fieldParser

  beforeEach(() => {
    fieldParser = new FieldParser()
  })

  describe('normalizeKeyToken method', () => {
    it('should normalize uppercase key tokens to TitleCase format', () => {
      expect(fieldParser.normalizeKeyToken('SPACE')).toBe('Space')
      expect(fieldParser.normalizeKeyToken('CONTROL')).toBe('Control')
      expect(fieldParser.normalizeKeyToken('SHIFT')).toBe('Shift')
      expect(fieldParser.normalizeKeyToken('TAB')).toBe('Tab')
      expect(fieldParser.normalizeKeyToken('HOME')).toBe('Home')
      expect(fieldParser.normalizeKeyToken('PAGEUP')).toBe('PageUp')
      expect(fieldParser.normalizeKeyToken('PAGEDOWN')).toBe('PageDown')
      expect(fieldParser.normalizeKeyToken('INSERT')).toBe('insert')
      expect(fieldParser.normalizeKeyToken('DELETE')).toBe('delete')
      expect(fieldParser.normalizeKeyToken('END')).toBe('End')
    })

    it('should handle mixed case key tokens', () => {
      expect(fieldParser.normalizeKeyToken('Space')).toBe('Space')
      expect(fieldParser.normalizeKeyToken('sPaCe')).toBe('Space')
      expect(fieldParser.normalizeKeyToken('CTRL')).toBe('Control')
      expect(fieldParser.normalizeKeyToken('CTrl')).toBe('Control')
      expect(fieldParser.normalizeKeyToken('CtrL')).toBe('Control')
      expect(fieldParser.normalizeKeyToken('alt')).toBe('ALT')
      expect(fieldParser.normalizeKeyToken('Alt')).toBe('ALT')
      expect(fieldParser.normalizeKeyToken('ALt')).toBe('ALT')
    })

    it('should preserve already correct key tokens', () => {
      expect(fieldParser.normalizeKeyToken('Space')).toBe('Space')
      expect(fieldParser.normalizeKeyToken('Control')).toBe('Control')
      expect(fieldParser.normalizeKeyToken('ALT')).toBe('ALT')
      expect(fieldParser.normalizeKeyToken('Shift')).toBe('Shift')
      expect(fieldParser.normalizeKeyToken('Tab')).toBe('Tab')
      expect(fieldParser.normalizeKeyToken('enter')).toBe('enter')
      expect(fieldParser.normalizeKeyToken('delete')).toBe('delete')
    })

    it('should handle special case variations', () => {
      expect(fieldParser.normalizeKeyToken('ctrl')).toBe('Control')
      expect(fieldParser.normalizeKeyToken('escape')).toBe('delete')
      expect(fieldParser.normalizeKeyToken('esc')).toBe('delete')
      expect(fieldParser.normalizeKeyToken('capslock')).toBe('CapsLock')
      expect(fieldParser.normalizeKeyToken('backspace')).toBe('delete')
      expect(fieldParser.normalizeKeyToken('del')).toBe('delete')
    })

    it('should return original token for unknown keys', () => {
      expect(fieldParser.normalizeKeyToken('UnknownKey')).toBe('UnknownKey')
      expect(fieldParser.normalizeKeyToken('CUSTOM')).toBe('CUSTOM')
      expect(fieldParser.normalizeKeyToken('SomeSpecialKey')).toBe('SomeSpecialKey')
    })

    it('should handle function keys correctly', () => {
      expect(fieldParser.normalizeKeyToken('F1')).toBe('F1')
      expect(fieldParser.normalizeKeyToken('f1')).toBe('F1')
      expect(fieldParser.normalizeKeyToken('F10')).toBe('F10')
      expect(fieldParser.normalizeKeyToken('f10')).toBe('F10')
    })

    it('should handle numpad keys correctly', () => {
      expect(fieldParser.normalizeKeyToken('numpad0')).toBe('numpad0')
      expect(fieldParser.normalizeKeyToken('NUMPAD0')).toBe('numpad0')
      expect(fieldParser.normalizeKeyToken('NumpadEnter')).toBe('numpadenter')
    })

    it('should handle mouse buttons correctly', () => {
      expect(fieldParser.normalizeKeyToken('Lbutton')).toBe('Lbutton')
      expect(fieldParser.normalizeKeyToken('LBUTTON')).toBe('Lbutton')
      expect(fieldParser.normalizeKeyToken('Rbutton')).toBe('Rbutton')
      expect(fieldParser.normalizeKeyToken('BUTTON1')).toBe('Button1')
    })
  })

  describe('parseKeyTokenField method with normalization', () => {
    it('should apply normalization when parsing key token fields', () => {
      // Test record structure that parseKeyTokenField expects
      const testRecord = {
        hasColon: true,
        value: 'SPACE'
      }

      const result = fieldParser.parseKeyTokenField(testRecord, 0)
      expect(result).toBe('Space') // Should be normalized
    })

    it('should normalize CTRL variations correctly', () => {
      const ctrlRecord = {
        hasColon: true,
        value: 'CTRL'
      }

      const result = fieldParser.parseKeyTokenField(ctrlRecord, 0)
      expect(result).toBe('Control') // Should be normalized
    })

    it('should handle special tokens correctly', () => {
      // Test SemiColon special case
      const semiColonRecord = {
        hasColon: true,
        value: 'SemiColon'
      }
      expect(fieldParser.parseKeyTokenField(semiColonRecord, 0)).toBe(';')

      // Test Space special case (should remain as space character)
      const spaceRecord = {
        hasColon: true,
        value: 'Space'
      }
      expect(fieldParser.parseKeyTokenField(spaceRecord, 0)).toBe(' ')
    })

    it('should not normalize the special Space token to "Space"', () => {
      // This tests that the special case handling takes precedence
      const spaceRecord = {
        hasColon: true,
        value: 'Space'
      }
      const result = fieldParser.parseKeyTokenField(spaceRecord, 0)
      expect(result).toBe(' ') // Should be space character, not "Space" string
    })

    it('should handle invalid records gracefully', () => {
      // Test record without colon
      const noColonRecord = {
        hasColon: false,
        value: 'SPACE'
      }
      expect(fieldParser.parseKeyTokenField(noColonRecord, 0)).toBeNull()

      // Test record with null value
      const nullValueRecord = {
        hasColon: true,
        value: null
      }
      expect(fieldParser.parseKeyTokenField(nullValueRecord, 0)).toBeNull()

      // Test record with empty value
      const emptyValueRecord = {
        hasColon: true,
        value: ''
      }
      expect(fieldParser.parseKeyTokenField(emptyValueRecord, 0)).toBeNull()
    })

    it('should preserve exact tokens that are already in correct format', () => {
      const correctFormatRecord = {
        hasColon: true,
        value: 'F1'
      }

      const result = fieldParser.parseKeyTokenField(correctFormatRecord, 0)
      expect(result).toBe('F1') // Should remain unchanged
    })
  })

  // Regression test for the original bug
  describe('Regression tests', () => {
    it('should fix the original KBF uppercase key token bug (regression: js-kbf-key-token-normalization)', () => {
      // This test specifically reproduces the original bug scenario
      // where KBF files with uppercase key tokens weren't matching
      // the application's internal key representation

      // These are the problematic keys that need normalization
      // ALT is already correct in STO_KEY_NAMES, so it doesn't need normalization
      const problematicKeys = ['SPACE', 'CTRL', 'CONTROL', 'SHIFT', 'TAB', 'HOME', 'END']

      problematicKeys.forEach(uppercaseKey => {
        const record = { hasColon: true, value: uppercaseKey }
        const normalizedResult = fieldParser.parseKeyTokenField(record, 0)

        // Verify the key has been normalized to match STO_KEY_NAMES format
        expect(typeof normalizedResult).toBe('string')
        expect(normalizedResult.length).toBeGreaterThan(0)
      })

      // Specific known mappings that should work
      expect(fieldParser.parseKeyTokenField({ hasColon: true, value: 'SPACE' }, 0)).toBe('Space')
      expect(fieldParser.parseKeyTokenField({ hasColon: true, value: 'CTRL' }, 0)).toBe('Control')
      expect(fieldParser.parseKeyTokenField({ hasColon: true, value: 'CONTROL' }, 0)).toBe('Control')
      expect(fieldParser.parseKeyTokenField({ hasColon: true, value: 'ALT' }, 0)).toBe('ALT') // ALT is already correct
      expect(fieldParser.parseKeyTokenField({ hasColon: true, value: 'SHIFT' }, 0)).toBe('Shift')
      expect(fieldParser.parseKeyTokenField({ hasColon: true, value: 'TAB' }, 0)).toBe('Tab')
    })
  })
})