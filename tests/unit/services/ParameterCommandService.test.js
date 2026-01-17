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

  /**
   * Regression tests for arc targeting commands bug fix
   * Bug: js-missing-arc-target-commands
   * Issue: Editing arc targeting commands corrupted them to just "Target"
   * Fix: Updated targeting builder to recognize arc commandIds and append degrees parameter
   */
  describe('Regression tests', () => {
    it('should build Target_Enemy_Near_ForArc command with degrees parameter (regression: js-missing-arc-target-commands)', async () => {
      const commandDef = {
        command: 'Target_Enemy_Near_ForArc',
        name: 'Target Nearest Enemy (Fore Arc)',
        icon: '🎯'
      }
      const params = { degrees: 90 }

      const result = await service.buildParameterizedCommand('targeting', 'target_enemy_near_forarc', commandDef, params)

      expect(result).not.toBeNull()
      expect(result.command).toBe('Target_Enemy_Near_ForArc 90')
      expect(result.displayText).toBe('Target Nearest Enemy (Fore Arc) (90°)')
      expect(result.parameters).toEqual({ degrees: 90 })
    })

    it('should build Target_Enemy_Near_AftArc command with degrees parameter (regression: js-missing-arc-target-commands)', async () => {
      const commandDef = {
        command: 'Target_Enemy_Near_AftArc',
        name: 'Target Nearest Enemy (Aft Arc)',
        icon: '🎯'
      }
      const params = { degrees: 120 }

      const result = await service.buildParameterizedCommand('targeting', 'target_enemy_near_aftarc', commandDef, params)

      expect(result).not.toBeNull()
      expect(result.command).toBe('Target_Enemy_Near_AftArc 120')
      expect(result.displayText).toBe('Target Nearest Enemy (Aft Arc) (120°)')
      expect(result.parameters).toEqual({ degrees: 120 })
    })

    it('should build Target_Enemy_Near_SideArc command with degrees parameter (regression: js-missing-arc-target-commands)', async () => {
      const commandDef = {
        command: 'Target_Enemy_Near_SideArc',
        name: 'Target Nearest Enemy (Side Arc)',
        icon: '🎯'
      }
      const params = { degrees: 180 }

      const result = await service.buildParameterizedCommand('targeting', 'target_enemy_near_sidearc', commandDef, params)

      expect(result).not.toBeNull()
      expect(result.command).toBe('Target_Enemy_Near_SideArc 180')
      expect(result.displayText).toBe('Target Nearest Enemy (Side Arc) (180°)')
      expect(result.parameters).toEqual({ degrees: 180 })
    })

    it('should still build Target command with entityName parameter (regression: js-missing-arc-target-commands)', async () => {
      const commandDef = {
        command: 'Target',
        name: 'Target by Name',
        icon: '🎯'
      }
      const params = { entityName: 'EnemyShip' }

      const result = await service.buildParameterizedCommand('targeting', 'target', commandDef, params)

      expect(result).not.toBeNull()
      expect(result.command).toBe('Target "EnemyShip"')
      expect(result.displayText).toBe('Target: EnemyShip')
    })
  })
}) 