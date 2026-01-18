// STOCommandParser.js - Standalone STO Command Parser Library
// Reusable library for parsing STO keybind commands with function signature validation
// Dependencies: Only core infrastructure (eventBus, requestResponse)
//
// NOTE ON parseInt VALIDATION:
// The regex patterns in this parser use \d+ to match numeric parameters, which ensures that
// only valid digit strings reach the parseInt() calls. This means parseInt() will never return NaN
// for valid regex matches, so additional NaN validation is unnecessary. Invalid inputs with
// non-numeric parameters (e.g., "+TrayExecByTray abc 1") do not match the tray execution patterns
// and are handled as "UnknownCommand" fallbacks.

import { respond } from '../core/requestResponse.js'

export class STOCommandParser {
  constructor(eventBus = null, options = {}) {
    this.eventBus = eventBus
    this.options = {
      enableCache: true,
      maxCacheSize: 1000,
      enablePerformanceMetrics: false,
      hotPathThreshold: 10, // Commands used this many times get cached in hot path
      ...options
    }
    
    // Performance-optimized cache for high-frequency commands
    this.parseCache = new Map()
    this.hotPathCache = new Map() // Ultra-fast cache for frequent commands
    this.frequencyTracker = new Map()
    this.performanceMetrics = new Map()
    
    // Initialize command signatures
    this.signatures = this.initializeCommandSignatures()
    
    // Setup request handlers if eventBus provided
    if (this.eventBus) {
      this.setupRequestHandlers()
    }
  }

  setupRequestHandlers() {
    // Pure parsing operations (no application logic)
    respond(this.eventBus, 'parser:parse-command-string', ({ commandString, options }) => 
      this.parseCommandString(commandString, options))
  
    respond(this.eventBus, 'parser:get-performance-metrics', () =>
      Array.from(this.performanceMetrics.entries()))
    
    respond(this.eventBus, 'parser:clear-cache', () => {
      this.parseCache.clear()
      this.hotPathCache.clear()
      this.frequencyTracker.clear()
      return { success: true }
    })
  }

