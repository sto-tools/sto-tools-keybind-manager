// STO Tools Keybind Manager - Main Application Controller
// Coordinates all modules and handles global application state
import store from './core/store.js'
import eventBus from './core/eventBus.js'
import { AutoSync } from './components/services/index.js'
import ProfileService from './components/services/ProfileService.js'
import ProfileUI from './components/ui/ProfileUI.js'
import { keyHandling } from './features/keyHandling.js'
import { uiRendering } from './ui/uiRendering.js'
import { parameterCommands } from './features/parameterCommands.js'
import { keyCapture } from './ui/keyCapture.js'
import { EventHandlerService, InterfaceModeService } from './components/services/index.js'
import { ProjectManagementService } from './components/services/index.js'
import { InterfaceModeUI } from './components/ui/index.js'
import { CommandService, CommandLibraryService } from './components/services/index.js'
import { CommandLibraryUI, CommandUI } from './components/ui/index.js'
import { AliasModalService, AliasModalUI } from './components/aliases/index.js'
import { viewManagement } from './ui/viewManagement.js'
import { welcome } from './ui/welcome.js'
import { CommandChainService, CommandChainUI } from './components/chain/index.js'
import { AliasBrowserService, AliasBrowserUI } from './components/aliases/index.js'
import { KeyBrowserService, KeyBrowserUI } from './components/keybinds/index.js'
import { PreferencesService } from './components/services/index.js'
import PreferencesUI from './components/ui/PreferencesUI.js'

export default class STOToolsKeybindManager {
  constructor() {
    this.store = store
    this.eventListeners = new Map()
    this.autoSyncManager = null // created later when dependencies available

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

    // Project management service (export/import operations)
    this.projectManagementService = null

    // Bind key capture handlers once for consistent add/remove
    this.boundHandleKeyDown = this.handleKeyDown.bind(this)
    this.boundHandleKeyUp = this.handleKeyUp.bind(this)

    // Note: init() is now called manually from main.js after dependencies are ready
  }

  get currentMode() {
    return this.interfaceModeService ? this.interfaceModeService.currentMode : this.store?.currentMode
  }

  set currentMode(val) {
    if (this.store) {
      this.store.currentMode = val
    }
    if (this.interfaceModeService) {
      this.interfaceModeService.currentMode = val
    }
  }

  get undoStack() {
    // Safeguard for cases where getter is accessed on prototype or an instance
    // not yet fully constructed (e.g. via pretty-printer libraries).
    const targetStore = this && this.store ? this.store : store
    return targetStore.undoStack
  }
  set undoStack(val) {
    const targetStore = this && this.store ? this.store : store
    targetStore.undoStack = val
  }

  get redoStack() {
    const targetStore = this && this.store ? this.store : store
    return targetStore.redoStack
  }
  set redoStack(val) {
    const targetStore = this && this.store ? this.store : store
    targetStore.redoStack = val
  }

  get maxUndoSteps() {
    const targetStore = this && this.store ? this.store : store
    return targetStore.maxUndoSteps
  }
  set maxUndoSteps(val) {
    const targetStore = this && this.store ? this.store : store
    targetStore.maxUndoSteps = val
  }

  get commandIdCounter() {
    const targetStore = this && this.store ? this.store : store
    return targetStore.commandIdCounter
  }
  set commandIdCounter(val) {
    const targetStore = this && this.store ? this.store : store
    targetStore.commandIdCounter = val
  }

