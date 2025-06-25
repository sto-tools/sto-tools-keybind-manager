import { describe, it, expect, beforeEach } from 'vitest'
import CommandBuilderService from '../../src/js/components/services/CommandBuilderService.js'
import KeyService from '../../src/js/components/services/KeyService.js'

let builder

beforeEach(() => {
  builder = new CommandBuilderService({})
})

describe('CommandBuilderService – Tray Commands', () => {
  it('should build standard tray execution command', () => {
    const result = builder.build('tray', 'standard', { tray: 1, slot: 2 })
    expect(result).toEqual({
      command: '+STOTrayExecByTray 1 2',
      type: 'tray',
      icon: '⚡',
      text: 'Execute Tray 2 Slot 3',
      description: 'Execute ability in tray 2, slot 3',
      parameters: { tray: 1, slot: 2, command_type: 'STOTrayExecByTray' },
    })
  })

  it('should build tray command with backup parameters', () => {
    const result = builder.build('tray', 'tray_with_backup', {
      tray: 0,
      slot: 0,
      backup_tray: 1,
      backup_slot: 1,
      active: 'on',
    })
    expect(result).toEqual({
      command: 'TrayExecByTrayWithBackup 1 0 0 1 1',
      type: 'tray',
      icon: '⚡',
      text: 'Execute Tray 1 Slot 1 (with backup)',
      description: 'Execute ability in tray 1, slot 1 with backup in tray 2, slot 2',
      parameters: {
        tray: 0,
        slot: 0,
        backup_tray: 1,
        backup_slot: 1,
        active: 1,
      },
    })
  })

  it('should use default parameters when none provided', () => {
    const result = builder.build('tray', 'standard')
    expect(result.command).toBe('+STOTrayExecByTray 0 0')
    expect(result.text).toBe('Execute Tray 1 Slot 1')
  })

  it('should build tray range execution command', () => {
    const result = builder.build('tray', 'tray_range', {
      start_tray: 0,
      start_slot: 0,
      end_tray: 0,
      end_slot: 2,
      command_type: 'STOTrayExecByTray',
    })
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(3)
    expect(result[0].type).toBe('tray')
    expect(result[0].icon).toBe('⚡')
    expect(result[0].text).toBe('Execute Range: Tray 1 Slot 1 to Tray 1 Slot 3')
    expect(result[0].command).toBe('+STOTrayExecByTray 0 0')
    expect(result[0].parameters).toEqual({
      start_tray: 0,
      start_slot: 0,
      end_tray: 0,
      end_slot: 2,
      command_type: 'STOTrayExecByTray',
    })
    expect(result[1].command).toBe('+STOTrayExecByTray 0 1')
    expect(result[2].command).toBe('+STOTrayExecByTray 0 2')
  })

  it('should build tray range across multiple trays', () => {
    const result = builder.build('tray', 'tray_range', {
      start_tray: 0,
      start_slot: 8,
      end_tray: 1,
      end_slot: 1,
      command_type: 'STOTrayExecByTray',
    })
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(4)
    expect(result[0].command).toBe('+STOTrayExecByTray 0 8')
    expect(result[1].command).toBe('+STOTrayExecByTray 0 9')
    expect(result[2].command).toBe('+STOTrayExecByTray 1 0')
    expect(result[3].command).toBe('+STOTrayExecByTray 1 1')
  })

  it('should build tray range with TrayExecByTray variant', () => {
    const result = builder.build('tray', 'tray_range', {
      start_tray: 0,
      start_slot: 0,
      end_tray: 0,
      end_slot: 1,
      command_type: 'TrayExecByTray',
    })
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
    expect(result[0].command).toBe('TrayExecByTray 0 0')
    expect(result[1].command).toBe('TrayExecByTray 0 1')
  })

  it('should build whole tray execution command', () => {
    const result = builder.build('tray', 'whole_tray', {
      tray: 2,
      command_type: 'STOTrayExecByTray',
    })
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(10)
    expect(result[0].type).toBe('tray')
    expect(result[0].icon).toBe('⚡')
    expect(result[0].text).toBe('Execute Whole Tray 3')
    expect(result[0].command).toBe('+STOTrayExecByTray 2 0')
    expect(result[9].command).toBe('+STOTrayExecByTray 2 9')
  })

  it('should build tray range with backup command', () => {
    const result = builder.build('tray', 'tray_range_with_backup', {
      active: 1,
      start_tray: 0,
      start_slot: 0,
      end_tray: 0,
      end_slot: 1,
      backup_start_tray: 1,
      backup_start_slot: 0,
      backup_end_tray: 1,
      backup_end_slot: 1,
    })
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('tray')
    expect(result[0].icon).toBe('⚡')
    expect(result[0].text).toBe('Execute Range with Backup: Tray 1-1')
    expect(result[0].command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
    expect(result[1].command).toBe('TrayExecByTrayWithBackup 1 0 1 1 1')
  })

  it('should build whole tray with backup command', () => {
    const result = builder.build('tray', 'whole_tray_with_backup', {
      active: 1,
      tray: 0,
      backup_tray: 1,
    })
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(10)
    expect(result[0].type).toBe('tray')
    expect(result[0].icon).toBe('⚡')
    expect(result[0].text).toBe('Execute Whole Tray 1 (with backup Tray 2)')
    expect(result[0].command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
    expect(result[9].command).toBe('TrayExecByTrayWithBackup 1 0 9 1 9')
  })
})

describe('CommandBuilderService – Combat Commands', () => {
  it('should build combat command correctly', () => {
    const result = builder.build('combat', 'fire_all')
    expect(result).toEqual({
      command: 'FireAll',
      type: 'combat',
      icon: '🔥',
      text: 'Fire All Weapons',
      description: 'Fire all weapons',
      environment: 'space',
    })
  })

  it('should build ground combat command correctly', () => {
    const result = builder.build('combat', 'aim')
    expect(result).toEqual({
      command: 'aim',
      type: 'combat',
      icon: '🎯',
      text: 'Aim/Scope',
      description: 'Toggle scope on/off. In scope mode the player does more damage. Can either be used as a toggle or a press and hold',
      environment: 'ground',
    })
  })

  it('should build customizable ground command with parameters', () => {
    const result = builder.build('combat', 'setactivecostume', {
      modifier1: 'costume1',
      modifier2: 'costume2',
    })
    expect(result).toEqual({
      command: 'setactivecostume costume1 costume2',
      type: 'combat',
      icon: expect.any(String),
      text: expect.any(String),
      description: expect.any(String),
      environment: expect.any(String),
      parameters: {
        modifier1: 'costume1',
        modifier2: 'costume2',
      },
    })
  })

  it('should handle invalid combat command ID', () => {
    const result = builder.build('combat', 'invalid_command')
    expect(result).toBeNull()
  })
})

describe('CommandBuilderService – Communication Commands', () => {
  it('should build communication command with message parameters', () => {
    const result = builder.build('communication', 'local_message', {
      message: 'Hello world',
    })
    expect(result).toEqual({
      command: 'LocalMessage Hello world',
      type: 'communication',
      icon: expect.any(String),
      text: expect.stringContaining('Hello world'),
      description: expect.any(String),
      parameters: { message: 'Hello world' },
    })
  })

  it('should use default message when none provided', () => {
    const result = builder.build('communication', 'team_message')
    expect(result.command).toContain('Message text here')
    expect(result.parameters.message).toBe('Message text here')
  })

  it('should handle invalid communication command ID', () => {
    const result = builder.build('communication', 'invalid_command')
    expect(result).toBeNull()
  })
}) 