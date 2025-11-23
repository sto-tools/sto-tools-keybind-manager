// ActivityTranslator.js - KBF Activity Translation Module
// Activity-to-STO command translation for STO Keybind application .kbf archives
// Dependencies: Only core JavaScript APIs
//
// This module handles activity translation:
// - KBF activity ID to STO command mapping
// - Command generation for all 123 activity types
// - Key token mapping and canonical key generation
// - Combo chord processing and validation

import { STO_KEY_NAMES } from '../../../data/stoKeyNames.js'

/**
 * KBF Activity Translator for converting KBF activities to STO commands
 * Handles activity-to-command translation with direct switch statement mapping
 */
export class ActivityTranslator {
  constructor(options = {}) {
    this.options = {
      validateUtf8: true,
      strictMode: false, // Throw errors vs. collecting warnings
      maxFileSize: 1024 * 1024, // 1MB default limit
      ...options,
    }

    // Reference to decoder for error/warning reporting
    this.decoder = options.decoder || null

    // Initialize activity translation map
    this.activityTranslations = new Map()
    this.keyTokenMap = new Map()

    // Parse state tracking
    this.parseState = {
      currentLayer: 0,
      processedBytes: 0,
      totalBytes: 0,
      errors: [],
      warnings: [],
    }
  }

  /**
   * Add error to decoder's parse state
   * @param {string} message - Error message
   * @param {Object} context - Optional context
   * @private
   */
  addError(message, context = {}) {
    if (this.decoder && typeof this.decoder.addError === 'function') {
      this.decoder.addError(message, context)
    }
  }

  /**
   * Add warning to decoder's parse state
   * @param {string} message - Warning message
   * @param {Object} context - Optional context
   * @private
   */
  addWarning(message, context = {}) {
    if (this.decoder && typeof this.decoder.addWarning === 'function') {
      this.decoder.addWarning(message, context)
    }
  }

  /**
   * Returns list of implemented activity types
   * @returns {number[]} Array of supported activity IDs
   */
  getSupportedActivities() {
    throw new Error('getSupportedActivities method not implemented yet')
  }

  // ---------------------------------------------------------------------------
  // Layer 1: Base64 file decoding
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Layer 2: GROUPSET/KEYSET record parsing
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Layer 3: KEYSET payload decoding
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Layer 4: KEY record parsing
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Layer 5: ACT activity record parsing
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Layer 6: Text/Text2 UTF-8 decoding
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Translation and processing methods
  // ---------------------------------------------------------------------------

  /**
   * Translate KBF activity to STO command/alias structures
   * @param {number} activity - Activity ID
   * @param {Object} context - Translation context (environment, bindset, etc.)
   * @returns {Object} Translation result with commands, aliases, and metadata
   * @private
   */
  translateActivity(activity, context) {
    // Enhanced validation for activity ID with specific categorization
    if (typeof activity !== 'number' || !Number.isInteger(activity)) {
      this.addValidationError('activity', 'must be a valid integer', activity, {
        fieldType: 'number',
        expectedValue: 'integer between 0-123',
        suggestion: 'Activity ID must be an integer value',
      })
      return this.createUnknownActivityResult(activity, context)
    }

    if (activity < 0 || activity > 123) {
      this.addValidationError(
        'activity',
        `value ${activity} is outside valid range (0-123)`,
        activity,
        {
          fieldType: 'number',
          actualValue: activity,
          expectedValue: '0-123',
          suggestion: 'Activity IDs must be between 0 and 123 inclusive',
        }
      )
      return this.createUnknownActivityResult(activity, context)
    }

    // Initialize translation context with validation
    const translationContext = {
      environment: context?.environment || 'space',
      bindsetName: context?.bindsetName || 'unknown_bindset',
      keyToken: context?.keyToken || 'unknown_key',
      modifiers: {
        control: context?.modifiers?.control || false,
        alt: context?.modifiers?.alt || false,
        shift: context?.modifiers?.shift || false,
      },
      combo: context?.combo || [],
      sanitize: context?.sanitize || ((name) => this.sanitizeBindsetName(name)),
      ...context,
    }

    // Validate environment context
    if (!['space', 'ground'].includes(translationContext.environment)) {
      this.addWarning(
        `Invalid environment "${translationContext.environment}", defaulting to "space"`,
        {
          category: 'validation',
          fieldName: 'environment',
          actualValue: translationContext.environment,
          expectedValue: 'space|ground',
          suggestion: 'Environment must be either "space" or "ground"',
        }
      )
      translationContext.environment = 'space'
    }

    // Use the new direct activity command generation
    try {
      const result = this.generateActivityCommand(activity, context, translationContext)

      // Validate the command generation result
      if (!result || typeof result !== 'object') {
        this.addError(
          `Activity command generation returned invalid result for activity ${activity}`,
          {
            category: 'generation_error',
            severity: 'error',
            activity,
            actualValue: result,
            expectedValue: 'object with commands/aliases/metadata',
            recoverable: true,
            suggestion: 'Command generation implementation may be broken',
          }
        )
        return this.createUnknownActivityResult(activity, translationContext)
      }

      // Return the result directly with success flag
      return {
        ...result,
        success: true,
        metadata: {
          type: result.type || 'unknown',
          environment: translationContext.environment,
          bindsetName: translationContext.bindsetName,
          keyToken: translationContext.keyToken,
        },
        warnings: [...this.parseState.warnings], // Include parseState warnings
      }
    } catch (error) {
      this.addError(
        `Activity command generation failed for ${activity}: ${error.message}`,
        {
          category: 'generation_error',
          severity: 'error',
          activity,
          error: error.name,
          errorStack: error.stack,
          context: translationContext.keyToken,
          environment: translationContext.environment,
          bindsetName: translationContext.bindsetName,
          recoverable: true,
          suggestion: `Command generation for activity ${activity} encountered an error. This may indicate a bug in the translation logic.`,
        }
      )
      return this.createUnknownActivityResult(activity, translationContext)
    }
  }

