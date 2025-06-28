import ComponentBase from '../ComponentBase.js'
import { request } from '../../core/requestResponse.js'

/**
 * ProfileUI - Handles all profile-related UI operations
 * Manages profile rendering, modals, and user interactions
 */
export default class ProfileUI extends ComponentBase {
  constructor({ eventBus: bus, ui = null, modalManager = null, document = null, i18n = null } = {}) {
    super(bus)
    this.componentName = 'ProfileUI'

    // REFACTORED: Strict dependency injection - no global fallbacks
    this.ui = ui
    this.modalManager = modalManager
    this.document = document || (typeof window !== 'undefined' ? window.document : null)

    // I18n handle
    this.i18n = i18n

    // Cached state - following broadcast/cache pattern
    this._currentProfileId   = null
    this._currentEnvironment = 'space'
    this._isModified         = false
    this._currentProfile     = null  // Cache current profile data to avoid request/response calls

    this.currentModal = null
    this.eventListenersSetup = false

    // Bind helpers
    this._t = this._t.bind(this)
  }

  /** Lightweight translation helper */
  _t(key, options) {
    return this.i18n?.t?.(key, options) || key
  }

  /**
   * Initialize the ProfileUI component – called by ComponentBase after the
   * late-join handshake wiring is set up.
   */
  onInit() {
    // Register listeners *before* we request any state so we don't miss
    // updates that might come in between.
    this.setupEventListeners()

    // Initial DOM population – fetch available profiles to render dropdown.
    // Current profile/environment will be filled in later by the
    // late-join handshake (handleInitialState) or subsequent events.
    this.renderProfiles()
    this.updateProfileInfo()
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

    // -------------------------------------------
    // Listen for global events to keep caches sync - broadcast/cache pattern
    // -------------------------------------------
    this.addEventListener('profile:switched', ({ profileId, environment, profile } = {}) => {
      if (profileId) this._currentProfileId = profileId
      if (environment) this._currentEnvironment = environment
      if (profile) this._currentProfile = profile  // Cache profile data
      this._isModified = false // new profile starts clean
      this.renderProfiles()
      this.updateProfileInfo()
    })

    this.addEventListener('environment:changed', ({ environment } = {}) => {
      if (environment) {
        this._currentEnvironment = environment
        this.updateProfileInfo()
      }
    })

    this.addEventListener('profile-modified', () => {
      this._isModified = true
      this.updateProfileInfo()
    })

    // Listen for profile updates to keep cached data fresh
    this.addEventListener('current-profile:updated', ({ profile }) => {
      if (profile) {
        this._currentProfile = profile
        this.updateProfileInfo()
      }
    })

    // Profile UI no longer handles global menu events - moved to EventHandlerService
    // This component focuses only on profile-specific UI interactions

    // Language listeners moved to EventHandlerService
    // Global menu methods moved to EventHandlerService
  }

  /**
   * Handle profile switching - using DataCoordinator directly for better performance
   */
  async handleProfileSwitch(profileId) {
    try {
      // Use DataCoordinator directly for better performance
      const result = await request(this.eventBus, 'data:switch-profile', { profileId })
      if (result?.switched) {
        this._selectedKey = null
        this.renderKeyGrid()
        // Command chain handled elsewhere – just refresh our info UI
        this.updateProfileInfo()
        this.ui?.showToast?.(result.message, 'success')
      }
    } catch (error) {
      this.ui?.showToast?.(error.message, 'error')
    }
  }

  /**
   * Render the profiles dropdown - using DataCoordinator directly
   */
  async renderProfiles() {
    const select = this.document.getElementById('profileSelect')
    if (!select) return

    // Use DataCoordinator directly for better performance
    const profiles = await request(this.eventBus, 'data:get-all-profiles')
    select.innerHTML = ''

    const profileEntries = Object.entries(profiles || {})
    if (profileEntries.length === 0) {
      const option = this.document.createElement('option')
      option.value = ''
      option.textContent = this._t('no_profiles_available') || 'No profiles available'
      option.disabled = true
      select.appendChild(option)
    } else {
      profileEntries.forEach(([id, profile]) => {
        const option = this.document.createElement('option')
        option.value = id
        option.textContent = profile.name
        if (id === this._currentProfileId) {
          option.selected = true
        }
        select.appendChild(option)
      })
    }

    this.updateProfileInfo()
  }