  initializeCommandSignatures() {
    return {
      // High-frequency commands optimized for performance (checked first)
      'TrayExecution': {
        patterns: [
          { 
            // Handle + form: +TrayExecByTray <tray> <slot> (active=1 implicit)
            regex: /^(\+(?:STO)?TrayExecByTray)\s+(\d+)\s+(\d+)$/i,
            weight: 100, // Highest priority - most frequent command
            signature: 'TrayExecByTray(active: number, tray: number, slot: number)',
            extractParams: (match) => ({ 
              active: 1, // + form implies active=1
              tray: parseInt(match[2]), 
              slot: parseInt(match[3]),
              baseCommand: match[1],
              isShorthand: true
            }),
            generateDisplayText: (params) => ({
              key: 'command_definitions.custom_tray.name',
              params: { tray: params.tray, slot: params.slot },
              fallback: `Tray Execution (${params.tray} ${params.slot})`
            })
          },
          { 
            // Handle standard form: TrayExecByTray <active> <tray> <slot>
            regex: /^((?:STO)?TrayExecByTray)\s+(\d+)\s+(\d+)\s+(\d+)$/i,
            weight: 99, // Slightly lower priority than + form
            signature: 'TrayExecByTray(active: number, tray: number, slot: number)',
            extractParams: (match) => ({ 
              active: parseInt(match[2]),
              tray: parseInt(match[3]), 
              slot: parseInt(match[4]),
              baseCommand: match[1],
              isShorthand: false
            }),
            generateDisplayText: (params) => ({
              key: 'command_definitions.custom_tray.name',
              params: { tray: params.tray, slot: params.slot },
              fallback: `Tray Execution (${params.tray} ${params.slot})`
            })
          }
        ],
        category: 'tray',
        baseCommand: 'TrayExecByTray',
        icon: '⚡'
      },
      
      'TrayWithBackup': {
        patterns: [
          {
            // Handle + form: +TrayExecByTrayWithBackup <tray> <slot> <backup_tray> <backup_slot> (active=1 implicit)
            regex: /^(\+TrayExecByTrayWithBackup)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/i,
            weight: 90,
            signature: 'TrayExecByTrayWithBackup(active: number, tray: number, slot: number, backup_tray: number, backup_slot: number)',
            extractParams: (match) => ({ 
              active: 1, // + form implies active=1
              tray: parseInt(match[2]), 
              slot: parseInt(match[3]),
              backup_tray: parseInt(match[4]), 
              backup_slot: parseInt(match[5]),
              baseCommand: match[1],
              isShorthand: true
            }),
            generateDisplayText: (params) => ({
              key: 'command_definitions.tray_with_backup.name',
              params: { 
                tray: params.tray, 
                slot: params.slot, 
                backup_tray: params.backup_tray, 
                backup_slot: params.backup_slot 
              },
              fallback: `Tray Execution with Backup (${params.tray} ${params.slot} -> ${params.backup_tray} ${params.backup_slot})`
            })
          },
          {
            // Handle standard form: TrayExecByTrayWithBackup <active> <tray> <slot> <backup_tray> <backup_slot>
            regex: /^(TrayExecByTrayWithBackup)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/i,
            weight: 89,
            signature: 'TrayExecByTrayWithBackup(active: number, tray: number, slot: number, backup_tray: number, backup_slot: number)',
            extractParams: (match) => ({ 
              active: parseInt(match[2]),
              tray: parseInt(match[3]), 
              slot: parseInt(match[4]),
              backup_tray: parseInt(match[5]), 
              backup_slot: parseInt(match[6]),
              baseCommand: match[1],
              isShorthand: false
            }),
            generateDisplayText: (params) => ({
              key: 'command_definitions.tray_with_backup.name',
              params: { 
                tray: params.tray, 
                slot: params.slot, 
                backup_tray: params.backup_tray, 
                backup_slot: params.backup_slot 
              },
              fallback: `Tray Execution with Backup (${params.tray} ${params.slot} -> ${params.backup_tray} ${params.backup_slot})`
            })
          }
        ],
        category: 'tray',
        baseCommand: 'TrayExecByTrayWithBackup',
        icon: '⚡'
      },

      'Communication': {
        patterns: [
          {
            regex: /^(say|team|zone|tell)\s+"([^"]+)"$/i,
            weight: 70,
            signature: 'Communication(verb: string, message: string)',
            extractParams: (match) => ({ verb: match[1], message: match[2] }),
            generateDisplayText: (params) => `${params.verb}: "${params.message}"`
          },
          {
            regex: /^(say|team|zone|tell)\s+(.+)$/i,
            weight: 65, // Lower priority than quoted version
            signature: 'Communication(verb: string, message: string)',
            extractParams: (match) => ({ verb: match[1], message: match[2] }),
            generateDisplayText: (params) => `${params.verb}: ${params.message}`
          }
        ],
        category: 'communication',
        baseCommand: 'Communication',
        icon: '💬'
      },

      'TeamLootRoll': {
        patterns: [
          {
            regex: /^LootRollNeed$/i,
            weight: 68,
            signature: 'LootRollNeed()',
            extractParams: () => ({}),
            generateDisplayText: () => ({
              key: 'command_definitions.loot_roll_need.name',
              fallback: 'Roll Need on Loot'
            })
          },
          {
            regex: /^LootRollGreed$/i,
            weight: 67,
            signature: 'LootRollGreed()',
            extractParams: () => ({}),
            generateDisplayText: () => ({
              key: 'command_definitions.loot_roll_greed.name',
              fallback: 'Roll Greed on Loot'
            })
          },
          {
            regex: /^LootRollPass$/i,
            weight: 66,
            signature: 'LootRollPass()',
            extractParams: () => ({}),
            generateDisplayText: () => ({
              key: 'command_definitions.loot_roll_pass.name',
              fallback: 'Pass on Loot'
            })
          }
        ],
        category: 'team',
        baseCommand: 'TeamLootRoll',
        icon: '🎲'
      },

