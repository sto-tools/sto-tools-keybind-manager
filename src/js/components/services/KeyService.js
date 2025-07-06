import ComponentBase from '../ComponentBase.js'
import { respond, request } from '../../core/requestResponse.js'

/**
 * KeyService – the authoritative service for creating, deleting and duplicating
 * key-bind rows in a profile. This service mirrors CommandService but focuses
 * exclusively on key level operations so other components (KeyBrowser,
 * CommandChain, etc.) can delegate all key data mutations here.
 * 
 * REFACTORED: Now uses DataCoordinator broadcast/cache pattern
 * - Caches profile state locally from DataCoordinator broadcasts
 * - Uses DataCoordinator request/response for all profile updates
 * - Implements late-join support for dynamic initialization
 * - No direct storage access - all data operations go through DataCoordinator
 */
export default class KeyService extends ComponentBase {
  constructor ({ storage, eventBus, i18n, ui } = {}) {
    super(eventBus)
    this.componentName = 'KeyService'
    // Legacy storage parameter kept for backward compatibility but not used
    this.storage = storage
    this.i18n = i18n
    this.ui = ui

    this.selectedKey = null
    this.currentEnvironment = 'space'
    this.currentProfile = null

    // REFACTORED: Cache profile state from DataCoordinator broadcasts
    this.cache = {
      currentProfile: null,
      currentEnvironment: 'space',
      keys: {}, // Current environment's keys
      builds: { // Full builds structure for profile
        space: { keys: {} },
        ground: { keys: {} }
      },
      aliases: {}
    }

    /* ------------------------------------------------------------------
     * Legacy STOKeybindFileManager fields expected by unit tests
     * ------------------------------------------------------------------ */
    // Generate valid key list once
    this.validKeys = this.generateValidKeys()

    // ---------------------------------------------------------
    // Register Request/Response topics for key state and actions
    // ---------------------------------------------------------
    if (this.eventBus) {
      this.respond('key:get-selected', () => this.selectedKey)
      // Note: key:select is handled by KeyBrowserService to maintain consistency with alias pattern
      this.respond('key:add', ({ key } = {}) => this.addKey(key))
      
      // Use addEventListener for key:delete since KeyBrowserUI emits it rather than requests it
      this.addEventListener('key:delete', ({ key } = {}) => this.deleteKey(key))
      this.respond('key:duplicate-with-name', ({ sourceKey, newKey } = {}) => this.duplicateKeyWithName(sourceKey, newKey))
    }
  }

  /* ------------------------------------------------------------------
   * Lifecycle
   * ------------------------------------------------------------------ */
  async init() {
    super.init() // ComponentBase handles late-join automatically
    this.setupEventListeners()
  }

  /* ------------------------------------------------------------------
   * State setters - Updated to use cached state
   * ------------------------------------------------------------------ */
  setSelectedKey (key) {
    this.selectedKey = key
  }

  setCurrentEnvironment (environment) {
    this.currentEnvironment = environment
    this.cache.currentEnvironment = environment
    // Update keys cache for current environment
    this.cache.keys = this.cache.builds[environment]?.keys || {}
  }

  setCurrentProfile (profileId) {
    this.currentProfile = profileId
    this.cache.currentProfile = profileId
  }

  /** Convenience getter */
  getCurrentProfileId () {
    return this.currentProfile
  }

  /* ------------------------------------------------------------------
   * REFACTORED: Event listeners for DataCoordinator integration
   * ------------------------------------------------------------------ */
  setupEventListeners () {
    if (!this.eventBus) return

    // Cache profile state from DataCoordinator broadcasts
    this.addEventListener('profile:updated', ({ profileId, profile }) => {
      if (profileId === this.cache.currentProfile) {
        this.updateCacheFromProfile(profile)
        this.emit('keys:changed', { keys: this.cache.keys })
      }
    })

    this.addEventListener('profile:switched', ({ profileId, profile, environment }) => {
      this.cache.currentProfile = profileId
      this.currentProfile = profileId
      this.cache.currentEnvironment = environment || 'space'
      this.currentEnvironment = this.cache.currentEnvironment
      this.selectedKey = null
      
      this.updateCacheFromProfile(profile)
      this.emit('keys:changed', { keys: this.cache.keys })
    })

    this.addEventListener('environment:changed', ({ environment }) => {
      if (environment) {
        this.cache.currentEnvironment = environment
        this.currentEnvironment = environment
        this.cache.keys = this.cache.builds[environment]?.keys || {}
        this.emit('keys:changed', { keys: this.cache.keys })
      }
    })

    // Late-join support now handled by ComponentBase automatically

    // Legacy event compatibility
    this.addEventListener('key-selected', ({ key, name } = {}) => {
      this.selectedKey = key || name || null
    })
  }

