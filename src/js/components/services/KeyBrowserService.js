import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'

/**
 * KeyBrowserService – source-of-truth for the key grid.
 * Keeps track of the active profile/environment and exposes
 * helpers for retrieving keybind data as well as selecting keys
 * in a decoupled, event-driven manner.
 */
export default class KeyBrowserService extends ComponentBase {
  constructor ({ storage, profileService, ui } = {}) {
    super(eventBus)
    this.storage        = storage
    this.profileService = profileService || null
    this.ui             = ui

    this.currentProfileId   = null
    this.currentEnvironment = 'space'
    this.selectedKeyName    = null
  }

  /* ============================================================
   * Lifecycle
   * ========================================================== */
  onInit () {
    // Determine initial profile/environment.
    if (this.profileService) {
      this.currentProfileId   = this.profileService.getCurrentProfileId?.() || null
      this.currentEnvironment = this.profileService.getCurrentEnvironment?.() || 'space'
    } else if (this.storage) {
      const data = this.storage.getAllData?.()
      if (data) {
        this.currentProfileId = data.currentProfile
      }
    }

    // Listen for profile/environment changes
    this.setupEventListeners()
  }

  setupEventListeners () {
    // Profile switched (new modular event)
    this.addEventListener('profile-switched', ({ profileId, environment }) => {
      this.currentProfileId   = profileId
      if (environment) this.currentEnvironment = environment
      this.selectedKeyName = null
      this.emit('keys-changed', { keys: this.getKeys() })
    })

    // Environment changed (legacy helper)
    this.addEventListener('environment-changed', (env) => {
      this.currentEnvironment = env
      this.emit('keys-changed', { keys: this.getKeys() })
    })

    // Data modifications
    this.addEventListener('profile-modified', () => {
      this.emit('keys-changed', { keys: this.getKeys() })
    })
  }

  /* ============================================================
   * Data helpers
   * ========================================================== */
  getProfile () {
    if (!this.currentProfileId) return null
    return this.storage.getProfile(this.currentProfileId)
  }

  getKeys () {
    const profile = this.getProfile()
    if (!profile) return {}

    const builds = profile.builds || {}
    const build  = builds[this.currentEnvironment] || {}
    return build.keys || {}
  }

  /* ============================================================
   * Selection helpers
   * ========================================================== */
  selectKey (name) {
    if (this.selectedKeyName === name) return
    this.selectedKeyName = name

    // Forward to legacy keySelection mechanism if available
    if (typeof window.keyHandling?.selectKey === 'function') {
      window.keyHandling.selectKey(name)
    }

    this.emit('key-selected', { name })
  }
} 