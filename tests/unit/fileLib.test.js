import { describe, it, expect, beforeEach } from 'vitest'
import STOFileHandler from '../../src/js/lib/fileHandler.js'
import '../../src/js/data.js'

describe('STOFileHandler library', () => {
  let lib
  beforeEach(() => {
    lib = new STOFileHandler()
  })

  it('parses keybind files and aliases', () => {
    const content = 'F1 "say hi"\nalias test "wave"'
    const result = lib.parseKeybindFile(content)
    expect(result.keybinds.F1.commands[0].command).toBe('say hi')
    expect(result.aliases.test.commands).toBe('wave')
  })

  it('detects mirrored command strings', () => {
    const cmds = [{ command: 'A' }, { command: 'B' }, { command: 'C' }]
    const mirrored = lib.generateMirroredCommandString(cmds)
    const info = lib.detectAndUnmirrorCommands(mirrored)
    expect(info.isMirrored).toBe(true)
    expect(info.originalCommands).toEqual(['A','B','C'])
  })

  it('generates keybind file text', () => {
    const profile = { name: 'Test', currentEnvironment: 'space', keys: { F1: [{ command: "say hi", type: 'communication' }] }, aliases: {} }
    const txt = lib.generateKeybindFile(profile)
    expect(txt).toContain('F1 "say hi"')
    expect(txt).toContain('STO Keybind Configuration')
  })

  it('handles getCommandText when STO_DATA.commands is undefined', () => {
    // Save original STO_DATA
    const originalSTO_DATA = globalThis.STO_DATA
    
    // Set STO_DATA to an object without commands property
    globalThis.STO_DATA = {}
    
    try {
      // This should not throw a TypeError
      const result = lib.getCommandText('some_command')
      expect(result).toBe('some command')
    } finally {
      // Restore original STO_DATA
      globalThis.STO_DATA = originalSTO_DATA
    }
  })

  it('handles getCommandText when STO_DATA is undefined', () => {
    // Save original STO_DATA
    const originalSTO_DATA = globalThis.STO_DATA
    
    // Set STO_DATA to undefined
    globalThis.STO_DATA = undefined
    
    try {
      // This should not throw a TypeError
      const result = lib.getCommandText('some_command')
      expect(result).toBe('some command')
    } finally {
      // Restore original STO_DATA
      globalThis.STO_DATA = originalSTO_DATA
    }
  })
})
