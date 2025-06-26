import ComponentBase from '../ComponentBase.js'
import { respond } from '../../core/requestResponse.js'
import i18next from 'i18next'

/**
 * PreferencesService – persistent user settings (theme, language, etc.)
 * Pure logic / no DOM querying.  UI interactions live in PreferencesUI.
 */
export default class PreferencesService extends ComponentBase {
  constructor({ storage, eventBus, i18n = i18next } = {}) {
    super(eventBus) 
    this.componentName = 'PreferencesService'
    this.storage = storage
    this.i18n = i18n

    // Defaults match historical STOPreferencesManager
    this.defaultSettings = {
      theme: 'default',
      autoSave: true,
      showTooltips: true,
      confirmDeletes: true,
      maxUndoSteps: 50,
      defaultMode: 'space',
      compactView: false,
      language: 'en',
      syncFolderName: null,
      syncFolderPath: null,
      autoSync: false,
      autoSyncInterval: 'change',
    }

    // Runtime copy
    this.settings = { ...this.defaultSettings }

    // ---------------------------------------------------------
    // Register Request/Response endpoints for UI components
    // ---------------------------------------------------------
    if (this.eventBus) {
      respond(this.eventBus, 'preferences:init', () => this.init())
      respond(this.eventBus, 'preferences:load-settings', () => this.loadSettings())
      respond(this.eventBus, 'preferences:save-settings', () => this.saveSettings())
      respond(this.eventBus, 'preferences:get-settings', () => this.getSettings())
      respond(this.eventBus, 'preferences:set-setting', ({ key, value }) => this.setSetting(key, value))
      respond(this.eventBus, 'preferences:get-setting', ({ key }) => this.getSetting(key))
      respond(this.eventBus, 'preferences:reset-settings', () => this.resetSettings())
    }
  }

  /* --------------------------------------------------
   * Lifecycle
   * ------------------------------------------------ */
  init() {
    this.loadSettings()
    this.applySettings()
  }

  /* --------------------------------------------------
   * Persistence helpers
   * ------------------------------------------------ */
  loadSettings() {
    try {
      if (!this.storage) return
      const stored = this.storage.getSettings()
      this.settings = { ...this.defaultSettings, ...stored }
      this.emit('preferences:loaded', { settings: this.getSettings() })
    } catch (err) {
      console.error('[PreferencesService] loadSettings failed', err)
      this.settings = { ...this.defaultSettings }
    }
  }

  saveSettings() {
    if (!this.storage) return false
    const ok = this.storage.saveSettings(this.settings)
    if (ok) this.emit('preferences:saved', { settings: this.getSettings() })
    return ok
  }

  /* --------------------------------------------------
   * Accessors
   * ------------------------------------------------ */
  getSettings() { return { ...this.settings } }

  getSetting(key) { return this.settings[key] }

  setSetting(key, value) {
    this.settings[key] = value
    this.saveSettings()
    this.applySettings()
    this.emit('preferences:changed', { key, value })
  }

  setSettings(newSettings = {}) {
    this.settings = { ...this.defaultSettings, ...newSettings }
    this.saveSettings()
    this.applySettings()
  }

  resetSettings() {
    this.settings = { ...this.defaultSettings }
    this.saveSettings()
    this.applySettings()
  }

  /* --------------------------------------------------
   * Application of settings
   * ------------------------------------------------ */
  applySettings() {
    this.applyTheme()
    this.applyLanguage()
    this.applyOtherSettings()
  }

  applyTheme() {
    if (typeof document === 'undefined') return
    const theme = this.settings.theme || 'default'
    document.body.className = document.body.className.replace(/theme-\w+/g, '')
    document.body.classList.add(`theme-${theme}`)
  }

  applyLanguage() {
    const lang = this.settings.language || 'en'
    if (this.i18n && this.i18n.language !== lang) {
      this.i18n.changeLanguage(lang)
    }
  }

  applyOtherSettings() {
    // Compact view flag toggles a body class
    if (typeof document !== 'undefined') {
      if (this.settings.compactView) {
        document.body.classList.add('compact-view')
      } else {
        document.body.classList.remove('compact-view')
      }
    }

    // Propagate to global app instance if present
    if (typeof window !== 'undefined' && window.app) {
      const app = window.app
      if ('autoSave' in app) app.autoSave = this.settings.autoSave
      if ('maxUndoSteps' in app) app.maxUndoSteps = this.settings.maxUndoSteps
    }
  }
} 