import ComponentBase from '../ComponentBase.js'

/**
 * ProfileUI - Handles all profile-related UI operations
 * Manages profile rendering, modals, and user interactions
 */
export default class ProfileUI extends ComponentBase {
  constructor({ service, eventBus, ui, modalManager, document }) {
    super(eventBus)
    this.service = service
    this.ui = ui
    this.modalManager = modalManager
    this.document = document
    this.currentModal = null
    this.languageListenersSetup = false
    this.eventListenersSetup = false
    this.selectedKey = null
  }

  /**
   * Initialize the ProfileUI component
   */
  init() {
    super.init()
    this.setupEventListeners()
  }

  /**
   * Set up all event listeners for profile UI
   */
  setupEventListeners() {
    if (this.eventListenersSetup) {
      return // Prevent duplicate event listener setup
    }
    this.eventListenersSetup = true
    
    // Profile dropdown change
    const profileSelect = this.document.getElementById('profileSelect')
    if (profileSelect) {
      profileSelect.addEventListener('change', (e) => {
        this.handleProfileSwitch(e.target.value)
      })
    }

    // Profile action buttons
    this.eventBus.onDom('newProfileBtn', 'click', 'profile-new', () => {
      this.showNewProfileModal()
    })

    this.eventBus.onDom('cloneProfileBtn', 'click', 'profile-clone', () => {
      this.showCloneProfileModal()
    })

    this.eventBus.onDom('renameProfileBtn', 'click', 'profile-rename', () => {
      this.showRenameProfileModal()
    })

    this.eventBus.onDom('deleteProfileBtn', 'click', 'profile-delete', () => {
      this.confirmDeleteProfile()
    })

    // Profile modal save button
    this.eventBus.onDom('saveProfileBtn', 'click', 'profile-save', () => {
      this.handleProfileSave()
    })

    // Profile UI no longer handles global menu events - moved to main app eventHandlers
  }

  // Language listeners moved to main app eventHandlers

  /**
   * Handle profile switching
   */
  async handleProfileSwitch(profileId) {
    try {
      const result = this.service.switchProfile(profileId)
      if (result.switched) {
        this.selectedKey = null
        this.renderKeyGrid()
        this.renderCommandChain()
        this.updateProfileInfo()
        this.ui.showToast(result.message, 'success')
      }
    } catch (error) {
      this.ui.showToast(error.message, 'error')
    }
  }

  /**
   * Render the profiles dropdown
   */
  renderProfiles() {
    const select = this.document.getElementById('profileSelect')
    if (!select) return

    const data = this.service.storage.getAllData()
    select.innerHTML = ''

    if (Object.keys(data.profiles).length === 0) {
      const option = this.document.createElement('option')
      option.value = ''
      option.textContent = 'No profiles available'
      option.disabled = true
      select.appendChild(option)
    } else {
      Object.entries(data.profiles).forEach(([id, profile]) => {
        const option = this.document.createElement('option')
        option.value = id
        option.textContent = profile.name
        if (id === this.service.getCurrentProfileId()) {
          option.selected = true
        }
        select.appendChild(option)
      })
    }

    this.updateProfileInfo()
  }

  /**
   * Update profile information display
   */
  updateProfileInfo() {
    const profile = this.service.getCurrentProfile()

    const modeBtns = this.document.querySelectorAll('.mode-btn')
    modeBtns.forEach((btn) => {
      btn.classList.toggle(
        'active',
        profile && btn.dataset.mode === this.service.getCurrentEnvironment()
      )
      btn.disabled = !this.service.getCurrentProfileId()
    })

    const keyCount = this.document.getElementById('keyCount')
    if (keyCount) {
      if (profile) {
        const count = Object.keys(profile.keys).length
        const keyText = count === 1 ? this.service.i18n.t('key') : this.service.i18n.t('keys')
        keyCount.textContent = `${count} ${keyText}`
      } else {
        keyCount.textContent = this.service.i18n.t('no_profile')
      }
    }

    // Update modified indicator
    const indicator = this.document.getElementById('modifiedIndicator')
    if (indicator) {
      indicator.style.display = this.service.getModified() ? 'inline' : 'none'
    }
  }

  /**
   * Render the key grid (delegated to existing uiRendering)
   */
  renderKeyGrid() {
    if (typeof app !== 'undefined' && app.renderKeyGrid) {
      app.renderKeyGrid()
    }
  }

  /**
   * Render the command chain (delegated to existing commandLibrary)
   */
  renderCommandChain() {
    if (typeof app !== 'undefined' && app.renderCommandChain) {
      app.renderCommandChain()
    }
  }

  /**
   * Show new profile modal
   */
  showNewProfileModal() {
    const modal = this.document.getElementById('profileModal')
    const title = this.document.getElementById('profileModalTitle')
    const nameInput = this.document.getElementById('profileName')
    const descInput = this.document.getElementById('profileDescription')

    if (title) title.textContent = this.service.i18n.t('new_profile')
    if (nameInput) {
      nameInput.value = ''
      nameInput.placeholder = 'Enter profile name'
    }
    if (descInput) {
      descInput.value = ''
    }

    this.currentModal = 'new'
    this.modalManager.show('profileModal')
  }