  /**
   * Update profile information display - using cached state (broadcast/cache pattern)
   */
  updateProfileInfo() {
    // Use cached state instead of request/response - follows broadcast/cache pattern
    const modeBtns = this.document.querySelectorAll('.mode-btn')
    modeBtns.forEach((btn) => {
      btn.classList.toggle('active', this._currentProfile && btn.dataset.mode === this._currentEnvironment)
      btn.disabled = !this._currentProfileId
    })

    const keyCount = this.document.getElementById('keyCount')
    if (keyCount) {
      if (this._currentProfile) {
        const currentBuild = this._currentProfile.builds?.[this._currentEnvironment]
        const count = Object.keys(currentBuild?.keys || {}).length
        const keyText = count === 1 ? this._t('key') : this._t('keys')
        keyCount.textContent = `${count} ${keyText}`
      } else {
        keyCount.textContent = this._t('no_profile')
      }
    }

    // Update modified indicator
    const indicator = this.document.getElementById('modifiedIndicator')
    if (indicator) {
      indicator.style.display = this._isModified ? 'inline' : 'none'
    }
  }

  /**
   * Render the key grid (delegated to existing uiRendering)
   * TODO: Target for removal like renderCommandChain()
   */
  renderKeyGrid() {
    if (typeof app !== 'undefined' && app.renderKeyGrid) {
      app.renderKeyGrid()
    }
  }

  /**
   * Render the command chain - now handled by CommandChainUI
   * This method is deprecated and does nothing
   */
  renderCommandChain() {
    // Command chain rendering is now handled by CommandChainUI
    // This method is kept for backward compatibility but does nothing
  }