  /**
   * Generate activity command using direct activity ID mapping
   * Replaces the artificial phase categorization with explicit activity mapping
   * @param {number} activity - Activity ID
   * @param {Object} context - Translation context containing activity data (text, n1, n2, n3, etc.)
   * @param {Object} translationContext - Additional translation context
   * @returns {Object} Translation result with commands, aliases, and metadata
   * @private
   */
  generateActivityCommand(activity, context, translationContext) {
    // Extract common activity data from context (passed from KBFDecodePipeline)
    const { text, text2, n1, n2, n3 } = context || {}

    switch (activity) {
      // === TEXT-BASED COMMANDS ===
      case 0: 
        return {
          type: 'text_command',
          commands: text ? ['team ' + text] : ['team '],
          aliases: {}
        }

      // === FIXED STRING COMMANDS ===
      case 1: 
        return {
          type: 'fixed_command',
          commands: ['target_clear'],
          aliases: {}
        }

      case 2: 
        return {
          type: 'fixed_command',
          commands: ['Target_Enemy_Near'],
          aliases: {}
        }

      case 3: 
        return {
          type: 'fixed_command',
          commands: ['Target_Enemy_Next'],
          aliases: {}
        }

      case 4: 
        return {
          type: 'parameterized_command',
          commands: n1 !== undefined && n1 !== null ? ['Target_Teammate ' + n1] : [],
          aliases: {}
        }

      case 5: 
        return {
          type: 'text_command',
          commands: text ? ['Target ' + text.trim()] : ['Target '],
          aliases: {}
        }

      case 6: 
        return {
          type: 'fixed_command',
          commands: ['Target_Friend_Next'],
          aliases: {}
        }

      case 7: 
        return {
          type: 'fixed_command',
          commands: ['Target_Enemy_Next_Exposed'],
          aliases: {}
        }

      case 8: 
        return {
          type: 'fixed_command',
          commands: ['StatsPreset_Load Preset_1'],
          aliases: {}
        }

      case 9: 
        return {
          type: 'fixed_command',
          commands: ['StatsPreset_Load Preset_2'],
          aliases: {}
        }

      case 10: 
        return {
          type: 'fixed_command',
          commands: ['StatsPreset_Load Preset_3'],
          aliases: {}
        }

      case 11: 
        return {
          type: 'fixed_command',
          commands: ['StatsPreset_Load Preset_4'],
          aliases: {}
        }

      case 12: 
        return {
          type: 'text_command',
          commands: text ? ['Assist ' + text.trim()] : ['Assist '],
          aliases: {}
        }

      case 13: 
        return {
          type: 'parameterized_command',
          commands: (typeof n1 === 'number' && typeof n2 === 'number' && !isNaN(n1) && !isNaN(n2)) ? ['+TrayExecByTray ' + n1 + ' ' + n2] : [],
          aliases: {}
        }

      case 14: 
        return {
          type: 'fixed_command',
          commands: ['GenSendMessage HUD_Root FireAll'],
          aliases: {}
        }

      case 15: 
        return {
          type: 'fixed_command',
          commands: ['FirePhasers'],
          aliases: {}
        }

      case 16: 
        return {
          type: 'fixed_command',
          commands: ['FireTorps'],
          aliases: {}
        }

      case 17: 
        return {
          type: 'fixed_command',
          commands: ['FireMines'],
          aliases: {}
        }

      case 18: 
        return {
          type: 'fixed_command',
          commands: ['FirePhasersTorps'],
          aliases: {}
        }

      case 19: 
        return {
          type: 'fixed_command',
          commands: ['FireProjectiles'],
          aliases: {}
        }

      case 20: 
        return {
          type: 'fixed_command',
          commands: ['CamReset'],
          aliases: {}
        }

      case 22: 
        return {
          type: 'fixed_command',
          commands: ['camUseChaseCam 1'],
          aliases: {}
        }

      case 23: 
        return {
          type: 'fixed_command',
          commands: ['camUseChaseCam 0'],
          aliases: {}
        }

      case 24: 
        return {
          type: 'parameterized_command',
          commands: typeof n1 === 'number' && n1 !== 0 ? [`camdist ${n1}`] : ['camdist'],
          aliases: {}
        }

    
      case 26: 
        {
          const tray = (typeof n1 === 'number' && !isNaN(n1)) ? n1 : 0
          const trayCommands = []
          for (let slot = 0; slot <= 9; slot++) {
            trayCommands.push(`+TrayExecByTray ${tray} ${slot}`)
          }
          //const commandSequence = trayCommands.join(' $$ ')
          return {
            type: 'parameterized_command',
            commands: trayCommands,
            aliases: {}
          }
        }

      case 27: 
        return {
          type: 'fixed_command',
          commands: ['camUseAutoTargetLock 1'],
          aliases: {}
        }

      case 28: 
        return {
          type: 'fixed_command',
          commands: ['camUseAutoTargetLock 0'],
          aliases: {}
        }

      case 29: 
        return {
          type: 'fixed_command',
          commands: ['+Power_Exec Distribute_Shields'],
          aliases: {}
        }

      case 30: 
        return {
          type: 'fixed_command',
          commands: ['+up'],
          aliases: {}
        }

      case 31: 
        return {
          type: 'fixed_command',
          commands: ['+down'],
          aliases: {}
        }

      case 32: 
        return {
          type: 'fixed_command',
          commands: ['+left'],
          aliases: {}
        }

      case 33: 
        return {
          type: 'fixed_command',
          commands: ['+right'],
          aliases: {}
        }

      case 34: 
        return {
          type: 'parameterized_command',
          commands: typeof n1 === 'number' && !isNaN(n1) ? [`throttleadjust ${(n1 / 100.0).toFixed(2)}`] : [],
          aliases: {}
        }

      case 35: 
        return {
          type: 'fixed_command',
          commands: ['GenSendMessage Throttle_FullImpulse_Button FullThrottle'],
          aliases: {}
        }

      case 36: 
        return {
          type: 'fixed_command',
          commands: ['+Forward'],
          aliases: {}
        }

      case 37: 
        return {
          type: 'fixed_command',
          commands: ['+backward'],
          aliases: {}
        }

      case 38: 
        return {
          type: 'fixed_command',
          commands: ['+Left'],
          aliases: {}
        }

      case 39: 
        return {
          type: 'fixed_command',
          commands: ['+Right'],
          aliases: {}
        }

      case 40: 
        return {
          type: 'fixed_command',
          commands: ['+TurnLeft'],
          aliases: {}
        }

      case 41: 
        return {
          type: 'fixed_command',
          commands: ['+TurnRight'],
          aliases: {}
        }

      case 42: 
        return {
          type: 'fixed_command',
          commands: ['++AutoForward'],
          aliases: {}
        }

      case 43: 
        return {
          type: 'fixed_command',
          commands: ['+Up'],
          aliases: {}
        }

      case 44: 
        return {
          type: 'fixed_command',
          commands: ['+Walk'],
          aliases: {}
        }

      case 45: 
        return {
          type: 'fixed_command',
          commands: ['+Run'],
          aliases: {}
        }

      case 46: 
        return {
          type: 'fixed_command',
          commands: ['+Roll'],
          aliases: {}
        }

      case 47: 
        return {
          type: 'fixed_command',
          commands: ['+Aim'],
          aliases: {}
        }

      case 48: 
        return {
          type: 'fixed_command',
          commands: ['Follow'],
          aliases: {}
        }

      case 49: 
        return {
          type: 'fixed_command',
          commands: ['GenSendMessage Inventory_Root SwitchActiveWeapon'],
          aliases: {}
        }

      case 50: 
        return {
          type: 'fixed_command',
          commands: ['HolsterToggle'],
          aliases: {}
        }

      case 51: 
        return {
          type: 'fixed_command',
          commands: ['+Crouch'],
          aliases: {}
        }

      case 52: 
        return {
          type: 'fixed_command',
          commands: ['Clear'],
          aliases: {}
        }

      case 53: 
        return {
          type: 'fixed_command',
          commands: ['None'],
          aliases: {}
        }

      case 54: 
        return {
          type: 'fixed_command',
          commands: ['ShowFPS 1'],
          aliases: {}
        }

      case 55: 
        return {
          type: 'fixed_command',
          commands: ['ShowFPS 0'],
          aliases: {}
        }

      case 56: 
        return {
          type: 'fixed_command',
          commands: ['netgraph 1'],
          aliases: {}
        }

      case 57: 
        return {
          type: 'fixed_command',
          commands: ['netgraph 0'],
          aliases: {}
        }
      

      case 58: 
      {
        return {
          type: 'fixed_command',
          commands: ['netTimingGraph 1'],
          aliases: {}
        }
      }

      case 59: 
      {
        return {
          type: 'fixed_command',
          commands: ['netTimingGraph 0'],
          aliases: {}
        }
      }

      case 60: 
      {
        return {
          type: 'fixed_command',
          commands: ['showmem 1'],
          aliases: {}
        }
      }

      case 61: 
      {
        return {
          type: 'fixed_command',
          commands: ['showmem 0'],
          aliases: {}
        }
      }

      case 62: 
      {
        return {
          type: 'fixed_command',
          commands: ['frameRateStabilizer 1'],
          aliases: {}
        }
      }

      case 63: 
      {
        return {
          type: 'fixed_command',
          commands: ['frameRateStabilizer 0'],
          aliases: {}
        }
      }

      case 64: 
      {
        return {
          type: 'parameterized_command',
          commands: typeof n1 === 'number' && !isNaN(n1) ? [`maxfps ${n1}`] : ['maxfps 0'],
          aliases: {}
        }
      }

      case 65: 
      {
        return {
          type: 'parameterized_command',
          commands: typeof n1 === 'number' && !isNaN(n1) ? [`perFrameSleep ${n1}`] : ['perFrameSleep 0'],
          aliases: {}
        }
      }

      case 66: 
      {
        return {
          type: 'parameterized_command',
          commands: typeof n1 === 'number' && !isNaN(n1) ? [`rdrMaxGPUFramesAhead ${n1}`] : ['rdrMaxGPUFramesAhead 1'],
          aliases: {}
        }
      }

      case 67: 
      {
        const numericValue = typeof n1 === 'number' && !isNaN(n1) ? n1.toString().replace(/ /g, '').replace(/,/g, '.') : '1'
        return {
          type: 'parameterized_command',
          commands: [`rdrMaxFramesAhead ${numericValue}`],
          aliases: {}
        }
      }

      case 68: 
      {
        return {
          type: 'fixed_command',
          commands: [
            'Target Alpha Freighter',
            'Target Bravo Freighter',
            'Target Charlie Freighter',
            'Target Delta Freighter',
            'Target Foxtrot Freighter',
            'Target Golf Freighter',
            'Target India Freighter',
            'Target Juliet Freighter'
          ],
          aliases: {}
        }
      }

      case 69: 
      {
        return {
          type: 'fixed_command',
          commands: [
            'Target Juliet Freighter $$ Target India Freighter $$ Target Golf Freighter $$ Target Foxtrot Freighter $$ Target Delta Freighter $$ Target Charlie Freighter $$ Target Bravo Freighter $$ Target Alpha Freighter'
          ],
          aliases: {}
        }
      }

      case 70: 
      {
        return {
          type: 'fixed_command',
          commands: ['Target Starbase'],
          aliases: {}
        }
      }

      case 71: 
        return {
          type: 'fixed_command',
          commands: ['Target Civilian Transport'],
          aliases: {}
        }

      case 72: 
        return {
          type: 'fixed_command',
          commands: ['Target Bio-Neural Warhead'],
          aliases: {}
        }

      case 73: 
        return {
          type: 'fixed_command',
          commands: ['focustargetset'],
          aliases: {}
        }

      case 74: 
        return {
          type: 'fixed_command',
          commands: ['focustargetselect'],
          aliases: {}
        }

  
      case 76: 
        const n1Value = n1 || 0
        const gammaValue = (n1Value / 100.0).toFixed(2).replace(',', '.')
        return {
          type: 'parameterized_command',
          commands: [`gamma ${gammaValue}`],
          aliases: {}
        }

      case 77: 
        return {
          type: 'text_command',
          commands: text ? ['zone ' + text] : ['zone '],
          aliases: {}
        }

      case 78: 
        return {
          type: 'text_command',
          commands: text ? ['local ' + text] : ['local '],
          aliases: {}
        }

      case 79: 
        return {
          type: 'fixed_command',
          commands: ['ControlSchemeCycle'],
          aliases: {}
        }

      case 80: 
        return {
          type: 'fixed_command',
          commands: ['Inventory'],
          aliases: {}
        }

      case 81: 
        return {
          type: 'fixed_command',
          commands: ['Map'],
          aliases: {}
        }

      case 82: 
        return {
          type: 'fixed_command',
          commands: ['Target Aceton Assimilator'],
          aliases: {}
        }

      case 83: 
        return {
          type: 'fixed_command',
          commands: ['camturntoface 1'],
          aliases: {}
        }

      case 84: 
        return {
          type: 'fixed_command',
          commands: ['PvPQueues'],
          aliases: {}
        }

      case 85: 
        return {
          type: 'fixed_command',
          commands: ['PvEQueues'],
          aliases: {}
        }

      case 86: 
        const targetOfTargetScaleValue = (typeof n1 === 'number' && n1 > 0) ? (n1 / 100.0).toFixed(2) : '1.00'
        return {
          type: 'parameterized_command',
          commands: [
            `GenSetEarlyOverrideFloat Hud_Statustargetoftarget_Space_Bufflist scale ${targetOfTargetScaleValue}$$GenSetEarlyOverrideFloat Hud_Statustargetoftarget_Ground_Bufflist scale ${targetOfTargetScaleValue}`
          ],
          aliases: {}
        }

      case 87: 
        const targetScaleValue = (typeof n1 === 'number' && n1 > 0) ? (n1 / 100.0).toFixed(2) : '1.00'
        return {
          type: 'parameterized_command',
          commands: [
            `GenSetEarlyOverrideFloat Hud_Statustarget_Space_Bufflist scale ${targetScaleValue}$$GenSetEarlyOverrideFloat Hud_Statustarget_Ground_Bufflist scale ${targetScaleValue}`
          ],
          aliases: {}
        }

      case 88: 
        const targetFocusScaleValue = (typeof n1 === 'number' && n1 > 0) ? (n1 / 100.0).toFixed(2) : '1.00'
        return {
          type: 'parameterized_command',
          commands: [
            `GenSetEarlyOverrideFloat Hud_Statustargetfocused_Space_Bufflist scale ${targetFocusScaleValue}$$GenSetEarlyOverrideFloat Hud_Statustargetfocused_Ground_Bufflist scale ${targetFocusScaleValue}`
          ],
          aliases: {}
        }

      case 89: 
        const personalBuffScaleValue = (typeof n1 === 'number' && n1 > 0) ? (n1 / 100.0).toFixed(2) : '1.00'
        return {
          type: 'parameterized_command',
          commands: [`GenSetEarlyOverrideFloat Hud_Statusself_Bufflist scale ${personalBuffScaleValue}`],
          aliases: {}
        }

      case 90: 
        return {
          type: 'fixed_command',
          commands: ['Target_Self'],
          aliases: {}
        }

      case 91: 
        const allBuffScaleValue = (typeof n1 === 'number' && n1 > 0) ? (n1 / 100.0).toFixed(2) : '1.00'
        return {
          type: 'parameterized_command',
          commands: [
            `GenSetEarlyOverrideFloat Hud_Statustargetoftarget_Space_Bufflist scale ${allBuffScaleValue}$$GenSetEarlyOverrideFloat Hud_Statustargetoftarget_Ground_Bufflist scale ${allBuffScaleValue}$$GenSetEarlyOverrideFloat Hud_Statustarget_Space_Bufflist scale ${allBuffScaleValue}$$GenSetEarlyOverrideFloat Hud_Statustarget_Ground_Bufflist scale ${allBuffScaleValue}$$GenSetEarlyOverrideFloat Hud_Statustargetfocused_Space_Bufflist scale ${allBuffScaleValue}$$GenSetEarlyOverrideFloat Hud_Statustargetfocused_Ground_Bufflist scale ${allBuffScaleValue}$$GenSetEarlyOverrideFloat Hud_Statusself_Bufflist scale ${allBuffScaleValue}`
          ],
          aliases: {}
        }

      case 92: 
        const scaleSpaceTrayValue = (typeof n1 === 'number' && n1 > 0) ? (n1 / 100.0).toFixed(2) : '1.00'
        return {
          type: 'parameterized_command',
          commands: [`GenSetEarlyOverrideFloat Hud_Spacetraywindow_Large scale ${scaleSpaceTrayValue}`],
          aliases: {}
        }

      case 93: 
        const spacePersonalBuffScaleValue = (typeof n1 === 'number' && n1 > 0) ? (n1 / 100.0).toFixed(2) : '1.00'
        return {
          type: 'parameterized_command',
          commands: [`GenSetEarlyOverrideFloat Hud_Buffs scale ${spacePersonalBuffScaleValue}`],
          aliases: {}
        }

      case 94: 
        const spaceVerticleTrayScaleValue = (typeof n1 === 'number' && n1 > 0) ? (n1 / 100.0).toFixed(2) : '1.00'
        return {
          type: 'parameterized_command',
          commands: [`GenSetEarlyOverrideFloat Hud_Spacetraywindow_Secondary ${spaceVerticleTrayScaleValue}`],
          aliases: {}
        }

      case 95: 
        const trayNum = (typeof n1 === 'number') ? n1.toString() : '0'
        const fromSlot = (typeof n2 === 'number') ? n2 : 0
        const toSlot = (typeof n3 === 'number') ? n3 : 0
        const commands = []

        // Generate commands for each slot in the range
        for (let slot = fromSlot; slot <= toSlot; slot++) {
          commands.push(`+TrayExecByTray ${trayNum} ${slot.toString()}`)
        }

        return {
          type: 'parameterized_command',
          commands: commands,
          aliases: {}
        }

      case 96: 
        const emoteName = text || ''
        return {
          type: 'text_command',
          commands: [`emote_notext ${emoteName}`],
          aliases: {}
        }

      case 97: 
        const emoteCycleName = text || ''
        const emoteCycleAlias = `sto_kb_emotecycle_${context.baseKeyName || 'key'}_${context.index || 0}`

        return {
          type: 'cycle_command',
          commands: [emoteCycleAlias],
          aliases: {
            [emoteCycleAlias]: {
              steps: [`${emoteCycleAlias}_step0`],
              currentIndex: 0
            },
            [`${emoteCycleAlias}_step0`]: {
              commands: [`emote_notext ${emoteCycleName}`],
              next: `${emoteCycleAlias}_step0`
            }
          }
        }

      case 98: 
        {
          const recipient = text || ''
          const message = (text2 || '').trim()
          return {
            type: 'text_command',
            commands: [`tell ${recipient}, ${message}`],
            aliases: {}
          }
        }

      case 99: 
        {
          const filename = text || ''
          return {
            type: 'text_command',
            commands: filename ? [`bind_load_file ${filename}`] : ['bind_load_file'],
            aliases: {}
          }
        }

  
      case 101: 
        const emoteCycleVisibleName = text || ''
        const emoteCycleVisibleAlias = `sto_kb_emotecyclevisible_${context.baseKeyName || 'key'}_${context.index || 0}`

        return {
          type: 'cycle_command',
          commands: [emoteCycleVisibleAlias],
          aliases: {
            [emoteCycleVisibleAlias]: {
              steps: [`${emoteCycleVisibleAlias}_step0`],
              currentIndex: 0
            },
            [`${emoteCycleVisibleAlias}_step0`]: {
              commands: [`emote ${emoteCycleVisibleName}`],
              next: `${emoteCycleVisibleAlias}_step0`
            }
          }
        }

      case 102: 
        return {
          type: 'fixed_command',
          commands: ['target Armored Bio-Neural Warhead'],
          aliases: {}
        }

      case 103: 
        return {
          type: 'fixed_command',
          commands: ['InteractWindow'],
          aliases: {}
        }

      case 104:
      {
        if (!text || !text.trim()) {
          return {
            type: 'text_command',
            commands: []
          }
        }

        // Map "Master" bindset to "Primary Bindset" for consistency with ImportService
        let targetBindsetName = text.trim()
        if (targetBindsetName.toLowerCase() === 'master') {
          targetBindsetName = 'Primary Bindset'
        }

        const sanitizedTargetName = targetBindsetName.replace(/[^a-zA-Z0-9_]/g, '_')
        const loaderAliasName = `sto_kb_bindset_enable_${context?.environment || 'space'}_${sanitizedTargetName}`
        return {
          type: 'bindset_loader',
          commands: [loaderAliasName],
          aliases: {}
        }
      }

      case 105:
      {
        // File must end with .txt (case-insensitive) and have length > 4
        if (text && text.length > 4 && text.toLowerCase().substring(text.length - 4) === '.txt') {
          // Replace spaces with underscores for STO command compatibility
          const filename = text.replace(/ /g, '_')
          return {
            type: 'text_command',
            commands: ['bind_save_file ' + filename],
            aliases: {}
          }
        }
        return {
          type: 'text_command',
          commands: [],
          aliases: {}
        }
      }

      case 106: 
        return {
          type: 'fixed_command',
          commands: ['CombatLog 1'],
          aliases: {}
        }

      case 107: 
        return {
          type: 'fixed_command',
          commands: ['CombatLog 0'],
          aliases: {}
        }

      case 108: 
        return {
          type: 'fixed_command',
          commands: ['CombatLog'],
          aliases: {}
        }

      case 109: 
        return {
          type: 'fixed_command',
          commands: ['defaultautoattack 1'],
          aliases: {}
        }

      case 110: 
        return {
          type: 'fixed_command',
          commands: ['defaultautoattack 0'],
          aliases: {}
        }

      case 111: 
        return {
          type: 'fixed_command',
          commands: ['unbind_all'],
          aliases: {}
        }

      case 112: 
        return {
          type: 'text_command',
          commands: text ? ['unbind_local ' + text.trim()] : ['unbind_local '],
          aliases: {}
        }

      case 113: 
        return {
          type: 'text_command',
          commands: text ? (text2 ? ['chan ' + text + ' ' + text2.trim()] : ['chan ' + text + ' ']) : ['chan '],
          aliases: {}
        }

      case 114: 
        return {
          type: 'text_command',
          commands: text ? ['unbind ' + text] : ['unbind '],
          aliases: {}
        }

      case 115: 
        return {
          type: 'fixed_command',
          commands: ['GenSendMessage Doff_Recipe_Start_Action Clicked'],
          aliases: {}
        }

      case 116: 
        const sliderValue = (typeof n1 === 'number' && !isNaN(n1)) ? n1.toString().replace(/ /g, '').replace(/,/g, '.') : '100'
        return {
          type: 'parameterized_command',
          commands: [`GenSliderSetNotch Doff_Recipe_Quantity_Slider ${sliderValue}`],
          aliases: {}
        }

      case 117: 
        return {
          type: 'fixed_command',
          commands: ['GenSendMessage Doff_Recipe_Actions_Starttask Clicked'],
          aliases: {}
        }

      case 118: 
        return {
          type: 'fixed_command',
          commands: ['LootRollNeed'],
          aliases: {}
        }

      case 119: 
        return {
          type: 'fixed_command',
          commands: ['LootRollGreed'],
          aliases: {}
        }

      case 120: 
        return {
          type: 'fixed_command',
          commands: ['LootRollPass'],
          aliases: {}
        }

      case 121:
        const clearTrayNum = (typeof n1 === 'number' && !isNaN(n1)) ? n1.toString().replace(/ /g, '').replace(/,/g, '.') : '0'
        const clearSlotNum = (typeof n2 === 'number' && !isNaN(n2)) ? n2.toString().replace(/ /g, '').replace(/,/g, '.') : '0'
        return {
          type: 'parameterized_command',
          commands: [`trayelemdestroy ${clearTrayNum} ${clearSlotNum}`],
          aliases: {}
        }

      case 122: 
        {
          const trayNum = n1 || 0
          const commands = []
          for (let slotNum = 0; slotNum <= 9; slotNum++) {
            commands.push(`trayelemdestroy ${trayNum} ${slotNum}`)
          }
          return {
            type: 'parameterized_command',
            commands: commands,
            aliases: {}
          }
        }

      case 123: 
        return {
          type: 'fixed_command',
          commands: ['ScanForClickies'],
          aliases: {}
        }

      // Default case for unknown activities
      default:
        return this.generateUnknownActivityCommand(activity, context, translationContext)
    }
  }
  
