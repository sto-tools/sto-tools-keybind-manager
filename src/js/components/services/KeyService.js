import ComponentBase from '../ComponentBase.js'
import { respond } from '../../core/requestResponse.js'

/**
 * KeyService – the authoritative service for creating, deleting and duplicating
 * key-bind rows in a profile. This service mirrors CommandService but focuses
 * exclusively on key level operations so other components (KeyBrowser,
 * CommandChain, etc.) can delegate all key data mutations here.
 */
export default class KeyService extends ComponentBase {
  constructor ({ storage, eventBus, i18n, ui } = {}) {
    super(eventBus)
    this.componentName = 'KeyService'
    this.storage = storage
    this.i18n = i18n
    this.ui = ui

    this.selectedKey = null
    this.currentEnvironment = 'space'
    this.currentProfile = null

    /* ------------------------------------------------------------------
     * Legacy STOKeybindFileManager fields expected by unit tests
     * ------------------------------------------------------------------ */
    // Generate valid key list once
    this.validKeys = this.generateValidKeys()

    // ---------------------------------------------------------
    // Register Request/Response topics for key state and actions
    // ---------------------------------------------------------
    if (this.eventBus) {
      respond(this.eventBus, 'key:get-selected', () => this.selectedKey)
      respond(this.eventBus, 'key:select', ({ key } = {}) => this.selectKey(key))
      respond(this.eventBus, 'key:add', ({ key } = {}) => this.addKey(key))
      respond(this.eventBus, 'key:delete', ({ key } = {}) => this.deleteKey(key))
    }
  }

  /* ------------------------------------------------------------------
   * State setters
   * ------------------------------------------------------------------ */
  setSelectedKey (key) {
    this.selectedKey = key
  }

  setCurrentEnvironment (environment) {
    this.currentEnvironment = environment
  }

  setCurrentProfile (profileId) {
    this.currentProfile = profileId
  }

  /** Convenience getter */
  getCurrentProfileId () {
    return this.currentProfile
  }

  /* ------------------------------------------------------------------
   * Profile helpers – modelled after CommandService helpers
   * ------------------------------------------------------------------ */
  _ensureBuildStructure (profile) {
    if (!profile.builds) {
      profile.builds = {
        space: { keys: {} },
        ground: { keys: {} },
      }
    }

    if (!profile.builds[this.currentEnvironment]) {
      profile.builds[this.currentEnvironment] = { keys: {} }
    }

    if (!profile.builds[this.currentEnvironment].keys) {
      profile.builds[this.currentEnvironment].keys = {}
    }
  }

  getCurrentProfile () {
    if (!this.currentProfile) return null
    const profile = this.storage.getProfile(this.currentProfile)
    if (!profile) return null
    this._ensureBuildStructure(profile)
    return {
      ...profile,
      keys: profile.builds[this.currentEnvironment].keys,
    }
  }

  /* ------------------------------------------------------------------
   * Core key operations
   * ------------------------------------------------------------------ */
  /** Add a new empty key row to the current profile */
  addKey (keyName) {
    if (!this.isValidKeyName(keyName)) {
      this.ui?.showToast?.(this.i18n?.t?.('invalid_key_name') || 'Invalid key name', 'error')
      return false
    }

    const profile = this.storage.getProfile(this.currentProfile)
    if (!profile) {
      this.ui?.showToast?.(this.i18n?.t?.('no_profile_selected') || 'No active profile', 'error')
      return false
    }

    this._ensureBuildStructure(profile)

    const keyMap = profile.builds[this.currentEnvironment].keys
    if (keyMap[keyName]) {
      this.ui?.showToast?.(this.i18n?.t?.('key_already_exists', { keyName }) || 'Key already exists', 'warning')
      return false
    }

    keyMap[keyName] = []
    this.storage.saveProfile(this.currentProfile, profile)

    this.selectedKey = keyName
    this.emit('key-added', { key: keyName })
    return true
  }

  /** Delete a key row from the current profile */
  deleteKey (keyName) {
    const profile = this.storage.getProfile(this.currentProfile)
    if (!profile) return false

    this._ensureBuildStructure(profile)
    const keyMap = profile.builds[this.currentEnvironment].keys
    if (!keyMap[keyName]) return false

    delete keyMap[keyName]
    if (this.selectedKey === keyName) this.selectedKey = null

    this.storage.saveProfile(this.currentProfile, profile)
    this.emit('key-deleted', { key: keyName })
    return true
  }