  /**
   * Show clone profile modal
   */
  showCloneProfileModal() {
    const currentProfile = this.service.getCurrentProfile()
    if (!currentProfile) {
      this.ui.showToast(this.service.i18n.t('no_profile_selected_to_clone'), 'warning')
      return
    }

    const modal = this.document.getElementById('profileModal')
    const title = this.document.getElementById('profileModalTitle')
    const nameInput = this.document.getElementById('profileName')
    const descInput = this.document.getElementById('profileDescription')

    if (title) title.textContent = this.service.i18n.t('clone_profile')
    if (nameInput) {
      nameInput.value = `${currentProfile.name} Copy`
      nameInput.placeholder = 'Enter new profile name'
    }
    if (descInput) {
      descInput.value = `Copy of ${currentProfile.name}`
    }

    this.currentModal = 'clone'
    this.modalManager.show('profileModal')
  }

  /**
   * Show rename profile modal
   */
  showRenameProfileModal() {
    const currentProfile = this.service.getCurrentProfile()
    if (!currentProfile) {
      this.ui.showToast(this.service.i18n.t('no_profile_selected_to_rename'), 'warning')
      return
    }

    const modal = this.document.getElementById('profileModal')
    const title = this.document.getElementById('profileModalTitle')
    const nameInput = this.document.getElementById('profileName')
    const descInput = this.document.getElementById('profileDescription')

    if (title) title.textContent = this.service.i18n.t('rename_profile')
    if (nameInput) {
      nameInput.value = currentProfile.name
      nameInput.placeholder = 'Enter profile name'
    }
    if (descInput) {
      descInput.value = currentProfile.description || ''
    }

    this.currentModal = 'rename'
    this.modalManager.show('profileModal')
  }

  /**
   * Handle profile save from modal
   */
  async handleProfileSave() {
    const nameInput = this.document.getElementById('profileName')
    const descInput = this.document.getElementById('profileDescription')

    if (!nameInput) return

    const name = nameInput.value.trim()
    const description = descInput ? descInput.value.trim() : ''

    if (!name) {
      this.ui.showToast(this.service.i18n.t('profile_name_required'), 'error')
      return
    }

    try {
      let result
      switch (this.currentModal) {
        case 'new':
          result = this.service.createProfile(name, description)
          if (result.success) {
            this.service.switchProfile(result.profileId)
            this.renderProfiles()
            this.renderKeyGrid()
            this.renderCommandChain()
            this.updateProfileInfo()
            this.ui.showToast(result.message, 'success')
          }
          break

        case 'clone':
          result = this.service.cloneProfile(this.service.getCurrentProfileId(), name)
          if (result.success) {
            this.renderProfiles()
            this.ui.showToast(result.message, 'success')
          }
          break

        case 'rename':
          // For rename, we need to update the current profile
          const currentProfile = this.service.getCurrentProfile()
          if (currentProfile) {
            currentProfile.name = name
            currentProfile.description = description
            this.service.saveProfile()
            this.renderProfiles()
            this.updateProfileInfo()
            this.ui.showToast(this.service.i18n.t('profile_renamed'), 'success')
          }
          break
      }

      this.modalManager.hide('profileModal')
      this.currentModal = null
    } catch (error) {
      this.ui.showToast(error.message, 'error')
    }
  }

  /**
   * Confirm profile deletion
   */
  async confirmDeleteProfile() {
    const currentProfile = this.service.getCurrentProfile()
    if (!currentProfile) {
      this.ui.showToast(this.service.i18n.t('no_profile_selected_to_delete'), 'warning')
      return
    }

    const confirmed = confirm(
      this.service.i18n.t('confirm_delete_profile', { name: currentProfile.name }) ||
      `Are you sure you want to delete the profile "${currentProfile.name}"? This action cannot be undone.`
    )

    if (confirmed) {
      this.deleteCurrentProfile()
    }
  }

  /**
   * Delete the current profile
   */
  async deleteCurrentProfile() {
    try {
      const result = this.service.deleteProfile(this.service.getCurrentProfileId())
      if (result.success) {
        if (result.switchedProfile) {
          this.selectedKey = null
          this.renderKeyGrid()
          this.renderCommandChain()
          this.updateProfileInfo()
        }
        this.renderProfiles()
        this.ui.showToast(result.message, 'success')
      }
    } catch (error) {
      this.ui.showToast(error.message, 'error')
    }
  }

  // Global menu methods moved to main app eventHandlers

  /**
   * Set the selected key (for UI state management)
   */
  setSelectedKey(key) {
    this.selectedKey = key
  }

  /**
   * Get the selected key
   */
  getSelectedKey() {
    return this.selectedKey
  }
} 