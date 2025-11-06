/**
 * CommandSignatureDefinitions - Maps STOCommandParser signatures to parameter definitions
 * 
 * This provides the parameter editing interface definitions for all parameterized
 * commands recognized by STOCommandParser. Each signature maps to a command
 * definition that includes the parameter structure needed for UI editing.
 */

export const SIGNATURE_DEFINITIONS = {
  // =============================================================================
  // TRAY COMMANDS
  // =============================================================================
  'TrayExecByTray(active: number, tray: number, slot: number)': {
    commandId: 'custom_tray',
    name: 'Execute Tray Slot',
    category: 'tray',
    icon: '⚡',
    description: 'Execute a specific tray slot',
    parameters: {
      active: {
        type: 'number',
        min: 0,
        max: 1,
        default: 1,
        label: 'Active',
        help: 'Set to 1 to enable, 0 to disable (temporarily disable without removing)'
      },
      tray: {
        type: 'number',
        min: 0,
        max: 9,
        default: 0,
        label: 'Tray Number',
        help: 'Tray number (0-9, displays as 1-10 in UI)'
      },
      slot: {
        type: 'number', 
        min: 0,
        max: 9,
        default: 0,
        label: 'Slot Number',
        help: 'Slot number (0-9, displays as 1-10 in UI)'
      },
      command_type: {
        type: 'select',
        options: ['STOTrayExecByTray', 'TrayExecByTray'],
        default: 'STOTrayExecByTray',
        label: 'Command Type',
        help: 'STOTrayExecByTray shows binding in UI, TrayExecByTray does not'
      }
    }
  },

  'TrayExecByTrayWithBackup(active: number, tray: number, slot: number, backup_tray: number, backup_slot: number)': {
    commandId: 'tray_with_backup',
    name: 'Execute Tray with Backup',
    category: 'tray',
    icon: '⚡',
    description: 'Execute tray slot with backup fallback',
    parameters: {
      active: {
        type: 'number',
        min: 0,
        max: 1,
        default: 1,
        label: 'Active State',
        help: 'Primary tray state (0 or 1)'
      },
      tray: {
        type: 'number',
        min: 0,
        max: 9,
        default: 0,
        label: 'Primary Tray',
        help: 'Primary tray number'
      },
      slot: {
        type: 'number',
        min: 0,
        max: 9,
        default: 0,
        label: 'Primary Slot',
        help: 'Primary slot number'
      },
      backup_tray: {
        type: 'number',
        min: 0,
        max: 9,
        default: 0,
        label: 'Backup Tray',
        help: 'Backup tray number'
      },
      backup_slot: {
        type: 'number',
        min: 0,
        max: 9,
        default: 0,
        label: 'Backup Slot',
        help: 'Backup slot number'
      }
    }
  },

  // =============================================================================
  // COMMUNICATION COMMANDS  
  // =============================================================================
  'Communication(verb: string, message: string)': {
    commandId: 'communication',
    name: 'Communication Command',
    category: 'communication',
    icon: '💬',
    description: 'Send message to chat channel',
    parameters: {
      verb: {
        type: 'select',
        options: ['say', 'team', 'zone', 'tell'],
        default: 'say',
        label: 'Channel',
        help: 'Chat channel to send message to'
      },
      message: {
        type: 'text',
        default: '',
        placeholder: 'Enter your message...',
        label: 'Message',
        help: 'Message text to send'
      }
    }
  },

  // =============================================================================
  // TARGETING COMMANDS
  // =============================================================================
  'Target(entityName: string)': {
    commandId: 'target_entity',
    name: 'Target Entity',
    category: 'targeting', 
    icon: '🎯',
    description: 'Target specific entity by name',
    parameters: {
      entityName: {
        type: 'text',
        default: '',
        placeholder: 'Entity name...',
        label: 'Entity Name',
        help: 'Name of entity to target'
      }
    }
  },

  // =============================================================================
  // VFX COMMANDS
  // =============================================================================
  'VFXExclusion(effects: string)': {
    commandId: 'vfx_exclusion',
    name: 'VFX Exclusion List',
    category: 'vfx',
    icon: '✨',
    description: 'Set visual effects exclusion list',
    parameters: {
      effects: {
        type: 'text',
        default: '',
        placeholder: 'Fx_Explosion,Fx_Beam,Fx_Particle...',
        label: 'Effects List',
        help: 'Comma-separated list of effects to exclude'
      }
    }
  },

  'VFXExclusionAlias(aliasName: string)': {
    commandId: 'vfx_exclusion_alias',
    name: 'VFX Exclusion Alias',
    category: 'vfx',
    icon: '✨',
    description: 'Use predefined VFX exclusion alias',
    parameters: {
      aliasName: {
        type: 'text',
        default: '',
        placeholder: 'LowVFX, NoParticles, etc...',
        label: 'Alias Name',
        help: 'Name of predefined VFX exclusion alias'
      }
    }
  },

  // Master alias – combined space/ground
  'VFXExclusionMaster()': {
    commandId: 'vfx_exclusion_master',
    name: 'VFX Exclusion Master Alias',
    category: 'vfx',
    icon: '✨',
    description: 'Combined space and ground VFX suppression alias',
    parameters: {}
  },

  // =============================================================================
  // POWER COMMANDS
  // =============================================================================
  'PowerExec(powerName: string)': {
    commandId: 'power_exec',
    name: 'Execute Power',
    category: 'power',
    icon: '🔋',
    description: 'Execute specific power by name',
    parameters: {
      powerName: {
        type: 'text',
        default: '',
        placeholder: 'Power name...',
        label: 'Power Name',
        help: 'Name of power to execute'
      }
    }
  },

  // =============================================================================
  // STATIC COMMANDS WITH DISPLAY CUSTOMIZATION
  // =============================================================================
  'StaticCombat()': {
    commandId: 'static_combat',
    name: 'Combat Command',
    category: 'combat',
    icon: '🔥',
    description: 'Static combat command',
    parameters: {
      // Static commands don't have editable parameters, but we track the command name
      commandName: {
        type: 'hidden',
        default: '',
        label: 'Command Name'
      }
    }
  },

  'StaticTargeting()': {
    commandId: 'static_targeting',
    name: 'Targeting Command',
    category: 'targeting',
    icon: '🎯',
    description: 'Static targeting command',
    parameters: {
      commandName: {
        type: 'hidden',
        default: '',
        label: 'Command Name'
      }
    }
  }
}

/**
 * Get parameter definition for a given signature
 * @param {string} signature - Command signature from STOCommandParser
 * @returns {Object|null} Parameter definition or null if not found
 */
export function getParameterDefinition(signature) {
  return SIGNATURE_DEFINITIONS[signature] || null
}

/**
 * Check if a signature has editable parameters
 * @param {string} signature - Command signature
 * @returns {boolean} True if signature has editable parameters
 */
export function isEditableSignature(signature) {
  const definition = getParameterDefinition(signature)
  if (!definition) return false
  
  // Check if any parameters are not hidden
  return Object.values(definition.parameters || {}).some(param => param.type !== 'hidden')
}



export default {
  SIGNATURE_DEFINITIONS,
  getParameterDefinition,
  isEditableSignature
} 