  /**
   * Update local cache from profile data
   */
  updateCacheFromProfile(profile) {
    if (!profile) return
    
    // Ensure builds structure exists
    this.cache.builds = profile.builds || {
      space: { keys: {} },
      ground: { keys: {} }
    }
    
    // Update keys for current environment
    this.cache.keys = this.cache.builds[this.cache.currentEnvironment]?.keys || {}
    this.cache.aliases = profile.aliases || {}
  }

  /* ------------------------------------------------------------------
   * REFACTORED: Profile access now uses cached state
   * ------------------------------------------------------------------ */
  getCurrentProfile () {
    if (!this.cache.currentProfile) return null
    
    // Return virtual profile with current environment's keys
    return {
      id: this.cache.currentProfile,
      builds: this.cache.builds,
      keys: this.cache.keys, // Current environment's keys
      aliases: this.cache.aliases,
      environment: this.cache.currentEnvironment
    }
  }

  /* ------------------------------------------------------------------
   * REFACTORED: Core key operations now use DataCoordinator
   * ------------------------------------------------------------------ */
  /** Add a new empty key row to the current profile */
  async addKey (keyName) {
    if (!await this.isValidKeyName(keyName)) {
      this.ui?.showToast?.(this.i18n?.t?.('invalid_key_name') || 'Invalid key name', 'error')
      return false
    }

    if (!this.cache.currentProfile) {
      this.ui?.showToast?.(this.i18n?.t?.('no_profile_selected') || 'No active profile', 'error')
      return false
    }

    // Check if key already exists in cache
    if (this.cache.keys[keyName]) {
      this.ui?.showToast?.(this.i18n?.t?.('key_already_exists', { keyName }) || 'Key already exists', 'warning')
      return false
    }

    try {
      // Add new key using explicit operations API
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        add: {
          builds: {
            [this.cache.currentEnvironment]: {
              keys: {
                [keyName]: []
              }
            }
          }
        }
      })

      this.selectedKey = keyName
      this.emit('key-added', { key: keyName })
      
      // Show success toast (legacy behavior from keyHandling.js)
      this.ui?.showToast?.(this.i18n?.t?.('key_added') || 'Key added', 'success')
      
