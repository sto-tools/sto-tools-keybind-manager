/**
 * keyEncoding.test.js - Unit tests for key encoding/decoding functionality
 *
 * Tests the encodeKeyForExport and decodeKeyFromImport functions to ensure
 * they handle various input types and edge cases correctly.
 */

import { describe, test, expect } from 'vitest'
import {
  encodeKeyForExport,
  decodeKeyFromImport,
  keyNeedsEncoding,
  keyNeedsDecoding,
  getEncodableKeys,
  getEncodedKeys
} from '../../../src/js/lib/keyEncoding.js'

describe('keyEncoding', () => {
  describe('encodeKeyForExport', () => {
    test('should encode single backtick key correctly', () => {
      expect(encodeKeyForExport('`')).toBe('0x29')
    })

    test('should handle chord combinations with backtick correctly', () => {
      expect(encodeKeyForExport('ALT+`')).toBe('ALT+0x29')
      expect(encodeKeyForExport('CTRL+`')).toBe('CTRL+0x29')
      expect(encodeKeyForExport('SHIFT+`')).toBe('SHIFT+0x29')
    })

    test('should return unchanged keys that don\'t need encoding', () => {
      expect(encodeKeyForExport('A')).toBe('A')
      expect(encodeKeyForExport('F1')).toBe('F1')
      expect(encodeKeyForExport('ENTER')).toBe('ENTER')
    })

    test('should handle chord combinations without encodable keys', () => {
      expect(encodeKeyForExport('ALT+A')).toBe('ALT+A')
      expect(encodeKeyForExport('CTRL+F1')).toBe('CTRL+F1')
    })

    test('should handle whitespace in chord combinations correctly', () => {
      expect(encodeKeyForExport('ALT + `')).toBe('ALT+0x29')
      expect(encodeKeyForExport('CTRL + A')).toBe('CTRL+A')
    })

    test('should handle null input gracefully', () => {
      expect(encodeKeyForExport(null)).toBe(null)
    })

    test('should handle undefined input gracefully', () => {
      expect(encodeKeyForExport(undefined)).toBe(undefined)
    })

    test('should handle number input gracefully', () => {
      expect(encodeKeyForExport(123)).toBe(123)
    })

    test('should handle object input gracefully', () => {
      const obj = { test: 'value' }
      expect(encodeKeyForExport(obj)).toBe(obj)
    })

    test('should handle array input gracefully', () => {
      const arr = ['test']
      expect(encodeKeyForExport(arr)).toBe(arr)
    })

    test('should handle empty string correctly', () => {
      expect(encodeKeyForExport('')).toBe('')
    })

    test('should handle boolean input gracefully', () => {
      expect(encodeKeyForExport(true)).toBe(true)
      expect(encodeKeyForExport(false)).toBe(false)
    })
  })

  describe('decodeKeyFromImport', () => {
    test('should decode single hex key correctly', () => {
      expect(decodeKeyFromImport('0x29')).toBe('`')
    })

    test('should handle chord combinations with hex keys correctly', () => {
      expect(decodeKeyFromImport('ALT+0x29')).toBe('ALT+`')
      expect(decodeKeyFromImport('CTRL+0x29')).toBe('CTRL+`')
      expect(decodeKeyFromImport('SHIFT+0x29')).toBe('SHIFT+`')
    })

    test('should return unchanged keys that don\'t need decoding', () => {
      expect(decodeKeyFromImport('A')).toBe('A')
      expect(decodeKeyFromImport('F1')).toBe('F1')
      expect(decodeKeyFromImport('ENTER')).toBe('ENTER')
    })

    test('should handle chord combinations without decodable keys', () => {
      expect(decodeKeyFromImport('ALT+A')).toBe('ALT+A')
      expect(decodeKeyFromImport('CTRL+F1')).toBe('CTRL+F1')
    })

    test('should handle whitespace in chord combinations correctly', () => {
      expect(decodeKeyFromImport('ALT + 0x29')).toBe('ALT+`')
      expect(decodeKeyFromImport('CTRL + A')).toBe('CTRL+A')
    })

    test('should handle null input gracefully', () => {
      expect(decodeKeyFromImport(null)).toBe(null)
    })

    test('should handle undefined input gracefully', () => {
      expect(decodeKeyFromImport(undefined)).toBe(undefined)
    })

    test('should handle number input gracefully', () => {
      expect(decodeKeyFromImport(123)).toBe(123)
    })

    test('should handle object input gracefully', () => {
      const obj = { test: 'value' }
      expect(decodeKeyFromImport(obj)).toBe(obj)
    })

    test('should handle array input gracefully', () => {
      const arr = ['test']
      expect(decodeKeyFromImport(arr)).toBe(arr)
    })

    test('should handle empty string correctly', () => {
      expect(decodeKeyFromImport('')).toBe('')
    })

    test('should handle boolean input gracefully', () => {
      expect(decodeKeyFromImport(true)).toBe(true)
      expect(decodeKeyFromImport(false)).toBe(false)
    })
  })

  describe('keyNeedsEncoding', () => {
    test('should return true for keys that need encoding', () => {
      expect(keyNeedsEncoding('`')).toBe(true)
    })

    test('should return false for keys that don\'t need encoding', () => {
      expect(keyNeedsEncoding('A')).toBe(false)
      expect(keyNeedsEncoding('F1')).toBe(false)
      expect(keyNeedsEncoding('ENTER')).toBe(false)
    })

    test('should handle invalid input gracefully', () => {
      expect(keyNeedsEncoding(null)).toBe(false)
      expect(keyNeedsEncoding(undefined)).toBe(false)
      expect(keyNeedsEncoding(123)).toBe(false)
    })
  })

  describe('keyNeedsDecoding', () => {
    test('should return true for encoded keys that need decoding', () => {
      expect(keyNeedsDecoding('0x29')).toBe(true)
    })

    test('should return false for keys that don\'t need decoding', () => {
      expect(keyNeedsDecoding('A')).toBe(false)
      expect(keyNeedsDecoding('F1')).toBe(false)
      expect(keyNeedsDecoding('ENTER')).toBe(false)
    })

    test('should handle invalid input gracefully', () => {
      expect(keyNeedsDecoding(null)).toBe(false)
      expect(keyNeedsDecoding(undefined)).toBe(false)
      expect(keyNeedsDecoding(123)).toBe(false)
    })
  })

  describe('getEncodableKeys', () => {
    test('should return array of keys that need encoding', () => {
      const keys = getEncodableKeys()
      expect(Array.isArray(keys)).toBe(true)
      expect(keys).toContain('`')
    })
  })

  describe('getEncodedKeys', () => {
    test('should return array of encoded key values', () => {
      const keys = getEncodedKeys()
      expect(Array.isArray(keys)).toBe(true)
      expect(keys).toContain('0x29')
    })
  })

  describe('round-trip encoding/decoding', () => {
    test('should maintain consistency through encode-decode cycle', () => {
      const testKeys = ['`', 'ALT+`', 'CTRL+`', 'SHIFT+`', 'A', 'F1', 'ENTER']

      testKeys.forEach(key => {
        const encoded = encodeKeyForExport(key)
        const decoded = decodeKeyFromImport(encoded)
        expect(decoded).toBe(key)
      })
    })

    test('should handle complex chord combinations', () => {
      const complexKey = 'CTRL+SHIFT+ALT+`'
      const encoded = encodeKeyForExport(complexKey)
      const decoded = decodeKeyFromImport(encoded)
      expect(decoded).toBe(complexKey)
    })
  })

  describe('edge cases', () => {
    test('should handle unusual but valid string inputs', () => {
      expect(encodeKeyForExport('+')).toBe('+')
      expect(encodeKeyForExport('+++')).toBe('+++')
      expect(encodeKeyForExport(' + ` + ')).toBe('+0x29+')
    })

    test('should handle mixed case whitespace consistently', () => {
      const testInputs = [
        'ALT+`',
        'ALT +`',
        'ALT+ `',
        'ALT + `',
        ' ALT + ` ',
        '\tALT+\t`\t'
      ]

      const expected = 'ALT+0x29'
      testInputs.forEach(input => {
        expect(encodeKeyForExport(input)).toBe(expected)
      })
    })
  })
})