import ComponentBase from '../ComponentBase.js'

/**
 * TrayCommandService – handles construction of tray-related commands such as
 * single slot execution, ranges and backup tray fall-backs.
 */
export default class TrayCommandService extends ComponentBase {
  constructor ({ eventBus } = {}) {
    super(eventBus)
    this.componentName = 'TrayCommandService'
  }

  /**
   * Build a tray command by id. Recognised commandIds:
   *   • tray_with_backup
   *   • tray_range
   *   • tray_range_with_backup
   *   • whole_tray
   *   • whole_tray_with_backup
   *   • custom_tray (fallback / default)
   *
   * The method returns either a single command object or an array of command
   * objects – matching the behaviour of the original implementation.
   */
  build (commandId, params = {}) {
    const tray      = params.tray           ?? 0
    const slot      = params.slot           ?? 0

    // -------------------------------------------------------------------
    // 1. Tray with backup slot
    // -------------------------------------------------------------------
    if (commandId === 'tray_with_backup') {
      const backupTray  = params.backup_tray ?? 0
      const backupSlot  = params.backup_slot ?? 0
      const active      = this._normalizeActiveParameter(params.active ?? 1)

      return {
        command: `TrayExecByTrayWithBackup ${active} ${tray} ${slot} ${backupTray} ${backupSlot}`,
        type: 'tray',
        icon: '⚡',
        text: `Execute Tray ${tray + 1} Slot ${slot + 1} (with backup)`,
        description: `Execute ability in tray ${tray + 1}, slot ${slot + 1} with backup in tray ${backupTray + 1}, slot ${backupSlot + 1}`,
        parameters: {
          tray,
          slot,
          backup_tray: backupTray,
          backup_slot: backupSlot,
          active,
        },
      }
    }

    // -------------------------------------------------------------------
    // 2. Tray range (no backups)
    // -------------------------------------------------------------------
    if (commandId === 'tray_range') {
      const startTray   = params.start_tray ?? 0
      const startSlot   = params.start_slot ?? 0
      const endTray     = params.end_tray   ?? 0
      const endSlot     = params.end_slot   ?? 0
      const commandType = params.command_type ?? 'STOTrayExecByTray'

      const commands = this._generateTrayRangeCommands(startTray, startSlot, endTray, endSlot, commandType)

      return commands.map((cmd, idx) => ({
        command: cmd,
        type: 'tray',
        icon: '⚡',
        text: idx === 0 ? `Execute Range: Tray ${startTray + 1} Slot ${startSlot + 1} to Tray ${endTray + 1} Slot ${endSlot + 1}` : cmd,
        description: idx === 0 ? `Execute abilities from tray ${startTray + 1} slot ${startSlot + 1} to tray ${endTray + 1} slot ${endSlot + 1}` : cmd,
        parameters: idx === 0 ? { start_tray: startTray, start_slot: startSlot, end_tray: endTray, end_slot: endSlot, command_type: commandType } : undefined,
      }))
    }

    // -------------------------------------------------------------------
    // 3. Tray range with backup
    // -------------------------------------------------------------------
    if (commandId === 'tray_range_with_backup') {
      const active             = this._normalizeActiveParameter(params.active ?? 1)
      const startTray          = params.start_tray ?? 0
      const startSlot          = params.start_slot ?? 0
      const endTray            = params.end_tray ?? 0
      const endSlot            = params.end_slot ?? 0
      const backupStartTray    = params.backup_start_tray ?? 0
      const backupStartSlot    = params.backup_start_slot ?? 0
      const backupEndTray      = params.backup_end_tray ?? 0
      const backupEndSlot      = params.backup_end_slot ?? 0

      const commands = this._generateTrayRangeWithBackupCommands(
        active,
        startTray,
        startSlot,
        endTray,
        endSlot,
        backupStartTray,
        backupStartSlot,
        backupEndTray,
        backupEndSlot,
      )

      return commands.map((cmd, idx) => ({
        command: cmd,
        type: 'tray',
        icon: '⚡',
        text: idx === 0 ? `Execute Range with Backup: Tray ${startTray + 1}-${endTray + 1}` : cmd,
        description: idx === 0 ? `Execute abilities from tray ${startTray + 1} to ${endTray + 1} with backup range` : cmd,
        parameters: idx === 0 ? {
          active,
          start_tray: startTray,
          start_slot: startSlot,
          end_tray: endTray,
          end_slot: endSlot,
          backup_start_tray: backupStartTray,
          backup_start_slot: backupStartSlot,
          backup_end_tray: backupEndTray,
          backup_end_slot: backupEndSlot,
        } : undefined,
      }))
    }

    // -------------------------------------------------------------------
    // 4. Whole tray commands
    // -------------------------------------------------------------------
    if (commandId === 'whole_tray') {
      const commandType = params.command_type ?? 'STOTrayExecByTray'
      const commands = this._generateWholeTrayCommands(tray, commandType)

      return commands.map((cmd, idx) => ({
        command: cmd,
        type: 'tray',
        icon: '⚡',
        text: idx === 0 ? `Execute Whole Tray ${tray + 1}` : cmd,
        description: idx === 0 ? `Execute all abilities in tray ${tray + 1}` : cmd,
        parameters: idx === 0 ? { tray, command_type: commandType } : undefined,
      }))
    }

    // -------------------------------------------------------------------
    // 5. Whole tray with backup
    // -------------------------------------------------------------------
    if (commandId === 'whole_tray_with_backup') {
      const active      = this._normalizeActiveParameter(params.active ?? 1)
      const backupTray  = params.backup_tray  ?? 0

      const commands = this._generateWholeTrayWithBackupCommands(active, tray, backupTray)

      return commands.map((cmd, idx) => ({
        command: cmd,
        type: 'tray',
        icon: '⚡',
        text: idx === 0 ? `Execute Whole Tray ${tray + 1} (with backup Tray ${backupTray + 1})` : cmd,
        description: idx === 0 ? `Execute all abilities in tray ${tray + 1} with backup from tray ${backupTray + 1}` : cmd,
        parameters: idx === 0 ? { active, tray, backup_tray: backupTray } : undefined,
      }))
    }

    // -------------------------------------------------------------------
    // 6. Fallback – single slot execution (custom_tray)
    // -------------------------------------------------------------------
    const commandType = params.command_type ?? 'STOTrayExecByTray'
    const prefix      = '+'

    return {
      command: `${prefix}${commandType} ${tray} ${slot}`,
      type: 'tray',
      icon: '⚡',
      text: `Execute Tray ${tray + 1} Slot ${slot + 1}`,
      description: `Execute ability in tray ${tray + 1}, slot ${slot + 1}`,
      parameters: { tray, slot, command_type: commandType },
    }
  }