  async init() {
    try {
      // dbg('app.init start')
      // dbg('checking dependencies - storageService:', typeof storageService, 'stoUI:', typeof stoUI)
      if (typeof storageService === 'undefined' || typeof stoUI === 'undefined') {
        // dbg('dependencies check FAILED')
        throw new Error('Required dependencies not loaded')
      }
      // dbg('dependencies check passed')
      // dbg('About to create ProfileService')
      this.profileService = new ProfileService({ 
        storage: storageService, 
        eventBus, 
        i18n: i18next 
      })
      // dbg('ProfileService created')
      
      // dbg('About to create ProfileUI')
      try {
        this.profileUI = new ProfileUI({
          service: this.profileService,
          eventBus,
          ui: stoUI,
          modalManager,
          document
        })
        // dbg('ProfileUI created successfully')
      } catch (error) {
        // dbg('TEST: Error creating ProfileUI:', error)
        throw error
      }

      // dbg('About to create AliasModalService')
      this.aliasService = new AliasModalService({
        eventBus,
        storage: storageService,
        ui: stoUI,
      })

      // dbg('AliasModalService created')
      this.aliasUI = new AliasModalUI({
        service: this.aliasService,
        eventBus,
        ui: stoUI,
        modalManager,
        document,
      })

      // dbg('AliasModalUI created')
      // ------------------------------
      // Alias Browser (grid selector)
      // ------------------------------
      this.aliasBrowserService = new AliasBrowserService({
        storage: storageService,
        ui: stoUI,
      })

      // dbg('AliasBrowserService created')
      this.aliasBrowserUI = new AliasBrowserUI({
        service: this.aliasBrowserService,
        document,
      })

      // dbg('AliasBrowserUI created')
      // ------------------------------
      // Key Browser (key grid)
      // ------------------------------
      this.keyBrowserService = new KeyBrowserService({
        storage: storageService,
        profileService: this.profileService,
        ui: stoUI,
      })

      // dbg('KeyBrowserService created')
      this.keyBrowserUI = new KeyBrowserUI({
        service: this.keyBrowserService,
        app: this,
        document,
      })

      // dbg('KeyBrowserUI created')
      // ------------------------------
      // Command service (new authority)
      // ------------------------------
      this.commandService = new CommandService({
        storage: storageService,
        eventBus,
        i18n: i18next,
        ui: stoUI,
      })

      // dbg('CommandService created')
      // Initialize early so it listens to profile-switched emitted during loadData
      this.commandService.init()

      // dbg('CommandService initialized')
      // Initialize command library service and UI – delegates to commandService
      this.commandLibraryService = new CommandLibraryService({
        storage: storageService,
        eventBus,
        i18n: i18next,
        ui: stoUI,
        modalManager,
        commandService: this.commandService,
      })

      // dbg('CommandLibraryService created')
      this.commandLibraryUI = new CommandLibraryUI({
        service: this.commandLibraryService,
        eventBus,
        ui: stoUI,
        modalManager,
        document,
      })

      // dbg('CommandLibraryUI created')
      // ------------------------------------------------------------------
      // New command-chain component (phase-1)
      // ------------------------------------------------------------------
      this.commandChainService = new CommandChainService({
        i18n: i18next,
        commandLibraryService: this.commandLibraryService,
        commandService: this.commandService,
      })
      // dbg('CommandChainService created')
      this.commandChainUI      = new CommandChainUI({
        service: this.commandChainService,
        ui: stoUI,
        eventBus,
        document
      })

      // dbg('CommandChainUI created')
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

      // dbg('CommandUI created')
      
      // Initialize EventHandlerService
      this.eventHandlerService = new EventHandlerService({
        eventBus,
        storage: storageService,
        ui: stoUI,
        modalManager,
        i18n: i18next,
        app: this
      })
      // dbg('EventHandlerService created')
      
      // Initialize InterfaceModeService
      this.interfaceModeService = new InterfaceModeService({
        eventBus,
        storage: storageService,
        profileService: this.profileService,
        app: this
      })
      // dbg('InterfaceModeService created')
      
      // Initialize InterfaceModeUI
      this.interfaceModeUI = new InterfaceModeUI({
        service: this.interfaceModeService,
        eventBus,
        ui: stoUI,
        profileUI: this.profileUI,
        document
      })
      // dbg('InterfaceModeUI created')
      
      // Load profile data first
      await this.profileService.loadData()

      // dbg('Profile data loaded')
      // Ensure command library service is synced with the loaded profile/environment
      if (this.commandLibraryService && this.profileService) {
        this.commandLibraryService.setCurrentProfile(this.profileService.getCurrentProfileId())
      }

      // dbg('Command library synced')
      window.stoAliases = this.aliasUI

      // dbg('Setting up sto-app-ready event handler')
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

      // dbg('Event handler setup completed')
      // Apply theme
      this.applyTheme()

      // dbg('Theme applied')
      // Apply language
      await this.applyLanguage()

      // dbg('Language applied')
      // Setup command library
      this.setupCommandLibrary()

      // dbg('Command library setup')
      // Setup drag and drop
      this.setupDragAndDrop()

      // dbg('Drag and drop setup')
      // Initialize preferences service & UI
      this.preferencesService = new PreferencesService({ storage: storageService, eventBus, i18n: i18next, ui: stoUI })
      this.preferencesUI = new PreferencesUI({ service: this.preferencesService, modalManager, ui: stoUI })
      this.preferencesManager = this.preferencesUI
      this.preferencesService.init()
      this.preferencesUI.init()

      // dbg('Preferences service & UI initialized')
      // Initialize auto-sync manager
      this.autoSyncManager = new AutoSync({ eventBus, storage: storageService, syncManager: window.stoSync, ui: stoUI })
      this.autoSyncManager.init()

      // dbg('Auto-sync manager initialized')
      // Initialize profile UI
      this.profileUI.init()
      // dbg('Profile UI initialized')

      // Setup UI event handlers after all components are initialized
      // dbg('About to call eventHandlerService.init, method exists:', typeof this.eventHandlerService?.init === 'function')
      // dbg('About to call interfaceModeService.init, method exists:', typeof this.interfaceModeService?.init === 'function')
      // dbg('About to call interfaceModeUI.init, method exists:', typeof this.interfaceModeUI?.init === 'function')
      // dbg('Calling eventHandlerService.init now...')
      try {
        this.eventHandlerService.init()
        // dbg('eventHandlerService.init completed successfully')
      } catch (error) {
        // dbg('Error in eventHandlerService.init:', error)
        throw error // Re-throw to see the full error
      }
      // dbg('Calling interfaceModeService.init now...')
      try {
        this.interfaceModeService.init()
        // dbg('interfaceModeService.init completed successfully')
      } catch (error) {
        // dbg('Error in interfaceModeService.init:', error)
        throw error // Re-throw to see the full error
      }
      // dbg('Calling interfaceModeUI.init now...')
      try {
        this.interfaceModeUI.init()
        // dbg('interfaceModeUI.init completed successfully')
      } catch (error) {
        // dbg('Error in interfaceModeUI.init:', error)
        throw error // Re-throw to see the full error
      }

      // dbg('About to render initial state...')
      // Render initial state
      this.profileUI.renderProfiles()
      // dbg('Profiles rendered')
      this.profileUI.renderKeyGrid()
      // dbg('Key grid rendered')
      this.profileUI.renderCommandChain()
      // dbg('Command chain rendered')
      this.profileUI.updateProfileInfo()
      // dbg('Profile info updated')
      this.updateModeUI()
      // dbg('Mode UI updated (1st call)')

      // Update mode buttons to reflect current environment
      this.updateModeUI()
      // dbg('Mode UI updated (2nd call)')

      // Update toggle button to reflect current view mode
      const currentViewMode = localStorage.getItem('keyViewMode') || 'key-types'
      this.updateViewToggleButton(currentViewMode)
      // dbg('View toggle button updated')

      // Update theme toggle button to reflect current theme
      const settings = storageService.getSettings()
      this.updateThemeToggleButton(settings.theme || 'default')
      // dbg('Theme toggle button updated')

      // Show welcome message for new users
      if (this.isFirstTime()) {
        this.showWelcomeMessage()
      }
      // dbg('Welcome message check completed')

      stoUI.showToast(
        i18next.t('sto_tools_keybind_manager_loaded_successfully'),
        'success'
      )
      // dbg('Success toast shown')

      // Flag the instance as fully initialized so tests can poll for readiness
      this.initialized = true
      // dbg('Initialized flag set to true')

      // Dispatch app ready event through eventBus
      // dbg('About to emit sto-app-ready event')
      eventBus.emit('sto-app-ready', { app: this })
      // dbg('sto-app-ready event emitted successfully')

      // Make chain UI globally accessible for legacy components/test hooks
      window.commandChainUI = this.commandChainUI

      // Expose key browser for legacy hooks/tests
      window.keyBrowserUI = this.keyBrowserUI
      window.keyBrowserService = this.keyBrowserService

      // Alias selection now flows through the event bus to CommandChainService
      // and CommandLibraryService, so no direct wiring needed here.

      // Make the service available to helper modules that are plain objects
      parameterCommands.commandService = this.commandService

      // dbg('Init method completed successfully!')

      // Provide UI reference to EventHandlerService for legacy menu button
      if (this.eventHandlerService) {
        this.eventHandlerService.preferencesManager = this.preferencesUI
      }

      // ------------------------------
      // Project management service (new)
      // ------------------------------
      this.projectManagementService = new ProjectManagementService({
        storage: storageService,
        ui: stoUI,
        exportManager: window.stoExport,
        i18n: i18next,
        app: this,
        eventBus,
      })
      // No special init needed currently
    } catch (error) {
      // dbg('Failed to initialize application:', error)
      // dbg('Error stack:', error.stack)
      if (typeof stoUI !== 'undefined' && stoUI.showToast) {
        stoUI.showToast(
          typeof i18next !== 'undefined' ? i18next.t('failed_to_load_application') : 'Failed to load application',
          'error'
        )
      }

      // Dispatch error event through eventBus
      eventBus.emit('sto-app-error', { error })
      throw error // Re-throw to ensure the error is visible
    }
  }

