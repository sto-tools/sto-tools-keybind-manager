import { describe, it, expect, beforeEach } from 'vitest'
import TrayCommandService from '../../src/js/components/services/TrayCommandService.js'

describe('TrayCommandService', () => {
  let service

  beforeEach(() => {
    service = new TrayCommandService()
  })

  describe('_normalizeActiveParameter', () => {
    it('should handle numeric values correctly', () => {
      expect(service._normalizeActiveParameter(0)).toBe(0)
      expect(service._normalizeActiveParameter(1)).toBe(1)
      expect(service._normalizeActiveParameter(2)).toBe(1)
      expect(service._normalizeActiveParameter(-1)).toBe(1)
      expect(service._normalizeActiveParameter(0.5)).toBe(1)
    })

    it('should handle boolean values correctly', () => {
      expect(service._normalizeActiveParameter(true)).toBe(1)
      expect(service._normalizeActiveParameter(false)).toBe(0)
    })

    it('should handle string values correctly', () => {
      expect(service._normalizeActiveParameter('on')).toBe(1)
      expect(service._normalizeActiveParameter('off')).toBe(0)
      expect(service._normalizeActiveParameter('true')).toBe(1)
      expect(service._normalizeActiveParameter('false')).toBe(0)
      expect(service._normalizeActiveParameter('1')).toBe(1)
      expect(service._normalizeActiveParameter('0')).toBe(0)
      expect(service._normalizeActiveParameter('yes')).toBe(1)
      expect(service._normalizeActiveParameter('no')).toBe(1) // anything not explicitly false is true
      expect(service._normalizeActiveParameter('  OFF  ')).toBe(0) // with whitespace
      expect(service._normalizeActiveParameter('  FALSE  ')).toBe(0) // with whitespace
    })

    it('should handle null/undefined values correctly', () => {
      expect(service._normalizeActiveParameter(null)).toBe(1)
      expect(service._normalizeActiveParameter(undefined)).toBe(1)
    })

    it('should handle other types correctly', () => {
      expect(service._normalizeActiveParameter([])).toBe(1) // truthy
      expect(service._normalizeActiveParameter({})).toBe(1) // truthy
      expect(service._normalizeActiveParameter('')).toBe(0) // falsy
    })
  })

  describe('tray_with_backup command', () => {
    it('should build command with default active parameter', () => {
      const result = service.build('tray_with_backup', {
        tray: 0,
        slot: 1,
        backup_tray: 1,
        backup_slot: 2
      })

      expect(result.command).toBe('TrayExecByTrayWithBackup 1 0 1 1 2')
      expect(result.type).toBe('tray')
      expect(result.parameters.active).toBe(1)
    })

    it('should handle numeric active parameter correctly', () => {
      const result = service.build('tray_with_backup', {
        tray: 0,
        slot: 1,
        backup_tray: 1,
        backup_slot: 2,
        active: 0
      })

      expect(result.command).toBe('TrayExecByTrayWithBackup 0 0 1 1 2')
      expect(result.parameters.active).toBe(0)
    })

    it('should handle boolean active parameter correctly', () => {
      const result = service.build('tray_with_backup', {
        tray: 0,
        slot: 1,
        backup_tray: 1,
        backup_slot: 2,
        active: false
      })

      expect(result.command).toBe('TrayExecByTrayWithBackup 0 0 1 1 2')
      expect(result.parameters.active).toBe(0)
    })

    it('should handle string active parameter correctly', () => {
      const result = service.build('tray_with_backup', {
        tray: 0,
        slot: 1,
        backup_tray: 1,
        backup_slot: 2,
        active: 'off'
      })

      expect(result.command).toBe('TrayExecByTrayWithBackup 0 0 1 1 2')
      expect(result.parameters.active).toBe(0)
    })

    it('should handle legacy "on" string parameter correctly', () => {
      const result = service.build('tray_with_backup', {
        tray: 0,
        slot: 1,
        backup_tray: 1,
        backup_slot: 2,
        active: 'on'
      })

      expect(result.command).toBe('TrayExecByTrayWithBackup 1 0 1 1 2')
      expect(result.parameters.active).toBe(1)
    })
  })

  describe('tray_range_with_backup command', () => {
    it('should build command with consistent active parameter handling', () => {
      const result = service.build('tray_range_with_backup', {
        start_tray: 0,
        start_slot: 0,
        end_tray: 0,
        end_slot: 1,
        backup_start_tray: 1,
        backup_start_slot: 0,
        backup_end_tray: 1,
        backup_end_slot: 1,
        active: 'off'
      })

      expect(Array.isArray(result)).toBe(true)
      expect(result[0].command).toBe('TrayExecByTrayWithBackup 0 0 0 1 0')
      expect(result[0].parameters.active).toBe(0)
    })

    it('should handle boolean active parameter', () => {
      const result = service.build('tray_range_with_backup', {
        start_tray: 0,
        start_slot: 0,
        end_tray: 0,
        end_slot: 0,
        backup_start_tray: 1,
        backup_start_slot: 0,
        backup_end_tray: 1,
        backup_end_slot: 0,
        active: true
      })

      expect(result[0].command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
      expect(result[0].parameters.active).toBe(1)
    })
  })

  describe('whole_tray_with_backup command', () => {
    it('should build command with consistent active parameter handling', () => {
      const result = service.build('whole_tray_with_backup', {
        tray: 0,
        backup_tray: 1,
        active: false
      })

      expect(Array.isArray(result)).toBe(true)
      expect(result[0].command).toBe('TrayExecByTrayWithBackup 0 0 0 1 0')
      expect(result[0].parameters.active).toBe(0)
    })

    it('should handle string active parameter', () => {
      const result = service.build('whole_tray_with_backup', {
        tray: 0,
        backup_tray: 1,
        active: 'on'
      })

      expect(result[0].command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
      expect(result[0].parameters.active).toBe(1)
    })
  })

  describe('tray_range command', () => {
    it('should build range commands for same tray', () => {
      const result = service.build('tray_range', {
        start_tray: 0,
        start_slot: 1,
        end_tray: 0,
        end_slot: 3
      })

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(3)
      expect(result[0].command).toBe('+STOTrayExecByTray 0 1')
      expect(result[1].command).toBe('+STOTrayExecByTray 0 2')
      expect(result[2].command).toBe('+STOTrayExecByTray 0 3')
    })

    it('should build range commands across trays', () => {
      const result = service.build('tray_range', {
        start_tray: 0,
        start_slot: 8,
        end_tray: 1,
        end_slot: 1
      })

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(4) // slots 8,9 from tray 0 + slots 0,1 from tray 1
      expect(result[0].command).toBe('+STOTrayExecByTray 0 8')
      expect(result[1].command).toBe('+STOTrayExecByTray 0 9')
      expect(result[2].command).toBe('+STOTrayExecByTray 1 0')
      expect(result[3].command).toBe('+STOTrayExecByTray 1 1')
    })
  })

  describe('whole_tray command', () => {
    it('should build whole tray commands', () => {
      const result = service.build('whole_tray', {
        tray: 1
      })

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(10) // 10 slots per tray
      expect(result[0].command).toBe('+STOTrayExecByTray 1 0')
      expect(result[9].command).toBe('+STOTrayExecByTray 1 9')
    })
  })

  describe('custom_tray command (fallback)', () => {
    it('should build single slot command', () => {
      const result = service.build('custom_tray', {
        tray: 2,
        slot: 5
      })

      expect(result.command).toBe('+STOTrayExecByTray 2 5')
      expect(result.type).toBe('tray')
      expect(result.parameters.tray).toBe(2)
      expect(result.parameters.slot).toBe(5)
    })

    it('should handle unknown command types as custom_tray', () => {
      const result = service.build('unknown_command', {
        tray: 1,
        slot: 3
      })

      expect(result.command).toBe('+STOTrayExecByTray 1 3')
      expect(result.type).toBe('tray')
    })
  })

  describe('parameter defaults', () => {
    it('should use default values when parameters are missing', () => {
      const result = service.build('tray_with_backup')

      expect(result.command).toBe('TrayExecByTrayWithBackup 1 0 0 0 0')
      expect(result.parameters.tray).toBe(0)
      expect(result.parameters.slot).toBe(0)
      expect(result.parameters.backup_tray).toBe(0)
      expect(result.parameters.backup_slot).toBe(0)
      expect(result.parameters.active).toBe(1)
    })
  })

  describe('regression tests for active parameter bug', () => {
    it('should handle numeric 1 as active for all backup commands', () => {
      const trayWithBackup = service.build('tray_with_backup', { active: 1 })
      const rangeWithBackup = service.build('tray_range_with_backup', { 
        active: 1,
        start_tray: 0, start_slot: 0, end_tray: 0, end_slot: 0,
        backup_start_tray: 0, backup_start_slot: 0, backup_end_tray: 0, backup_end_slot: 0
      })
      const wholeTrayWithBackup = service.build('whole_tray_with_backup', { active: 1, tray: 0, backup_tray: 1 })

      expect(trayWithBackup.command).toBe('TrayExecByTrayWithBackup 1 0 0 0 0')
      expect(rangeWithBackup[0].command).toBe('TrayExecByTrayWithBackup 1 0 0 0 0')
      expect(wholeTrayWithBackup[0].command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
    })

    it('should handle boolean true as active for all backup commands', () => {
      const trayWithBackup = service.build('tray_with_backup', { active: true })
      const rangeWithBackup = service.build('tray_range_with_backup', { 
        active: true,
        start_tray: 0, start_slot: 0, end_tray: 0, end_slot: 0,
        backup_start_tray: 0, backup_start_slot: 0, backup_end_tray: 0, backup_end_slot: 0
      })
      const wholeTrayWithBackup = service.build('whole_tray_with_backup', { active: true, tray: 0, backup_tray: 1 })

      expect(trayWithBackup.command).toBe('TrayExecByTrayWithBackup 1 0 0 0 0')
      expect(rangeWithBackup[0].command).toBe('TrayExecByTrayWithBackup 1 0 0 0 0')
      expect(wholeTrayWithBackup[0].command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
    })

    it('should handle numeric 0 as inactive for all backup commands', () => {
      const trayWithBackup = service.build('tray_with_backup', { active: 0 })
      const rangeWithBackup = service.build('tray_range_with_backup', { 
        active: 0,
        start_tray: 0, start_slot: 0, end_tray: 0, end_slot: 0,
        backup_start_tray: 0, backup_start_slot: 0, backup_end_tray: 0, backup_end_slot: 0
      })
      const wholeTrayWithBackup = service.build('whole_tray_with_backup', { active: 0, tray: 0, backup_tray: 1 })

      expect(trayWithBackup.command).toBe('TrayExecByTrayWithBackup 0 0 0 0 0')
      expect(rangeWithBackup[0].command).toBe('TrayExecByTrayWithBackup 0 0 0 0 0')
      expect(wholeTrayWithBackup[0].command).toBe('TrayExecByTrayWithBackup 0 0 0 1 0')
    })

    it('should handle boolean false as inactive for all backup commands', () => {
      const trayWithBackup = service.build('tray_with_backup', { active: false })
      const rangeWithBackup = service.build('tray_range_with_backup', { 
        active: false,
        start_tray: 0, start_slot: 0, end_tray: 0, end_slot: 0,
        backup_start_tray: 0, backup_start_slot: 0, backup_end_tray: 0, backup_end_slot: 0
      })
      const wholeTrayWithBackup = service.build('whole_tray_with_backup', { active: false, tray: 0, backup_tray: 1 })

      expect(trayWithBackup.command).toBe('TrayExecByTrayWithBackup 0 0 0 0 0')
      expect(rangeWithBackup[0].command).toBe('TrayExecByTrayWithBackup 0 0 0 0 0')
      expect(wholeTrayWithBackup[0].command).toBe('TrayExecByTrayWithBackup 0 0 0 1 0')
    })
  })
}) 