import ComponentBase from '../ComponentBase.js'

/**
 * HeaderMenuUI - Handles header dropdown menu interactions
 * Manages import, backup, language, and settings menu toggles and interactions
 */
export default class HeaderMenuUI extends ComponentBase {
  constructor({ eventBus, document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(eventBus)
    this.componentName = 'HeaderMenuUI'
    this.document = document
  }

  onInit() {
    this.setupEventListeners()
  }

  setupEventListeners() {
    if (this.eventListenersSetup) {
      return
    }
    this.eventListenersSetup = true

    // Header menu toggles - using correct button IDs from HTML
    this.eventBus.onDom('settingsBtn', 'click', 'settings-toggle', () => {
      this.toggleSettingsMenu()
    })

    this.eventBus.onDom('importMenuBtn', 'click', 'import-toggle', () => {
      this.toggleImportMenu()
    })

    this.eventBus.onDom('backupMenuBtn', 'click', 'backup-toggle', () => {
      this.toggleBackupMenu()
    })

    this.eventBus.onDom('languageMenuBtn', 'click', 'language-toggle', () => {
      this.toggleLanguageMenu()
    })

    // VFX Button (could be moved to VFXManagerUI if preferred)
    this.eventBus.onDom('vertigoBtn', 'click', 'vfx-open', () => {
      this.eventBus.emit('vfx:show-modal')
    })

    // File Explorer Button
    this.eventBus.onDom('fileExplorerBtn', 'click', 'file-explorer-open', () => {
      this.eventBus.emit('file-explorer:open')
    })

    // Sync Now Button
    this.eventBus.onDom('syncNowBtn', 'click', 'sync-now', () => {
      this.eventBus.emit('sync:sync-now')
    })

    // Settings menu items
    this.eventBus.onDom('preferencesBtn', 'click', 'preferences-open', () => {
      this.eventBus.emit('preferences:show')
    })

    this.eventBus.onDom('aboutBtn', 'click', 'about-open', () => {
      this.eventBus.emit('about:show')
    })

    // Close all menus when clicking outside
    this.document.addEventListener('click', (e) => {
      if (!e.target.closest('.dropdown')) {
        this.document.querySelectorAll('.dropdown.active').forEach(dropdown => {
          dropdown.classList.remove('active')
        })
      }
    })

    // File operations
    this.eventBus.onDom('openProjectBtn', 'click', 'project-open', () => {
      this.eventBus.emit('project:open')
    })

    this.eventBus.onDom('saveProjectBtn', 'click', 'project-save', () => {
      this.eventBus.emit('project:save')
    })

    this.eventBus.onDom('exportKeybindsBtn', 'click', 'keybinds-export', () => {
      this.eventBus.emit('keybinds:export')
    })

    // Menu-specific operations
    this.eventBus.onDom('importKeybindsBtn', 'click', 'keybinds-import', () => {
      this.eventBus.emit('keybinds:import')
    })

    this.eventBus.onDom('importAliasesBtn', 'click', 'aliases-import', () => {
      this.eventBus.emit('aliases:import')
    })

    this.eventBus.onDom('loadDefaultDataBtn', 'click', 'data-load-default', () => {
      this.eventBus.emit('data:load-default')
    })

    this.eventBus.onDom('resetAppBtn', 'click', 'app-reset', () => {
      this.confirmResetApp()
    })

    // Language selection
    this.document.querySelectorAll('[data-lang]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const lang = e.target.getAttribute('data-lang')
        if (lang) {
          this.eventBus.emit('language:change', { language: lang })
        }
      })
    })

    // Theme toggle
    this.eventBus.onDom('themeToggleBtn', 'click', 'theme-toggle', () => {
      this.eventBus.emit('theme:toggle')
    })
  }

  /**
   * Toggle the settings menu dropdown
   */
  toggleSettingsMenu() {
    this.toggleDropdown('settingsBtn')
  }

  /**
   * Toggle the import menu dropdown
   */
  toggleImportMenu() {
    this.toggleDropdown('importMenuBtn')
  }

  /**
   * Toggle the backup menu dropdown
   */
  toggleBackupMenu() {
    this.toggleDropdown('backupMenuBtn')
  }

  /**
   * Toggle the language menu dropdown
   */
  toggleLanguageMenu() {
    this.toggleDropdown('languageMenuBtn')
  }

  /**
   * Generic dropdown toggle helper
   */
  toggleDropdown(buttonId) {
    const button = this.document.getElementById(buttonId)
    if (!button) return

    const dropdown = button.closest('.dropdown')
    if (!dropdown) return

    // Close other dropdowns
    this.document.querySelectorAll('.dropdown.active').forEach(other => {
      if (other !== dropdown) {
        other.classList.remove('active')
      }
    })

    // Toggle this dropdown
    dropdown.classList.toggle('active')
  }

  /**
   * Close all dropdowns
   */
  closeAllMenus() {
    this.document.querySelectorAll('.dropdown.active').forEach(dropdown => {
      dropdown.classList.remove('active')
    })
  }

  /**
   * Confirm app reset with user
   */
  async confirmResetApp() {
    const message = 'Are you sure you want to reset the application? This will clear all profiles and data.'
    if (confirm(message)) {
      this.eventBus.emit('app:reset-confirmed')
    }
  }
} 