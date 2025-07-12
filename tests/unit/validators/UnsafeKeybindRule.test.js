import { describe, it, expect } from 'vitest'
import UnsafeKeybindRule from '../../../src/js/components/services/validators/UnsafeKeybindRule.js'

describe('UnsafeKeybindRule', () => {
  it('flags unsafe keybinds', () => {
    const rule = new UnsafeKeybindRule()

    const res = rule.run({ key: 'Alt+F4' })
    expect(res).not.toBeNull()
    expect(res.severity).toBe('warning')
  })

  it('flags unsafe keybinds case-insensitive', () => {
    const rule = new UnsafeKeybindRule()

    const res = rule.run({ key: 'ALT+F4' })
    expect(res).not.toBeNull()
  })

  it('passes safe keybinds', () => {
    const rule = new UnsafeKeybindRule()

    const res = rule.run({ key: 'Ctrl+A' })
    expect(res).toBeNull()
  })
}) 