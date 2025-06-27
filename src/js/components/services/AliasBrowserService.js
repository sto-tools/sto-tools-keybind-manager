import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import i18next from 'i18next'
import { respond } from '../../core/requestResponse.js'

/**
 * AliasBrowserService – source-of-truth for alias CRUD & selection.
 * It wraps the existing alias logic but exposes a clean, event-driven API.
 */
export default class AliasBrowserService extends ComponentBase {
  constructor ({ storage, ui } = {}) {
    super(eventBus)
    this.componentName = 'AliasBrowserService'
    this.storage = storage
    this.ui      = ui

    this.currentProfileId   = null
    this.currentEnvironment = 'space'
    this.selectedAliasName  = null

    // Selection caching for environment switches
    this._cachedAliasSelection = null

    // ---------------------------------------------------------
    // Register Request/Response endpoints for alias operations
    // ---------------------------------------------------------
    if (this.eventBus) {
      respond(this.eventBus, 'alias:get-all',           () => this.getAliases())
      respond(this.eventBus, 'alias:select',            ({ name }) => this.selectAlias(name))
    }
  }

  onInit () {
    // Determine initial profile id from storage (if available)
    const data = this.storage ? this.storage.getAllData() : null
    if (data && data.currentProfile) {
      this.currentProfileId = data.currentProfile
      
      // Also get the current environment from the profile
      const profile = this.storage.getProfile(data.currentProfile)
      if (profile && profile.currentEnvironment) {
        this.currentEnvironment = profile.currentEnvironment
      }
    }

    this.setupEventListeners()
  }

  setupEventListeners () {
    // Listen for profile switched events from ProfileService
    this.addEventListener('profile-switched', ({ profileId, environment }) => {
      this.currentProfileId  = profileId
      if (environment) this.currentEnvironment = environment
      this.selectedAliasName = null
      // Clear cached selection when profile changes
      this._cachedAliasSelection = null
      const aliases = this.getAliases()
      this.emit('aliases-changed', { aliases })

      // Auto-select first alias if we are in alias mode and none is selected
      if (this.currentEnvironment === 'alias' && !this.selectedAliasName) {
        const names = Object.keys(aliases)
        if (names.length) this.selectAlias(names[0])
      }
    })

    // Listen for environment changes
    this.addEventListener('environment:changed', (payload) => {
      const env = typeof payload === 'string' ? payload : payload?.environment
      if (env) {
        // Cache current selection before changing environment (only when leaving alias mode)
        if (this.currentEnvironment === 'alias' && this.selectedAliasName) {
          this._cachedAliasSelection = this.selectedAliasName
        }
        
        this.currentEnvironment = env
        
        // If switched into alias mode, restore cached or auto-select immediately
        if (env === 'alias') {
          this._restoreOrAutoSelectAlias()
        }
      }
    })



    // Back-compat: also accept legacy topic if emitted elsewhere
    this.addEventListener('profile:changed', (profileId) => {
      this.currentProfileId  = profileId
      this.selectedAliasName = null
      // Clear cached selection when profile changes
      this._cachedAliasSelection = null
      this.emit('aliases-changed', { aliases: this.getAliases() })
    })
  }

  /* ============================================================
   * Selection caching and auto-selection
   * ========================================================== */
  
  /**
   * Restore cached selection or auto-select first alias
   */
  _restoreOrAutoSelectAlias() {
    // Try to restore cached selection first
    if (this._cachedAliasSelection) {
      const aliases = this.getAliases()
      if (aliases[this._cachedAliasSelection]) {
        this.selectAlias(this._cachedAliasSelection)
        return
      }
    }
    
    // Auto-select first alias if none selected and aliases exist
    if (!this.selectedAliasName) {
      const names = Object.keys(this.getAliases())
      if (names.length > 0) {
        // Sort names to ensure consistent first selection
        names.sort()
        this.selectAlias(names[0])
      }
    }
  }

  /* ============================================================
   * Data helpers
   * ========================================================== */
  getProfile () {
    if (!this.currentProfileId) return null
    return this.storage.getProfile(this.currentProfileId)
  }

  getAliases () {
    const profile = this.getProfile()
    return (profile && profile.aliases) ? profile.aliases : {}
  }

  selectAlias (name) {
    this.selectedAliasName = name
    this.emit('alias-selected', { name })
  }

  createAlias (name, description = '') {
    const profile = this.getProfile()
    if (!profile) return false

    if (!profile.aliases) profile.aliases = {}

    if (profile.aliases[name]) {
      this.ui && this.ui.showToast(i18next.t('alias_already_exists', { name }), 'error')
      return false
    }

    profile.aliases[name] = { description, commands: '' }
    this.storage.saveProfile(this.currentProfileId, profile)
    this.emit('aliases-changed', { aliases: this.getAliases() })
    this.selectAlias(name)
    return true
  }

  deleteAlias (name) {
    const profile = this.getProfile()
    if (!profile || !profile.aliases || !profile.aliases[name]) return false
    delete profile.aliases[name]
    this.storage.saveProfile(this.currentProfileId, profile)
    if (this.selectedAliasName === name) this.selectedAliasName = null
    this.emit('aliases-changed', { aliases: this.getAliases() })
    return true
  }

  duplicateAlias (name) {
    const profile = this.getProfile()
    if (!profile || !profile.aliases || !profile.aliases[name]) return false

    const original = profile.aliases[name]
    let newName = name + '_copy'
    let counter = 1
    while (profile.aliases[newName]) {
      newName = `${name}_copy${counter++}`
    }

    profile.aliases[newName] = {
      description: original.description + ' (copy)',
      commands: original.commands,
    }
    this.storage.saveProfile(this.currentProfileId, profile)
    this.emit('aliases-changed', { aliases: this.getAliases() })
    this.selectAlias(newName)
    return true
  }
} 