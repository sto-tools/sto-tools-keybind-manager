// STO Tools Keybind Manager - Main Application Controller
// Coordinates all modules and handles global application state
import store from './core/store.js'
import eventBus from './core/eventBus.js'
import STOPreferencesManager from './services/preferences.js'
import STOAutoSyncManager from './services/autoSync.js'
import ProfileService from './components/services/ProfileService.js'
import ProfileUI from './components/ui/ProfileUI.js'
import { keyHandling } from './features/keyHandling.js'
import { uiRendering } from './ui/uiRendering.js'
import { parameterCommands } from './features/parameterCommands.js'
import { keyCapture } from './ui/keyCapture.js'
import { eventHandlers } from './ui/eventHandlers.js'
import { projectManagement } from './services/projectManagement.js'
import { modeManagement } from './ui/modeManagement.js'
import { CommandService, CommandLibraryService } from './components/services/index.js'
import { CommandLibraryUI, CommandUI } from './components/ui/index.js'
import { AliasModalService, AliasModalUI } from './components/aliases/index.js'
import { viewManagement } from './ui/viewManagement.js'
import { welcome } from './ui/welcome.js'
import { CommandChainService, CommandChainUI } from './components/chain/index.js'
import { AliasBrowserService, AliasBrowserUI } from './components/aliases/index.js'
import { KeyBrowserService, KeyBrowserUI } from './components/keybinds/index.js'