  /**
   * Generate unknown activity result
   * @param {number} activity - Activity ID
   * @param {Object} context - Translation context containing activity data
   * @param {Object} translationContext - Additional translation context
   * @returns {Object} Translation result for unknown activities
   * @private
   */
  generateUnknownActivityCommand(activity, context, translationContext) {
    this.addUnknownElementWarning('activity', activity, {
      recordType: 'ACT',
      fieldName: 'Activity',
      activity,
      context: context?.keyToken,
      environment: context?.environment,
      bindsetName: context?.bindsetName,
      suggestion: 'This activity may be from a newer KBF version or custom extension. The activity will be skipped but parsing will continue.',
    })

    // Return a simplified structure for generateActivityCommand
    const warnings = [
      `Activity ${activity} translation not implemented or failed`,
      `This activity will be skipped but parsing will continue with other activities`,
    ]

    // Add specific warnings about unknown activities with more context
    if (activity > 123) {
      warnings.push(
        `High activity ID ${activity} may indicate custom or future KBF format extension`
      )
    }

    // Add out-of-range warning for activities outside 0-123 range
    if (typeof activity === 'number' && (activity < 0 || activity > 123)) {
      warnings.push(
        `Activity ${activity} outside valid range (0-123)`
      )
    }

    if (typeof activity !== 'number') {
      warnings.push(
        `Invalid activity type: ${typeof activity}, expected number`
      )
    }

    return {
      type: 'unknown',
      commands: [],
      aliases: {},
      success: false,
      error: `Activity ${activity} translation not implemented or failed`,
      warnings,
      errorCategory: this.determineActivityErrorCategory(activity),
    }
  }

  
  createUnknownActivityResult(activity, context) {
    const result = {
      commands: [],
      aliases: [],
      metadata: {
        type: 'unknown',
        originalActivity: activity,
        environment: context?.environment || 'space',
        bindsetName: context?.bindsetName || 'unknown',
        keyToken: context?.keyToken || 'unknown',
        recoveryAction: 'skipped',
        parseTimestamp: Date.now(),
      },
      success: false,
      error: `Activity translation failed: ${activity}`,
      errorCategory: this.determineActivityErrorCategory(activity),
      suggestion: this.getActivitySuggestion(activity),
      warnings: [
        ...this.parseState.warnings, // Include parseState warnings
        ...this.parseState.errors.map(e => e.message), // Include parseState errors as warnings
        `Activity ${activity} translation not implemented or failed`,
        `This activity will be skipped but parsing will continue with other activities`,
      ],
    }

    // Add specific warnings about unknown activities with more context
    if (activity > 123) {
      result.warnings.push(
        `High activity ID ${activity} may indicate custom or future KBF format extension`
      )
    }

    // Add out-of-range warning for activities outside 0-123 range
    if (typeof activity === 'number' && (activity < 0 || activity > 123)) {
      result.warnings.push(
        `Activity ${activity} outside valid range (0-123)`
      )
    }

    if (typeof activity !== 'number') {
      result.warnings.push(
        `Invalid activity type: ${typeof activity}, expected number`
      )
    }

    return result
  }

