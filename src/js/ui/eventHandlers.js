import eventBus from '../core/eventBus.js'

export const eventHandlers = {
  setupEventListeners() {
    // Profile management
    const profileSelect = document.getElementById('profileSelect')
    profileSelect?.addEventListener('change', (e) => {
      this.switchProfile(e.target.value)
    })

    // Mode switching - get elements first, then use eventBus for consistent event handling
    const spaceBtn = document.querySelector('[data-mode="space"]')
    const groundBtn = document.querySelector('[data-mode="ground"]')
    const aliasBtn = document.querySelector('[data-mode="alias"]')

    if (spaceBtn) {
      eventBus.onDom(spaceBtn, 'click', 'mode-space', (e) => {
        e.stopPropagation()
        this.switchMode('space')
      })
    }

    if (groundBtn) {
      eventBus.onDom(groundBtn, 'click', 'mode-ground', (e) => {
        e.stopPropagation()
        this.switchMode('ground')
      })
    }

    if (aliasBtn) {
      eventBus.onDom(aliasBtn, 'click', 'mode-alias', (e) => {
        e.stopPropagation()
        this.switchMode('alias')
      })
    }

    // File operations
    eventBus.onDom('openProjectBtn', 'click', 'project-open', () => {
      this.openProject()
    })

    eventBus.onDom('saveProjectBtn', 'click', 'project-save', () => {
      this.saveProject()
    })

    eventBus.onDom('exportKeybindsBtn', 'click', 'keybinds-export', () => {
      this.exportKeybinds()
    })

    // Vertigo VFX manager
    eventBus.onDom('vertigoBtn', 'click', 'vertigo-open', () => {
      this.showVertigoModal()
    })

    // Key management
    eventBus.onDom('addKeyBtn', 'click', 'key-add', () => {
      this.showKeySelectionModal()
    })

    eventBus.onDom('deleteKeyBtn', 'click', 'key-delete', () => {
      if (this.selectedKey) {
        this.confirmDeleteKey(this.selectedKey)
      }
    })

    eventBus.onDom('duplicateKeyBtn', 'click', 'key-duplicate', () => {
      if (this.selectedKey) {
        this.duplicateKey(this.selectedKey)
      }
    })

    // Alias chain management
    eventBus.onDom('addAliasChainBtn', 'click', 'alias-chain-add', () => {
      this.showAliasCreationModal()
    })

    eventBus.onDom('deleteAliasChainBtn', 'click', 'alias-chain-delete', () => {
      if (this.selectedKey && this.currentEnvironment === 'alias') {
        this.confirmDeleteAlias(this.selectedKey)
      }
    })

    eventBus.onDom('duplicateAliasChainBtn', 'click', 'alias-chain-duplicate', () => {
      if (this.selectedKey && this.currentEnvironment === 'alias') {
        this.duplicateAlias(this.selectedKey)
      }
    })

    // Command management
    eventBus.onDom('addCommandBtn', 'click', 'command-add', () => {
      modalManager.show('addCommandModal')
    })

    eventBus.onDom('clearChainBtn', 'click', 'command-chain-clear', () => {
      if (this.selectedKey) {
        this.confirmClearChain(this.selectedKey)
      }
    })

    eventBus.onDom(
      'validateChainBtn',
      'click',
      'command-chain-validate',
      () => {
        this.validateCurrentChain()
      }
    )

    // Stabilization checkbox
    eventBus.onDom(
      'stabilizeExecutionOrder',
      'change',
      'stabilize-change',
      (e) => {
        // Persist stabilization flag to stored profile (environment-scoped)
        if (this.selectedKey) {
          const env = this.currentEnvironment
          const storedProfile = stoStorage.getProfile(this.currentProfile)
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
            stoStorage.saveProfile(this.currentProfile, storedProfile)
            this.setModified(true)
          }
        }
        this.renderCommandChain() // Update preview when checkbox changes
      }
    )

    // Search and filter
    eventBus.onDom('keyFilter', 'input', 'key-filter', (e) => {
      this.filterKeys(e.target.value)
    })

    eventBus.onDom('commandSearch', 'input', 'command-search', (e) => {
      this.filterCommands(e.target.value)
    })

    eventBus.onDom('showAllKeysBtn', 'click', 'show-all-keys', () => {
      this.showAllKeys()
    })

    // Key view toggle
    eventBus.onDom('toggleKeyViewBtn', 'click', 'toggle-key-view', () => {
      this.toggleKeyView()
    })

    // Library toggle
    eventBus.onDom('toggleLibraryBtn', 'click', 'toggle-library', () => {
      this.toggleLibrary()
    })

    // Alias options multiselect dropdown
    eventBus.onDom('aliasOptionsDropdown', 'click', 'alias-options-toggle', (e) => {
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
      eventBus.onDom(id, 'change', `alias-option-${id}`, () => {
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
    eventBus.onDom('stabilizeExecutionOrderBtn', 'click', 'stabilize-toggle', (e) => {
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
    eventBus.onDom('aliasOptionsBtn', 'click', 'alias-options-toggle', (e) => {
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
  },

  setupGlobalUIEventListeners() {
    // Settings dropdown
    eventBus.onDom('settingsBtn', 'click', 'settings-menu', (e) => {
      e.stopPropagation()
      this.toggleSettingsMenu()
    })

    // Import dropdown
    eventBus.onDom('importMenuBtn', 'click', 'import-menu', (e) => {
      e.stopPropagation()
      this.toggleImportMenu()
    })

    // Backup dropdown
    eventBus.onDom('backupMenuBtn', 'click', 'backup-menu', (e) => {
      e.stopPropagation()
      this.toggleBackupMenu()
    })

    // Language dropdown
    eventBus.onDom('languageMenuBtn', 'click', 'language-menu', (e) => {
      e.stopPropagation()
      this.toggleLanguageMenu()
    })

    // Import menu items
    eventBus.onDom('importKeybindsBtn', 'click', 'keybinds-import', () => {
      this.importKeybinds()
      this.closeImportMenu()
    })

    eventBus.onDom('importAliasesBtn', 'click', 'aliases-import', () => {
      this.importAliases()
      this.closeImportMenu()
    })

    // Settings menu items
    eventBus.onDom('loadDefaultDataBtn', 'click', 'load-default-data', () => {
      this.loadDefaultData()
      this.closeSettingsMenu()
    })

    eventBus.onDom('resetAppBtn', 'click', 'reset-app', () => {
      this.confirmResetApp()
      this.closeSettingsMenu()
    })

    eventBus.onDom('syncNowBtn', 'click', 'sync-now', () => {
      if (typeof stoSync !== 'undefined') {
        stoSync.syncProject()
      }
      this.closeSettingsMenu()
    })

    eventBus.onDom('aboutBtn', 'click', 'about-open', () => {
      modalManager.show('aboutModal')
    })

    eventBus.onDom('themeToggleBtn', 'click', 'theme-toggle', () => {
      this.toggleTheme()
      this.closeSettingsMenu()
    })

    eventBus.onDom('preferencesBtn', 'click', 'preferences-open', () => {
      if (this.preferencesManager) {
        this.preferencesManager.showPreferences()
      } else {
        // Fallback to old modal if preferences manager not available
        modalManager.show('preferencesModal')
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
  },

  setupLanguageListeners() {
    if (this.languageListenersSetup) return

    const languageOptions = document.querySelectorAll('.language-option')
    if (languageOptions.length > 0) {
      languageOptions.forEach((btn) => {
        eventBus.onDom(btn, 'click', 'language-change', (e) => {
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
              eventBus.onDom(btn, 'click', 'language-change', (e) => {
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
  },

  // Dropdown menu methods
  toggleSettingsMenu() {
    const btn = document.getElementById('settingsBtn')
    const dropdown = btn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.toggle('active')
    }
  },

  closeSettingsMenu() {
    const btn = document.getElementById('settingsBtn')
    const dropdown = btn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.remove('active')
    }
  },

  toggleImportMenu() {
    const btn = document.getElementById('importMenuBtn')
    const dropdown = btn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.toggle('active')
    }
  },

  closeImportMenu() {
    const btn = document.getElementById('importMenuBtn')
    const dropdown = btn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.remove('active')
    }
  },

  toggleBackupMenu() {
    const btn = document.getElementById('backupMenuBtn')
    const dropdown = btn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.toggle('active')
    }
  },

  closeBackupMenu() {
    const btn = document.getElementById('backupMenuBtn')
    const dropdown = btn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.remove('active')
    }
  },

  toggleLanguageMenu() {
    const btn = document.getElementById('languageMenuBtn')
    const dropdown = btn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.toggle('active')
    }
  },

  closeLanguageMenu() {
    const btn = document.getElementById('languageMenuBtn')
    const dropdown = btn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.remove('active')
    }
  },

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
              stoUI.showToast(i18next.t('failed_to_import_keybind_file', { error: error.message }), 'error')
            }
          }
          reader.readAsText(file)
        }
      }
      input.click()
    }
  },

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
              stoUI.showToast(i18next.t('failed_to_import_aliases', { error: error.message }), 'error')
            }
          }
          reader.readAsText(file)
        }
      }
      input.click()
    }
  },

  loadDefaultData() {
    try {
      if (stoStorage.loadDefaultData()) {
        const data = stoStorage.getAllData()
        this.currentProfile = data.currentProfile
        this.selectedKey = null
        this.setModified(false)
        this.renderProfiles()
        this.renderKeyGrid()
        this.renderCommandChain()
        this.updateProfileInfo()
        stoUI.showToast(i18next.t('default_demo_data_loaded'), 'success')
      } else {
        stoUI.showToast(i18next.t('failed_to_load_default_data'), 'error')
      }
    } catch (error) {
      stoUI.showToast(i18next.t('failed_to_load_default_data_with_error', { error: error.message }), 'error')
    }
  },

  async confirmResetApp() {
    const confirmed = confirm(
      i18next.t('confirm_reset_application') ||
      'Are you sure you want to reset the application?\n\nThis will delete all profiles, keybinds, and settings. This action cannot be undone.'
    )

    if (confirmed) {
      this.resetApplication()
    }
  },

  resetApplication() {
    try {
      stoStorage.clearAllData()
      this.currentProfile = null
      this.selectedKey = null
      this.setModified(false)
      this.renderProfiles()
      this.renderKeyGrid()
      this.renderCommandChain()
      this.updateProfileInfo()
      stoUI.showToast(i18next.t('application_reset_successfully'), 'success')
    } catch (error) {
      stoUI.showToast(i18next.t('failed_to_reset_application', { error: error.message }), 'error')
    }
  },

  setupExpandableSearch(buttonId, inputId) {
    const button = document.getElementById(buttonId)
    const input = document.getElementById(inputId)

    if (!button || !input) return

    // Toggle search input visibility
    eventBus.onDom(buttonId, 'click', `${buttonId}-toggle`, (e) => {
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
  },

  setupModalHandlers() {
    // Add Key Modal
    eventBus.onDom('confirmAddKeyBtn', 'click', 'key-add-confirm', () => {
      const keyName = document.getElementById('newKeyName')?.value.trim()
      if (keyName) {
        this.addKey(keyName)
        modalManager.hide('addKeyModal')
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
    eventBus.onDom('saveCommandBtn', 'click', 'command-save', () => {
      this.saveCommandFromModal()
    })

    // Modal close handlers
    document.querySelectorAll('.modal-close, [data-modal]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const modalId =
          e.target.dataset.modal || e.target.closest('button').dataset.modal
        if (modalId) {
          modalManager.hide(modalId)

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
}