export default class STOToolsKeybindManager {
  constructor() {
    this.store = store
    this.eventListeners = new Map()
    this.preferencesManager = new STOPreferencesManager()
    this.autoSyncManager = new STOAutoSyncManager()

    // Initialize profile service and UI when dependencies are available
    this.profileService = null
    this.profileUI = null
    this.aliasService = null
    this.aliasUI = null
    this.commandService = null
    this.commandLibraryService = null
    this.keyBrowserService = null
    this.keyBrowserUI = null
    this.commandUI = null

    // Bind key capture handlers once for consistent add/remove
    this.boundHandleKeyDown = this.handleKeyDown.bind(this)
    this.boundHandleKeyUp = this.handleKeyUp.bind(this)

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init())
    } else {
      this.init()
    }
  }

  get currentMode() {
    return this.store.currentMode
  }
  set currentMode(val) {
    this.store.currentMode = val
  }

  get undoStack() {
    return this.store.undoStack
  }
  set undoStack(val) {
    this.store.undoStack = val
  }

  get redoStack() {
    return this.store.redoStack
  }
  set redoStack(val) {
    this.store.redoStack = val
  }

  get maxUndoSteps() {
    return this.store.maxUndoSteps
  }
  set maxUndoSteps(val) {
    this.store.maxUndoSteps = val
  }

  get commandIdCounter() {
    return this.store.commandIdCounter
  }
  set commandIdCounter(val) {
    this.store.commandIdCounter = val
  }

  async init() {
    try {
      // Check if required dependencies are available
      if (typeof stoStorage === 'undefined' || typeof stoUI === 'undefined') {
        throw new Error('Required dependencies not loaded')
      }

      // Initialize profile service and UI
      this.profileService = new ProfileService({ 
        storage: stoStorage, 
        eventBus, 
        i18n: i18next 
      })
      
      this.profileUI = new ProfileUI({
        service: this.profileService,
        eventBus,
        ui: stoUI,
        modalManager,
        document
      })

      this.aliasService = new AliasModalService({
        eventBus,
        storage: stoStorage,
        ui: stoUI,
      })

      this.aliasUI = new AliasModalUI({
        service: this.aliasService,
        eventBus,
        ui: stoUI,
        modalManager,
        document,
      })

      // ------------------------------
      // Alias Browser (grid selector)
      // ------------------------------
      this.aliasBrowserService = new AliasBrowserService({
        storage: stoStorage,
        ui: stoUI,
      })

      this.aliasBrowserUI = new AliasBrowserUI({
        service: this.aliasBrowserService,
        document,
      })

      // ------------------------------
      // Key Browser (key grid)
      // ------------------------------
      this.keyBrowserService = new KeyBrowserService({
        storage: stoStorage,
        profileService: this.profileService,
        ui: stoUI,
      })

      this.keyBrowserUI = new KeyBrowserUI({
        service: this.keyBrowserService,
        app: this,
        document,
      })

      // ------------------------------
      // Command service (new authority)
      // ------------------------------
      this.commandService = new CommandService({
        storage: stoStorage,
        eventBus,
        i18n: i18next,
        ui: stoUI,
      })

      // Initialize early so it listens to profile-switched emitted during loadData
      this.commandService.init()

      // Initialize command library service and UI – delegates to commandService
      this.commandLibraryService = new CommandLibraryService({
        storage: stoStorage,
        eventBus,
        i18n: i18next,
        ui: stoUI,
        modalManager,
        commandService: this.commandService,
      })

      // Initialize command library UI
      this.commandLibraryUI = new CommandLibraryUI({
        service: this.commandLibraryService,
        eventBus,
        ui: stoUI,
        modalManager,
        document,
      })

      // ------------------------------------------------------------------
      // New command-chain component (phase-1)
      // ------------------------------------------------------------------
      this.commandChainService = new CommandChainService({
        i18n: i18next,
        commandLibraryService: this.commandLibraryService,
        commandService: this.commandService,
      })
      this.commandChainUI      = new CommandChainUI({
        service: this.commandChainService,
        ui: stoUI,
        eventBus,
        document
      })

      // ---------------------------------
      // Command UI (parameter modal owner)
      // ---------------------------------
      this.commandUI = new CommandUI({
        eventBus,
        ui: stoUI,
        modalManager,
        commandService: this.commandService,
        commandLibraryService: this.commandLibraryService,
      })

      // Load profile data
      await this.profileService.loadData()

      // Ensure command library service is synced with the loaded profile/environment
      if (this.commandLibraryService && this.profileService) {
        this.commandLibraryService.setCurrentProfile(this.profileService.getCurrentProfileId())
      }

      window.stoAliases = this.aliasUI

      eventBus.on('sto-app-ready', () => {
        this.aliasService.init()
        this.aliasUI.init()
        // commandService is initialized earlier, so we don't need to call it here
        // this.commandService.init()
        this.commandLibraryService.init()
        this.commandChainService.init()
        this.commandChainUI.init()
        this.aliasBrowserService.init()
        this.aliasBrowserUI.init()
        this.keyBrowserService.init()
        this.keyBrowserUI.init()
        this.commandUI.init()
      })

      // Apply saved theme
      this.applyTheme()
      await this.applyLanguage()

      // Setup UI components
      this.setupEventListeners()
      this.setupCommandLibrary()
      this.setupDragAndDrop()
      
      // Initialize preferences manager
      this.preferencesManager.init()

      // Initialize auto-sync manager
      this.autoSyncManager.init()

      // Initialize profile UI
      this.profileUI.init()

      // Render initial state
      this.profileUI.renderProfiles()
      this.profileUI.renderKeyGrid()
      this.profileUI.renderCommandChain()
      this.profileUI.updateProfileInfo()
      this.updateModeUI()

      // Update mode buttons to reflect current environment
      this.updateModeButtons()

      // Update toggle button to reflect current view mode
      const currentViewMode = localStorage.getItem('keyViewMode') || 'key-types'
      this.updateViewToggleButton(currentViewMode)

      // Update theme toggle button to reflect current theme
      const settings = stoStorage.getSettings()
      this.updateThemeToggleButton(settings.theme || 'default')

      // Show welcome message for new users
      if (this.isFirstTime()) {
        this.showWelcomeMessage()
      }

      stoUI.showToast(
        i18next.t('sto_tools_keybind_manager_loaded_successfully'),
        'success'
      )

      // Flag the instance as fully initialized so tests can poll for readiness
      this.initialized = true

      // Dispatch app ready event through eventBus
      eventBus.emit('sto-app-ready', { app: this })

      // Make chain UI globally accessible for legacy components/test hooks
      window.commandChainUI = this.commandChainUI

      // Expose key browser for legacy hooks/tests
      window.keyBrowserUI = this.keyBrowserUI
      window.keyBrowserService = this.keyBrowserService

      // Alias selection now flows through the event bus to CommandChainService
      // and CommandLibraryService, so no direct wiring needed here.

      // Make the service available to helper modules that are plain objects
      parameterCommands.commandService = this.commandService
    } catch (error) {
      console.error('Failed to initialize application:', error)
      if (typeof stoUI !== 'undefined' && stoUI.showToast) {
        stoUI.showToast(
          typeof i18next !== 'undefined' ? i18next.t('failed_to_load_application') : 'Failed to load application',
          'error'
        )
      }

      // Dispatch error event through eventBus
      eventBus.emit('sto-app-error', { error })
    }
  }

  // Proxy methods for backward compatibility
  get currentProfile() {
    return this.profileService ? this.profileService.getCurrentProfileId() : this.store.currentProfile
  }
  
  set currentProfile(val) {
    this.store.currentProfile = val
    if (this.profileService) {
      this.profileService.currentProfile = val
    }
  }

  get currentEnvironment() {
    return this.profileService ? this.profileService.getCurrentEnvironment() : this.store.currentEnvironment
  }
  
  set currentEnvironment(val) {
    this.store.currentEnvironment = val
    if (this.profileService) {
      this.profileService.setCurrentEnvironment(val)
    }
  }

  get selectedKey() {
    return this.store.selectedKey
  }
  
  set selectedKey(val) {
    this.store.selectedKey = val
    // Synchronize with the command library service
    if (this.commandLibraryService) {
      this.commandLibraryService.setSelectedKey(val)
    }
  }

  get isModified() {
    return this.profileService ? this.profileService.getModified() : this.store.isModified
  }
  
  set isModified(val) {
    this.store.isModified = val
    if (this.profileService) {
      this.profileService.setModified(val)
    }
  }

  // Profile management proxy methods
  getCurrentProfile() {
    return this.profileService ? this.profileService.getCurrentProfile() : null
  }

  switchProfile(profileId) {
    if (this.profileService && this.profileUI) {
      return this.profileUI.handleProfileSwitch(profileId)
    }
  }

  createProfile(name, description, mode) {
    if (this.profileService && this.profileUI) {
      try {
        const result = this.profileService.createProfile(name, description, mode)
        if (result.success) {
          this.profileService.switchProfile(result.profileId)
          this.profileUI.renderProfiles()
          this.profileUI.renderKeyGrid()
          this.profileUI.renderCommandChain()
          this.profileUI.updateProfileInfo()
          // Show toast message for test compatibility
          if (typeof stoUI !== 'undefined' && stoUI.showToast) {
            stoUI.showToast(result.message, 'success')
          }
          return result.profileId
        }
        return null
      } catch (error) {
        return null
      }
    }
    return null
  }

  cloneProfile(sourceProfileId, newName) {
    if (this.profileService && this.profileUI) {
      try {
        const result = this.profileService.cloneProfile(sourceProfileId, newName)
        if (result.success) {
          this.profileUI.renderProfiles()
          // Show toast message for test compatibility
          if (typeof stoUI !== 'undefined' && stoUI.showToast) {
            stoUI.showToast(result.message, 'success')
          }
          return result.profileId
        }
        return null
      } catch (error) {
        return null
      }
    }
    return null
  }

  deleteProfile(profileId) {
    if (this.profileService && this.profileUI) {
      try {
        const result = this.profileService.deleteProfile(profileId)
        if (result.success) {
          if (result.switchedProfile) {
            this.selectedKey = null
            this.profileUI.renderKeyGrid()
            this.profileUI.renderCommandChain()
            this.profileUI.updateProfileInfo()
          }
          this.profileUI.renderProfiles()
          return true
        }
        return false
      } catch (error) {
        return false
      }
    }
    return false
  }

  saveProfile() {
    if (this.profileService) {
      try {
        this.profileService.saveProfile()
        return true
      } catch (error) {
        return false
      }
    }
    return false
  }

  saveData() {
    if (this.profileService) {
      try {
        this.profileService.saveData()
        return true
      } catch (error) {
        return false
      }
    }
    return false
  }

  setModified(modified = true) {
    if (this.profileService) {
      this.profileService.setModified(modified)
    }
    if (this.profileUI) {
      this.profileUI.updateProfileInfo()
    }
  }

  renderProfiles() {
    if (this.profileUI) {
      this.profileUI.renderProfiles()
    }
  }

  updateProfileInfo() {
    if (this.profileUI) {
      this.profileUI.updateProfileInfo()
    }
  }

  saveCurrentBuild() {
    if (this.profileService) {
      try {
        this.profileService.saveCurrentBuild()
        return true
      } catch (error) {
        return false
      }
    }
    return false
  }

  saveCurrentProfile() {
    if (this.profileService) {
      try {
        this.profileService.saveCurrentProfile()
        return true
      } catch (error) {
        return false
      }
    }
    return false
  }

  getCurrentBuild(profile) {
    if (this.profileService) {
      return this.profileService.getCurrentBuild(profile)
    }
    return null
  }

  generateProfileId(name) {
    if (this.profileService) {
      return this.profileService.generateProfileId(name)
    }
    return null
  }

  // Alias management proxy methods for backward compatibility
  createAliasChain(name, description = '') {
    if (this.aliasService) {
      return this.aliasService.createAliasChain(name, description)
    }
  }

  renderAliasGrid() {
    if (this.aliasBrowserUI && typeof this.aliasBrowserUI.render === 'function') {
      this.aliasBrowserUI.render()
    }
  }

  generateCommandId() {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  addCommand(key, command) {
    const profile = this.getCurrentProfile()
    if (!profile || !key) return false

    if (!profile.keys) {
      profile.keys = {}
    }
    if (!profile.keys[key]) {
      profile.keys[key] = []
    }

    profile.keys[key].push(command)
    this.saveProfile()
    this.setModified(true)
    return true
  }

  selectKey(keyName) {
    keyHandling.selectKey(keyName)
    // Synchronize with the command library service
    if (this.commandLibraryService) {
      this.commandLibraryService.setSelectedKey(keyName)
    }
  }

  // Command library proxy methods for backward compatibility
  renderCommandChain() {
    if (this.commandLibraryUI) {
      this.commandLibraryUI.renderCommandChain()
    }
  }

  setupCommandLibrary() {
    if (this.commandLibraryUI) {
      this.commandLibraryUI.setupCommandLibrary()
    }
  }

  setupDragAndDrop() {
    if (this.commandLibraryUI) {
      this.commandLibraryUI.setupDragAndDrop()
    }
  }

  filterCommandLibrary() {
    if (this.commandLibraryService) {
      this.commandLibraryService.filterCommandLibrary()
    }
  }

  updateChainActions() {
    if (this.commandLibraryUI) {
      this.commandLibraryUI.updateChainActions()
    }
  }

  toggleLibrary() {
    if (this.commandLibraryUI) {
      this.commandLibraryUI.toggleLibrary()
    }
  }

  showTemplateModal() {
    if (this.commandLibraryUI) {
      this.commandLibraryUI.showTemplateModal()
    }
  }



  // ------------------------------------------------------------------
  // Backward-compatibility thin wrappers – emit events rather than performing
  // logic directly. These can be deleted once all tests & legacy hooks are
  // migrated.
  // ------------------------------------------------------------------
  deleteCommand(key, index) {
    if (typeof eventBus !== 'undefined') {
      eventBus.emit('commandchain:delete', { index })
    }
  }

  moveCommand(key, fromIndex, toIndex) {
    if (typeof eventBus !== 'undefined') {
      eventBus.emit('commandchain:move', { fromIndex, toIndex })
    }
  }

  editCommand(index) {
    if (typeof eventBus !== 'undefined') {
      eventBus.emit('commandchain:edit', { index })
    }
  }
}

// Initialize application
Object.assign(
  STOToolsKeybindManager.prototype,
  keyHandling,
  uiRendering,
  parameterCommands,
  keyCapture,
  eventHandlers,
  projectManagement,
  modeManagement,
  viewManagement,
  welcome,
)
;