  /**
   * Determine the error category for an unknown activity
   * @param {number|string} activity - Activity ID
   * @returns {string} Error category
   * @private
   */
  determineActivityErrorCategory(activity) {
    if (typeof activity !== 'number') return 'invalid_type'
    if (activity < 0 || activity > 123) return 'out_of_range'
    if (activity >= 30 && activity <= 123) return 'unimplemented_standard'
    return 'unknown_basic'
  }

  /**
   * Get suggestion for unknown activity
   * @param {number|string} activity - Activity ID
   * @returns {string} Suggestion message
   * @private
   */
  getActivitySuggestion(activity) {
    if (typeof activity !== 'number') {
      return 'Activity IDs should be numeric values'
    }

    if (activity < 0 || activity > 123) {
      return 'Valid activity IDs range from 0 to 123'
    }

    if (activity > 96) {
      return 'This may be from a newer KBF version or contain custom extensions'
    }

    return 'This activity may not be implemented yet in the current parser version'
  }

  /**
   * Map KBF key tokens and modifiers to canonical application format
   * @param {string} token - Key token from KBF
   * @param {Object} modifiers - Modifier flags (control, alt, shift)
   * @param {string} combo - Combo chord base64 data
   * @returns {string} Canonical key string
   * @private
   */
  mapKeyToken(token, modifiers = {}, combo = null) {
    // Handle non-string inputs gracefully - return as-is to match test expectations
    if (typeof token !== 'string') {
      this.addWarning(`Invalid key token type: ${typeof token}`, {
        category: 'validation',
        fieldName: 'keyToken',
        actualValue: token,
        expectedValue: 'string',
        suggestion:
          'Key tokens should be string identifiers from the KBF specification',
      })
      return token // Return original value unchanged
    }

    if (token.length === 0) {
      this.addWarning(`Empty key token provided`, {
        category: 'validation',
        fieldName: 'keyToken',
        actualValue: token,
        expectedValue: 'non-empty string',
        suggestion: 'Key tokens must have at least one character',
      })
      return '' // Return empty string as-is to match test expectations
    }

    // Validate token format (should be alphanumeric or special tokens)
    if (
      !/^[A-Za-z0-9_]+$/.test(token) &&
      !['SemiColon', 'Space', ' '].includes(token)
    ) {
      this.addWarning(`Key token "${token}" contains unexpected characters`, {
        category: 'validation',
        fieldName: 'keyToken',
        actualValue: token,
        expectedValue: 'alphanumeric or special tokens (SemiColon, Space)',
        suggestion:
          'Key tokens should be alphanumeric according to KBF specification',
      })
    }

    // Initialize key token map if not already done
    if (this.keyTokenMap.size === 0) {
      this.initializeKeyTokenMap()
    }

    // Create a case-insensitive lookup map for STO key names
    const lowerCaseMap = new Map()
    STO_KEY_NAMES.forEach(stoKey => {
      lowerCaseMap.set(stoKey.toLowerCase(), stoKey)
    })

    // Helper function to normalize key names to match STO_KEY_NAMES case conventions
    const normalizeKeyName = (keyName) => {
      // Try to find exact match first
      if (STO_KEY_NAMES.includes(keyName)) {
        return keyName
      }
      // Try case-insensitive match
      const lowerKey = keyName.toLowerCase()
      if (lowerCaseMap.has(lowerKey)) {
        return lowerCaseMap.get(lowerKey)
      }
      // Special case handling for common variations
      const specialCases = new Map([
        ['space', 'Space'],
        ['ctrl', 'Control'],
        ['control', 'Control'],
        ['alt', 'ALT'],
        ['shift', 'Shift'],
        ['tab', 'Tab'],
        ['enter', 'enter'],
        ['escape', 'delete'],
        ['esc', 'delete'],
        ['capslock', 'CapsLock'],
        ['backspace', 'delete'],
        ['pageup', 'PageUp'],
        ['pagedown', 'PageDown'],
        ['home', 'Home'],
        ['end', 'End'],
        ['insert', 'insert'],
        ['del', 'delete']
      ])
      if (specialCases.has(lowerKey)) {
        return specialCases.get(lowerKey)
      }
      // Return original if no match found
      return keyName
    }

    // Handle special token conversions with validation
    let mappedToken = token
    if (token === 'SemiColon') {
      mappedToken = ';'
    } else if (token === 'Space') {
      mappedToken = 'Space' // KBF "Space" should map to normalized "Space" key
    } else if (token === ' ') {
      mappedToken = 'Space' // Literal space character should map to normalized "Space" key
    } else {
      // Apply FieldParser-style normalization for consistency
      mappedToken = normalizeKeyName(token)
    }

    // Validate and sanitize modifiers
    const sanitizedModifiers = this.validateAndSanitizeModifiers(modifiers)

    // Build canonical key string with validated components
    const keyParts = []

    // Add modifier prefixes in canonical order with validation
    if (sanitizedModifiers.control) {
      keyParts.push('Ctrl')
    }
    if (sanitizedModifiers.alt) {
      keyParts.push('Alt')
    }
    if (sanitizedModifiers.shift) {
      keyParts.push('Shift')
    }

    // Add the primary key with validation
    if (mappedToken && mappedToken.length > 0) {
      keyParts.push(mappedToken)
    } else {
      // If mapped token is empty, provide a fallback
      keyParts.push('UnknownKey')
      this.addWarning(
        `Mapped key token is empty, using fallback "UnknownKey"`,
        {
          category: 'validation',
          fieldName: 'mappedToken',
          originalToken: token,
          mappedToken,
          suggestion: 'Key token mapping resulted in empty value',
        }
      )
    }

    // Join with '+' to create canonical format
    const canonicalKey = keyParts.join('+')

    // Validate the final canonical key
    if (canonicalKey.length === 0) {
      this.addError('Canonical key generation failed - empty result', {
        category: 'handler_error',
        severity: 'error',
        originalToken: token,
        modifiers: sanitizedModifiers,
        mappedToken,
        recoverable: true,
        suggestion: 'Key generation failed but will continue with fallback',
      })
      return 'UnknownKey' // Ultimate fallback
    }

    // Handle combo chords if present with enhanced validation
    if (combo && typeof combo === 'string' && combo.trim().length > 0) {
      try {
        return this.processComboChord(canonicalKey, combo)
      } catch (error) {
        this.addError(`Combo chord processing failed: ${error.message}`, {
          category: 'handler_error',
          severity: 'warning',
          canonicalKey,
          combo,
          error: error.name,
          recoverable: true,
          suggestion:
            'Combo chord processing failed, using base key without chord',
        })
        return canonicalKey // Fallback to base key without combo
      }
    }

    return canonicalKey
  }