  /** Duplicate an existing key row (clone commands with new ids) */
  duplicateKey (keyName) {
    const profile = this.storage.getProfile(this.currentProfile)
    if (!profile) return false

    this._ensureBuildStructure(profile)
    const keyMap = profile.builds[this.currentEnvironment].keys
    const commands = keyMap[keyName]
    if (!commands || commands.length === 0) return false

    let newKeyName = `${keyName}_copy`
    let counter = 1
    while (keyMap[newKeyName]) {
      newKeyName = `${keyName}_copy_${counter}`
      counter++
    }

    const cloned = commands.map(cmd => ({ ...cmd, id: this.generateKeyId() }))
    keyMap[newKeyName] = cloned

    this.storage.saveProfile(this.currentProfile, profile)
    this.emit('key-duplicated', { from: keyName, to: newKeyName })
    return true
  }

  /* ------------------------------------------------------------------
   * Validation helpers
   * ------------------------------------------------------------------ */
  isValidKeyName (keyName) {
    if (!keyName || typeof keyName !== 'string') return false
    const pattern = (typeof globalThis.STO_DATA !== 'undefined' && globalThis.STO_DATA.validation && globalThis.STO_DATA.validation.keyNamePattern) || /^[A-Za-z0-9_]+$/
    return pattern.test(keyName) && keyName.length <= 20
  }

  // Alias validation used by unit tests
  isValidAliasName (name) {
    const pattern = (typeof globalThis.STO_DATA !== 'undefined' && globalThis.STO_DATA.validation && globalThis.STO_DATA.validation.aliasNamePattern) || /^[A-Za-z0-9_]+$/
    return pattern.test(name)
  }

  /* Legacy helper used by keybinds tests */
  isValidKey (key) {
    if (!key || typeof key !== 'string' || !Array.isArray(this.validKeys)) return false
    return this.validKeys.some(v => v.toLowerCase() === key.toLowerCase())
  }

  generateValidKeys () {
    const list = []
    // Function keys F1–F12
    for (let i = 1; i <= 12; i++) {
      list.push(`F${i}`)
      list.push(`Alt+F${i}`)
    }
    // Special keys
    list.push('Space', 'Tab', 'Enter', 'Shift+Space')

    // Letters A–Z and modifiers
    for (let i = 65; i <= 90; i++) {
      const l = String.fromCharCode(i)
      list.push(l)
      list.push(`Ctrl+${l}`)
      list.push(`Control+${l}`)
      list.push(`Alt+${l}`)
      list.push(`Shift+${l}`)
    }

    // Numbers 0–9 and modifiers
    for (let i = 0; i <= 9; i++) {
      list.push(String(i))
      list.push(`Ctrl+${i}`)
      list.push(`Alt+${i}`)
      list.push(`Shift+${i}`)
    }

    // Common mouse buttons
    list.push('Lbutton', 'Rbutton', 'Button4', 'Wheelplus')

    return list
  }

