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
import { commandLibrary } from './features/commandLibrary.js'
import { aliasView } from './ui/aliasView.js'
import { viewManagement } from './ui/viewManagement.js'
import { welcome } from './ui/welcome.js'

export default class STOToolsKeybindManager {
  constructor() {
    this.store = store
    this.eventListeners = new Map()
    this.preferencesManager = new STOPreferencesManager()
    this.autoSyncManager = new STOAutoSyncManager()
    
    // Initialize profile service and UI when dependencies are available
    this.profileService = null
    this.profileUI = null

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

      // Load profile data
      await this.profileService.loadData()

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

      // Dispatch app ready event through eventBus
      eventBus.emit('sto-app-ready', { app: this })
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
  commandLibrary,
  aliasView,
  viewManagement,
  welcome,
)
;