  // Proxy methods for backward compatibility
  get currentProfile() {
    return this.profileService ? this.profileService.getCurrentProfileId() : this.store?.currentProfile
  }
  
  set currentProfile(val) {
    if (this.store) {
      this.store.currentProfile = val
    }
    if (this.profileService) {
      this.profileService.currentProfile = val
    }
  }

  get currentEnvironment() {
    return this.profileService ? this.profileService.getCurrentEnvironment() : this.store?.currentEnvironment
  }
  
  set currentEnvironment(val) {
    if (this.store) {
      this.store.currentEnvironment = val
    }
    if (this.profileService) {
      this.profileService.setCurrentEnvironment(val)
    }
    if (this.interfaceModeService) {
      this.interfaceModeService.currentEnvironment = val
    }
  }

  get selectedKey() {
    return this.store?.selectedKey
  }
  
  set selectedKey(val) {
    if (this.store) {
      this.store.selectedKey = val
    }
    // Synchronize with the command library service
    if (this.commandLibraryService) {
      this.commandLibraryService.setSelectedKey(val)
    }
  }

  get isModified() {
    return this.profileService ? this.profileService.getModified() : this.store?.isModified
  }
  
  set isModified(val) {
    if (this.store) {
      this.store.isModified = val
    }
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

  // Mode management proxy methods for backward compatibility
  switchMode(mode) {
    if (this.interfaceModeService) {
      return this.interfaceModeService.switchMode(mode)
    }
  }

  updateModeUI() {
    if (this.interfaceModeUI) {
      return this.interfaceModeUI.updateModeUI()
    }
  }

  getCurrentMode() {
    if (this.interfaceModeService) {
      return this.interfaceModeService.getCurrentMode()
    }
    return this.currentMode
  }

  setCurrentMode(mode) {
    if (this.interfaceModeService) {
      return this.interfaceModeService.setCurrentMode(mode)
    }
  }

  /* --------------------------------------------------
   * Project management wrappers (delegates to service)
   * ------------------------------------------------ */
  exportProject(...args) {
    return this.projectManagementService?.exportProject(...args)
  }
  importProject(...args) {
    return this.projectManagementService?.importProject(...args)
  }
  loadProjectFromFile(...args) {
    return this.projectManagementService?.loadProjectFromFile(...args)
  }
  saveProjectToFile(...args) {
    return this.projectManagementService?.saveProjectToFile(...args)
  }
  validateProjectData(...args) {
    return this.projectManagementService?.validateProjectData(...args)
  }
  openProject(...args) {
    return this.projectManagementService?.openProject(...args)
  }
  saveProject(...args) {
    return this.projectManagementService?.saveProject(...args)
  }
  exportKeybinds(...args) {
    return this.projectManagementService?.exportKeybinds(...args)
  }
}

// Apply mixins to prototype
Object.assign(
  STOToolsKeybindManager.prototype,
  keyHandling,
  uiRendering,
  parameterCommands,
  keyCapture,
  viewManagement,
  welcome,
)

