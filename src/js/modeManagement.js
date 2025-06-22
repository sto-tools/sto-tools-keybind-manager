export const modeManagement = {
  switchMode(mode) {
    // Guard against undefined or invalid mode values
    if (!mode || (mode !== 'space' && mode !== 'ground' && mode !== 'alias')) {
      console.warn('Invalid mode provided to switchMode:', mode)
      return
    }

    if (this.currentEnvironment !== mode) {
      // Save current build before switching (only for space/ground modes)
      if (this.currentEnvironment === 'space' || this.currentEnvironment === 'ground') {
        this.saveCurrentBuild()
      }

      this.currentEnvironment = mode

      // Update profile's current environment
      const profile = stoStorage.getProfile(this.currentProfile)
      if (profile) {
        profile.currentEnvironment = mode
        stoStorage.saveProfile(this.currentProfile, profile)
      }

      // Update UI components based on mode
      this.updateProfileInfo()
      this.updateModeUI()
      this.setModified(true)

      // Update button states after all other updates are complete
      this.updateModeButtons()

      stoUI.showToast(i18next.t('switched_to_mode', { mode: mode }), 'success')
    }
  },

  updateModeButtons() {
    // Update the active state of mode buttons
    const spaceBtn = document.querySelector('[data-mode="space"]')
    const groundBtn = document.querySelector('[data-mode="ground"]')
    const aliasBtn = document.querySelector('[data-mode="alias"]')

    if (spaceBtn && groundBtn && aliasBtn) {
      spaceBtn.classList.toggle('active', this.currentEnvironment === 'space')
      groundBtn.classList.toggle('active', this.currentEnvironment === 'ground')
      aliasBtn.classList.toggle('active', this.currentEnvironment === 'alias')

      // Ensure buttons are enabled when we have a valid profile
      spaceBtn.disabled = !this.currentProfile
      groundBtn.disabled = !this.currentProfile
      aliasBtn.disabled = !this.currentProfile
    }
  },

  updateModeUI() {
    if (this.currentEnvironment === 'alias') {
      // Show alias view, hide key view
      this.showAliasView()
      this.renderAliasGrid()
      this.renderCommandChain()
      this.updateChainOptionsForAlias()
    } else {
      // Show key view, hide alias view
      this.showKeyView()
      this.renderKeyGrid()
      this.renderCommandChain()
      this.updateChainOptionsForKeybind()
      this.filterCommandLibrary() // Apply environment filter to command library
    }

    // Update toggle button visibility based on environment
    this.updateToggleButtonVisibility()
  },

  updateToggleButtonVisibility() {
    const toggleBtn = document.getElementById('toggleKeyViewBtn')
    if (toggleBtn) {
      // Hide toggle button in alias mode, show in keybind modes
      toggleBtn.style.display = this.currentEnvironment === 'alias' ? 'none' : 'block'
    }
  },

  showAliasView() {
    const keyContainer = document.querySelector('.key-selector-container')
    const aliasContainer = document.getElementById('aliasSelectorContainer')

    if (keyContainer) keyContainer.style.display = 'none'
    if (aliasContainer) aliasContainer.style.display = 'block'
  },

  showKeyView() {
    const keyContainer = document.querySelector('.key-selector-container')
    const aliasContainer = document.getElementById('aliasSelectorContainer')

    if (keyContainer) keyContainer.style.display = 'block'
    if (aliasContainer) aliasContainer.style.display = 'none'
  },

  updateChainOptionsForAlias() {
    const stabilizeBtn = document.getElementById('stabilizeExecutionOrderBtn')
    const aliasOptionsBtn = document.getElementById('aliasOptionsBtn')
    const aliasOptions = document.getElementById('aliasOptions')

    if (stabilizeBtn) stabilizeBtn.style.display = 'none'
    if (aliasOptionsBtn) aliasOptionsBtn.style.display = 'block'
    if (aliasOptions) aliasOptions.style.display = 'none' // Initially hidden, shown when button is clicked
  },

  updateChainOptionsForKeybind() {
    const stabilizeBtn = document.getElementById('stabilizeExecutionOrderBtn')
    const aliasOptionsBtn = document.getElementById('aliasOptionsBtn')
    const aliasOptions = document.getElementById('aliasOptions')

    if (stabilizeBtn) stabilizeBtn.style.display = 'block'
    if (aliasOptionsBtn) aliasOptionsBtn.style.display = 'none'
    if (aliasOptions) aliasOptions.style.display = 'none'
  },
}