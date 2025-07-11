import { describe, it, expect } from 'vitest'
import { 
  isAliasNameAllowed, 
  isAliasNamePatternValid, 
  generateBindToAliasName,
  parseBindToAliasName 
} from '../../../src/js/lib/aliasNameValidator.js'

describe('aliasNameValidator', () => {
  describe('isAliasNameAllowed', () => {
    it('returns false for reserved communication commands', () => {
      expect(isAliasNameAllowed('say')).toBe(false)
      expect(isAliasNameAllowed('team')).toBe(false)
    })

    it('allows VFX command names', () => {
      expect(isAliasNameAllowed('dynFxSetFXExlusionList')).toBe(true)
    })

    it('allows custom safe names', () => {
      expect(isAliasNameAllowed('MyCoolAlias')).toBe(true)
    })

    it('disallows reserved STO-prefixed command names but allows unrelated ones', () => {
      expect(isAliasNameAllowed('STOTrayExecByTray')).toBe(false)
      expect(isAliasNameAllowed('STOSAY')).toBe(true)
    })
  })

  describe('isAliasNamePatternValid', () => {
    it('enforces pattern rules', () => {
      expect(isAliasNamePatternValid('1Bad')).toBe(false)
      expect(isAliasNamePatternValid('Good_One')).toBe(true)
      expect(isAliasNamePatternValid('validName123')).toBe(true)
      expect(isAliasNamePatternValid('invalid-name')).toBe(false)
      expect(isAliasNamePatternValid('invalid.name')).toBe(false)
    })
  })

  describe('generateBindToAliasName', () => {
    it('generates basic environment_key patterns', () => {
      expect(generateBindToAliasName('space', 'Q')).toBe('space_q')
      expect(generateBindToAliasName('ground', 'F1')).toBe('ground_f1')
      expect(generateBindToAliasName('space', 'Ctrl+A')).toBe('space_ctrl_a')
    })

    it('handles numeric keys with k prefix', () => {
      expect(generateBindToAliasName('space', '1')).toBe('space_k1')
      expect(generateBindToAliasName('ground', '9')).toBe('ground_k9')
      expect(generateBindToAliasName('space', 'NumPad1')).toBe('space_numpad1')
    })

    it('converts special characters to meaningful names', () => {
      expect(generateBindToAliasName('ground', 'Control+[')).toBe('ground_control_leftbracket')
      expect(generateBindToAliasName('space', 'Shift+]')).toBe('space_shift_rightbracket')
      expect(generateBindToAliasName('space', 'Alt+=')).toBe('space_alt_equals')
      expect(generateBindToAliasName('ground', 'Ctrl+-')).toBe('ground_ctrl_minus')
      expect(generateBindToAliasName('space', 'Shift+(')).toBe('space_shift_leftparen')
      expect(generateBindToAliasName('space', 'Alt+)')).toBe('space_alt_rightparen')
    })

    it('handles complex key combinations', () => {
      expect(generateBindToAliasName('space', 'Ctrl+Shift+A')).toBe('space_ctrl_shift_a')
      expect(generateBindToAliasName('ground', 'Alt+F4')).toBe('ground_alt_f4')
      expect(generateBindToAliasName('space', 'Mouse4')).toBe('space_mouse4')
    })

    it('sanitizes environment names', () => {
      expect(generateBindToAliasName('Ground-Control', 'A')).toBe('groundcontrol_a')
      expect(generateBindToAliasName('space_test', 'B')).toBe('spacetest_b')
    })

    it('handles edge cases', () => {
      expect(generateBindToAliasName('', 'A')).toBe('space_a') // defaults to space
      expect(generateBindToAliasName('space', '')).toBe(null) // empty key
      expect(generateBindToAliasName('space', '!!!')).toBe('space_exclamationexclamationexclamation')
    })

    it('collapses multiple underscores and removes leading/trailing ones', () => {
      expect(generateBindToAliasName('space', 'Ctrl+_+A')).toBe('space_ctrl_underscore_a')
      expect(generateBindToAliasName('space', '___test___')).toBe('space_underscoreunderscoreunderscoretestunderscoreunderscoreunderscore')
    })
  })

  describe('parseBindToAliasName', () => {
    it('parses generated alias names correctly', () => {
      expect(parseBindToAliasName('space_q')).toEqual({
        environment: 'space',
        keyPart: 'q',
        originalKey: 'q'
      })

      expect(parseBindToAliasName('ground_control_leftbracket')).toEqual({
        environment: 'ground',
        keyPart: 'control_leftbracket',
        originalKey: 'control leftbracket'
      })
    })

    it('handles numeric key prefixes', () => {
      expect(parseBindToAliasName('space_k1')).toEqual({
        environment: 'space',
        keyPart: 'k1',
        originalKey: '1'
      })
    })

    it('returns null for invalid patterns', () => {
      expect(parseBindToAliasName('invalid')).toBe(null)
      expect(parseBindToAliasName('')).toBe(null)
      expect(parseBindToAliasName(null)).toBe(null)
    })
  })
}) 