  /* ------------------------------------------------------------------
   * Utility helpers
   * ------------------------------------------------------------------ */
  generateKeyId () {
    return `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /* ------------------------------------------------------------------
   * Lifecycle hooks
   * ------------------------------------------------------------------ */
  onInit () {
    this.setupEventListeners()
  }

  setupEventListeners () {
    if (!this.eventBus) return

    // When UI selects a key
    this.eventBus.on('key-selected', ({ key, name } = {}) => {
      this.selectedKey = key || name || null
    })

    // Profile service notifies of active profile change
    this.eventBus.on('profile-switched', ({ profileId, environment } = {}) => {
      this.currentProfile = profileId || null
      if (environment) this.currentEnvironment = environment
      this.selectedKey = null
    })

    // Mode switches between space/ground via modeManagement
    this.eventBus.on('environment:changed', ({ environment } = {}) => {
      if (environment) this.currentEnvironment = environment
    })
  }

  /**
   * Legacy helper maintained for backward-compatibility – mimics the old
   * keyHandling.selectKey() behaviour by setting selection state and emitting
   * an event so interested UI components can react.
   */
  selectKey (keyName) {
    this.setSelectedKey(keyName)
    this.emit('key-selected', { key: keyName, name: keyName })
  }

  /**
   * Historically the UI expected a command-id generator utility on the
   * keyHandling helper.  We expose the same helper here so the singleton stub
   * continues to satisfy older tests without modification.
   */
  generateCommandId () {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /* ------------------------------------------------------------------
   * Mirroring helpers (legacy compatibility for stoKeybinds)
   * ------------------------------------------------------------------ */
  /** Mirror command array forward and then reverse (excluding last) */
  generateMirroredCommandString (commands) {
    if (!Array.isArray(commands) || commands.length === 0) return ''
    const forward = commands.map(c => (c.command ? c.command : c))
    const reverse = commands.slice(0, -1).reverse().map(c => (c.command ? c.command : c))
    return [...forward, ...reverse].join(' $$ ')
  }

  /** Detect simple mirrored sequences produced by above method */
  detectAndUnmirrorCommands (commandString) {
    if (!commandString) {
      return { isMirrored: false, originalCommands: [] }
    }

    const parts = commandString.split(/\s*\$\$\s*/).map(s => s.trim()).filter(Boolean)

    // Always prepare originalCommands (even if empty)
    const originalCommands = [...parts]

    const len = parts.length
    if (len < 3) return { isMirrored: false, originalCommands }
    const mid = Math.floor(len / 2)
    const forward = parts.slice(0, mid + 1)
    const reverse = parts.slice(mid).reverse()
    const isMirrored = forward.join('||') === reverse.join('||')

    return isMirrored ? { isMirrored: true, originalCommands: forward } : { isMirrored: false, originalCommands }
  }

  /** Split $$ separated string into command objects */
  parseCommandString (commandString) {
    const parts = (commandString || '').split(/\s*\$\$\s*/)
    const now = Date.now()
    return parts
      .map((raw, idx) => {
        const cmd = typeof raw === 'string' ? raw.trim() : ''
        // Always create an object to preserve empty commands
        const obj = { id: `imported_${now}_${idx}`, command: cmd }

        if (!cmd) return obj // Keep empty command objects for tests expecting them

        // Tray execution detection (+STOTrayExecByTray or TrayExecByTray)
        const trayMatch = cmd.match(/TrayExecByTray\s+(\d+)\s+(\d+)/i) || cmd.match(/\+STO?TrayExecByTray\s+(\d+)\s+(\d+)/i)
        if (trayMatch) {
          const tray = parseInt(trayMatch[1], 10)
          const slot = parseInt(trayMatch[2], 10)
          obj.type = 'tray'
          obj.parameters = { tray, slot }
          obj.text = `Execute Tray ${tray + 1} Slot ${slot + 1}`
          return obj
        }

        // Communication commands (starting with say or team say etc)
        if (/^(\+)?say\b/i.test(cmd)) {
          obj.type = 'communication'
          obj.icon = '💬'
          return obj
        }

        // Fallback: unknown type
        return obj
      })
      // Do not filter out entries – tests expect empty command objects
  }

  /**
   * Very lightweight keybind file parser supporting the patterns referenced in
   * unit tests: standard keybind lines (KEY "commands") and /bind format as
   * well as alias definitions.  It ignores comments and collects simple error
   * information for unknown lines.
   */
  parseKeybindFile (content) {
    const lines = content.split(/\r?\n/)
    const keybinds = {}
    const aliases = {}
    const errors = []
    const comments = []

    lines.forEach((line, idx) => {
      const trimmed = line.trim()
      if (!trimmed) return

      // Comments start with ; or #
      if (/^[;#]/.test(trimmed)) {
        comments.push({ line: idx + 1, content: trimmed })
        return
      }

      // Alias definitions – quoted or bracket syntax
      const aliasQuoted = trimmed.match(/^alias\s+(\S+)\s+"([^"]*)"/)
      const aliasBracket = trimmed.match(/^alias\s+(\S+)\s+<&\s*(.+?)\s*&>/)
      if (aliasQuoted || aliasBracket) {
        const name = (aliasQuoted || aliasBracket)[1]
        const cmdStr = (aliasQuoted ? aliasQuoted[2] : aliasBracket[2]).trim()
        aliases[name] = { name, commands: cmdStr }
        return
      }

      // /bind or bind line
      const bindMatch = trimmed.match(/^\/?bind\s+(\S+)\s+"([^"]*)"/)
      if (bindMatch) {
        const key = bindMatch[1]
        const cmdStr = bindMatch[2]
        keybinds[key] = {
          key,
          commands: this.parseCommandString(cmdStr),
          isMirrored: false,
        }
        return
      }

      // Standard keybind format: KEY "commands" "mode" (mode optional)
      const stdMatch = trimmed.match(/^(\S+)\s+"([^"]*)"/)
      if (stdMatch) {
        const key = stdMatch[1]
        const cmdStr = stdMatch[2]
        const mirrorInfo = this.detectAndUnmirrorCommands(cmdStr)
        const raw = mirrorInfo.isMirrored ? mirrorInfo.originalCommands.join(' $$ ') : cmdStr
        keybinds[key] = {
          key,
          commands: this.parseCommandString(raw),
          isMirrored: mirrorInfo.isMirrored,
        }
        return
      }

      errors.push({ line: idx + 1, error: 'Invalid keybind format' })
    })

    return { keybinds, aliases, errors, comments }
  }

  /** Simplified importer used by tests */
  importKeybindFile (content) {
    // Sync environment with global app context if available
    if (typeof globalThis !== 'undefined' && globalThis.app?.currentEnvironment) {
      this.currentEnvironment = globalThis.app.currentEnvironment
    }

    const parsed = this.parseKeybindFile(content)
    const keyCount = Object.keys(parsed.keybinds).length
    if (keyCount === 0) return { success: false, error: 'No keybinds found' }
    const storage = this.storage || (typeof window !== 'undefined' && window.storageService)
    if (!storage) return { success: false, error: 'Storage not available' }
    const profileId = this.currentProfile || (typeof window !== 'undefined' && window.app?.currentProfile)
    if (!profileId) return { success: false, error: 'No active profile' }
    let profile = storage.getProfile(profileId) || { builds: { space: { keys: {} }, ground: { keys: {} } } }

    const env = ( (typeof window !== 'undefined' && window.app?.currentEnvironment) || (typeof globalThis !== 'undefined' && globalThis.app?.currentEnvironment) || this.currentEnvironment || (typeof store !== 'undefined' && store.currentEnvironment) || 'space' )
    if (!profile.builds) profile.builds = { space: { keys: {} }, ground: { keys: {} } }
    if (!profile.builds[env]) profile.builds[env] = { keys: {} }
    const dest = profile.builds[env].keys

    Object.entries(parsed.keybinds).forEach(([k, data]) => {
      dest[k] = data.commands

      if (data.isMirrored) {
        if (!profile.keybindMetadata) profile.keybindMetadata = {}
        if (!profile.keybindMetadata[env]) profile.keybindMetadata[env] = {}
        if (!profile.keybindMetadata[env][k]) profile.keybindMetadata[env][k] = {}
        profile.keybindMetadata[env][k].stabilizeExecutionOrder = true
      }
    })
    storage.saveProfile(profileId, profile)

    // Notify UI / tests
    if (typeof window !== 'undefined') {
      window.app?.setModified?.(true)
      const ignoredAliases = Object.keys(parsed.aliases).length
      if (window.stoUI?.showToast) {
        const msg = ignoredAliases > 0
          ? `Import completed: ${keyCount} keybinds (${ignoredAliases} aliases ignored - use Import Aliases)`
          : `Import completed: ${keyCount} keybinds`
        window.stoUI.showToast(msg, 'success')
      }
    }

    return { success: true, imported: { keys: keyCount }, errors: parsed.errors }
  }

  /**
   * Import alias-only content (similar to original STOKeybindFileManager.importAliasFile)
   */
  importAliasFile (content) {
    const parsed = this.parseKeybindFile(content)
    const aliasCount = Object.keys(parsed.aliases).length
    if (aliasCount === 0) return { success: false, error: 'No aliases found' }

    const storage = this.storage || (typeof window !== 'undefined' && window.storageService)
    const profileId = this.currentProfile || (typeof window !== 'undefined' && window.app?.currentProfile)
    if (!storage || !profileId) return { success: false, error: 'No active profile' }

    const profile = storage.getProfile(profileId) || { aliases: {} }
    if (!profile.aliases) profile.aliases = {}
    Object.entries(parsed.aliases).forEach(([name, data]) => {
      profile.aliases[name] = { commands: data.commands, description: '' }
    })
    storage.saveProfile(profileId, profile)

    if (typeof window !== 'undefined') {
      window.app?.setModified?.(true)
    }

    return { success: true, imported: { aliases: aliasCount }, errors: parsed.errors }
  }

  /* ------------------------------------------------------------------
   * Profile export helpers (simplified for unit-test expectations)
   * ------------------------------------------------------------------ */
  compareKeys (a, b) {
    const funcA = a.match(/^F(\d+)$/)
    const funcB = b.match(/^F(\d+)$/)
    if (funcA && funcB) return parseInt(funcA[1]) - parseInt(funcB[1])
    if (funcA) return -1
    if (funcB) return 1

    // Numeric keys (0-9) – treat as integers
    const numA = /^\d+$/.test(a)
    const numB = /^\d+$/.test(b)
    if (numA && numB) return parseInt(a) - parseInt(b)
    if (numA) return -1
    if (numB) return 1

    // Special keys priority list
    const specials = ['Space', 'Tab', 'Enter', 'Escape']
    const idxA = specials.indexOf(a)
    const idxB = specials.indexOf(b)
    if (idxA !== -1 && idxB !== -1) return idxA - idxB
    if (idxA !== -1) return -1
    if (idxB !== -1) return 1

    // Fallback: alphabetical
    return a.localeCompare(b)
  }

  exportProfile (profile) {
    if (!profile || !profile.keys) return ''
    const timestamp = new Date().toLocaleDateString()

    let output = `; ${profile.name} - STO Keybind Configuration\n; Created by: STO Tools Keybind Manager\n; Generated: ${timestamp}\n\n`

    const keys = Object.keys(profile.keys).sort(this.compareKeys.bind(this))
    keys.forEach((k) => {
      const cmds = profile.keys[k].map((c) => c.command).join(' $$ ')
      output += `${k} "${cmds}"\n`
    })
    return output
  }

  /* ------------------------------------------------------------------
   * Legacy validation helpers expected by unit-tests
   * ------------------------------------------------------------------ */
  /**
   * Validate a keybind consisting of a key name and an array of command objects.
   * Returns an object { valid: boolean, errors: string[] }
   */
  validateKeybind (keyName, commands = []) {
    const errors = []

    // Validate key name
    if (!this.isValidKey(keyName)) {
      errors.push(`Invalid key name: ${keyName}`)
    }

    // Validate command array existence
    if (!Array.isArray(commands) || commands.length === 0) {
      errors.push('At least one command is required')
    } else {
      // Command count limit (arbitrary 20 – matches historical stoKeybinds limit)
      if (commands.length > 20) {
        errors.push('Too many commands (max 20)')
      }

      // Validate each individual command
      commands.forEach((cmd, idx) => {
        const str = (cmd && typeof cmd.command === 'string') ? cmd.command.trim() : ''
        if (!str) {
          errors.push(`Command ${idx + 1} is empty`)
        }
      })
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Suggest up to 20 key names from the full valid key list that match a filter.
   * Filtering is case-insensitive and suggestions are sorted according to compareKeys.
   */
  suggestKeys (filter = '') {
    if (!Array.isArray(this.validKeys) || this.validKeys.length === 0) return []
    const lower = filter.toLowerCase()
    const matches = this.validKeys.filter(k => k.toLowerCase().includes(lower))
    const sorted = matches.sort(this.compareKeys.bind(this))
    return sorted.slice(0, 20)
  }

  /**
   * Return a list of commonly used keys for quick selection in UI components.
   * The list is ordered according to compareKeys so tests get deterministic output.
   */
  getCommonKeys () {
    const preferred = ['Space', 'Tab', 'Enter', 'Escape', 'F1', 'F2', 'F3', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3']
    const available = preferred.filter(k => this.validKeys.includes(k))
    return available.sort(this.compareKeys.bind(this))
  }

  /**
   * Generate a unique keybind id (different from command/key ids) used by legacy tests.
   */
  generateKeybindId () {
    return `keybind_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /** Deep-clone a keybind object so mutations on the clone do not affect the original. */
  cloneKeybind (keybind) {
    return JSON.parse(JSON.stringify(keybind))
  }

  /**
   * Produce aggregate statistics for a profile used by analytics UI and unit-tests.
   */
  getProfileStats (profile = {}) {
    const keys = profile.keys || {}
    const aliases = profile.aliases || {}

    const stats = {
      totalKeys: Object.keys(keys).length,
      totalCommands: 0,
      totalAliases: Object.keys(aliases).length,
      commandTypes: {},
      mostUsedCommands: {},
    }

    Object.values(keys).forEach(cmdArray => {
      if (!Array.isArray(cmdArray)) return
      stats.totalCommands += cmdArray.length
      cmdArray.forEach(cmdObj => {
        // Skip null/undefined entries that can occur from partially edited keybinds
        if (!cmdObj) return
        const cmdStr = cmdObj.command || ''
        const type = cmdObj.type || 'unknown'
        // Count by type
        stats.commandTypes[type] = (stats.commandTypes[type] || 0) + 1
        // Count by command string
        if (cmdStr) {
          stats.mostUsedCommands[cmdStr] = (stats.mostUsedCommands[cmdStr] || 0) + 1
        }
      })
    })

    return stats
  }

  /**
   * Legacy file-input handler used by tests – simply reads the first file as text and
   * forwards content to importKeybindFile().
   */
  handleKeybindFileImport (event) {
    if (!event || !event.target || !event.target.files || event.target.files.length === 0) return
    const file = event.target.files[0]
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target.result
      this.importKeybindFile(content)
    }
    reader.readAsText(file)

    // Reset input so the same file can be chosen again if needed
    event.target.value = ''
  }

