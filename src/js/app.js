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
import { EventHandlerService, InterfaceModeService } from './components/services/index.js'
import { projectManagement } from './services/projectManagement.js'
import { InterfaceModeUI } from './components/ui/index.js'
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
      console.log('TEST: app.init')
      console.log('TEST: app.init - line 2')
      console.log('[app] 1. Starting init...')
      // Check if required dependencies are available
      console.log('TEST: checking dependencies - storageService:', typeof storageService, 'stoUI:', typeof stoUI)
      if (typeof storageService === 'undefined' || typeof stoUI === 'undefined') {
        console.log('TEST: dependencies check FAILED')
        throw new Error('Required dependencies not loaded')
      }
      console.log('TEST: dependencies check PASSED')
      console.log('[app] 2. Dependencies check passed')
      // Initialize profile service and UI using new StorageService
      console.log('TEST: About to create ProfileService')
      console.log('TEST: ProfileService class:', ProfileService)
      console.log('TEST: eventBus:', eventBus)
      console.log('TEST: i18next:', i18next)
      this.profileService = new ProfileService({ 
        storage: storageService, 
        eventBus, 
        i18n: i18next 
      })
      console.log('TEST: ProfileService created successfully')
      
      console.log('[app] 3. ProfileService created')
      console.log('TEST: About to create ProfileUI')
      try {
        this.profileUI = new ProfileUI({
          service: this.profileService,
          eventBus,
          ui: stoUI,
          modalManager,
          document
        })
        console.log('TEST: ProfileUI created successfully')
      } catch (error) {
        console.error('TEST: Error creating ProfileUI:', error)
        throw error
      }

      console.log('[app] 4. ProfileUI created')
      this.aliasService = new AliasModalService({
        eventBus,
        storage: storageService,
        ui: stoUI,
      })

      console.log('[app] 5. AliasModalService created')
      this.aliasUI = new AliasModalUI({
        service: this.aliasService,
        eventBus,
        ui: stoUI,
        modalManager,
        document,
      })

      console.log('[app] 6. AliasModalUI created')
      // ------------------------------
      // Alias Browser (grid selector)
      // ------------------------------
      this.aliasBrowserService = new AliasBrowserService({
        storage: storageService,
        ui: stoUI,
      })

      console.log('[app] 7. AliasBrowserService created')
      this.aliasBrowserUI = new AliasBrowserUI({
        service: this.aliasBrowserService,
        document,
      })

      console.log('[app] 8. AliasBrowserUI created')
      // ------------------------------
      // Key Browser (key grid)
      // ------------------------------
      this.keyBrowserService = new KeyBrowserService({
        storage: storageService,
        profileService: this.profileService,
        ui: stoUI,
      })

      console.log('[app] 9. KeyBrowserService created')
      this.keyBrowserUI = new KeyBrowserUI({
        service: this.keyBrowserService,
        app: this,
        document,
      })

      console.log('[app] 10. KeyBrowserUI created')
      // ------------------------------
      // Command service (new authority)
      // ------------------------------
      this.commandService = new CommandService({
        storage: storageService,
        eventBus,
        i18n: i18next,
        ui: stoUI,
      })

      console.log('[app] 11. CommandService created')
      // Initialize early so it listens to profile-switched emitted during loadData
      this.commandService.init()

      console.log('[app] 12. CommandService initialized')
      // Initialize command library service and UI – delegates to commandService
      this.commandLibraryService = new CommandLibraryService({
        storage: storageService,
        eventBus,
        i18n: i18next,
        ui: stoUI,
        modalManager,
        commandService: this.commandService,
      })

      console.log('[app] 13. CommandLibraryService created')
      this.commandLibraryUI = new CommandLibraryUI({
        service: this.commandLibraryService,
        eventBus,
        ui: stoUI,
        modalManager,
        document,
      })

      console.log('[app] 14. CommandLibraryUI created')
      // ------------------------------------------------------------------
      // New command-chain component (phase-1)
      // ------------------------------------------------------------------
      this.commandChainService = new CommandChainService({
        i18n: i18next,
        commandLibraryService: this.commandLibraryService,
        commandService: this.commandService,
      })
      console.log('[app] 15. CommandChainService created')
      this.commandChainUI      = new CommandChainUI({
        service: this.commandChainService,
        ui: stoUI,
        eventBus,
        document
      })

      console.log('[app] 16. CommandChainUI created')
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

      console.log('[app] 17. CommandUI created')
      
      // Initialize EventHandlerService
      this.eventHandlerService = new EventHandlerService({
        eventBus,
        storage: storageService,
        ui: stoUI,
        modalManager,
        i18n: i18next,
        app: this
      })
      console.log('[app] 17.5. EventHandlerService created')
      
      // Initialize InterfaceModeService
      this.interfaceModeService = new InterfaceModeService({
        eventBus,
        storage: storageService,
        profileService: this.profileService,
        app: this
      })
      console.log('[app] 17.6. InterfaceModeService created')
      
      // Initialize InterfaceModeUI
      this.interfaceModeUI = new InterfaceModeUI({
        service: this.interfaceModeService,
        eventBus,
        ui: stoUI,
        profileUI: this.profileUI,
        document
      })
      console.log('[app] 17.7. InterfaceModeUI created')
      
      // Load profile data first
      await this.profileService.loadData()

      console.log('[app] 18. Profile data loaded')
      // Ensure command library service is synced with the loaded profile/environment
      if (this.commandLibraryService && this.profileService) {
        this.commandLibraryService.setCurrentProfile(this.profileService.getCurrentProfileId())
      }

      console.log('[app] 19. Command library synced')
      window.stoAliases = this.aliasUI

      console.log('[app] 20. Setting up sto-app-ready event handler')
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

      console.log('[app] 21. Event handler setup completed')
      // Apply theme
      this.applyTheme()

      console.log('[app] 22. Theme applied')
      // Apply language
      await this.applyLanguage()

      console.log('[app] 23. Language applied')
      // Setup command library
      this.setupCommandLibrary()

      console.log('[app] 24. Command library setup')
      // Setup drag and drop
      this.setupDragAndDrop()

      console.log('[app] 25. Drag and drop setup')
      // Initialize preferences manager
      this.preferencesManager.init()

      console.log('[app] 26. Preferences manager initialized')
      // Initialize auto-sync manager
      this.autoSyncManager.init()

      console.log('[app] 27. Auto-sync manager initialized')
      // Initialize profile UI
      this.profileUI.init()
      console.log('[app] 28. Profile UI initialized')

      // Setup UI event handlers after all components are initialized
      console.log('[app] About to call eventHandlerService.init, method exists:', typeof this.eventHandlerService?.init === 'function')
      console.log('[app] About to call interfaceModeService.init, method exists:', typeof this.interfaceModeService?.init === 'function')
      console.log('[app] About to call interfaceModeUI.init, method exists:', typeof this.interfaceModeUI?.init === 'function')
      console.log('[app] Calling eventHandlerService.init now...')
      try {
        this.eventHandlerService.init()
        console.log('[app] eventHandlerService.init completed successfully')
      } catch (error) {
        console.error('[app] Error in eventHandlerService.init:', error)
        throw error // Re-throw to see the full error
      }
      console.log('[app] Calling interfaceModeService.init now...')
      try {
        this.interfaceModeService.init()
        console.log('[app] interfaceModeService.init completed successfully')
      } catch (error) {
        console.error('[app] Error in interfaceModeService.init:', error)
        throw error // Re-throw to see the full error
      }
      console.log('[app] Calling interfaceModeUI.init now...')
      try {
        this.interfaceModeUI.init()
        console.log('[app] interfaceModeUI.init completed successfully')
      } catch (error) {
        console.error('[app] Error in interfaceModeUI.init:', error)
        throw error // Re-throw to see the full error
      }

      console.log('[app] About to render initial state...')
      // Render initial state
      this.profileUI.renderProfiles()
      console.log('[app] Profiles rendered')
      this.profileUI.renderKeyGrid()
      console.log('[app] Key grid rendered')
      this.profileUI.renderCommandChain()
      console.log('[app] Command chain rendered')
      this.profileUI.updateProfileInfo()
      console.log('[app] Profile info updated')
      this.updateModeUI()
      console.log('[app] Mode UI updated (1st call)')

      // Update mode buttons to reflect current environment
      this.updateModeUI()
      console.log('[app] Mode UI updated (2nd call)')

      // Update toggle button to reflect current view mode
      const currentViewMode = localStorage.getItem('keyViewMode') || 'key-types'
      this.updateViewToggleButton(currentViewMode)
      console.log('[app] View toggle button updated')

      // Update theme toggle button to reflect current theme
      const settings = storageService.getSettings()
      this.updateThemeToggleButton(settings.theme || 'default')
      console.log('[app] Theme toggle button updated')

      // Show welcome message for new users
      if (this.isFirstTime()) {
        this.showWelcomeMessage()
      }
      console.log('[app] Welcome message check completed')

      stoUI.showToast(
        i18next.t('sto_tools_keybind_manager_loaded_successfully'),
        'success'
      )
      console.log('[app] Success toast shown')

      // Flag the instance as fully initialized so tests can poll for readiness
      this.initialized = true
      console.log('[app] Initialized flag set to true')

      // Dispatch app ready event through eventBus
      console.log('[app] About to emit sto-app-ready event')
      eventBus.emit('sto-app-ready', { app: this })
      console.log('[app] sto-app-ready event emitted successfully')

      // Make chain UI globally accessible for legacy components/test hooks
      window.commandChainUI = this.commandChainUI

      // Expose key browser for legacy hooks/tests
      window.keyBrowserUI = this.keyBrowserUI
      window.keyBrowserService = this.keyBrowserService

      // Alias selection now flows through the event bus to CommandChainService
      // and CommandLibraryService, so no direct wiring needed here.

      // Make the service available to helper modules that are plain objects
      parameterCommands.commandService = this.commandService

      console.log('[app] 29. Init method completed successfully!')
    } catch (error) {
      console.error('Failed to initialize application:', error)
      console.error('Error stack:', error.stack)
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
}

// Apply mixins to prototype
Object.assign(
  STOToolsKeybindManager.prototype,
  keyHandling,
  uiRendering,
  parameterCommands,
  keyCapture,
  projectManagement,
  viewManagement,
  welcome,
)

