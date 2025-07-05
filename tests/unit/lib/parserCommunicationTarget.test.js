import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import { STOCommandParser } from '../../../src/js/lib/STOCommandParser.js'

let fixture, eventBus, parser

beforeEach(() => {
  fixture = createServiceFixture()
  eventBus = fixture.eventBus
  // Stand-alone parser that does not register responders (unit level)
  parser = new STOCommandParser(eventBus, { enableCache: false })
})

afterEach(() => {
  fixture.destroy()
})

describe('STOCommandParser – Communication vs Target parsing', () => {
  it('should treat team "attack $Target" as a Communication command, NOT Target by Name', () => {
    const cmdStr   = 'team "attack $Target"'
    const result   = parser.parseCommandString(cmdStr)
    const firstCmd = result.commands[0]

    // Expect category & base command for communication
    expect(firstCmd.category).toBe('communication')
    expect(firstCmd.baseCommand).toBe('Communication')
    expect(firstCmd.parameters.verb).toBe('team')
    expect(firstCmd.parameters.message).toBe('attack $Target')
  })

  it('should parse target "foo" as Target by Name', () => {
    const cmdStr   = 'target "foo"'
    const result   = parser.parseCommandString(cmdStr)
    const firstCmd = result.commands[0]

    expect(firstCmd.baseCommand).toBe('Target')
    expect(firstCmd.category).toBe('targeting')
    expect(firstCmd.parameters.entityName).toBe('foo')
  })
}) 