  /**
   * Validate and sanitize modifier objects
   * @param {Object} modifiers - Modifier object
   * @returns {Object} Sanitized modifier object
   * @private
   */
  validateAndSanitizeModifiers(modifiers) {
    const sanitized = {
      control: false,
      alt: false,
      shift: false,
    }

    if (!modifiers || typeof modifiers !== 'object') {
      if (modifiers !== null && modifiers !== undefined) {
        this.addWarning(`Invalid modifiers object, using defaults`, {
          category: 'validation',
          fieldName: 'modifiers',
          actualValue: modifiers,
          expectedValue: 'object with control/alt/shift boolean properties',
          suggestion: 'Modifiers should be an object with boolean properties',
        })
      }
      return sanitized
    }

    // Validate each modifier with proper boolean conversion
    Object.keys(sanitized).forEach((mod) => {
      if (modifiers[mod] !== undefined) {
        if (typeof modifiers[mod] === 'boolean') {
          sanitized[mod] = modifiers[mod]
        } else if (modifiers[mod] === 1 || modifiers[mod] === '1') {
          sanitized[mod] = true
        } else if (
          modifiers[mod] === 0 ||
          modifiers[mod] === '0' ||
          !modifiers[mod]
        ) {
          sanitized[mod] = false
        } else {
          this.addWarning(
            `Invalid ${mod} modifier value: ${modifiers[mod]}, using false`,
            {
              category: 'validation',
              fieldName: `modifiers.${mod}`,
              actualValue: modifiers[mod],
              expectedValue: 'boolean or 0/1',
              suggestion: `Modifier ${mod} should be true/false or 0/1`,
            }
          )
          sanitized[mod] = false
        }
      }
    })

    return sanitized
  }

