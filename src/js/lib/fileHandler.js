// STO Tools - Generic file handling library for keybind and alias files
// Provides parsing, export generation, and command utilities
import '../data.js'
const STO_DATA = globalThis.STO_DATA || {}

export default class STOFileHandler {
  constructor() {
    this.keybindPatterns = {
      standard: /^([a-zA-Z0-9_+\-\s\[\]]+)\s+"([^"]*)"(?:\s+"([^"]*)")?$/,
      bind: /^\/bind\s+([a-zA-Z0-9_+\-\s\[\]]+)\s+(.+)$/,
      alias: /^alias\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:"([^"]+)"|<&\s+(.+?)\s+&>)$/,
      comment: /^[#;].*$/,
    }
    this.validKeys = this.generateValidKeys()
  }

  generateValidKeys() {
    const keys = new Set()
    for (let i = 1; i <= 12; i++) keys.add(`F${i}`)
    for (let i = 0; i <= 9; i++) keys.add(i.toString())
    for (let i = 65; i <= 90; i++) keys.add(String.fromCharCode(i))
    const special = [
      'Space','Tab','Enter','Escape','Backspace','Delete','Insert','Home','End',
      'PageUp','PageDown','Up','Down','Left','Right','NumPad0','NumPad1','NumPad2',
      'NumPad3','NumPad4','NumPad5','NumPad6','NumPad7','NumPad8','NumPad9',
      'NumPadEnter','NumPadPlus','NumPadMinus','NumPadMultiply','NumPadDivide',
      'numpad0','numpad1','numpad2','numpad3','numpad4','numpad5','numpad6',
      'numpad7','numpad8','numpad9','divide','multiply','Button4','Button5',
      'Button6','Button7','Button8','Lbutton','Rbutton','Mbutton','Leftdrag',
      'Rightdrag','Middleclick','Mousechord','Wheelplus','Wheelminus','Semicolon',
      'Equals','Comma','Minus','Period','Slash','Grave','LeftBracket','Backslash',
      'RightBracket','Quote','[',']'
    ]
    special.forEach(k => keys.add(k))
    const modifiers = ['Ctrl','Alt','Shift','Control']
    const base = Array.from(keys)
    modifiers.forEach(m => {
      base.forEach(k => keys.add(`${m}+${k}`))
    })
    keys.add('Ctrl+Alt'); keys.add('Ctrl+Shift'); keys.add('Alt+Shift');
    keys.add('Control+Alt'); keys.add('Control+Shift')
    base.forEach(k => {
      keys.add(`Ctrl+Alt+${k}`); keys.add(`Ctrl+Shift+${k}`)
      keys.add(`Alt+Shift+${k}`); keys.add(`Control+Alt+${k}`)
      keys.add(`Control+Shift+${k}`)
    })
    return Array.from(keys).sort()
  }

  parseKeybindFile(content) {
    const lines = content.split('\n')
    const result = { keybinds: {}, aliases: {}, comments: [], errors: [] }
    lines.forEach((line, idx) => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        if (this.keybindPatterns.comment.test(trimmed)) {
          result.comments.push({ line: idx + 1, content: trimmed })
        } else if (this.keybindPatterns.alias.test(trimmed)) {
          const match = trimmed.match(this.keybindPatterns.alias)
          if (match) {
            const [, name, quoted, bracket] = match
            const commands = quoted || bracket
            result.aliases[name] = { name, commands, line: idx + 1 }
          }
        } else if (this.keybindPatterns.standard.test(trimmed)) {
          const m = trimmed.match(this.keybindPatterns.standard)
          if (m) {
            const [, key, cmdString, opt] = m
            const commands = this.parseCommandString(cmdString)
            result.keybinds[key] = {
              key,
              commands,
              line: idx + 1,
              raw: cmdString,
              optionalParam: opt || null,
            }
          }
        } else if (this.keybindPatterns.bind.test(trimmed)) {
          const m = trimmed.match(this.keybindPatterns.bind)
          if (m) {
            const [, key, cmdString] = m
            const clean = cmdString.replace(/^"(.*)"$/, '$1')
            const commands = this.parseCommandString(clean)
            result.keybinds[key] = {
              key,
              commands,
              line: idx + 1,
              raw: clean,
            }
          }
        } else {
          result.errors.push({ line: idx + 1, content: trimmed, error: 'Invalid keybind format' })
        }
      } catch (err) {
        result.errors.push({ line: idx + 1, content: trimmed, error: err.message })
      }
    })
    return result
  }

  generateMirroredCommandString(commands) {
    if (!commands || commands.length <= 1) {
      return (commands || []).map(c => c.command || c).join(' $$ ')
    }
    const commandStrings = commands.map(c => c.command || c)
    const reversed = [...commandStrings].slice(0, -1).reverse()
    const mirrored = [...commandStrings, ...reversed]
    return mirrored.join(' $$ ')
  }

  detectAndUnmirrorCommands(commandString) {
    if (!commandString || typeof commandString !== 'string') {
      return { isMirrored: false, originalCommands: [] }
    }
    const cmds = commandString.split(/\s*\$\$\s*/).map(c => c.trim()).filter(c => c)
    if (cmds.length <= 1) return { isMirrored: false, originalCommands: cmds }
    if (cmds.length < 3 || cmds.length % 2 === 0) {
      return { isMirrored: false, originalCommands: cmds }
    }
    const mid = Math.floor(cmds.length / 2)
    const first = cmds.slice(0, mid + 1)
    const second = cmds.slice(mid + 1)
    const expected = first.slice(0, -1).reverse()
    if (second.length === expected.length && second.every((c, i) => c === expected[i])) {
      return { isMirrored: true, originalCommands: first }
    }
    return { isMirrored: false, originalCommands: cmds }
  }

  parseCommandString(commandString) {
    const commands = commandString.split(/\s*\$\$\s*/).map(c => c.trim())
    return commands.map((command, index) => {
      const type = this.detectCommandType(command)
      const obj = {
        command,
        type,
        icon: this.getCommandIcon(command),
        text: this.getCommandText(command),
        id: `imported_${Date.now()}_${index}`,
      }
      if (command.includes('+STOTrayExecByTray')) {
        const match = command.match(/\+STOTrayExecByTray\s+(\d+)\s+(\d+)/)
        if (match) {
          obj.parameters = { tray: parseInt(match[1]), slot: parseInt(match[2]) }
          obj.text = `Execute Tray ${parseInt(match[1]) + 1} Slot ${parseInt(match[2]) + 1}`
        }
      } else if (command.includes('"')) {
        const match = command.match(/^(\w+)\s+"([^"]+)"$/)
        if (match) {
          obj.parameters = { message: match[2] }
          obj.text = `${obj.text}: ${match[2]}`
        }
      }
      return obj
    })
  }

  detectCommandType(command) {
    if (!command || typeof command !== 'string') return 'custom'
    const cmd = command.toLowerCase().trim()
    if (cmd.includes('+stotrayexecbytray')) return 'tray'
    if (cmd.startsWith('say ') || cmd.startsWith('team ') || cmd.startsWith('zone ') || cmd.startsWith('tell ') || cmd.includes('"')) return 'communication'
    if (cmd.includes('+power_exec') || cmd.includes('distribute_shields') || cmd.includes('reroute_shields')) return 'power'
    if (cmd.includes('+fullimpulse') || cmd.includes('+reverse') || cmd.includes('throttle') || cmd.includes('+turn') || cmd.includes('+up') || cmd.includes('+down') || cmd.includes('+left') || cmd.includes('+right') || cmd.includes('+forward') || cmd.includes('+backward') || cmd.includes('follow')) return 'movement'
    if (cmd.includes('cam') || cmd.includes('look') || cmd.includes('zoom')) return 'camera'
    if (cmd.includes('fire') || cmd.includes('attack') || cmd === 'fireall' || cmd === 'firephasers' || cmd === 'firetorps' || cmd === 'firephaserstorps') return 'combat'
    if (cmd.includes('target') || cmd === 'target_enemy_near' || cmd === 'target_self' || cmd === 'target_friend_near' || cmd === 'target_clear') return 'targeting'
    if (cmd.includes('+gentoggle') || cmd === 'screenshot' || cmd.includes('hud') || cmd === 'interactwindow') return 'system'
    return 'custom'
  }

  getCommandIcon(command) {
    const type = this.detectCommandType(command)
    const iconMap = {
      targeting: '🎯',
      combat: '🔥',
      tray: '⚡',
      power: '🔋',
      communication: '💬',
      movement: '🚀',
      camera: '📹',
      system: '⚙️',
    }
    return iconMap[type] || '⚙️'
  }

  getCommandText(command) {
    if (command.includes('+STOTrayExecByTray')) {
      const match = command.match(/\+STOTrayExecByTray\s+(\d+)\s+(\d+)/)
      if (match) {
        const tray = parseInt(match[1]) + 1
        const slot = parseInt(match[2]) + 1
        return `Execute Tray ${tray} Slot ${slot}`
      }
    }
    if (STO_DATA.commands) {
      for (const [, category] of Object.entries(STO_DATA.commands)) {
        for (const [, cmd] of Object.entries(category.commands)) {
          if (cmd.command === command) {
            return cmd.name
          }
        }
      }
    }
    return command.replace(/[_+]/g, ' ').replace(/([A-Z])/g, ' $1').trim()
  }

  compareKeys(a, b) {
    const aIsF = a.match(/^F(\d+)$/)
    const bIsF = b.match(/^F(\d+)$/)
    if (aIsF && bIsF) return parseInt(aIsF[1]) - parseInt(bIsF[1])
    if (aIsF && !bIsF) return -1
    if (!aIsF && bIsF) return 1
    const aIsNum = /^\d+$/.test(a)
    const bIsNum = /^\d+$/.test(b)
    if (aIsNum && bIsNum) return parseInt(a) - parseInt(b)
    if (aIsNum && !bIsNum) return -1
    if (!aIsNum && bIsNum) return 1
    const aIsLetter = /^[A-Z]$/.test(a)
    const bIsLetter = /^[A-Z]$/.test(b)
    if (aIsLetter && bIsLetter) return a.localeCompare(b)
    if (aIsLetter && !bIsLetter) return -1
    if (!aIsLetter && bIsLetter) return 1
    const specialOrder = ['Space', 'Tab', 'Enter', 'Escape']
    const aSpecial = specialOrder.indexOf(a)
    const bSpecial = specialOrder.indexOf(b)
    if (aSpecial !== -1 && bSpecial !== -1) return aSpecial - bSpecial
    if (aSpecial !== -1 && bSpecial === -1) return -1
    if (aSpecial === -1 && bSpecial !== -1) return 1
    return a.localeCompare(b)
  }

  getProfileStats(profile) {
    const stats = {
      totalKeys: Object.keys(profile.keys || {}).length,
      totalCommands: 0,
      totalAliases: Object.keys(profile.aliases || {}).length,
      commandTypes: {},
      mostUsedCommands: {},
    }
    Object.values(profile.keys || {}).forEach((commands) => {
      stats.totalCommands += commands.length
      commands.forEach((command) => {
        stats.commandTypes[command.type] = (stats.commandTypes[command.type] || 0) + 1
        stats.mostUsedCommands[command.command] = (stats.mostUsedCommands[command.command] || 0) + 1
      })
    })
    return stats
  }

  generateFileHeader(profile, syncFilename = null) {
    const timestamp = new Date().toLocaleString()
    const stats = this.getProfileStats(profile)
    const bindLoadFilename = syncFilename || this.generateFileName(profile, 'txt')
    return `; ================================================================\n; ${profile.name} - STO Keybind Configuration\n; ================================================================\n; Mode: ${(profile.currentEnvironment || 'space').toUpperCase()}\n; Generated: ${timestamp}\n; Created by: STO Tools Keybind Manager v${STO_DATA.settings.version}\n;\n; Keybind Statistics:\n; - Keys bound: ${stats.totalKeys}\n; - Total commands: ${stats.totalCommands}\n;\n; Note: Aliases are exported separately\n; To use this file in Star Trek Online:\n; 1. Save this file to your STO Live folder\n; 2. In game, type: /bind_load_file ${bindLoadFilename}\n; ================================================================\n\n`
  }

  generateAliasFile(aliases) {
    if (!aliases || Object.keys(aliases).length === 0) return ''
    let content = `; Command Aliases\n; ================================================================\n; Aliases allow you to create custom commands that execute\n; multiple commands in sequence. Use them in keybinds like any\n; other command.\n; ================================================================\n\n`
    const sorted = Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b))
    sorted.forEach(([name, alias]) => {
      if (alias.description) content += `; ${alias.description}\n`
      content += `alias ${name} <& ${alias.commands} &>\n\n`
    })
    return content
  }

  generateKeybindSection(keys, options = {}) {
    if (!keys || Object.keys(keys).length === 0) return '; No keybinds defined\n\n'
    let content = `; Keybind Commands\n; ================================================================\n; Each line binds a key to one or more commands.\n; Multiple commands are separated by $$`
    if (options.stabilizeExecutionOrder) {
      content += `\n; EXECUTION ORDER STABILIZATION: ON\n; Commands are mirrored to ensure consistent execution order\n; Phase 1: left-to-right, Phase 2: right-to-left`
    }
    content += `\n; ================================================================\n\n`
    const sortedKeys = Object.keys(keys).sort(this.compareKeys.bind(this))
    sortedKeys.forEach((key) => {
      const commands = keys[key]
      if (commands && commands.length > 0) {
        let commandString
        let shouldStabilize = false
        if (options.profile && options.profile.keybindMetadata) {
          if (options.environment && options.profile.keybindMetadata[options.environment]) {
            const envMeta = options.profile.keybindMetadata[options.environment]
            shouldStabilize = !!(envMeta && envMeta[key] && envMeta[key].stabilizeExecutionOrder)
          }
        }
        if (options.stabilizeExecutionOrder || shouldStabilize) {
          commandString = this.generateMirroredCommandString(commands)
        } else {
          commandString = commands.map((c) => c.command).join('$$')
        }
        content += `${key} "${commandString}"\n`
      }
    })
    content += '\n'
    return content
  }

  generateFileFooter() {
    return `; ================================================================\n; End of keybind file\n; ================================================================\n;\n; Additional STO Commands Reference:\n;\n; Targeting:\n;   target_nearest_enemy    - Target closest hostile\n;   target_nearest_friend   - Target closest friendly\n;   target_self            - Target your own ship\n;\n; Combat:\n;   FireAll               - Fire all weapons\n;   FirePhasers          - Fire beam weapons only\n;   FireTorps            - Fire torpedo weapons only\n;\n; Shield Management:\n;   +power_exec <ability> - Execute bridge officer ability\n;   Examples: +power_exec Distribute_Shields\n;\n; Tray Execution:\n;   +STOTrayExecByTray <tray> <slot> - Execute ability from tray\n;   Example: +STOTrayExecByTray 0 0  (Tray 1, Slot 1)\n;\n; For more commands and help, visit the STO Wiki or community forums.\n; ================================================================\n`
  }

  generateFileName(profile, ext, environment) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const env = environment || profile.currentEnvironment || 'space'
    return `${profile.name.replace(/\s+/g, '_')}_${env}_${timestamp}.${ext}`
  }

  generateKeybindFile(profile, options = {}) {
    let content = ''
    content += this.generateFileHeader(profile, options.syncFilename)
    content += this.generateKeybindSection(profile.keys, {
      ...options,
      profile,
      environment: options.environment || profile.currentEnvironment || 'space',
    })
    content += this.generateFileFooter()
    return content
  }
}
