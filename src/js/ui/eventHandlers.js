import eventBus from '../core/eventBus.js'

export const eventHandlers = {
  setupEventListeners() {
    // Profile management
    const profileSelect = document.getElementById('profileSelect')
    profileSelect?.addEventListener('change', (e) => {
      this.switchProfile(e.target.value)
    })

    // Mode switching - fix event target issue by using currentTarget and closest
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        // Use currentTarget to get the button element, not the clicked child element
        const button = e.currentTarget
        const mode = button.dataset.mode
        if (mode) {
          this.switchMode(mode)
        }
      })
    })

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