  /**
   * Provide fallback for unknown key tokens
   * @param {string} token - Unknown token
   * @returns {string} Fallback token
   * @private
   */
  provideTokenFallback(token) {
    // Common patterns for unknown tokens
    const tokenLower = token.toLowerCase()

    // If it looks like a function key
    if (tokenLower.startsWith('f') && /^\d+$/.test(tokenLower.slice(1))) {
      return token.toUpperCase() // Return F1, F2, etc.
    }

    // If it looks like a number pad key
    if (tokenLower.startsWith('numpad')) {
      return token.charAt(0).toUpperCase() + token.slice(1) // Numpad1, etc.
    }

    // If it contains mouse button indicators
    if (tokenLower.includes('mouse') || tokenLower.includes('button')) {
      return 'MouseButton' // Generic fallback
    }

    // For very short tokens, try to make them more readable
    if (token.length <= 3) {
      return token.toUpperCase()
    }

    // For longer tokens, use as-is but maybe capitalize first letter
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
  }

  /**
   * Initialize the key token mapping table from KBF format specification
   * Maps KBF key tokens to their canonical application representation
   * @private
   */
  initializeKeyTokenMap() {
    // Key token mappings based on KBF_FORMAT_SPECIFICATION.md
    // Display label → Key token format, mapped to canonical application format
    const tokenMappings = new Map([
      // Special characters
      ['[', '['],
      ['\\\\', '\\'],
      [']', ']'],
      [',', ','],
      ['/', '/'],
      ['.', '.'],
      ['`', '`'],

      // Modifier keys
      ['ALT', 'Alt'],
      ['LALT', 'Alt'],
      ['RALT', 'Alt'],
      ['Control', 'Ctrl'],
      ['LCTRL', 'Ctrl'],
      ['RCTRL', 'Ctrl'],
      ['Shift', 'Shift'],

      // Arrow keys
      ['Down', 'ArrowDown'],
      ['Left', 'ArrowLeft'],
      ['Right', 'ArrowRight'],
      ['Up', 'ArrowUp'],

      // Function keys
      ['F1', 'F1'],
      ['F2', 'F2'],
      ['F3', 'F3'],
      ['F4', 'F4'],
      ['F5', 'F5'],
      ['F6', 'F6'],
      ['F7', 'F7'],
      ['F8', 'F8'],
      ['F9', 'F9'],
      ['F10', 'F10'],
      ['F11', 'F11'],
      ['F12', 'F12'],
      ['F13', 'F13'],
      ['F14', 'F14'],
      ['F15', 'F15'],
      ['F16', 'F16'],
      ['F17', 'F17'],
      ['F18', 'F18'],
      ['F19', 'F19'],
      ['F20', 'F20'],
      ['F21', 'F21'],
      ['F22', 'F22'],
      ['F23', 'F23'],
      ['F24', 'F24'],

      // Special keys
      ['Delete', 'Delete'],
      ['End', 'End'],
      ['Home', 'Home'],
      ['Insert', 'Insert'],
      ['PageDown', 'PageDown'],
      ['PageUp', 'PageUp'],
      ['Tab', 'Tab'],
      ['enter', 'Enter'],

      // Numpad keys
      ['numpad0', 'Numpad0'],
      ['numpad1', 'Numpad1'],
      ['numpad2', 'Numpad2'],
      ['numpad3', 'Numpad3'],
      ['numpad4', 'Numpad4'],
      ['numpad5', 'Numpad5'],
      ['numpad6', 'Numpad6'],
      ['numpad7', 'Numpad7'],
      ['numpad8', 'Numpad8'],
      ['numpad9', 'Numpad9'],
      ['Decimal', 'NumpadDecimal'],
      ['Divide', 'NumpadDivide'],
      ['numpadenter', 'NumpadEnter'],

      // Mathematical operators
      ['Add', '+'],
      ['Multiply', '*'],
      ['Subtract', '-'],

      // Alphabetic keys (uppercase A-Z)
      ['A', 'A'],
      ['B', 'B'],
      ['C', 'C'],
      ['D', 'D'],
      ['E', 'E'],
      ['F', 'F'],
      ['G', 'G'],
      ['H', 'H'],
      ['I', 'I'],
      ['J', 'J'],
      ['K', 'K'],
      ['L', 'L'],
      ['M', 'M'],
      ['N', 'N'],
      ['O', 'O'],
      ['P', 'P'],
      ['Q', 'Q'],
      ['R', 'R'],
      ['S', 'S'],
      ['T', 'T'],
      ['U', 'U'],
      ['V', 'V'],
      ['W', 'W'],
      ['X', 'X'],
      ['Y', 'Y'],
      ['Z', 'Z'],

      // Numbers (0-9)
      ['0', '0'],
      ['1', '1'],
      ['2', '2'],
      ['3', '3'],
      ['4', '4'],
      ['5', '5'],
      ['6', '6'],
      ['7', '7'],
      ['8', '8'],
      ['9', '9'],

      // Mouse buttons
      ['Button1', 'Mouse1'],
      ['Button2', 'Mouse2'],
      ['Button3', 'Mouse3'],
      ['Button4', 'Mouse4'],
      ['Button5', 'Mouse5'],
      ['Button6', 'Mouse6'],
      ['Button7', 'Mouse7'],
      ['Button8', 'Mouse8'],
      ['Button9', 'Mouse9'],
      ['Button10', 'Mouse10'],
      ['Lbutton', 'MouseLeft'],
      ['Middleclick', 'MouseMiddle'],
      ['Rbutton', 'MouseRight'],
      ['Wheelminus', 'MouseWheelDown'],
      ['Wheelplus', 'MouseWheelUp'],

      // XBOX Controller buttons
      ['Joy1', 'XboxStart'],
      ['Joy2', 'XboxBack'],
      ['Joy3', 'XboxLThumb'],
      ['Joy4', 'XboxRThumb'],
      ['Joy5', 'XboxLB'],
      ['Joy6', 'XboxRB'],
      ['Joy7', 'XboxLT'],
      ['Joy8', 'XboxRT'],
      ['Joy9', 'XboxA'],
      ['Joy10', 'XboxB'],
      ['Joy11', 'XboxX'],
      ['Joy12', 'XboxY'],

      // XBOX Controller stick directions
      ['Lstick_up', 'XboxLStickUp'],
      ['Lstick_down', 'XboxLStickDown'],
      ['Lstick_left', 'XboxLStickLeft'],
      ['Lstick_right', 'XboxLStickRight'],
      ['Rstick_up', 'XboxRStickUp'],
      ['Rstick_down', 'XboxRStickDown'],
      ['Rstick_left', 'XboxRStickLeft'],
      ['Rstick_right', 'XboxRStickRight'],

      // XBOX Controller pad directions
      ['Joypad_up', 'XboxDPadUp'],
      ['Joypad_down', 'XboxDPadDown'],
      ['Joypad_left', 'XboxDPadLeft'],
      ['Joypad_right', 'XboxDPadRight'],
    ])

    // Store mappings in the instance map
    this.keyTokenMap = tokenMappings
  }

