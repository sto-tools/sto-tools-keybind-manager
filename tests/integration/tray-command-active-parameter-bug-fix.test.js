import { describe, it, expect, beforeEach } from 'vitest'
import TrayCommandService from '../../src/js/components/services/TrayCommandService.js'

describe('TrayCommandService Active Parameter Bug Fix Integration', () => {
  let service

  beforeEach(() => {
    service = new TrayCommandService()
  })

  describe('Bug Fix: Inconsistent active parameter handling', () => {
    it('should handle all active parameter formats consistently across all backup commands', () => {
      // Test the previously buggy scenario: passing numeric 1 should work for all commands
      const trayWithBackup = service.build('tray_with_backup', {
        tray: 0,
        slot: 0,
        backup_tray: 1,
        backup_slot: 0,
        active: 1 // This used to be incorrectly converted to 0 in tray_with_backup
      })

      const rangeWithBackup = service.build('tray_range_with_backup', {
        active: 1,
        start_tray: 0,
        start_slot: 0,
        end_tray: 0,
        end_slot: 0,
        backup_start_tray: 1,
        backup_start_slot: 0,
        backup_end_tray: 1,
        backup_end_slot: 0
      })

      const wholeTrayWithBackup = service.build('whole_tray_with_backup', {
        active: 1,
        tray: 0,
        backup_tray: 1
      })

      // All commands should now consistently use active=1
      expect(trayWithBackup.command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
      expect(rangeWithBackup[0].command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
      expect(wholeTrayWithBackup[0].command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')

      // All parameters should be normalized to numeric values
      expect(trayWithBackup.parameters.active).toBe(1)
      expect(rangeWithBackup[0].parameters.active).toBe(1)
      expect(wholeTrayWithBackup[0].parameters.active).toBe(1)
    })

    it('should handle boolean true consistently across all backup commands', () => {
      const trayWithBackup = service.build('tray_with_backup', {
        tray: 0,
        slot: 0,
        backup_tray: 1,
        backup_slot: 0,
        active: true // This used to be incorrectly converted to 0 in tray_with_backup
      })

      const rangeWithBackup = service.build('tray_range_with_backup', {
        active: true,
        start_tray: 0,
        start_slot: 0,
        end_tray: 0,
        end_slot: 0,
        backup_start_tray: 1,
        backup_start_slot: 0,
        backup_end_tray: 1,
        backup_end_slot: 0
      })

      const wholeTrayWithBackup = service.build('whole_tray_with_backup', {
        active: true,
        tray: 0,
        backup_tray: 1
      })

      // All commands should consistently use active=1
      expect(trayWithBackup.command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
      expect(rangeWithBackup[0].command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
      expect(wholeTrayWithBackup[0].command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')

      // All parameters should be normalized to numeric values
      expect(trayWithBackup.parameters.active).toBe(1)
      expect(rangeWithBackup[0].parameters.active).toBe(1)
      expect(wholeTrayWithBackup[0].parameters.active).toBe(1)
    })

    it('should handle legacy "on" string consistently across all backup commands', () => {
      const trayWithBackup = service.build('tray_with_backup', {
        tray: 0,
        slot: 0,
        backup_tray: 1,
        backup_slot: 0,
        active: 'on' // This was the only format that worked correctly before the fix
      })

      const rangeWithBackup = service.build('tray_range_with_backup', {
        active: 'on',
        start_tray: 0,
        start_slot: 0,
        end_tray: 0,
        end_slot: 0,
        backup_start_tray: 1,
        backup_start_slot: 0,
        backup_end_tray: 1,
        backup_end_slot: 0
      })

      const wholeTrayWithBackup = service.build('whole_tray_with_backup', {
        active: 'on',
        tray: 0,
        backup_tray: 1
      })

      // All commands should consistently use active=1
      expect(trayWithBackup.command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
      expect(rangeWithBackup[0].command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
      expect(wholeTrayWithBackup[0].command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')

      // All parameters should be normalized to numeric values
      expect(trayWithBackup.parameters.active).toBe(1)
      expect(rangeWithBackup[0].parameters.active).toBe(1)
      expect(wholeTrayWithBackup[0].parameters.active).toBe(1)
    })

    it('should handle inactive values consistently across all backup commands', () => {
      const testCases = [
        { label: 'numeric 0', value: 0 },
        { label: 'boolean false', value: false },
        { label: 'string "off"', value: 'off' },
        { label: 'string "false"', value: 'false' },
        { label: 'empty string', value: '' }
      ]

      testCases.forEach(({ label, value }) => {
        const trayWithBackup = service.build('tray_with_backup', {
          tray: 0,
          slot: 0,
          backup_tray: 1,
          backup_slot: 0,
          active: value
        })

        const rangeWithBackup = service.build('tray_range_with_backup', {
          active: value,
          start_tray: 0,
          start_slot: 0,
          end_tray: 0,
          end_slot: 0,
          backup_start_tray: 1,
          backup_start_slot: 0,
          backup_end_tray: 1,
          backup_end_slot: 0
        })

        const wholeTrayWithBackup = service.build('whole_tray_with_backup', {
          active: value,
          tray: 0,
          backup_tray: 1
        })

        // All commands should consistently use active=0 for inactive values
        expect(trayWithBackup.command, `tray_with_backup with ${label}`).toBe('TrayExecByTrayWithBackup 0 0 0 1 0')
        expect(rangeWithBackup[0].command, `tray_range_with_backup with ${label}`).toBe('TrayExecByTrayWithBackup 0 0 0 1 0')
        expect(wholeTrayWithBackup[0].command, `whole_tray_with_backup with ${label}`).toBe('TrayExecByTrayWithBackup 0 0 0 1 0')

        // All parameters should be normalized to numeric values
        expect(trayWithBackup.parameters.active, `tray_with_backup parameters with ${label}`).toBe(0)
        expect(rangeWithBackup[0].parameters.active, `tray_range_with_backup parameters with ${label}`).toBe(0)
        expect(wholeTrayWithBackup[0].parameters.active, `whole_tray_with_backup parameters with ${label}`).toBe(0)
      })
    })

    it('should demonstrate the bug was fixed: numeric 1 now works for tray_with_backup', () => {
      // Before the fix: active: 1 would be incorrectly treated as inactive (0)
      // After the fix: active: 1 should be correctly treated as active (1)
      
      const result = service.build('tray_with_backup', {
        tray: 0,
        slot: 0,
        backup_tray: 1,
        backup_slot: 0,
        active: 1
      })

      // This assertion would have failed before the fix
      expect(result.command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
      expect(result.parameters.active).toBe(1)
    })

    it('should demonstrate the bug was fixed: boolean true now works for tray_with_backup', () => {
      // Before the fix: active: true would be incorrectly treated as inactive (0)
      // After the fix: active: true should be correctly treated as active (1)
      
      const result = service.build('tray_with_backup', {
        tray: 0,
        slot: 0,
        backup_tray: 1,
        backup_slot: 0,
        active: true
      })

      // This assertion would have failed before the fix
      expect(result.command).toBe('TrayExecByTrayWithBackup 1 0 0 1 0')
      expect(result.parameters.active).toBe(1)
    })
  })
}) 