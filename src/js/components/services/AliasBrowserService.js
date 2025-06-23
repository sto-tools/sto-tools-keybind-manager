import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import i18next from 'i18next'

/**
 * AliasBrowserService – source-of-truth for alias CRUD & selection.
 * It wraps the existing alias logic but exposes a clean, event-driven API.
 */
export default class AliasBrowserService extends ComponentBase {
  constructor ({ storage, ui } = {}) {
    super(eventBus)
    this.storage = storage
    this.ui      = ui

    this.currentProfileId   = null
    this.selectedAliasName  = null
  }

  onInit () {
    // Determine initial profile id from storage (if available)
    const data = this.storage ? this.storage.getAllData() : null
    if (data && data.currentProfile) {
      this.currentProfileId = data.currentProfile
    }

    this.setupEventListeners()
  }

  setupEventListeners () {
    // Listen for profile switched events from ProfileService
    this.addEventListener('profile-switched', ({ profileId }) => {
      this.currentProfileId  = profileId
      this.selectedAliasName = null
      this.emit('aliases:changed', { aliases: this.getAliases() })
    })

    // Back-compat: also accept legacy topic if emitted elsewhere
    this.addEventListener('profile:changed', (profileId) => {
      this.currentProfileId  = profileId
      this.selectedAliasName = null
      this.emit('aliases:changed', { aliases: this.getAliases() })
    })
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
    this.emit('alias:selected', { name })
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
    this.emit('aliases:changed', { aliases: this.getAliases() })
    this.selectAlias(name)
    return true
  }

  deleteAlias (name) {
    const profile = this.getProfile()
    if (!profile || !profile.aliases || !profile.aliases[name]) return false
    delete profile.aliases[name]
    this.storage.saveProfile(this.currentProfileId, profile)
    if (this.selectedAliasName === name) this.selectedAliasName = null
    this.emit('aliases:changed', { aliases: this.getAliases() })
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
    this.emit('aliases:changed', { aliases: this.getAliases() })
    this.selectAlias(newName)
    return true
  }
} 