  /**
   * Process combo chord data from KBF format
   * @param {string} comboData - Base64 encoded combo data with * delimiter
   * @returns {string[]} Array of decoded combo tokens
   * @private
   */
  processCombo(comboData) {
    // Enhanced validation with specific error categorization
    if (!comboData) {
      this.addValidationError(
        'comboData',
        'combo data is required for combo processing',
        comboData,
        {
          fieldType: comboData === null ? 'null' : 'undefined',
          expectedValue: 'string with Base64 encoded combo tokens',
          suggestion:
            'Combo data should be a string containing Base64 encoded tokens separated by *',
        }
      )
      return []
    }

    if (typeof comboData !== 'string') {
      this.addValidationError(
        'comboData',
        'must be a string value',
        comboData,
        {
          fieldType: typeof comboData,
          expectedValue: 'string',
          suggestion:
            'Combo data should be a string containing Base64 encoded tokens',
        }
      )
      return []
    }

    const trimmedData = comboData.trim()
    if (trimmedData.length === 0) {
      this.addWarning('Combo data is empty after trimming', {
        category: 'validation',
        fieldName: 'comboData',
        actualValue: comboData,
        suggestion:
          'Combo data should contain at least one Base64 encoded token',
      })
      return []
    }

    // Validate combo data format - should contain * delimiters for multiple tokens
    if (!trimmedData.includes('*') && trimmedData.length > 50) {
      this.addWarning(
        `Combo data may be malformed: very long single token (${trimmedData.length} chars)`,
        {
          category: 'format',
          fieldName: 'comboData',
          dataLength: trimmedData.length,
          suggestion:
            'Combo data should contain Base64 tokens separated by * delimiters',
        }
      )
    }

    // Split by * delimiter and trim trailing empty entries (including trailing * delimiters)
    const tokens = trimmedData.split('*').filter((token) => token.length > 0)

    if (tokens.length === 0) {
      this.addWarning('No valid tokens found in combo data after splitting', {
        category: 'format',
        fieldName: 'comboData',
        originalData: comboData,
        suggestion:
          'Combo data should contain Base64 encoded tokens separated by * delimiters',
      })
      return []
    }

    // Warn about excessive number of tokens which may indicate data corruption
    if (tokens.length > 10) {
      this.addWarning(
        `Large number of combo tokens (${tokens.length}) may indicate data corruption`,
        {
          category: 'format',
          fieldName: 'comboData',
          tokenCount: tokens.length,
          suggestion:
            'Typical combo chords have 2-5 tokens. Large numbers may indicate parsing errors.',
        }
      )
    }

    const decodedTokens = []
    let validTokenCount = 0
    let invalidTokenCount = 0

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i].trim()

