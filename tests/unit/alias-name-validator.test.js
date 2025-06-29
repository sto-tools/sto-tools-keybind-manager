import { describe, it, expect } from 'vitest'
import { isAliasNameAllowed, isAliasNamePatternValid } from '../../src/js/lib/aliasNameValidator.js'

describe('aliasNameValidator', () => {
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

  it('enforces pattern rules', () => {
    expect(isAliasNamePatternValid('1Bad')).toBe(false)
    expect(isAliasNamePatternValid('Good_One')).toBe(true)
  })
}) 