  /* ---------------------------------------------------------------------
   * Private helpers
   * ------------------------------------------------------------------- */

  /**
   * Normalizes the active parameter to a numeric value (0 or 1).
   * Accepts various input formats for backward compatibility:
   * - Numbers: 0 = inactive, any other number = active
   * - Booleans: false = inactive, true = active
   * - Strings: 'off', 'false', '0', '' = inactive, everything else = active
   * 
   * @param {*} active - The active parameter value
   * @returns {number} 0 for inactive, 1 for active
   */
  _normalizeActiveParameter (active) {
    // Handle numeric values
    if (typeof active === 'number') {
      return active === 0 ? 0 : 1
    }
    
    // Handle boolean values
    if (typeof active === 'boolean') {
      return active ? 1 : 0
    }
    
    // Handle string values
    if (typeof active === 'string') {
      const normalized = active.toLowerCase().trim()
      return (normalized === '' || normalized === 'off' || normalized === 'false' || normalized === '0') ? 0 : 1
    }
    
    // Handle null/undefined (should not happen due to default values, but be safe)
    if (active == null) {
      return 1
    }
    
    // For any other type, treat as truthy/falsy
    return active ? 1 : 0
  }

  _generateTrayRangeCommands (startTray, startSlot, endTray, endSlot, commandType) {
    const cmds   = []
    const prefix = commandType === 'STOTrayExecByTray' ? '+' : ''

    // Same tray – simply iterate slots.
    if (startTray === endTray) {
      for (let slot = startSlot; slot <= endSlot; slot++) {
        cmds.push(`${prefix}${commandType} ${startTray} ${slot}`)
      }
    } else {
      // ----- First tray -----
      for (let slot = startSlot; slot <= 9; slot++) {
        cmds.push(`${prefix}${commandType} ${startTray} ${slot}`)
      }
      // ----- Middle trays -----
      for (let tray = startTray + 1; tray < endTray; tray++) {
        for (let slot = 0; slot <= 9; slot++) {
          cmds.push(`${prefix}${commandType} ${tray} ${slot}`)
        }
      }
      // ----- Last tray -----
      if (endTray > startTray) {
        for (let slot = 0; slot <= endSlot; slot++) {
          cmds.push(`${prefix}${commandType} ${endTray} ${slot}`)
        }
      }
    }
    return cmds
  }

  _generateWholeTrayCommands (tray, commandType) {
    const cmds   = []
    const prefix = commandType === 'STOTrayExecByTray' ? '+' : ''
    for (let slot = 0; slot <= 9; slot++) {
      cmds.push(`${prefix}${commandType} ${tray} ${slot}`)
    }
    return cmds
  }

  _generateTrayRangeWithBackupCommands (
    active,
    startTray,
    startSlot,
    endTray,
    endSlot,
    backupStartTray,
    backupStartSlot,
    backupEndTray,
    backupEndSlot,
  ) {
    const cmds = []
    const primarySlots = this._generateTraySlotList(startTray, startSlot, endTray, endSlot)
    const backupSlots  = this._generateTraySlotList(backupStartTray, backupStartSlot, backupEndTray, backupEndSlot)

    for (let i = 0; i < Math.max(primarySlots.length, backupSlots.length); i++) {
      const primary = primarySlots[i] || primarySlots[primarySlots.length - 1]
      const backup  = backupSlots[i]  || backupSlots[backupSlots.length - 1]
      cmds.push(`TrayExecByTrayWithBackup ${active} ${primary.tray} ${primary.slot} ${backup.tray} ${backup.slot}`)
    }
    return cmds
  }

  _generateWholeTrayWithBackupCommands (active, tray, backupTray) {
    const cmds = []
    for (let slot = 0; slot <= 9; slot++) {
      cmds.push(`TrayExecByTrayWithBackup ${active} ${tray} ${slot} ${backupTray} ${slot}`)
    }
    return cmds
  }

  _generateTraySlotList (startTray, startSlot, endTray, endSlot) {
    const slots = []

    if (startTray === endTray) {
      for (let slot = startSlot; slot <= endSlot; slot++) {
        slots.push({ tray: startTray, slot })
      }
    } else {
      // First tray
      for (let slot = startSlot; slot <= 9; slot++) {
        slots.push({ tray: startTray, slot })
      }
      // Middle trays
      for (let tray = startTray + 1; tray < endTray; tray++) {
        for (let slot = 0; slot <= 9; slot++) {
          slots.push({ tray, slot })
        }
      }
      // Last tray
      if (endTray > startTray) {
        for (let slot = 0; slot <= endSlot; slot++) {
          slots.push({ tray: endTray, slot })
        }
      }
    }
    return slots
  }
} 