      if (token.length === 0) {
        continue
      }

      // Enhanced validation for individual tokens
      if (token.length < 1) {
        this.addWarning(`Combo token ${i} is empty`, {
          category: 'validation',
          fieldName: 'comboToken',
          tokenIndex: i,
          suggestion: 'Empty tokens should be removed from combo data',
        })
        continue
      }

      // Validate token length - Base64 tokens should be reasonable size
      if (token.length > 100) {
        this.addWarning(
          `Combo token ${i} is unusually long (${token.length} chars)`,
          {
            category: 'format',
            fieldName: 'comboToken',
            tokenIndex: i,
            tokenLength: token.length,
            suggestion: 'Combo tokens should typically be under 100 characters',
          }
        )
      }

      // Enhanced Base64 validation with specific patterns
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(token)) {
        invalidTokenCount++
        this.addDecodingError(
          'combo token',
          `Invalid Base64 format: contains invalid characters`,
          {
            tokenIndex: i,
            token,
            tokenLength: token.length,
            recoverable: true,
            suggestion:
              'Combo tokens should contain only valid Base64 characters (A-Z, a-z, 0-9, +, /, =)',
          }
        )
        continue
      }

      // Check for common Base64 padding issues
      const paddingCount = (token.match(/=/g) || []).length
      if (paddingCount > 2) {
        this.addWarning(
          `Combo token ${i} has excessive Base64 padding (${paddingCount} equals signs)`,
          {
            category: 'format',
            fieldName: 'comboToken',
            tokenIndex: i,
            paddingCount,
            suggestion:
              'Base64 tokens should have at most 2 padding characters',
          }
        )
      }

      // Base64-decode each token with enhanced error handling
      try {
        const decodedToken = atob(token)

        // Validate decoded token
        if (decodedToken.length === 0) {
          this.addWarning(`Combo token ${i} decoded to empty string`, {
            category: 'decoding',
            fieldName: 'comboToken',
            tokenIndex: i,
            originalToken: token,
            suggestion:
              'Token may contain only padding characters or be invalid',
          })
          continue
        }

        // Validate decoded token contains printable characters for key chords
        if (!/^[\x20-\x7E]*$/.test(decodedToken)) {
          this.addWarning(
            `Combo token ${i} decoded to non-printable characters`,
            {
              category: 'validation',
              fieldName: 'decodedComboToken',
              tokenIndex: i,
              decodedToken: decodedToken.slice(0, 20), // Limit display
              suggestion:
                'Decoded combo tokens should contain printable ASCII characters for key bindings',
            }
          )
        }

        decodedTokens.push(decodedToken)
        validTokenCount++
      } catch (error) {
        invalidTokenCount++
        this.addDecodingError(
          'combo token',
          `${error.message} (token: ${token.slice(0, 20)}${token.length > 20 ? '...' : ''})`,
          {
            tokenIndex: i,
            token,
            tokenLength: token.length,
            errorType: error.name,
            critical: false,
            recoverable: true,
            suggestion: 'Token may be corrupted or not properly Base64 encoded',
          }
        )
      }
    }

    // Provide summary of combo processing results
    if (invalidTokenCount > 0) {
      this.addWarning(
        `Combo processing completed with ${invalidTokenCount} invalid tokens out of ${tokens.length} total`,
        {
          category: 'processing_summary',
          fieldName: 'comboData',
          totalTokens: tokens.length,
          validTokens: validTokenCount,
          invalidTokens: invalidTokenCount,
          successRate: `${Math.round((validTokenCount / tokens.length) * 100)}%`,
          suggestion:
            'Some combo tokens were invalid but processing continued with valid tokens',
        }
      )
    }

    if (validTokenCount === 0 && tokens.length > 0) {
      this.addError('All combo tokens failed to decode', {
        category: 'processing_summary',
        severity: 'warning',
        totalTokens: tokens.length,
        suggestion: 'Combo data may be corrupted or encoded incorrectly',
      })
    }

    return decodedTokens
  }

  /**
   * Process combo chord data to append to canonical key string
   * @param {string} baseKey - Base canonical key string
   * @param {string} comboData - Base64 encoded combo data
   * @returns {string} Enhanced key string with combo information
   * @private
   */
  processComboChord(baseKey, comboData) {
    if (!comboData || typeof comboData !== 'string') {
      return baseKey
    }

    const trimmedData = comboData.trim()
    if (trimmedData.length === 0) {
      return baseKey
    }

    // Process the combo data to get decoded tokens
    const decodedTokens = this.processCombo(comboData)

    if (decodedTokens.length === 0) {
      return baseKey
    }

    // Join decoded tokens with + separators and append to base key
    const comboString = decodedTokens.join('+')
    return `${baseKey}+${comboString}`
  }

  // ---------------------------------------------------------------------------
  // Error and warning handling methods
  // ---------------------------------------------------------------------------



  /**
   * Add validation error
   * @param {string} field - Field name
   * @param {string} issue - Issue description
   * @param {*} value - Field value
   * @param {Object} context - Additional context
   * @private
   */
  addValidationError(field, issue, value, context = {}) {
    this.addError(`Validation failed for ${field}: ${issue}`, {
      category: 'validation',
      fieldName: field,
      actualValue: value,
      fieldType: typeof value,
      recoverable: true,
      suggestion: context.suggestion,
      ...context,
    })
  }

  /**
   * Add decoding error
   * @param {string} field - Field name
   * @param {string} issue - Issue description
   * @param {Object} context - Additional context
   * @private
   */
  addDecodingError(field, issue, context = {}) {
    this.addError(`${field} decoding error: ${issue}`, {
      category: 'decoding',
      fieldName: field,
      recoverable: context.recoverable !== false,
      suggestion: context.suggestion,
      ...context,
    })
  }

  /**
   * Add unknown element warning
   * @param {string} elementType - Type of element
   * @param {*} identifier - Element identifier
   * @param {Object} context - Additional context
   * @private
   */
  addUnknownElementWarning(elementType, identifier, context = {}) {
    this.addWarning(`Unknown ${elementType}: ${identifier}`, {
      category: 'unknown_element',
      severity: 'warning',
      suggestion: `This ${elementType} may be from a newer KBF version or custom extension. It will be skipped.`,
      ...context,
    })
  }

  // ---------------------------------------------------------------------------
  // Utility methods
  // ---------------------------------------------------------------------------

}

/**
 * Create a standalone KBF activity translator instance
 * @param {Object} options - Configuration options
 * @returns {ActivityTranslator} Configured activity translator instance
 */
export function createActivityTranslator(options = {}) {
  return new ActivityTranslator(options)
}

export default ActivityTranslator