  /**
   * Detect the type of a command string (tray, communication, power, movement, camera, combat, targeting, system, custom).
   */
  detectCommandType(command) {
    if (!command || typeof command !== 'string') return 'custom'

    const cmd = command.toLowerCase().trim()

    // Tray commands
    if (cmd.includes('+stotrayexecbytray')) return 'tray'

    // Communication commands
    if (
      cmd.startsWith('say ') ||
      cmd.startsWith('team ') ||
      cmd.startsWith('zone ') ||
      cmd.startsWith('tell ') ||
      cmd.includes('"')
    )
      return 'communication'

    // Shield management commands
    if (
      cmd.includes('+power_exec') ||
      cmd.includes('distribute_shields') ||
      cmd.includes('reroute_shields')
    )
      return 'power'

    // Movement commands
    if (
      cmd.includes('+fullimpulse') ||
      cmd.includes('+reverse') ||
      cmd.includes('throttle') ||
      cmd.includes('+turn') ||
      cmd.includes('+up') ||
      cmd.includes('+down') ||
      cmd.includes('+left') ||
      cmd.includes('+right') ||
      cmd.includes('+forward') ||
      cmd.includes('+backward') ||
      cmd.includes('follow')
    )
      return 'movement'

    // Camera commands
    if (cmd.includes('cam') || cmd.includes('look') || cmd.includes('zoom'))
      return 'camera'

    // Combat commands
    if (
      cmd.includes('fire') ||
      cmd.includes('attack') ||
      cmd === 'fireall' ||
      cmd === 'firephasers' ||
      cmd === 'firetorps' ||
      cmd === 'firephaserstorps'
    )
      return 'combat'

    // Targeting commands
    if (
      cmd.includes('target') ||
      cmd === 'target_enemy_near' ||
      cmd === 'target_self' ||
      cmd === 'target_friend_near' ||
      cmd === 'target_clear'
    )
      return 'targeting'

    // System commands
    if (
      cmd.includes('+gentoggle') ||
      cmd === 'screenshot' ||
      cmd.includes('hud') ||
      cmd === 'interactwindow'
    )
      return 'system'

    // Default to custom for unknown commands
    return 'custom'
  }

  /* ------------------------------------------------------------------
   * Late-join state sharing
   * ------------------------------------------------------------------ */
  getCurrentState () {
    return {
      selectedKey: this.selectedKey,
      keys: this.getKeys()
    }
  }

  /**
   * Helper: return array of key names in current profile & environment.
   */
  getKeys () {
    const profile = this.getCurrentProfile()
    if (!profile || !profile.keys) return []
    return Object.keys(profile.keys)
  }

  handleInitialState (sender, state) {
    if (!state) return
    if (sender === 'ProfileService') {
      if (state.currentProfile) this.currentProfile = state.currentProfile
      // environment is managed by InterfaceModeService now; but fall back
      if (state.environment) this.currentEnvironment = state.environment
    }
    if (sender === 'KeyService') {
      this.selectedKey = state.selectedKey ?? this.selectedKey
    }
  }
} 