      return true
    } catch (error) {
      console.error('[KeyService] Failed to add key:', error)
      this.ui?.showToast?.(this.i18n?.t?.('failed_to_add_key') || 'Failed to add key', 'error')
      return false
    }
  }

  /** Delete a key row from the current profile */
  async deleteKey (keyName) {
    if (!this.cache.currentProfile || !this.cache.keys[keyName]) {
      return false
    }

    try {
      // Delete key using explicit operations API
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        delete: {
          builds: {
            [this.cache.currentEnvironment]: {
              keys: [keyName]
            }
          }
        }
      })

      if (this.selectedKey === keyName) {
        this.selectedKey = null
      }

      this.emit('key-deleted', { key: keyName })
      return true
    } catch (error) {
      console.error('[KeyService] Failed to delete key:', error)
      return false
    }
  }

  /** Duplicate an existing key row (clone commands with new ids) */
  async duplicateKey (keyName) {
    if (!this.cache.currentProfile || !this.cache.keys[keyName]) {
      return false
    }

    const commands = this.cache.keys[keyName]
    if (!commands || commands.length === 0) {
      return false
    }

    try {
      // Generate unique new key name
      let newKeyName = `${keyName}_copy`
      let counter = 1
      while (this.cache.keys[newKeyName]) {
        newKeyName = `${keyName}_copy_${counter}`
        counter++
      }

      // Clone commands with new IDs
      const cloned = commands.map(cmd => ({ ...cmd, id: this.generateKeyId() }))

      // Add duplicated key using explicit operations API
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        add: {
          builds: {
            [this.cache.currentEnvironment]: {
              keys: {
                [newKeyName]: cloned
              }
            }
          }
        }
      })

      this.emit('key-duplicated', { from: keyName, to: newKeyName })
      return true
    } catch (error) {
      console.error('[KeyService] Failed to duplicate key:', error)
      return false
    }
  }

  /** Duplicate an existing key to an explicit new key name */
  async duplicateKeyWithName (sourceKey, newKey) {
    if (!sourceKey || !newKey) return false

    // Validate source exists
    if (!this.cache.keys[sourceKey]) return false

    // Validate new key name and not duplicate
    if (!await this.isValidKeyName(newKey)) return false
    if (this.cache.keys[newKey]) return false

    const commands = this.cache.keys[sourceKey]

    try {
      await this.request('data:update-profile', {
        profileId: this.cache.currentProfile,
        add: {
          builds: {
            [this.cache.currentEnvironment]: {
              keys: {
                [newKey]: JSON.parse(JSON.stringify(commands))
              }
            }
          }
        }
      })

      // Update local cache
      this.cache.keys[newKey] = JSON.parse(JSON.stringify(commands))
      this.emit('keys:changed', { keys: this.cache.keys })
      this.emit('key-duplicated', { from: sourceKey, to: newKey })
      return true
    } catch (error) {
      console.error('[KeyService] Failed to duplicate key with name:', error)
      return false
    }
  }

  /* ------------------------------------------------------------------
   * Validation helpers
   * ------------------------------------------------------------------ */
  async isValidKeyName (keyName) {
    if (!keyName || typeof keyName !== 'string') return false
    try {
      const pattern = await this.request('data:get-key-name-pattern') || /^[A-Za-z0-9_+]+$/
      return pattern.test(keyName) && keyName.length <= 20
    } catch (error) {
      // Fallback to default pattern if DataService not available
      return /^[A-Za-z0-9_+]+$/.test(keyName) && keyName.length <= 20
    }
  }

  // Alias validation used by unit tests
  async isValidAliasName (name) {
    try {
      const pattern = await this.request('data:get-alias-name-pattern') || /^[A-Za-z0-9_]+$/
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
   * Legacy lifecycle hooks (kept for compatibility)
   * ------------------------------------------------------------------ */
  onInit () {
    // Now handled by init() method
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
    // Use STOCommandParser directly - return new format
    return request(this.eventBus, 'parser:parse-command-string', { commandString })
      .then(result => result.commands)
  }

  /**
   * Parse keybind file content using FileOperationsService
   */
  parseKeybindFile (content) {
    // Delegate to FileOperationsService for authoritative implementation
    return request(this.eventBus, 'fileops:parse-keybind-file', { content })
  }

  /**
   * Import keybind file content using ImportService
   */
  importKeybindFile (content) {
    const profileId = this.currentProfile
    const environment = this.currentEnvironment || 'space'

    // Delegate to ImportService for complete import handling
    return request(this.eventBus, 'import:keybind-file', { 
      content, 
      profileId, 
      environment 
    })
  }

  /**
   * Import alias file using ImportService
   */
  importAliasFile (content) {
    const profileId = this.currentProfile

    // Delegate to ImportService for complete import handling
    return request(this.eventBus, 'import:alias-file', { 
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
        const category = cmdObj.category || cmdObj.type || 'unknown' // Support both new and legacy format
        // Count by category
        stats.commandTypes[category] = (stats.commandTypes[category] || 0) + 1
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
   * Detect the category of a command string (tray, communication, power, movement, camera, combat, targeting, system, custom).
   * Uses STOCommandParser directly for consistent, performance-optimized parsing.
   */
  async detectCommandType(command) {
    if (!command || typeof command !== 'string') return 'custom'

    try {
      // Use STOCommandParser directly for efficient command category detection
      const result = await this.request('parser:parse-command-string', { 
        commandString: command.trim(),
        options: { generateDisplayText: false } // Skip expensive display text generation
      })
      
      // Return the category from the first parsed command
      if (result.commands && result.commands.length > 0) {
        return result.commands[0].category || 'custom'
      }
    } catch (error) {
      console.warn('[KeyService] detectCommandType failed, falling back to custom:', error)
    }
    
    return 'custom'
  }

  /* ------------------------------------------------------------------
   * REFACTORED: Late-join state sharing using cached data
   * ------------------------------------------------------------------ */
  getCurrentState () {
    return {
      selectedKey: this.selectedKey,
      currentProfile: this.cache.currentProfile,
      currentEnvironment: this.cache.currentEnvironment,
      keys: this.getKeys()
    }
  }

  /**
   * Helper: return array of key names in current environment from cache.
   */
  getKeys () {
    return Object.keys(this.cache.keys)
  }

  handleInitialState (sender, state) {
    if (!state) return
    
    // Handle state from DataCoordinator via ComponentBase late-join
    if (sender === 'DataCoordinator' && state.currentProfileData) {
      const profile = state.currentProfileData
      this.cache.currentProfile = profile.id
      this.currentProfile = profile.id
      this.cache.currentEnvironment = profile.environment || 'space'
      this.currentEnvironment = this.cache.currentEnvironment
      
      this.updateCacheFromProfile(profile)
      this.emit('keys:changed', { keys: this.cache.keys })
      
      console.log(`[${this.componentName}] Received initial state from DataCoordinator`)
    }
    
    // Handle state from other KeyService instances
    if (sender === 'KeyService') {
      this.selectedKey = state.selectedKey ?? this.selectedKey
    }
  }
} 