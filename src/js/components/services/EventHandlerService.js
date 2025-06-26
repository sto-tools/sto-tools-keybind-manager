import ComponentBase from '../ComponentBase.js'

/**
 * EventHandlerService - Handles all application event listeners and UI interactions
 * Manages DOM event listeners, modal interactions, and application-wide event handling
 */
export default class EventHandlerService extends ComponentBase {
  constructor({ eventBus, storage, ui, modalManager, i18n, app }) {
    super(eventBus)
    this.componentName = 'EventHandlerService'
    this.storage = storage
    this.ui = ui
    this.modalManager = modalManager
    this.i18n = i18n
    this.app = app
    
    // Internal state tracking
    this._ehListenersSetup = false
    this._modeToggleHandlerAdded = false
    this.languageListenersSetup = false
    this.vertigoInitialState = null
    this.vertigoSaving = false
  }

  /**
   * Initialize event handlers
   */
  init() {
    super.init()
    this.initEventHandlers()
  }

  /**
   * Initialize all event handlers
   */
  initEventHandlers() {
    // Ensure the DOM is fully parsed before we attempt to query for buttons.
    // If we run too early the mode-toggle elements won't exist and listeners
    // will never attach (then getEventListeners() → undefined).
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.setupEventListeners()
        // Ensure mode toggle listeners are attached once real buttons exist
        this.registerModeToggleHandler()
      }, { once: true })
    } else {
      this.setupEventListeners()
      this.registerModeToggleHandler()
    }
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    const spaceBtnCheck = document.querySelector('[data-mode="space"]')
    const groundBtnCheck = document.querySelector('[data-mode="ground"]')
    const aliasBtnCheck = document.querySelector('[data-mode="alias"]')
    // Prevent double-registration in case initEventHandlers() fires twice
    if (this._ehListenersSetup) return
    this._ehListenersSetup = true
 
    // Check if key elements exist
    const vertigoBtn = document.getElementById('vertigoBtn')
    const settingsBtn = document.getElementById('settingsBtn')

    // Profile management events
    this.eventBus.on('profile:create', (data) => {
      this.handleProfileCreate(data)
    })

    this.eventBus.on('profile:switch', (data) => {
      this.handleProfileSwitch(data)
    })

    this.eventBus.on('profile:delete', (data) => {
      this.handleProfileDelete(data)
    })

    // Keybind management events
    this.eventBus.on('keybind:add', (data) => {
      this.handleKeybindAdd(data)
    })

    this.eventBus.on('keybind:edit', (data) => {
      this.handleKeybindEdit(data)
    })

    this.eventBus.on('keybind:delete', (data) => {
      this.handleKeybindDelete(data)
    })

    // Command management events
    this.eventBus.on('command:add', (data) => {
      this.handleCommandAdd(data)
    })

    this.eventBus.on('command:edit', (data) => {
      this.handleCommandEdit(data)
    })

    this.eventBus.on('command:delete', (data) => {
      this.handleCommandDelete(data)
    })

    // Profile management
    const profileSelect = document.getElementById('profileSelect')
    profileSelect?.addEventListener('change', (e) => {
      this.switchProfile(e.target.value)
    })

    // Mode switching - set up event handlers with proper context binding
    const setupModeButtonHandlers = () => {
      const modeToggleContainer = document.querySelector('.mode-toggle')
      if (!modeToggleContainer) {
        console.warn('[EventHandlerService] .mode-toggle container not found - mode buttons will not function')
        return
      }

      // Ensure we only register once per session to avoid duplicate handlers
      if (this._modeToggleHandlerAdded) {
        return
      }
      this._modeToggleHandlerAdded = true

      // Delegate all click events from the container so that dynamically re-rendered
      // buttons (e.g. after language changes) continue to work without requiring
      // us to re-bind individual listeners.
      modeToggleContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mode]')
        if (!btn || btn.disabled) return

        const mode = btn.getAttribute('data-mode')
        if (!mode) return

        e.stopPropagation()
        e.preventDefault()

        try {
          this.switchMode(mode)
        } catch (error) {
          console.error('[EventHandlerService] Error calling switchMode:', error)
        }
      })
    }

    // Set up mode button handlers immediately since DOM should be ready
    try {
      setupModeButtonHandlers.call(this)
    } catch (error) {
      console.error('[EventHandlerService] Error setting up mode button handlers:', error)
    }

    // File operations
    this.eventBus.onDom('openProjectBtn', 'click', 'project-open', () => {
      this.openProject()
    })

    this.eventBus.onDom('saveProjectBtn', 'click', 'project-save', () => {
      this.saveProject()
    })

    this.eventBus.onDom('exportKeybindsBtn', 'click', 'keybinds-export', () => {
      this.exportKeybinds()
    })

    // Vertigo VFX manager
    const vertigoBtnCheck = document.getElementById('vertigoBtn')
    this.eventBus.onDom('vertigoBtn', 'click', 'vertigo-open', () => {
      this.showVertigoModal()
    })

    // Key management
    this.eventBus.onDom('addKeyBtn', 'click', 'key-add', () => {
      this.showKeySelectionModal()
    })

    this.eventBus.onDom('deleteKeyBtn', 'click', 'key-delete', () => {
      if (this.selectedKey) {
        this.confirmDeleteKey(this.selectedKey)
      }
    })

    this.eventBus.onDom('duplicateKeyBtn', 'click', 'key-duplicate', () => {
      if (this.selectedKey) {
        this.duplicateKey(this.selectedKey)
      }
    })

    // Alias chain management
    this.eventBus.onDom('addAliasChainBtn', 'click', 'alias-chain-add', () => {
      this.showAliasCreationModal()
    })

    this.eventBus.onDom('deleteAliasChainBtn', 'click', 'alias-chain-delete', () => {
      if (this.selectedKey && this.currentEnvironment === 'alias') {
        this.confirmDeleteAlias(this.selectedKey)
      }
    })

    this.eventBus.onDom('duplicateAliasChainBtn', 'click', 'alias-chain-duplicate', () => {
      if (this.selectedKey && this.currentEnvironment === 'alias') {
        this.duplicateAlias(this.selectedKey)
      }
    })

    // Command management
    this.eventBus.onDom('addCommandBtn', 'click', 'command-add', () => {
      this.modalManager.show('addCommandModal')
    })

    this.eventBus.onDom('clearChainBtn', 'click', 'command-chain-clear', () => {
      if (this.selectedKey) {
        this.confirmClearChain(this.selectedKey)
      }
    })

    this.eventBus.onDom(
      'validateChainBtn',
      'click',
      'command-chain-validate',
      () => {
        this.validateCurrentChain()
      }
    )

    // Stabilization checkbox
    this.eventBus.onDom(
      'stabilizeExecutionOrder',
      'change',
      'stabilize-change',
      (e) => {
        // Persist stabilization flag to stored profile (environment-scoped)
        if (this.selectedKey) {
          const env = this.currentEnvironment
          const storedProfile = this.storage.getProfile(this.currentProfile)
          if (storedProfile) {
            if (!storedProfile.keybindMetadata) {
              storedProfile.keybindMetadata = {}
            }
            if (!storedProfile.keybindMetadata[env]) {
              storedProfile.keybindMetadata[env] = {}
            }
            if (!storedProfile.keybindMetadata[env][this.selectedKey]) {
              storedProfile.keybindMetadata[env][this.selectedKey] = {}
            }
            storedProfile.keybindMetadata[env][
              this.selectedKey
            ].stabilizeExecutionOrder = e.target.checked

            // Save immediately and mark modified
            this.storage.saveProfile(this.currentProfile, storedProfile)
            this.setModified(true)
          }
        }
        this.renderCommandChain() // Update preview when checkbox changes
      }
    )

    // Search and filter
    this.eventBus.onDom('keyFilter', 'input', 'key-filter', (e) => {
      this.filterKeys(e.target.value)
    })

    this.eventBus.onDom('commandSearch', 'input', 'command-search', (e) => {
      this.filterCommands(e.target.value)
    })

    this.eventBus.onDom('showAllKeysBtn', 'click', 'show-all-keys', () => {
      this.showAllKeys()
    })

    // Key view toggle
    this.eventBus.onDom('toggleKeyViewBtn', 'click', 'toggle-key-view', () => {
      this.toggleKeyView()
    })

    // Library toggle
    this.eventBus.onDom('toggleLibraryBtn', 'click', 'toggle-library', () => {
      this.toggleLibrary()
    })

    // Alias options multiselect dropdown
    this.eventBus.onDom('aliasOptionsDropdown', 'click', 'alias-options-toggle', (e) => {
      e.stopPropagation()
      this.toggleAliasOptionsDropdown()
    })

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('aliasOptionsDropdown')
      const menu = document.getElementById('aliasOptionsMenu')
      if (dropdown && menu && !dropdown.contains(e.target) && !menu.contains(e.target)) {
        this.closeAliasOptionsDropdown()
      }
    })

    // Handle checkbox changes in alias options
    const aliasCheckboxes = ['aliasStabilizeOption', 'aliasToggleOption', 'aliasCycleOption']
    aliasCheckboxes.forEach(id => {
      this.eventBus.onDom(id, 'change', `alias-option-${id}`, () => {
        this.updateAliasOptionsLabel()
      })
    })

    // Modal handlers
    this.setupModalHandlers()

    // Auto-save
    setInterval(() => {
      if (this.isModified) {
        this.saveData()
      }
    }, 30000) // Auto-save every 30 seconds

    // Stabilize execution order toolbar button
    this.eventBus.onDom('stabilizeExecutionOrderBtn', 'click', 'stabilize-toggle', (e) => {
      const btn = e.target.closest('.toolbar-btn')
      const checkbox = document.getElementById('stabilizeExecutionOrder')

      // Toggle the hidden checkbox
      checkbox.checked = !checkbox.checked

      // Update button visual state
      btn.classList.toggle('active', checkbox.checked)

      // Trigger the existing change event
      checkbox.dispatchEvent(new Event('change'))
    })

    // Alias options toolbar button
    this.eventBus.onDom('aliasOptionsBtn', 'click', 'alias-options-toggle', (e) => {
      const btn = e.target.closest('.toolbar-btn')
      const optionsDiv = document.getElementById('aliasOptions')

      // Toggle visibility
      const isVisible = optionsDiv.style.display !== 'none'
      optionsDiv.style.display = isVisible ? 'none' : 'block'

      // Update button visual state
      btn.classList.toggle('active', !isVisible)
    })

    // Expandable search functionality
    this.setupExpandableSearch('keySearchBtn', 'keyFilter')
    this.setupExpandableSearch('aliasSearchBtn', 'aliasFilter')
    this.setupExpandableSearch('commandSearchBtn', 'commandSearch')

    // Global UI event listeners
    this.setupGlobalUIEventListeners()
  }

  /**
   * Setup global UI event listeners
   */
  setupGlobalUIEventListeners() {
    // Settings dropdown
    this.eventBus.onDom('settingsBtn', 'click', 'settings-menu', (e) => {
      e.stopPropagation()
      this.toggleSettingsMenu()
    })

    // Import dropdown
    this.eventBus.onDom('importMenuBtn', 'click', 'import-menu', (e) => {
      e.stopPropagation()
      this.toggleImportMenu()
    })

    // Backup dropdown
    this.eventBus.onDom('backupMenuBtn', 'click', 'backup-menu', (e) => {
      e.stopPropagation()
      this.toggleBackupMenu()
    })

    // Language dropdown
    this.eventBus.onDom('languageMenuBtn', 'click', 'language-menu', (e) => {
      e.stopPropagation()
      this.toggleLanguageMenu()
    })

    // Import menu items
    this.eventBus.onDom('importKeybindsBtn', 'click', 'keybinds-import', () => {
      this.importKeybinds()
      this.closeImportMenu()
    })

    this.eventBus.onDom('importAliasesBtn', 'click', 'aliases-import', () => {
      this.importAliases()
      this.closeImportMenu()
    })

    // Settings menu items
    this.eventBus.onDom('loadDefaultDataBtn', 'click', 'load-default-data', () => {
      this.loadDefaultData()
      this.closeSettingsMenu()
    })

    this.eventBus.onDom('resetAppBtn', 'click', 'reset-app', () => {
      this.confirmResetApp()
      this.closeSettingsMenu()
    })

    this.eventBus.onDom('syncNowBtn', 'click', 'sync-now', () => {
      if (typeof stoSync !== 'undefined') {
        stoSync.syncProject()
      }
      this.closeSettingsMenu()
    })

    this.eventBus.onDom('aboutBtn', 'click', 'about-open', () => {
      this.modalManager.show('aboutModal')
    })

    this.eventBus.onDom('themeToggleBtn', 'click', 'theme-toggle', () => {
      this.toggleTheme()
      this.closeSettingsMenu()
    })

    this.eventBus.onDom('preferencesBtn', 'click', 'preferences-open', () => {
      if (this.preferencesManager) {
        this.preferencesManager.showPreferences()
      } else {
        // Fallback to old modal if preferences manager not available
        this.modalManager.show('preferencesModal')
      }
      this.closeSettingsMenu()
    })

    // Setup language option event listeners
    this.setupLanguageListeners()

    // Close dropdown menus when clicking outside
    document.addEventListener('click', () => {
      // Close all dropdowns by removing active class
      document.querySelectorAll('.dropdown.active').forEach(dropdown => {
        dropdown.classList.remove('active')
      })
    })
  }

  /**
   * Setup language listeners
   */
  setupLanguageListeners() {
    if (this.languageListenersSetup) return

    const languageOptions = document.querySelectorAll('.language-option')
    if (languageOptions.length > 0) {
      languageOptions.forEach((btn) => {
        this.eventBus.onDom(btn, 'click', 'language-change', (e) => {
          const lang = e.currentTarget.dataset.lang
          if (lang) {
            this.changeLanguage(lang)
          }
          this.closeLanguageMenu()
        })
      })
      this.languageListenersSetup = true
    } else {
      // Retry after a short delay in case DOM is still loading
      setTimeout(() => {
        if (!this.languageListenersSetup) {
          const retryOptions = document.querySelectorAll('.language-option')
          if (retryOptions.length > 0) {
            retryOptions.forEach((btn) => {
              this.eventBus.onDom(btn, 'click', 'language-change', (e) => {
                const lang = e.currentTarget.dataset.lang
                if (lang) {
                  this.changeLanguage(lang)
                }
                this.closeLanguageMenu()
              })
            })
            this.languageListenersSetup = true
          }
        }
      }, 1000)
    }
  }

  // Dropdown menu methods
  toggleSettingsMenu() {
    const btn = document.getElementById('settingsBtn')
    const dropdown = btn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.toggle('active')
    }
  }

  closeSettingsMenu() {
    const btn = document.getElementById('settingsBtn')
    const dropdown = btn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.remove('active')
    }
  }

  toggleImportMenu() {
    const btn = document.getElementById('importMenuBtn')
    const dropdown = btn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.toggle('active')
    }
  }

  closeImportMenu() {
    const btn = document.getElementById('importMenuBtn')
    const dropdown = btn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.remove('active')
    }
  }

  toggleBackupMenu() {
    const btn = document.getElementById('backupMenuBtn')
    const dropdown = btn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.toggle('active')
    }
  }

  closeBackupMenu() {
    const btn = document.getElementById('backupMenuBtn')
    const dropdown = btn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.remove('active')
    }
  }

  toggleLanguageMenu() {
    const btn = document.getElementById('languageMenuBtn')
    const dropdown = btn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.toggle('active')
    }
  }

  closeLanguageMenu() {
    const btn = document.getElementById('languageMenuBtn')
    const dropdown = btn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.remove('active')
    }
  }

  // Import/Export methods
  importKeybinds() {
    if (typeof stoKeybinds !== 'undefined' && stoKeybinds.handleKeybindFileImport) {
      // Trigger file input for keybind import
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.txt'
      input.onchange = (e) => {
        const file = e.target.files[0]
        if (file) {
          const reader = new FileReader()
          reader.onload = (e) => {
            try {
              stoKeybinds.importKeybindFile(e.target.result)
            } catch (error) {
              this.ui.showToast(this.i18n.t('failed_to_import_keybind_file', { error: error.message }), 'error')
            }
          }
          reader.readAsText(file)
        }
      }
      input.click()
    }
  }

  importAliases() {
    if (typeof stoKeybinds !== 'undefined' && stoKeybinds.importAliasFile) {
      // Trigger file input for alias import
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.txt'
      input.onchange = (e) => {
        const file = e.target.files[0]
        if (file) {
          const reader = new FileReader()
          reader.onload = (e) => {
            try {
              stoKeybinds.importAliasFile(e.target.result)
            } catch (error) {
              this.ui.showToast(this.i18n.t('failed_to_import_aliases', { error: error.message }), 'error')
            }
          }
          reader.readAsText(file)
        }
      }
      input.click()
    }
  }

  loadDefaultData() {
    try {
      if (this.storage.loadDefaultData()) {
        const data = this.storage.getAllData()
        this.currentProfile = data.currentProfile
        this.selectedKey = null
        this.setModified(false)
        this.renderProfiles()
        this.renderKeyGrid()
        this.renderCommandChain()
        this.updateProfileInfo()
        this.ui.showToast(this.i18n.t('default_demo_data_loaded'), 'success')
      } else {
        this.ui.showToast(this.i18n.t('failed_to_load_default_data'), 'error')
      }
    } catch (error) {
      this.ui.showToast(this.i18n.t('failed_to_load_default_data_with_error', { error: error.message }), 'error')
    }
  }

  async confirmResetApp() {
    const confirmed = confirm(
      this.i18n.t('confirm_reset_application') ||
      'Are you sure you want to reset the application?\n\nThis will delete all profiles, keybinds, and settings. This action cannot be undone.'
    )

    if (confirmed) {
      this.resetApplication()
    }
  }

  resetApplication() {
    try {
      this.storage.clearAllData()
      this.currentProfile = null
      this.selectedKey = null
      this.setModified(false)
      this.renderProfiles()
      this.renderKeyGrid()
      this.renderCommandChain()
      this.updateProfileInfo()
      this.ui.showToast(this.i18n.t('application_reset_successfully'), 'success')
    } catch (error) {
      this.ui.showToast(this.i18n.t('failed_to_reset_application', { error: error.message }), 'error')
    }
  }

  setupExpandableSearch(buttonId, inputId) {
    const button = document.getElementById(buttonId)
    const input = document.getElementById(inputId)

    if (!button || !input) return

    // Toggle search input visibility
    this.eventBus.onDom(buttonId, 'click', `${buttonId}-toggle`, (e) => {
      e.preventDefault()
      e.stopPropagation()

      const isExpanded = input.classList.contains('expanded')

      if (isExpanded) {
        // If expanded and has content, clear it; if empty, collapse
        if (input.value.trim()) {
          input.value = ''
          // Trigger the existing filter/search logic
          input.dispatchEvent(new Event('input'))
        } else {
          input.classList.remove('expanded')
          input.blur()
        }
      } else {
        // Expand and focus
        input.classList.add('expanded')
        setTimeout(() => input.focus(), 100)
      }
    })

    // Handle clicks outside to collapse
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.toolbar-search') && input.classList.contains('expanded')) {
        if (!input.value.trim()) {
          input.classList.remove('expanded')
        }
      }
    })

    // Handle escape key to collapse
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (input.value.trim()) {
          input.value = ''
          input.dispatchEvent(new Event('input'))
        } else {
          input.classList.remove('expanded')
          input.blur()
        }
      }
    })

    // Keep expanded if there's content
    input.addEventListener('input', () => {
      if (input.value.trim()) {
        input.classList.add('expanded')
      }
    })
  }

  setupModalHandlers() {
    // Add Key Modal
    this.eventBus.onDom('confirmAddKeyBtn', 'click', 'key-add-confirm', () => {
      const keyName = document.getElementById('newKeyName')?.value.trim()
      if (keyName) {
        this.addKey(keyName)
        this.modalManager.hide('addKeyModal')
      }
    })

    // Key suggestions
    document.querySelectorAll('.key-suggestion').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const keyName = e.target.dataset.key
        const input = document.getElementById('newKeyName')
        if (input) {
          input.value = keyName
        }
      })
    })

    // Key Capture functionality for Add Key Modal
    const addKeyCaptureBtn = document.getElementById('addKeyCaptureBtn')
    if (addKeyCaptureBtn) {
      addKeyCaptureBtn.addEventListener('click', () => {
        this.startKeyCapture('addKeyModal')
      })
    }

    // Add Command Modal
    this.eventBus.onDom('saveCommandBtn', 'click', 'command-save', () => {
      this.saveCommandFromModal()
    })

    // Modal close handlers
    document.querySelectorAll('.modal-close, [data-modal]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const modalId =
          e.target.dataset.modal || e.target.closest('button').dataset.modal
        if (modalId) {
          this.modalManager.hide(modalId)

          // Handle Vertigo modal cancellation - rollback to initial state
          if (modalId === 'vertigoModal') {
            // Only rollback if we're not in the middle of saving
            if (this.vertigoInitialState && !this.vertigoSaving) {
              vertigoManager.selectedEffects.space = new Set(
                this.vertigoInitialState.selectedEffects.space
              )
              vertigoManager.selectedEffects.ground = new Set(
                this.vertigoInitialState.selectedEffects.ground
              )
              vertigoManager.showPlayerSay =
                this.vertigoInitialState.showPlayerSay
            }

            // Clean up stored state
            delete this.vertigoInitialState
            this.vertigoSaving = false
          }

          // Stop key capture if modal is closed
          if (modalId === 'addKeyModal' || modalId === 'keySelectionModal') {
            this.stopKeyCapture()
          }
        }
      })
    })
  }

  handleProfileCreate(data) {
    try {
      if (this.app && this.app.profileService) {
        const result = this.app.profileService.createProfile(data.name, data.description, data.mode)
        if (result.success) {
          this.eventBus.emit('profile:created', result)
        }
      }
    } catch (error) {
      console.error('Failed to create profile:', error)
      this.eventBus.emit('profile:create-failed', { error: error.message })
    }
  }

  handleProfileSwitch(data) {
    try {
      if (this.app && this.app.profileService) {
        const result = this.app.profileService.switchProfile(data.profileId)
        if (result.success) {
          this.eventBus.emit('profile:switched', result)
        }
      }
    } catch (error) {
      console.error('Failed to switch profile:', error)
      this.eventBus.emit('profile:switch-failed', { error: error.message })
    }
  }

  handleProfileDelete(data) {
    try {
      if (this.app && this.app.profileService) {
        const result = this.app.profileService.deleteProfile(data.profileId)
        if (result.success) {
          this.eventBus.emit('profile:deleted', result)
        }
      }
    } catch (error) {
      console.error('Failed to delete profile:', error)
      this.eventBus.emit('profile:delete-failed', { error: error.message })
    }
  }

  handleKeybindAdd(data) {
    try {
      if (this.app && this.app.profileService) {
        const profile = this.storage.getProfile(this.app.currentProfile)
        if (!profile) {
          throw new Error('Profile not found')
        }

        // Add keybind to profile
        if (!profile.builds) {
          profile.builds = {}
        }
        if (!profile.builds[this.app.currentEnvironment]) {
          profile.builds[this.app.currentEnvironment] = { keys: {} }
        }
        if (!profile.builds[this.app.currentEnvironment].keys) {
          profile.builds[this.app.currentEnvironment].keys = {}
        }

        profile.builds[this.app.currentEnvironment].keys[data.key] = data.commands || []
        this.storage.saveProfile(this.app.currentProfile, profile)

        this.eventBus.emit('keybind:added', { key: data.key, commands: data.commands })
      }
    } catch (error) {
      console.error('Failed to add keybind:', error)
      this.eventBus.emit('keybind:add-failed', { error: error.message })
    }
  }

  handleKeybindEdit(data) {
    try {
      if (this.app && this.app.profileService) {
        const profile = this.storage.getProfile(this.app.currentProfile)
        if (!profile) {
          throw new Error('Profile not found')
        }

        // Update keybind in profile
        if (profile.builds && profile.builds[this.app.currentEnvironment] && profile.builds[this.app.currentEnvironment].keys) {
          profile.builds[this.app.currentEnvironment].keys[data.key] = data.commands || []
          this.storage.saveProfile(this.app.currentProfile, profile)

          this.eventBus.emit('keybind:edited', { key: data.key, commands: data.commands })
        }
      }
    } catch (error) {
      console.error('Failed to edit keybind:', error)
      this.eventBus.emit('keybind:edit-failed', { error: error.message })
    }
  }

  handleKeybindDelete(data) {
    try {
      if (this.app && this.app.profileService) {
        const profile = this.storage.getProfile(this.app.currentProfile)
        if (!profile) {
          throw new Error('Profile not found')
        }

        // Remove keybind from profile
        if (profile.builds && profile.builds[this.app.currentEnvironment] && profile.builds[this.app.currentEnvironment].keys) {
          delete profile.builds[this.app.currentEnvironment].keys[data.key]
          this.storage.saveProfile(this.app.currentProfile, profile)

          this.eventBus.emit('keybind:deleted', { key: data.key })
        }
      }
    } catch (error) {
      console.error('Failed to delete keybind:', error)
      this.eventBus.emit('keybind:delete-failed', { error: error.message })
    }
  }

  handleCommandAdd(data) {
    // Payloads from CommandLibraryUI for parameterizable commands contain
    // categoryId / commandId only (no key / command). These should NOT be
    // routed to CommandService directly; CommandUI / ParameterCommandUI will
    // handle them after the parameter modal completes.
    if (!data || !data.key || !data.command) return

    try {
      if (this.app && this.app.commandService) {
        const result = this.app.commandService.addCommand(data.key, data.command)
        if (result && result.success) {
          this.eventBus.emit('command:added', result)
        }
      }
    } catch (error) {
      console.error('Failed to add command:', error)
      this.eventBus.emit('command:add-failed', { error: error.message })
    }
  }

  handleCommandEdit(data) {
    try {
      if (this.app && this.app.commandService) {
        const result = this.app.commandService.editCommand(data.key, data.index, data.command)
        if (result.success) {
          this.eventBus.emit('command:edited', result)
        }
      }
    } catch (error) {
      console.error('Failed to edit command:', error)
      this.eventBus.emit('command:edit-failed', { error: error.message })
    }
  }

  handleCommandDelete(data) {
    try {
      if (this.app && this.app.commandService) {
        const result = this.app.commandService.deleteCommand(data.key, data.index)
        if (result.success) {
          this.eventBus.emit('command:deleted', result)
        }
      }
    } catch (error) {
      console.error('Failed to delete command:', error)
      this.eventBus.emit('command:delete-failed', { error: error.message })
    }
  }

  // ------------------------------------------------------------
  // Mode toggle (space/ground/alias) click delegation
  // ------------------------------------------------------------
  registerModeToggleHandler() {
    const modeToggleContainer = document.querySelector('.mode-toggle')
    if (!modeToggleContainer) {
      // Container may not exist yet (e.g., HTML not injected); skip for now
      console.warn('[EventHandlerService] registerModeToggleHandler: .mode-toggle container not found')
      return false
    }

    // Avoid duplicate registration
    if (this._modeToggleHandlerAdded) return true

    this._modeToggleHandlerAdded = true

    modeToggleContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mode]')
      if (!btn || btn.disabled) return

      const mode = btn.getAttribute('data-mode')
      if (!mode) return

      e.stopPropagation()
      e.preventDefault()

      try {
        this.switchMode(mode)
      } catch (error) {
        console.error('[EventHandlerService] Error calling switchMode:', error)
      }
    })

    return true
  }

  // Proxy methods that delegate to the app instance
  get currentProfile() {
    return this.app?.currentProfile
  }

  set currentProfile(val) {
    if (this.app) this.app.currentProfile = val
  }

  get currentEnvironment() {
    return this.app?.currentEnvironment
  }

  set currentEnvironment(val) {
    if (this.app) this.app.currentEnvironment = val
  }

  get selectedKey() {
    return this.app?.selectedKey
  }

  set selectedKey(val) {
    if (this.app) this.app.selectedKey = val
  }

  get isModified() {
    return this.app?.isModified
  }

  set isModified(val) {
    if (this.app) this.app.isModified = val
  }

  // Delegate methods to app instance or implement as no-ops
  switchProfile(profileId) {
    return this.app?.switchProfile?.(profileId)
  }

  switchMode(mode) {
    // Emit environment change – InterfaceModeService handles
    this.eventBus.emit('environment:changed', { environment: mode })
  }

  setModified(modified = true) {
    return this.app?.setModified(modified)
  }

  renderProfiles() {
    this.eventBus.emit('ui:render-profiles')
  }

  renderKeyGrid() {
    this.eventBus.emit('ui:render-key-grid')
  }

  renderCommandChain() {
    this.eventBus.emit('ui:render-command-chain')
  }

  updateProfileInfo() {
    this.eventBus.emit('ui:update-profile-info')
  }

  saveData() {
    return this.app?.saveData()
  }

  addKey(keyName) {
    if (this.app?.addKey) {
      return this.app.addKey(keyName)
    }
    // Fallback: emit event
    this.eventBus.emit('key:add', { keyName })
  }

  confirmDeleteKey(key) {
    if (this.app?.confirmDeleteKey) {
      return this.app.confirmDeleteKey(key)
    }
    // Fallback: emit event
    this.eventBus.emit('key:delete-confirm', { key })
  }

  duplicateKey(key) {
    if (this.app?.duplicateKey) {
      return this.app.duplicateKey(key)
    }
    // Fallback: emit event
    this.eventBus.emit('key:duplicate', { key })
  }

  showAliasCreationModal() {
    if (this.app?.showAliasCreationModal) {
      return this.app.showAliasCreationModal()
    }
    // Fallback: emit event
    this.eventBus.emit('alias:create-modal')
  }

  confirmDeleteAlias(key) {
    if (this.app?.confirmDeleteAlias) {
      return this.app.confirmDeleteAlias(key)
    }
    // Fallback: emit event
    this.eventBus.emit('alias:delete-confirm', { key })
  }

  duplicateAlias(key) {
    if (this.app?.duplicateAlias) {
      return this.app.duplicateAlias(key)
    }
    // Fallback: emit event
    this.eventBus.emit('alias:duplicate', { key })
  }

  confirmClearChain(key) {
    if (this.app?.confirmClearChain) {
      return this.app.confirmClearChain(key)
    }
    // Fallback: emit event
    this.eventBus.emit('chain:clear-confirm', { key })
  }

  validateCurrentChain() {
    if (this.app?.validateCurrentChain) {
      return this.app.validateCurrentChain()
    }
    // Fallback: emit event
    this.eventBus.emit('chain:validate')
  }

  filterKeys(value) {
    if (this.app?.filterKeys) {
      return this.app.filterKeys(value)
    }
    // Fallback: emit event
    this.eventBus.emit('keys:filter', { value })
  }

  filterCommands(value) {
    if (this.app?.filterCommands) {
      return this.app.filterCommands(value)
    }
    // Fallback: emit event
    this.eventBus.emit('commands:filter', { value })
  }

  showAllKeys() {
    if (this.app?.showAllKeys) {
      return this.app.showAllKeys()
    }
    // Fallback: emit event
    this.eventBus.emit('keys:show-all')
  }

  toggleKeyView() {
    if (this.app?.toggleKeyView) {
      return this.app.toggleKeyView()
    }
    // Fallback: emit event
    this.eventBus.emit('key-view:toggle')
  }

  toggleLibrary() {
    // Fire-and-forget event – UI components listen and act
    this.eventBus.emit('library:toggle')
  }

  toggleAliasOptionsDropdown() {
    if (this.app?.toggleAliasOptionsDropdown) {
      return this.app.toggleAliasOptionsDropdown()
    }
    // Fallback: emit event
    this.eventBus.emit('alias-options:toggle')
  }

  closeAliasOptionsDropdown() {
    if (this.app?.closeAliasOptionsDropdown) {
      return this.app.closeAliasOptionsDropdown()
    }
    // Fallback: emit event
    this.eventBus.emit('alias-options:close')
  }

  updateAliasOptionsLabel() {
    if (this.app?.updateAliasOptionsLabel) {
      return this.app.updateAliasOptionsLabel()
    }
    // Fallback: emit event
    this.eventBus.emit('alias-options:update-label')
  }

  saveCommandFromModal() {
    if (this.app?.saveCommandFromModal) {
      return this.app.saveCommandFromModal()
    }
    // Fallback: emit event
    this.eventBus.emit('command:save-from-modal')
  }

  startKeyCapture(modalId) {
    if (this.app?.startKeyCapture) {
      return this.app.startKeyCapture(modalId)
    }
    // Fallback: emit event
    this.eventBus.emit('key-capture:start', { modalId })
  }

  stopKeyCapture() {
    if (this.app?.stopKeyCapture) {
      return this.app.stopKeyCapture()
    }
    // Fallback: emit event
    this.eventBus.emit('key-capture:stop')
  }

  showVertigoModal() {
    if (this.app?.showVertigoModal) {
      return this.app.showVertigoModal()
    }
    // Fallback: emit event
    this.eventBus.emit('vertigo:show-modal')
  }

  showKeySelectionModal() {
    if (this.app?.showKeySelectionModal) {
      return this.app.showKeySelectionModal()
    }
    // Fallback: emit event
    this.eventBus.emit('key-selection:show-modal')
  }

  openProject() {
    this.eventBus.emit('project:open')
  }

  saveProject() {
    this.eventBus.emit('project:save')
  }

  exportKeybinds() {
    // Notify project management components
    this.eventBus.emit('keybinds:export')
  }

  toggleTheme() {
    if (this.app?.toggleTheme) {
      return this.app.toggleTheme()
    }
    // Fallback: emit event
    this.eventBus.emit('theme:toggle')
  }

  changeLanguage(lang) {
    if (this.app?.changeLanguage) {
      return this.app.changeLanguage(lang)
    }
    // Fallback: emit event
    this.eventBus.emit('language:change', { lang })
  }
} 