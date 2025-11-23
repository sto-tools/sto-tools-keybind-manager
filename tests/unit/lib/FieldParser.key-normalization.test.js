import { describe, it, expect } from 'vitest'
import FieldParser from '../../../src/js/lib/kbf/parsers/FieldParser.js'

/**
 * Unit tests – FieldParser – verify key token normalization
 * Tests that FieldParser.parseKeyTokenField normalizes uppercase keys like SPACE to Space
 */

describe('FieldParser - Key Token Normalization', () => {
  let fieldParser

  beforeEach(() => {
    fieldParser = new FieldParser()
  })

  it('should normalize SPACE to Space', () => {
    // Create a mock key field record with uppercase SPACE
    const mockRecord = {
      fieldName: 'Key',
      hasColon: true,
      value: 'SPACE'
    }

    const result = fieldParser.parseKeyTokenField(mockRecord, 0)

    expect(result).toBe('Space')
  })

  it('should normalize CTRL to Control', () => {
    const mockRecord = {
      fieldName: 'Key',
      hasColon: true,
      value: 'CTRL'
    }

    const result = fieldParser.parseKeyTokenField(mockRecord, 0)

    expect(result).toBe('Control')
  })

  it('should normalize ctrl to Control', () => {
    const mockRecord = {
      fieldName: 'Key',
      hasColon: true,
      value: 'ctrl'
    }

    const result = fieldParser.parseKeyTokenField(mockRecord, 0)

    expect(result).toBe('Control')
  })

  it('should normalize f1 to F1', () => {
    const mockRecord = {
      fieldName: 'Key',
      hasColon: true,
      value: 'f1'
    }

    const result = fieldParser.parseKeyTokenField(mockRecord, 0)

    expect(result).toBe('F1')
  })

  it('should keep already normalized Space as Space', () => {
    const mockRecord = {
      fieldName: 'Key',
      hasColon: true,
      value: 'Space'
    }

    const result = fieldParser.parseKeyTokenField(mockRecord, 0)

    expect(result).toBe('Space')
  })

  it('should keep already normalized Control as Control', () => {
    const mockRecord = {
      fieldName: 'Key',
      hasColon: true,
      value: 'Control'
    }

    const result = fieldParser.parseKeyTokenField(mockRecord, 0)

    expect(result).toBe('Control')
  })

  it('should keep ALT as ALT (already in correct format)', () => {
    const mockRecord = {
      fieldName: 'Key',
      hasColon: true,
      value: 'ALT'
    }

    const result = fieldParser.parseKeyTokenField(mockRecord, 0)

    expect(result).toBe('ALT')
  })

  it('should handle special token Space as space character', () => {
    const mockRecord = {
      fieldName: 'Key',
      hasColon: true,
      value: 'Space'
    }

    const result = fieldParser.parseKeyTokenField(mockRecord, 0)

    expect(result).toBe(' ')
  })

  it('should handle special token SemiColon as semicolon', () => {
    const mockRecord = {
      fieldName: 'Key',
      hasColon: true,
      value: 'SemiColon'
    }

    const result = fieldParser.parseKeyTokenField(mockRecord, 0)

    expect(result).toBe(';')
  })

  it('should return unknown keys unchanged', () => {
    const mockRecord = {
      fieldName: 'Key',
      hasColon: true,
      value: 'UnknownKey123'
    }

    const result = fieldParser.parseKeyTokenField(mockRecord, 0)

    expect(result).toBe('UnknownKey123')
  })

  it('should return null for invalid records', () => {
    const invalidRecord = {
      fieldName: 'Key',
      hasColon: false,
      value: 'SPACE'
    }

    const result = fieldParser.parseKeyTokenField(invalidRecord, 0)

    expect(result).toBeNull()
  })

  it('should return null for empty value', () => {
    const emptyRecord = {
      fieldName: 'Key',
      hasColon: true,
      value: ''
    }

    const result = fieldParser.parseKeyTokenField(emptyRecord, 0)

    expect(result).toBeNull()
  })

  it('should test comprehensive case normalization scenarios', () => {
    const testCases = [
      { input: 'SPACE', expected: 'Space' },
      { input: 'Space', expected: 'Space' },
      { input: 'space', expected: 'Space' },
      { input: 'CTRL', expected: 'Control' },
      { input: 'Control', expected: 'Control' },
      { input: 'control', expected: 'Control' },
      { input: 'ALT', expected: 'ALT' },
      { input: 'alt', expected: 'ALT' },
      { input: 'F1', expected: 'F1' },
      { input: 'f1', expected: 'F1' },
      { input: 'TAB', expected: 'Tab' },
      { input: 'tab', expected: 'Tab' },
      { input: 'SHIFT', expected: 'Shift' },
      { input: 'shift', expected: 'Shift' }
    ]

    testCases.forEach(({ input, expected }) => {
      const mockRecord = {
        fieldName: 'Key',
        hasColon: true,
        value: input
      }

      const result = fieldParser.parseKeyTokenField(mockRecord, 0)

      expect(result).toBe(expected)
      console.log(`FieldParser normalization: "${input}" -> "${result}" (expected: "${expected}")`)
    })
  })
})