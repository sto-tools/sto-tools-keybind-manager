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
      this.respond('preferences:init', () => this.init())
      this.respond('preferences:load-settings', () => this.loadSettings())
      this.respond('preferences:save-settings', () => this.saveSettings())
      this.respond('preferences:get-settings', () => this.getSettings())
      this.respond('preferences:set-setting', ({ key, value }) => this.setSetting(key, value))
      this.respond('preferences:get-setting', ({ key }) => this.getSetting(key))
      this.respond('preferences:reset-settings', () => this.resetSettings())
      
      // Add i18n translation endpoint for UI components
      this.respond('i18n:translate', ({ key, params = {} }) => {
        if (this.i18n && this.i18n.t) {
          return this.i18n.t(key, params)
        }
        return key // Fallback to key if i18n not available
      })
    }

    // Set up event listeners for theme and language changes
    this.setupEventListeners()
  }

  /* --------------------------------------------------
   * Event Listeners
   * ------------------------------------------------ */
  setupEventListeners() {
    if (!this.eventBus) return

    // Listen for theme toggle events from HeaderMenuUI
    this.eventBus.on('theme:toggle', () => {
      this.toggleTheme()
    })

    // Listen for language change events from HeaderMenuUI
    this.eventBus.on('language:change', ({ language }) => {
      if (language) {
        this.changeLanguage(language)
      }
    })
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
    
    // Use documentElement for data-theme attribute (matches CSS)
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }

    this.updateThemeToggleButton(theme)
  }

  async applyLanguage() {
    const lang = this.settings.language || 'en'
    
    if (this.i18n && this.i18n.language !== lang) {
      await this.i18n.changeLanguage(lang)
    }

    // Apply translations to the document
    if (typeof window !== 'undefined' && typeof window.applyTranslations === 'function') {
      window.applyTranslations()
    }

    this.updateLanguageFlag(lang)
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

  /* --------------------------------------------------
   * Theme Management
   * ------------------------------------------------ */
  toggleTheme() {
    const currentTheme = this.settings.theme || 'default'
    const newTheme = currentTheme === 'dark' ? 'default' : 'dark'
    
    this.setSetting('theme', newTheme)
    
    // Show toast notification
    const themeName = newTheme === 'dark' ? 'Dark Mode' : 'Light Mode'
    if (this.i18n) {
      const message = this.i18n.t('switched_to_theme', { themeName }) || `Switched to ${themeName}`
      this.emit('toast:show', { message, type: 'success' })
    }
  }

  updateThemeToggleButton(theme) {
    if (typeof document === 'undefined') return
    
    const themeToggleBtn = document.getElementById('themeToggleBtn')
    const themeToggleText = document.getElementById('themeToggleText')
    const themeIcon = themeToggleBtn?.querySelector('i')

    if (themeToggleBtn && themeToggleText && themeIcon) {
      if (theme === 'dark') {
        themeIcon.className = 'fas fa-sun'
        themeToggleText.setAttribute('data-i18n', 'light_mode')
        themeToggleText.textContent = this.i18n?.t('light_mode') || 'Light Mode'
      } else {
        themeIcon.className = 'fas fa-moon'
        themeToggleText.setAttribute('data-i18n', 'dark_mode')
        themeToggleText.textContent = this.i18n?.t('dark_mode') || 'Dark Mode'
      }
    }
  }

  /* --------------------------------------------------
   * Language Management
   * ------------------------------------------------ */
  async changeLanguage(lang) {
    // Update settings
    this.setSetting('language', lang)

    // Re-localize command data with new language
    if (typeof window !== 'undefined' && window.localizeCommandData) {
      window.localizeCommandData()
    }

    // Emit event for other components to re-render with new language
    this.emit('language:changed', { language: lang })

    // Show toast notification
    if (this.i18n) {
      const message = this.i18n.t('language_updated') || 'Language updated'
      this.emit('toast:show', { message, type: 'success' })
    }
  }

  updateLanguageFlag(lang) {
    if (typeof document === 'undefined') return
    
    const flag = document.getElementById('languageFlag')
    const flagClasses = { 
      en: 'fi fi-gb', 
      de: 'fi fi-de', 
      es: 'fi fi-es', 
      fr: 'fi fi-fr' 
    }
    
    if (flag) {
      flag.className = flagClasses[lang] || 'fi fi-gb'
    }
  }

  /* --------------------------------------------------
   * Browser Language Detection
   * ------------------------------------------------ */
  detectBrowserLanguage() {
    try {
      if (typeof navigator === 'undefined') return 'en'
      const cand = (navigator.languages && navigator.languages[0]) || navigator.language
      if (!cand) return 'en'
      const lang = cand.toLowerCase().split(/[-_]/)[0]
      return ['en', 'de', 'es', 'fr'].includes(lang) ? lang : 'en'
    } catch (error) {
      console.error('Error detecting browser language:', error)
      return 'en'
    }
  }
} 