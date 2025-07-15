// STO Tools Keybind Manager - Main Application Controller
// Coordinates all modules and handles global application state
import store from './core/store.js'
import eventBus from './core/eventBus.js'
import DataService from './components/services/DataService.js'
import { AutoSync } from './components/services/index.js'
import ProfileService from './components/services/ProfileService.js'
import ProfileUI from './components/ui/ProfileUI.js'

import ParameterCommandUI from './components/ui/ParameterCommandUI.js'
import { InterfaceModeService } from './components/services/index.js'
import { ProjectManagementService } from './components/services/index.js'
import { InterfaceModeUI } from './components/ui/index.js'
import { CommandService, CommandLibraryService } from './components/services/index.js'
import { CommandLibraryUI, CommandUI } from './components/ui/index.js'
import { AliasBrowserService, AliasBrowserUI } from './components/aliases/index.js'

import { CommandChainService, CommandChainUI } from './components/chain/index.js'
import { KeyBrowserService, KeyBrowserUI } from './components/keybinds/index.js'
import { PreferencesService } from './components/services/index.js'
import PreferencesUI from './components/ui/PreferencesUI.js'
import KeyService from './components/services/KeyService.js'
import AliasService from './components/services/AliasService.js'
import AnalyticsService from './components/services/AnalyticsService.js'
import FileOperationsService from './components/services/FileOperationsService.js'
import ExportService from './components/services/ExportService.js'
import ExportUI from './components/ui/ExportUI.js'
import KeyCaptureService from './components/services/KeyCaptureService.js'
import KeyCaptureUI from './components/ui/KeyCaptureUI.js'
import SelectionService from './components/services/SelectionService.js'
import { VFXManagerService, ModalManagerService } from './components/services/index.js'
import { VFXManagerUI, HeaderMenuUI, AboutModalUI, ImportUI } from './components/ui/index.js'
import { SyncUI } from './components/sync/index.js'
import STOCommandParser from './lib/STOCommandParser.js'
import ImportService from './components/services/ImportService.js'
import ParameterCommandService from './components/services/ParameterCommandService.js'