      'TargetWithName': {
        patterns: [
          {
            regex: /^Target\s+"([^"]+)"$/i,
            weight: 60,
            signature: 'Target(entityName: string)',
            extractParams: (match) => ({ entityName: match[1] }),
            generateDisplayText: (params) => `Target "${params.entityName}"`
          }
        ],
        category: 'targeting',
        baseCommand: 'Target',
        icon: '🎯'
      },

      'VFXCommands': {
        patterns: [
          {
            // Master alias that combines both space & ground aliases
            regex: /^dynFxSetFXExclusionList_Combined$/i,
            weight: 48,
            signature: 'VFXExclusionMaster()',
            extractParams: () => ({}),
            generateDisplayText: () => {
              if (typeof i18next !== 'undefined' && i18next.t) {
                return i18next.t('vfx_alias_combined')
              }
              return 'VFX Alias: Combined Space/Ground'
            }
          },
          {
            // Correct spelling – effects list form
            regex: /^dynFxSetFXExclusionList\s+(.+)$/i,
            weight: 51,
            signature: 'VFXExclusion(effects: string)',
            extractParams: (match) => ({ effects: match[1] }),
            generateDisplayText: (params) => `VFX Exclude: ${params.effects}`
          },
          {
            // Correct spelling – alias form
            regex: /^dynFxSetFXExclusionList_(.+)$/i,
            weight: 49,
            signature: 'VFXExclusionAlias(aliasName: string)',
            extractParams: (match) => ({ aliasName: match[1] }),
            generateDisplayText: (params) => {
              if (typeof i18next !== 'undefined' && i18next.t) {
                const aliasName = params.aliasName.toLowerCase()
                if (aliasName === 'space') {
                  return i18next.t('vfx_alias_space')
                } else if (aliasName === 'ground') {
                  return i18next.t('vfx_alias_ground')
                }
              }
              return `VFX Alias: ${params.aliasName}`
            }
          }
        ],
        category: 'vfx',
        baseCommand: 'VFXControl',
        icon: '✨'
      },

      'PowerCommands': {
        patterns: [
          {
            regex: /^\+power_exec\s+(.+)$/i,
            weight: 30,
            signature: 'PowerExec(powerName: string)',
            extractParams: (match) => ({ powerName: match[1] }),
            generateDisplayText: (params) => `Power: ${params.powerName}`
          }
        ],
        category: 'power',
        baseCommand: 'PowerExec',
        icon: '🔋'
      },

      'MovementCommands': {
        patterns: [
          {
            regex: /^\+(fullimpulse|reverse|turn_left|turn_right|up|down|left|right|forward|backward)$/i,
            weight: 25,
            signature: 'Movement(direction: string)',
            extractParams: (match) => ({ direction: match[1] }),
            generateDisplayText: (params) => `Movement: ${params.direction}`
          }
        ],
        category: 'movement',
        baseCommand: 'Movement',
        icon: '🚀'
      },

      'SystemCommands': {
        patterns: [
          {
            regex: /^(screenshot|interactwindow|\+gentoggle.*)$/i,
            weight: 20,
            signature: 'System(command: string)',
            extractParams: (match) => ({ command: match[1] }),
            generateDisplayText: (params) => `System: ${params.command}`
          }
        ],
        category: 'system',
        baseCommand: 'System',
        icon: '⚙️'
      },

      'CameraCommands': {
        patterns: [
          {
            regex: /^(.*cam.*|.*look.*|.*zoom.*)$/i,
            weight: 15,
            signature: 'Camera(command: string)',
            extractParams: (match) => ({ command: match[1] }),
            generateDisplayText: (params) => `Camera: ${params.command}`
          }
        ],
        category: 'camera',
        baseCommand: 'Camera',
        icon: '📹'
      }
    }
  }

  parseCommandString(commandString, options = {}) {
    const startTime = performance.now()
    
    // Track frequency for hot path optimization
    this.trackCommandFrequency(commandString)
    
    // Check hot path cache first (ultra-frequent commands)
    if (this.hotPathCache.has(commandString)) {
      this.updateMetrics('hotpath_hit', startTime)
      return this.hotPathCache.get(commandString)
    }
    
    // Check regular cache
    if (this.options.enableCache && this.parseCache.has(commandString)) {
      this.updateMetrics('cache_hit', startTime)
      return this.parseCache.get(commandString)
    }

    const commands = commandString.split(/\s*\$\$\s*/).map(cmd => cmd.trim()).filter(cmd => cmd)
    const parsedCommands = commands.map((command, index) => {
      return this.parseIndividualCommand(command, index, options)
    })

    const result = {
      originalString: commandString,
      commands: parsedCommands,
      isMirrored: this.detectMirroring(commands),
      parseTime: performance.now() - startTime,
      metadata: {
        totalCommands: parsedCommands.length,
        cacheStatus: 'miss',
        parseMethod: 'signature-based'
      }
    }

    // Cache result
    if (this.options.enableCache) {
      this.cacheResult(commandString, result)
    }

    this.updateMetrics('parse_complete', startTime)
    return result
  }

  parseIndividualCommand(command, index, options = {}) {
    // Sort signatures by weight for performance (TrayExec checked first)
    const sortedSignatures = Object.entries(this.signatures)
      .sort((a, b) => {
        const aWeight = Math.max(...a[1].patterns.map(p => p.weight))
        const bWeight = Math.max(...b[1].patterns.map(p => p.weight))
        return bWeight - aWeight
      })

    for (const [signatureName, signature] of sortedSignatures) {
      for (const pattern of signature.patterns) {
        const match = command.match(pattern.regex)
        if (match) {
          const parameters = pattern.extractParams(match)
          const displayText = options.generateDisplayText !== false && pattern.generateDisplayText 
            ? pattern.generateDisplayText(parameters)
            : command

          
          return {
            command,
            signature: pattern.signature,
            category: signature.category,
            baseCommand: signature.baseCommand,
            icon: signature.icon,
            parameters,
            displayText,
            matchPattern: pattern,
            id: `parsed_${Date.now()}_${index}`,
            parseMetadata: {
              signatureName,
              patternWeight: pattern.weight,
              matchTime: performance.now()
            }
          }
        }
      }
    }

    // Fallback for unrecognized commands
    return {
      command,
      signature: 'UnknownCommand(command: string)',
      category: 'custom',
      baseCommand: 'Custom',
      icon: '⚙️',
      parameters: { command },
      displayText: command,
      id: `unknown_${Date.now()}_${index}`,
      parseMetadata: {
        signatureName: 'fallback',
        patternWeight: 0,
        matchTime: performance.now()
      }
    }
  }

  trackCommandFrequency(commandString) {
    const count = this.frequencyTracker.get(commandString) || 0
    this.frequencyTracker.set(commandString, count + 1)
    
    // Move to hot path cache if used frequently
    if (count >= this.options.hotPathThreshold && !this.hotPathCache.has(commandString)) {
      // Temporarily disable frequency tracking to prevent infinite recursion
      const originalThreshold = this.options.hotPathThreshold
      this.options.hotPathThreshold = Infinity
      
      const result = this.parseCommandString(commandString)
      this.hotPathCache.set(commandString, result)
      
      // Restore original threshold
      this.options.hotPathThreshold = originalThreshold
    }
  }

  detectMirroring(commands) {
    if (commands.length <= 1) return false
    if (commands.length < 3 || commands.length % 2 === 0) return false
    
    const mid = Math.floor(commands.length / 2)
    const first = commands.slice(0, mid + 1)
    const second = commands.slice(mid + 1)
    const expected = first.slice(0, -1).reverse()
    
    return second.length === expected.length && 
           second.every((cmd, i) => cmd.trim() === expected[i].trim())
  }

  cacheResult(commandString, result) {
    // Implement LRU cache behavior
    if (this.parseCache.size >= this.options.maxCacheSize) {
      const firstKey = this.parseCache.keys().next().value
      this.parseCache.delete(firstKey)
    }
    
    this.parseCache.set(commandString, result)
  }

  updateMetrics(operation, startTime) {
    if (!this.options.enablePerformanceMetrics) return
    
    const duration = performance.now() - startTime
    const existing = this.performanceMetrics.get(operation) || { count: 0, totalTime: 0, avgTime: 0 }
    
    existing.count++
    existing.totalTime += duration
    existing.avgTime = existing.totalTime / existing.count
    
    this.performanceMetrics.set(operation, existing)
  }

  // Utility method for external library usage
  static createStandalone(options = {}) {
    return new STOCommandParser(null, options)
  }
}

export default STOCommandParser 