import ComponentBase from '../ComponentBase.js'
import { respond, request } from '../../core/requestResponse.js'

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
      // Note: key:select is handled by KeyBrowserService to maintain consistency with alias pattern
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
    
    // Show success toast (legacy behavior from keyHandling.js)
    this.ui?.showToast?.(this.i18n?.t?.('key_added') || 'Key added', 'success')
    
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
  async isValidKeyName (keyName) {
    if (!keyName || typeof keyName !== 'string') return false
    try {
      const pattern = await request(this.eventBus, 'data:get-key-name-pattern') || /^[A-Za-z0-9_]+$/
      return pattern.test(keyName) && keyName.length <= 20
    } catch (error) {
      // Fallback to default pattern if DataService not available
      return /^[A-Za-z0-9_]+$/.test(keyName) && keyName.length <= 20
    }
  }

  // Alias validation used by unit tests
  async isValidAliasName (name) {
    try {
      const pattern = await request(this.eventBus, 'data:get-alias-name-pattern') || /^[A-Za-z0-9_]+$/
      return pattern.test(name)
    } catch (error) {
      // Fallback to default pattern if DataService not available
      return /^[A-Za-z0-9_]+$/.test(name)
    }
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
    this.eventBus.on('profile:switched', ({ profileId, environment } = {}) => {
      this.currentProfile = profileId || null
      if (environment) this.currentEnvironment = environment
      this.selectedKey = null
    })

    // Mode switches between space/ground via modeManagement
    this.eventBus.on('environment:changed', ({ environment } = {}) => {
      if (environment) this.currentEnvironment = environment
    })
  }

  // REMOVED: selectKey method - this should be handled by KeyBrowserService
  // Use request(eventBus, 'key:select', { key: keyName }) instead

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
    // Delegate to FileOperationsService for authoritative implementation
    return request(this.eventBus, 'fileops:generate-mirrored-commands', { commands })
  }

  /** Detect simple mirrored sequences produced by above method */
  detectAndUnmirrorCommands (commandString) {
    // Delegate to FileOperationsService for authoritative implementation
    return request(this.eventBus, 'fileops:detect-unmirror-commands', { commandString })
  }

  /** Split $$ separated string into command objects */
  parseCommandString (commandString) {
    // Delegate to FileOperationsService for authoritative implementation
    return request(this.eventBus, 'fileops:parse-command-string', { commandString })
  }

  /**
   * Parse keybind file content using FileOperationsService
   */
  parseKeybindFile (content) {
    // Delegate to FileOperationsService for authoritative implementation
    return request(this.eventBus, 'fileops:parse-keybind-file', { content })
  }

  /** Import keybind file using FileOperationsService */
  importKeybindFile (content) {
    // REFACTORED: Use cached state instead of globalThis.app
    // Current environment and profile should be set via events or late-join handshake
    
    const profileId = this.currentProfile
    const env = this.currentEnvironment || 'space'

    // Delegate to FileOperationsService for complete import handling
    return request(this.eventBus, 'fileops:import-keybind-file', { 
      content, 
      profileId, 
      environment: env 
    })
  }

  /**
   * Import alias file using FileOperationsService
   */
  importAliasFile (content) {
    const profileId = this.currentProfile

    // Delegate to FileOperationsService for complete import handling
    return request(this.eventBus, 'fileops:import-alias-file', { 
      content, 
      profileId 
    })
  }

  /* ------------------------------------------------------------------
   * Profile export helpers (simplified for unit-test expectations)
   * ------------------------------------------------------------------ */
  compareKeys (a, b) {
    // Embedded synchronous key comparison logic (from stoFileHandler)
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

  exportProfile (profile) {
    // Delegate to FileOperationsService for authoritative implementation
    return request(this.eventBus, 'fileops:generate-keybind-file', { profile })
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
    if (sender === 'DataCoordinator' || sender === 'ProfileService') {
      if (state.currentProfile) this.currentProfile = state.currentProfile
      // environment is managed by InterfaceModeService now; but fall back
      if (state.environment) this.currentEnvironment = state.environment
    }
    if (sender === 'KeyService') {
      this.selectedKey = state.selectedKey ?? this.selectedKey
    }
  }
} 