export default class STOToolsKeybindManager {
  constructor() {
    this.store = store
    this.eventListeners = new Map()
    this.autoSyncManager = null // created later when dependencies available

    // REFACTORED: Initialize DataService to eliminate globalThis.STO_DATA dependencies
    this.dataService = null

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
    this.keyService = null
    this.fileOperationsService = null
    this.keyCaptureService = null
    this.keyCaptureUI = null
    this.importUI = null

    // Project management service (export/import operations)
    this.projectManagementService = null

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
      
      // Create ModalManagerService first so it's available for all components
      this.modalManagerService = new ModalManagerService(eventBus)
      this.modalManagerService.init()
      
      // Make it available globally for components that need direct access
      const modalManager = this.modalManagerService
      
      // Initialize STOCommandParser early so other services can use it
      this.stoCommandParser = new STOCommandParser(eventBus)
      // Make it globally available
      window.stoCommandParser = this.stoCommandParser
      
      // REFACTORED: Use DataService created in main.js to ensure it's available before DataCoordinator
      this.dataService = window.dataService
      if (!this.dataService) {
        throw new Error('DataService not available - it should be initialized in main.js before app.init()')
      }
      

      
      // dbg('About to create ProfileService')
      this.profileService = new ProfileService({ 
        storage: storageService, 
        eventBus, 
        i18n: i18next 
      })
      // dbg('ProfileService created')

      // ------------------------------
      // Selection Service (centralized selection management)
      // ------------------------------
      this.selectionService = new SelectionService({ eventBus })
      this.selectionService.init()

    
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

      // ------------------------------
      // Alias Service (CRUD operations)
      // ------------------------------
      this.aliasService = new AliasService({
        storage: storageService,
        eventBus,
        i18n: i18next,
        ui: stoUI,
      })

      await this.aliasService.init()

      // ------------------------------
      // Analytics Service (profile statistics)
      // ------------------------------
      this.analyticsService = new AnalyticsService({
        eventBus,
      })

      await this.analyticsService.init()

      // ------------------------------
      // Alias Browser (grid selector)
      // ------------------------------
      this.aliasBrowserService = new AliasBrowserService({
        storage: storageService,
        ui: stoUI,
        eventBus,
      })

      this.aliasBrowserService.init()

      // dbg('AliasBrowserService created')
      this.aliasBrowserUI = new AliasBrowserUI({
        eventBus,
        modalManager,
        document,
      })

      this.aliasBrowserUI.init()

      // dbg('AliasBrowserUI created')
      // ------------------------------
      // Key Browser (key grid)
      // ------------------------------
      this.keyBrowserService = new KeyBrowserService({
        eventBus,
        storage: storageService,
        profileService: this.profileService,
        ui: stoUI,
      })

      // dbg('KeyBrowserService created')
      this.keyBrowserUI = new KeyBrowserUI({
        service: this.keyBrowserService,
        eventBus,
        document,
        modalManager,
      })

      //this.keyBrowserUI.init()

      // dbg('KeyBrowserUI created')
      // ------------------------------
      // Key service (key operations authority)
      // ------------------------------
      this.keyService = new KeyService({
        storage: storageService,
        eventBus,
        i18n: i18next,
        ui: stoUI,
      })

      this.keyService.init()

      // ------------------------------
      // Import Service (file imports)
      // ------------------------------
      this.importService = new ImportService({
        storage: storageService,
        eventBus,
        i18n: i18next,
        ui: stoUI,
      })

      this.importService.init()

      // ------------------------------
      // Export Service (file generation)
      // ------------------------------
      this.exportService = new ExportService({
        storage: storageService,
        eventBus,
        i18n: i18next,
        ui: stoUI,
      })

      this.exportService.init()

      // ------------------------------
      // Export UI (file export interface)
      // ------------------------------
      this.exportUI = new ExportUI({
        eventBus,
      })

      this.exportUI.init()

      // ------------------------------
      // Key Capture (refactored service + UI)
      // ------------------------------
      this.keyCaptureService = new KeyCaptureService({ eventBus })
      this.keyCaptureService.init()

      this.keyCaptureUI = new KeyCaptureUI({
        eventBus,
        modalManager,
        document,
      })
      this.keyCaptureUI.init()


      // dbg('KeyService created & initialized')
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
      // Initialize early so it listens to profile:switched emitted during loadData
      this.commandService.init()

      // dbg('CommandService initialized')
      // Initialize command library service and UI – delegates to commandService
      this.commandLibraryService = new CommandLibraryService({
        storage: storageService,
        eventBus,
        i18n: i18next,
        ui: stoUI,
        modalManager,
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
        eventBus,
        i18n: i18next,
      })
      // dbg('CommandChainService created')
      this.commandChainUI      = new CommandChainUI({
        eventBus,
        ui: stoUI,
        document
      })

      // dbg('CommandChainUI created')
      
      // ---------------------------------
      // Parameter Command Service (business logic for parameterized commands)
      // ---------------------------------
      this.parameterCommandService = new ParameterCommandService({
        eventBus
      })
      
      // ---------------------------------
      // Parameter Command UI (create first as dependency for CommandUI)
      // ---------------------------------
      this.parameterCommandUI = new ParameterCommandUI({
        eventBus,
        modalManager,
        i18n: i18next,
        ui: stoUI
      })
      
      // ---------------------------------
      // Command UI (parameter modal owner)
      // ---------------------------------
      this.commandUI = new CommandUI({
        eventBus,
        ui: stoUI,
        modalManager,
        parameterCommandUI: this.parameterCommandUI
      })

      // dbg('CommandUI created')
      
      // Initialize HeaderMenuUI to handle header dropdown menus
      this.headerMenuUI = new HeaderMenuUI({
        eventBus,
        document
      })
      // dbg('HeaderMenuUI created')
      
      // Initialize SyncUI to handle sync operations
      this.syncUI = new SyncUI({
        ui: stoUI
      })
      // dbg('SyncUI created')
      
      // Initialize AboutModalUI to handle about modal
      this.aboutModalUI = new AboutModalUI({
        eventBus,
        document
      })
      // dbg('AboutModalUI created')
      
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
        eventBus,
        ui: stoUI,
        profileUI: this.profileUI,
        document
      })
      // dbg('InterfaceModeUI created')

      // Initialize ProfileService so it participates in late join handshake
      this.profileService.init()
      
      // Load profile data
      await this.profileService.loadData()

      // Initialize preferences service & UI
      this.preferencesService = new PreferencesService({ storage: storageService, eventBus, i18n: i18next, ui: stoUI })
      this.preferencesUI = new PreferencesUI({ service: this.preferencesService, ui: stoUI })
      this.preferencesManager = this.preferencesUI
      this.preferencesService.init()
      this.preferencesUI.init()


      // dbg('Profile data loaded')
      // Ensure command library service is synced with the loaded profile/environment
      if (this.commandLibraryService && this.profileService) {
        this.commandLibraryService.currentProfile = this.profileService.getCurrentProfileId()
      }

      // dbg('Command library synced')
      // Legacy global reference kept for backward compatibility (now points to alias browser UI)
      window.stoAliases = this.aliasBrowserUI



      // Initialize UI components and services
      // These need to be initialized BEFORE sto-app-ready is emitted so they can participate in late join handshake
      this.aliasBrowserService.init()
      this.aliasBrowserUI.init()
      // commandService is initialized earlier, so we don't need to call it here
      // this.commandService.init()
      this.commandLibraryService.init()
      // Initialize the CommandLibrary UI so categories render on load
      this.commandLibraryUI.init()
      this.commandChainService.init()
      this.commandChainUI.init()
      this.keyBrowserService.init()
      this.keyBrowserUI.init()
      this.parameterCommandService.init()
      this.commandUI.init()
      this.parameterCommandUI.init()

      // dbg('Event handler setup completed')
      // REMOVED: Theme and language application moved to dedicated services

      // dbg('Language applied')

      // dbg('Preferences service & UI initialized')
      // Initialize VFX Manager service & UI
      this.vfxManagerService = new VFXManagerService(eventBus)
      this.vfxManagerUI = new VFXManagerUI(eventBus, modalManager)
      this.vfxManagerService.init()
      this.vfxManagerUI.init()

      // dbg('VFX Manager service & UI initialized')
      // Initialize auto-sync manager
      this.autoSyncManager = new AutoSync({ eventBus, storage: storageService, syncManager: window.stoSync, ui: stoUI })
      this.autoSyncManager.init()

      // dbg('Auto-sync manager initialized')
      // Initialize profile UI
      this.profileUI.init()
      // dbg('Profile UI initialized')

      // Setup UI event handlers after all components are initialized
      // Initialize InterfaceModeService FIRST so it can broadcast environment state
      try {
        this.interfaceModeService.init()
        // dbg('interfaceModeService.init completed successfully')
      } catch (error) {
        // dbg('Error in interfaceModeService.init:', error)
        throw error // Re-throw to see the full error
      }

      // Small delay to ensure environment state is broadcast before UI components initialize
      await new Promise(resolve => setTimeout(resolve, 10))

      try {
        this.headerMenuUI.onInit()
        // dbg('headerMenuUI.init completed successfully')
      } catch (error) {
        // dbg('Error in headerMenuUI.init:', error)
        throw error // Re-throw to see the full error
      }
      
      try {
        this.syncUI.init()
        // dbg('syncUI.init completed successfully')
      } catch (error) {
        // dbg('Error in syncUI.init:', error)
        throw error // Re-throw to see the full error
      }
      
      try {
        this.aboutModalUI.onInit()
        // dbg('aboutModalUI.init completed successfully')
      } catch (error) {
        // dbg('Error in aboutModalUI.init:', error)
        throw error // Re-throw to see the full error
      }
      
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
      
      this.profileUI.updateProfileInfo()
      // dbg('Profile info updated')

      // REMOVED: View toggle button management moved to dedicated UI components

      // Show welcome message for new users
      this.checkAndShowWelcomeMessage()
      
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

      // REMOVED: parameterCommands mixin is now handled by ParameterCommandUI directly

      // dbg('Init method completed successfully!')

      // UI components now handle their own event listeners - no central coordinator needed

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

      // ------------------------------
      // Components now handle their own event coordination - no central coordination needed
      // ------------------------------

      // ---------------------------------

      // Import UI – handles file selection for import menu
      this.importUI = new ImportUI({
        eventBus,
        document,
      })
      this.importUI.init()

      // Bindset manager button visibility control
      this.updateBindsetButtonVisibility = () => {
        try {
          const aliasMode = this.preferencesService?.getSetting?.('bindToAliasMode') ?? false
          const bindsets  = this.preferencesService?.getSetting?.('bindsetsEnabled') ?? false
          const btn = document.getElementById('bindsetManagerBtn')
          if (btn) {
            const show = aliasMode && bindsets
            btn.style.display = show ? '' : 'none'

            // Hide parent toolbar-group if empty
            const group = btn.closest('.toolbar-group')
            if (group) {
              group.style.display = show ? '' : 'none'
            }
          }
        } catch (e) {
          console.warn('Failed to update Bindset button visibility', e)
        }
      }

      // Initial state
      this.updateBindsetButtonVisibility()

      // Update when preference changes
      eventBus.on('preferences:changed', (data) => {
        if (data.key === 'bindsetsEnabled' || data.key === 'bindToAliasMode') {
          this.updateBindsetButtonVisibility()
        }
      })

      // Initialize bindset service & UI
      const { default: BindsetService }      = await import('./components/services/BindsetService.js')
      const { default: BindsetManagerUI }    = await import('./components/ui/BindsetManagerUI.js')

      this.bindsetService  = new BindsetService({ eventBus })
      this.bindsetManagerUI = new BindsetManagerUI({ eventBus })
      this.bindsetService.init()
      this.bindsetManagerUI.init()

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

  // REMOVED: All proxy methods have been eliminated to achieve clean component decoupling
  // Components should now communicate via eventBus and request/response patterns:
  //
  // Instead of: app.currentProfile
  // Use: request(eventBus, 'profile:get-current', {})
  //
  // Instead of: app.currentEnvironment  
  // Use: Listen to 'environment:changed' events
  //
  // Instead of: app.selectedKey
  // Use: Listen to 'key-selected' events
  //
  // Instead of: app.isModified
  // Use: Listen to 'profile-modified' events

  // REMOVED: Profile management proxy methods
  // These have been removed as part of Phase 1 refactoring to eliminate app proxy methods.
  // Components should now communicate directly with ProfileService and ProfileUI via events:
  // - Use eventBus events: 'profile:switch', 'profile:create', 'profile:delete' etc.
  // - Use request/response pattern: request(eventBus, 'profile:get-current', {})
  // - Listen to events: 'profile:switched', 'profile-created', 'profile-deleted'

  // REMOVED: Alias management proxy methods for backward compatibility
  // These have been removed as part of Phase 1 refactoring.
  // Use AliasBrowserService and AliasBrowserUI events instead:
  // - eventBus.emit('alias:create', { name, description })
  // - eventBus.emit('alias:render')

  generateCommandId() {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // REMOVED: All proxy methods have been eliminated to achieve clean component decoupling
  // Components should now communicate via eventBus and request/response patterns:
  //
  // Instead of: app.addCommand(key, command)
  // Use: eventBus.emit('command:add', { key, command })
  //
  // Instead of: app.getCurrentProfile()
  // Use: request(eventBus, 'profile:get-current', {})
  //
  // Instead of: app.saveProfile()
  // Use: eventBus.emit('profile:save')
  //
  // Instead of: app.setModified(true)
  // Use: eventBus.emit('profile:set-modified', { modified: true })

  // REMOVED: Key capture proxy methods
  // These have been removed as part of Phase 1 refactoring.
  // Use KeyCaptureService and KeyCaptureUI events instead:
  // - eventBus.emit('key-capture:start', { modalContext })
  // - eventBus.emit('key-capture:stop')

  // REMOVED: Theme and language proxy methods
  // These have been removed as part of Phase 1 refactoring.
  // Use PreferencesService events instead:
  // - eventBus.emit('preferences:theme-change', { theme })
  // - eventBus.emit('preferences:language-change', { language })
 
  
  // (deprecated mode & project proxy methods removed)

  // ------------------------------
  // Event-based coordination only – direct UI helpers moved to dedicated services/UI components.
  // ------------------------------

  // REMOVED: Event coordination methods - components now handle their own event subscriptions
  // Each service and UI component manages its own event listeners for full decoupling

  // Welcome message functionality (moved from welcome mixin)
  isFirstTime() {
    return !localStorage.getItem('sto_keybind_manager_visited')
  }

  checkAndShowWelcomeMessage() {
    if (this.isFirstTime()) {
      localStorage.setItem('sto_keybind_manager_visited', 'true')
      if (typeof modalManager !== 'undefined') {
        modalManager.show('aboutModal')
      }
    }
  }
}

// REMOVED: Mixin pattern application
// This has been removed as part of Phase 4 refactoring to eliminate mixins.
// The functionality from these mixins has been moved to dedicated services:
// - keyHandling -> KeyService, KeyBrowserService  
// - uiRendering -> KeyBrowserUI, AliasBrowserUI
// - parameterCommands -> ParameterCommandService, ParameterCommandUI
// - viewManagement -> InterfaceModeService, InterfaceModeUI
// - welcome -> Moved to app.checkAndShowWelcomeMessage()
// Components should communicate via events instead of direct method calls