  /**
   * Show new profile modal
   */
  showNewProfileModal() {
    const modal = this.document.getElementById('profileModal')
    const title = this.document.getElementById('profileModalTitle')
    const nameInput = this.document.getElementById('profileName')
    const descInput = this.document.getElementById('profileDescription')

    if (title) title.textContent = this._t('new_profile')
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
   * Show clone profile modal - using cached state (broadcast/cache pattern)
   */
  showCloneProfileModal() {
    // Use cached state instead of request/response - follows broadcast/cache pattern
    if (!this._currentProfile) {
      this.ui?.showToast?.(this._t('no_profile_selected_to_clone'), 'warning')
      return
    }

    const modal = this.document.getElementById('profileModal')
    const title = this.document.getElementById('profileModalTitle')
    const nameInput = this.document.getElementById('profileName')
    const descInput = this.document.getElementById('profileDescription')

    if (title) title.textContent = this._t('clone_profile')
    if (nameInput) {
      nameInput.value = `${this._currentProfile.name} Copy`
      nameInput.placeholder = 'Enter new profile name'
    }
    if (descInput) {
      descInput.value = `Copy of ${this._currentProfile.name}`
    }

    this.currentModal = 'clone'
    this.modalManager.show('profileModal')
  }

  /**
   * Show rename profile modal - using cached state (broadcast/cache pattern)
   */
  showRenameProfileModal() {
    // Use cached state instead of request/response - follows broadcast/cache pattern
    if (!this._currentProfile) {
      this.ui?.showToast?.(this._t('no_profile_selected_to_rename'), 'warning')
      return
    }

    const modal = this.document.getElementById('profileModal')
    const title = this.document.getElementById('profileModalTitle')
    const nameInput = this.document.getElementById('profileName')
    const descInput = this.document.getElementById('profileDescription')

    if (title) title.textContent = this._t('rename_profile')
    if (nameInput) {
      nameInput.value = this._currentProfile.name
      nameInput.placeholder = 'Enter profile name'
    }
    if (descInput) {
      descInput.value = this._currentProfile.description || ''
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
      this.ui?.showToast?.(this._t('profile_name_required'), 'error')
      return
    }

    try {
      let result
      switch (this.currentModal) {
        case 'new': {
          // Use DataCoordinator directly for better performance
          result = await request(this.eventBus, 'data:create-profile', { name, description })
          if (result?.success) {
            await request(this.eventBus, 'data:switch-profile', { profileId: result.profileId })
            await this.renderProfiles()
            this.renderKeyGrid()
            this.updateProfileInfo()
            this.ui?.showToast?.(result.message, 'success')
          }
          break
        }
        case 'clone': {
          // Use DataCoordinator directly for better performance
          result = await request(this.eventBus, 'data:clone-profile', { sourceId: this._currentProfileId, newName: name })
          if (result?.success) {
            await this.renderProfiles()
            this.ui?.showToast?.(result.message, 'success')
          }
          break
        }
        case 'rename': {
          // Use DataCoordinator directly for better performance
          result = await request(this.eventBus, 'data:rename-profile', { profileId: this._currentProfileId, newName: name, description })
          if (result?.success) {
            await this.renderProfiles()
            this.updateProfileInfo()
            this.ui?.showToast?.(result.message || this._t('profile_renamed'), 'success')
          }
          break
        }
      }

      this.modalManager.hide('profileModal')
      this.currentModal = null
    } catch (error) {
      this.ui?.showToast?.(error.message, 'error')
    }
  }

  /**
   * Confirm profile deletion - using cached state (broadcast/cache pattern)
   */
  confirmDeleteProfile() {
    // Use cached state instead of request/response - follows broadcast/cache pattern
    if (!this._currentProfile) {
      this.ui?.showToast?.(this._t('no_profile_selected_to_delete'), 'warning')
      return
    }

    const confirmed = confirm(
      this._t('confirm_delete_profile', { name: this._currentProfile.name }) ||
      `Are you sure you want to delete the profile "${this._currentProfile.name}"? This action cannot be undone.`
    )

    if (confirmed) {
      this.deleteCurrentProfile()
    }
  }

  /**
   * Delete the current profile - using DataCoordinator directly
   */
  async deleteCurrentProfile() {
    try {
      // Use DataCoordinator directly for better performance
      const result = await request(this.eventBus, 'data:delete-profile', { profileId: this._currentProfileId })
      if (result.success) {
        if (result.switchedProfile) {
          this._selectedKey = null
          this.renderKeyGrid()
          // Command chain rendering is now handled by CommandChainUI via events
          this.updateProfileInfo()
        }
        this.renderProfiles()
        this.ui?.showToast?.(result.message, 'success')
      }
    } catch (error) {
      this.ui?.showToast?.(error.message, 'error')
    }
  }

  /**
   * Set the selected key (for UI state management)
   * TODO: Target for removal like renderCommandChain()
   */
  setSelectedKey(key) {
    this._selectedKey = key
  }

  /**
   * Get the selected key
   * TODO: Target for removal like renderCommandChain()
   */
  getSelectedKey() {
    return this._selectedKey
  }

  /** ------------------------------------------------------------
   * Late-join handshake – receive initial snapshot from services
   * ---------------------------------------------------------- */
   handleInitialState (sender, state) {
     if (!state) return

     // Profiles now come from DataCoordinator (single source of truth)
     if ((sender === 'DataCoordinator' || sender === 'ProfileService' || state.currentProfile)) {
       if (state.currentProfile) this._currentProfileId = state.currentProfile
       if (state.currentEnvironment) this._currentEnvironment = state.currentEnvironment
       if (typeof state.modified === 'boolean') this._isModified = state.modified
       
       // Cache current profile data to avoid request/response calls
       if (state.profiles && state.currentProfile && state.profiles[state.currentProfile]) {
         this._currentProfile = state.profiles[state.currentProfile]
       }

       // UI hydration
       this.renderProfiles()
       this.updateProfileInfo()
     }
   }

   /**
    * Provide serialisable snapshot for other late-joiners (rarely needed)
    */
   getCurrentState () {
     return {
       currentProfile: this._currentProfileId,
       currentEnvironment: this._currentEnvironment,
       modified: this._isModified
     }
   }
} 