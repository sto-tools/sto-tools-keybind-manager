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

    // REMOVED: Selection state now managed by SelectionService
    // this.selectedKey = null
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
      // REMOVED: key:get-selected now handled by SelectionService
      // this.respond('key:get-selected', () => this.selectedKey)
      // Note: key:select is handled by SelectionService
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
  // REMOVED: Selection state now managed by SelectionService
  // setSelectedKey (key) {
  //   this.selectedKey = key
  // }

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
        // KeyBrowserService receives updates via ComponentBase automatic caching
      }
    })

    this.addEventListener('profile:switched', ({ profileId, profile, environment }) => {
      this.cache.currentProfile = profileId
      this.currentProfile = profileId
      this.cache.currentEnvironment = environment || 'space'
      this.currentEnvironment = this.cache.currentEnvironment
      // REMOVED: Selection clearing now handled by SelectionService
      // this.selectedKey = null
      
      this.updateCacheFromProfile(profile)
      // KeyBrowserService receives updates via ComponentBase automatic caching
    })

    this.addEventListener('environment:changed', ({ environment }) => {
      if (environment) {
        this.cache.currentEnvironment = environment
        this.currentEnvironment = environment
        this.cache.keys = this.cache.builds[environment]?.keys || {}
        // KeyBrowserService already listens to environment:changed directly
      }
    })

    // Late-join support now handled by ComponentBase automatically

    // REMOVED: Legacy event compatibility now handled by SelectionService
    // this.addEventListener('key-selected', ({ key, name } = {}) => {
    //   this.selectedKey = key || name || null
    // })
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

      // CHANGED: Delegate selection to SelectionService
      await this.request('selection:select-key', { keyName, environment: this.cache.currentEnvironment })
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

      // SelectionService handles selection clearing automatically via key-deleted event
      this.emit('key-deleted', { keyName })
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
      // KeyBrowserService receives updates via ComponentBase automatic caching
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
      
      // Special case: if pattern is 'USE_STO_KEY_NAMES', use the STO key names list
      if (pattern === 'USE_STO_KEY_NAMES') {
        const { STO_KEY_NAMES } = await import('../../data/stoKeyNames.js')
        
        // Check for chord combinations (e.g., "ALT+`", "CTRL+Space")
        if (keyName.includes('+')) {
          return this.isValidChordCombination(keyName, STO_KEY_NAMES)
        }
        
        // Single key validation
        return STO_KEY_NAMES.includes(keyName) && keyName.length <= 20
      }
      
      return pattern.test(keyName) && keyName.length <= 20
    } catch (error) {
      // Fallback to default pattern if DataService not available
      return /^[A-Za-z0-9_+]+$/.test(keyName) && keyName.length <= 20
    }
  }

  /**
   * Validate chord combinations like "ALT+`", "CTRL+Space", etc.
   */
  isValidChordCombination(keyName, stoKeyNames) {
    const parts = keyName.split('+')
    
    // Must have at least 2 parts (modifier + key)
    if (parts.length < 2) {
      return false
    }
    
    // All parts must be valid STO key names (with case normalization)
    const validParts = parts.map(part => {
      const trimmedPart = part.trim()
      const normalizedPart = this.normalizeKeyName(trimmedPart, stoKeyNames)
      return stoKeyNames.includes(normalizedPart)
    })
    
    return validParts.every(valid => valid) && keyName.length <= 20
  }

  /**
   * Normalize key names to match STO_KEY_NAMES case conventions
   */
  normalizeKeyName(keyName, stoKeyNames) {
    // Create a case-insensitive lookup map
    const lowerCaseMap = new Map()
    stoKeyNames.forEach(stoKey => {
      lowerCaseMap.set(stoKey.toLowerCase(), stoKey)
    })
    
    // Try to find exact match first
    if (stoKeyNames.includes(keyName)) {
      return keyName
    }
    
    // Try case-insensitive match
    const lowerKey = keyName.toLowerCase()
    if (lowerCaseMap.has(lowerKey)) {
      return lowerCaseMap.get(lowerKey)
    }
    
    // Return original if no match found
    return keyName
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


  /* ------------------------------------------------------------------
   * Legacy validation helpers expected by unit-tests
   * ------------------------------------------------------------------ */





  /* ------------------------------------------------------------------
   * REFACTORED: Late-join state sharing using cached data
   * ------------------------------------------------------------------ */
  getCurrentState () {
    return {
      // REMOVED: selectedKey now managed by SelectionService
      // All state ownership transferred to appropriate services:
      // - Selection state: SelectionService
      // - Profile state: DataCoordinator
      // KeyService owns only key operations, not state
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
    
  }
} 