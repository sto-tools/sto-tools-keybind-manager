// STOCommandParser.js - Standalone STO Command Parser Library
// Reusable library for parsing STO keybind commands with function signature validation
// Dependencies: Only core infrastructure (eventBus, requestResponse)

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
    
    respond(this.eventBus, 'parser:validate-command', ({ signature, commandString }) => 
      this.validateCommand(signature, commandString))
    
    respond(this.eventBus, 'parser:get-command-signature', ({ commandString }) => 
      this.getCommandSignature(commandString))
    
    respond(this.eventBus, 'parser:extract-parameters', ({ signature, commandString }) => 
      this.extractParameters(signature, commandString))
    
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
            regex: /^(\+?(?:STO)?TrayExecByTray)\s+(\d+)\s+(\d+)$/i,
            weight: 100, // Highest priority - most frequent command
            signature: 'TrayExecByTray(tray: number, slot: number)',
            extractParams: (match) => ({ 
              tray: parseInt(match[2]), 
              slot: parseInt(match[3]),
              baseCommand: match[1]
            }),
            generateDisplayText: (params) => `Execute Tray ${params.tray + 1} Slot ${params.slot + 1}`
          }
        ],
        category: 'tray',
        baseCommand: 'TrayExecByTray',
        icon: '⚡'
      },
      
      'TrayWithBackup': {
        patterns: [
          {
            regex: /^TrayExecByTrayWithBackup\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/i,
            weight: 90,
            signature: 'TrayExecByTrayWithBackup(active: number, tray: number, slot: number, backup_tray: number, backup_slot: number)',
            extractParams: (match) => ({ 
              active: parseInt(match[1]),
              tray: parseInt(match[2]), 
              slot: parseInt(match[3]),
              backup_tray: parseInt(match[4]), 
              backup_slot: parseInt(match[5])
            }),
            generateDisplayText: (params) => `Tray Backup (${params.tray + 1}.${params.slot + 1} → ${params.backup_tray + 1}.${params.backup_slot + 1})`
          }
        ],
        category: 'tray',
        baseCommand: 'TrayExecByTrayWithBackup',
        icon: '🔄'
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
            regex: /^dynFxSetFXExlusionList\s+(.+)$/i,
            weight: 50,
            signature: 'VFXExclusion(effects: string)',
            extractParams: (match) => ({ effects: match[1] }),
            generateDisplayText: (params) => `VFX Exclude: ${params.effects}`
          },
          {
            regex: /^dynFxSetFXExlusionList_(.+)$/i,
            weight: 49,
            signature: 'VFXExclusionAlias(aliasName: string)',
            extractParams: (match) => ({ aliasName: match[1] }),
            generateDisplayText: (params) => `VFX Alias: ${params.aliasName}`
          }
        ],
        category: 'vfx',
        baseCommand: 'VFXControl',
        icon: '✨'
      },

      'StaticCombat': {
        patterns: [
          {
            regex: /^(FireAll|FirePhasers|FireTorps|FireMines|FirePhasersTorps|FireProjectiles)$/i,
            weight: 40,
            signature: 'StaticCombat()',
            extractParams: (match) => ({ commandName: match[1] }),
            generateDisplayText: (params) => this.getStaticCombatDisplayName(params.commandName)
          }
        ],
        category: 'combat',
        baseCommand: 'StaticCombat',
        icon: '🔥'
      },

      'StaticTargeting': {
        patterns: [
          {
            regex: /^(Target_Enemy_Near|Target_Friend_Near|Target_Self|Target_Clear|Target_Teammate\s+\d+)$/i,
            weight: 35,
            signature: 'StaticTargeting()',
            extractParams: (match) => ({ commandName: match[1] }),
            generateDisplayText: (params) => this.getStaticTargetingDisplayName(params.commandName)
          }
        ],
        category: 'targeting',
        baseCommand: 'StaticTargeting',
        icon: '🎯'
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

  validateCommand(signature, commandString) {
    // Validate that a command string matches the expected signature
    const parseResult = this.parseCommandString(commandString)
    return parseResult.commands.some(cmd => cmd.signature === signature)
  }

  getCommandSignature(commandString) {
    const parseResult = this.parseCommandString(commandString)
    return parseResult.commands.map(cmd => cmd.signature)
  }

  extractParameters(signature, commandString) {
    const parseResult = this.parseCommandString(commandString)
    const matchingCommand = parseResult.commands.find(cmd => cmd.signature === signature)
    return matchingCommand ? matchingCommand.parameters : {}
  }

  getStaticCombatDisplayName(commandName) {
    const displayMap = {
      'FireAll': 'Fire All Weapons',
      'FirePhasers': 'Fire Energy Weapons',
      'FireTorps': 'Fire Torpedoes',
      'FireMines': 'Fire Mines',
      'FirePhasersTorps': 'Fire Phasers & Torpedoes',
      'FireProjectiles': 'Fire Projectiles'
    }
    return displayMap[commandName] || commandName
  }

  getStaticTargetingDisplayName(commandName) {
    const displayMap = {
      'Target_Enemy_Near': 'Target Nearest Enemy',
      'Target_Friend_Near': 'Target Nearest Friend',
      'Target_Self': 'Target Self',
      'Target_Clear': 'Clear Target'
    }
    
    if (commandName.startsWith('Target_Teammate')) {
      const match = commandName.match(/Target_Teammate\s+(\d+)/)
      return match ? `Target Teammate ${match[1]}` : commandName
    }
    
    return displayMap[commandName] || commandName
  }

  // Utility method for external library usage
  static createStandalone(options = {}) {
    return new STOCommandParser(null, options)
  }
}

export default STOCommandParser 