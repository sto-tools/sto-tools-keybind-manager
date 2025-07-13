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

    // UI-specific state (ComponentBase handles common caching)
    this._isModified = false

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
      // ComponentBase handles caching automatically
      this._isModified = false // new profile starts clean
      this.renderProfiles()
      this.updateProfileInfo()
    })

    this.addEventListener('environment:changed', ({ environment } = {}) => {
      // ComponentBase handles caching automatically
      this.updateProfileInfo()
    })

    this.addEventListener('profile-modified', () => {
      this._isModified = true
      this.updateProfileInfo()
    })

    // Listen for profile updates to keep cached data fresh
    this.addEventListener('current-profile:updated', ({ profile }) => {
      // ComponentBase handles caching automatically
      this.updateProfileInfo()
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
      const result = await this.request('data:switch-profile', { profileId })
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
    const profiles = await this.request('data:get-all-profiles')
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
        if (id === this.currentProfile) {
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
      btn.classList.toggle('active', this.cache?.profile && btn.dataset.mode === this.currentEnvironment)
      btn.disabled = !this.currentProfile
    })

    const keyCount = this.document.getElementById('keyCount')
    if (keyCount) {
      if (this.cache?.profile) {
        const currentBuild = this.cache.profile.builds?.[this.currentEnvironment]
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
    if (!this.cache?.profile) {
      this.ui?.showToast?.(this._t('no_profile_selected_to_clone'), 'warning')
      return
    }

    const modal = this.document.getElementById('profileModal')
    const title = this.document.getElementById('profileModalTitle')
    const nameInput = this.document.getElementById('profileName')
    const descInput = this.document.getElementById('profileDescription')

    if (title) title.textContent = this._t('clone_profile')
    if (nameInput) {
      nameInput.value = `${this.cache?.profile.name} Copy`
      nameInput.placeholder = 'Enter new profile name'
    }
    if (descInput) {
      descInput.value = `Copy of ${this.cache?.profile.name}`
    }

    this.currentModal = 'clone'
    this.modalManager.show('profileModal')
  }

  /**
   * Show rename profile modal - using cached state (broadcast/cache pattern)
   */
  showRenameProfileModal() {
    // Use cached state instead of request/response - follows broadcast/cache pattern
    if (!this.cache?.profile) {
      this.ui?.showToast?.(this._t('no_profile_selected_to_rename'), 'warning')
      return
    }

    const modal = this.document.getElementById('profileModal')
    const title = this.document.getElementById('profileModalTitle')
    const nameInput = this.document.getElementById('profileName')
    const descInput = this.document.getElementById('profileDescription')

    if (title) title.textContent = this._t('rename_profile')
    if (nameInput) {
      nameInput.value = this.cache?.profile.name
      nameInput.placeholder = 'Enter profile name'
    }
    if (descInput) {
      descInput.value = this.cache?.profile.description || ''
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
          result = await this.request('data:create-profile', { name, description })
          if (result?.success) {
            await this.request('data:switch-profile', { profileId: result.profileId })
            await this.renderProfiles()
            this.renderKeyGrid()
            this.updateProfileInfo()
            this.ui?.showToast?.(result.message, 'success')
          }
          break
        }
        case 'clone': {
          // Use DataCoordinator directly for better performance
          result = await this.request('data:clone-profile', { sourceId: this.currentProfile, newName: name })
          if (result?.success) {
            await this.renderProfiles()
            this.ui?.showToast?.(result.message, 'success')
          }
          break
        }
        case 'rename': {
          // Use DataCoordinator directly for better performance
          result = await this.request('data:rename-profile', { profileId: this.currentProfile, newName: name, description })
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
    if (!this.cache?.profile) {
      this.ui?.showToast?.(this._t('no_profile_selected_to_delete'), 'warning')
      return
    }

    const confirmed = confirm(
      this._t('confirm_delete_profile', { name: this.cache?.profile.name }) ||
      `Are you sure you want to delete the profile "${this.cache?.profile.name}"? This action cannot be undone.`
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
      const result = await this.request('data:delete-profile', { profileId: this.currentProfile })
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

     // ComponentBase handles caching, we just need to update the UI
     if ((sender === 'DataCoordinator' || sender === 'ProfileService')) {
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
       currentProfile: this.currentProfile,
       currentEnvironment: this.currentEnvironment,
       modified: this._isModified
     }
   }
} 