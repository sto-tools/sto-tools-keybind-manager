import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import ParameterCommandService from '../../../src/js/components/services/ParameterCommandService.js'
import { createServiceFixture } from '../../fixtures'

/**
 * Unit tests – ParameterCommandService
 * Focus on pure helper methods that do not require heavy profile data.
 */

describe('ParameterCommandService', () => {
  let fixture, service

  beforeEach(() => {
    fixture = createServiceFixture()
    service  = new ParameterCommandService({ eventBus: fixture.eventBus })
    // Ensure lifecycle listeners are registered
    if (typeof service.init === 'function') service.init()
  })

  afterEach(() => {
    fixture.destroy()
  })

  it('generateCommandId should return a unique cmd_* identifier', () => {
    const id1 = service.generateCommandId()
    const id2 = service.generateCommandId()

    expect(id1).toMatch(/^cmd_/)
    expect(id2).toMatch(/^cmd_/)
    expect(id1).not.toEqual(id2)
  })

  it('generateTrayRangeCommands (single tray, active=1) should prefix with "+"', () => {
    const commands = service.generateTrayRangeCommands('Exec', 1, 0, 1, 2, 1)
    expect(commands).toEqual(['+Exec 1 0', '+Exec 1 1', '+Exec 1 2'])
  })

  it('generateTrayRangeCommands (cross-tray, active=0) should use explicit syntax', () => {
    const commands = service.generateTrayRangeCommands('+Exec', 1, 0, 2, 0, 0)
    expect(commands).toEqual(['Exec 0 1 0', 'Exec 0 1 1', 'Exec 0 1 2', 'Exec 0 1 3', 'Exec 0 1 4', 'Exec 0 1 5', 'Exec 0 1 6', 'Exec 0 1 7', 'Exec 0 1 8', 'Exec 0 1 9', 'Exec 0 2 0'])
  })

  it('generateWholeTrayCommands should produce 10 commands for the tray', () => {
    const commands = service.generateWholeTrayCommands('TrayExec', 3, 1)
    expect(commands).toHaveLength(10)
    // Spot-check first & last command
    expect(commands[0]).toBe('+TrayExec 3 0')
    expect(commands[9]).toBe('+TrayExec 3 9')
  })
}) 