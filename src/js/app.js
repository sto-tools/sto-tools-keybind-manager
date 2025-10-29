// STO Tools Keybind Manager - Main Application Controller
// Coordinates all modules and handles global application state
import store from './core/store.js'
import eventBus from './core/eventBus.js'
import DataService from './components/services/DataService.js'
import { AutoSync } from './components/services/index.js'
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
import { VFXManagerUI, HeaderMenuUI, AboutModalUI, ImportUI, ConfirmDialogUI, InputDialogUI } from './components/ui/index.js'
import HeaderToolbarUI from './components/ui/HeaderToolbarUI.js'
import { SyncUI } from './components/sync/index.js'
import STOCommandParser from './lib/STOCommandParser.js'
import ImportService from './components/services/ImportService.js'
import ParameterCommandService from './components/services/ParameterCommandService.js'


export default class STOToolsKeybindManager {
  constructor() {
    this.store = store
    this.eventListeners = new Map()
    this.autoSyncManager = null // created later when dependencies available

    this.dataService = null

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
    this.confirmDialogUI = null
    this.inputDialogUI = null

    this.projectManagementService = null
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
      if (typeof storageService === 'undefined' || typeof stoUI === 'undefined') {
        throw new Error('Required dependencies not loaded')
      }
      
      this.modalManagerService = new ModalManagerService(eventBus)
      this.modalManagerService.init()
      
      const modalManager = this.modalManagerService
      
      this.stoCommandParser = new STOCommandParser(eventBus)
      window.stoCommandParser = this.stoCommandParser
      
      this.dataService = window.dataService
      if (!this.dataService) {
        throw new Error('DataService not available - it should be initialized in main.js before app.init()')
      }
      
      this.selectionService = new SelectionService({ eventBus })
      this.selectionService.init()

      // Modal dialog components - create early so they can be injected into other components
      this.confirmDialogUI = new ConfirmDialogUI({
        modalManager,
        i18n: i18next
      })

      this.inputDialogUI = new InputDialogUI({
        modalManager,
        i18n: i18next
      })

      // Make modal dialogs globally available
      window.confirmDialog = this.confirmDialogUI
      window.inputDialog = this.inputDialogUI

      try {
        this.profileUI = new ProfileUI({
          eventBus,
          ui: stoUI,
          modalManager,
          confirmDialog: this.confirmDialogUI,
          document,
          i18n: i18next
        })
      } catch (error) {
        throw error
      }

      this.aliasService = new AliasService({
        storage: storageService,
        eventBus,
        i18n: i18next,
        ui: stoUI,
      })

      await this.aliasService.init()

      this.analyticsService = new AnalyticsService({
        eventBus,
      })

      await this.analyticsService.init()

      this.aliasBrowserService = new AliasBrowserService({
        storage: storageService,
        ui: stoUI,
        eventBus,
      })

      this.aliasBrowserUI = new AliasBrowserUI({
        eventBus,
        modalManager,
        confirmDialog: this.confirmDialogUI,
        document,
      })

      this.keyBrowserService = new KeyBrowserService({
        eventBus,
        storage: storageService,
        profileService: this.profileService,
        ui: stoUI,
      })

      this.keyBrowserUI = new KeyBrowserUI({
        service: this.keyBrowserService,
        eventBus,
        document,
        modalManager,
        confirmDialog: this.confirmDialogUI,
        i18n: i18next,
      })

      //this.keyBrowserUI.init()

      this.keyService = new KeyService({
        storage: storageService,
        eventBus,
        i18n: i18next,
        ui: stoUI,
      })

      this.keyService.init()
    
      this.importService = new ImportService({
        storage: storageService,
        eventBus,
        i18n: i18next,
        ui: stoUI,
      })

      this.importService.init()

      this.exportService = new ExportService({
        storage: storageService,
        eventBus,
        i18n: i18next,
        ui: stoUI,
      })

      this.exportService.init()

      this.exportUI = new ExportUI({
        eventBus,
      })

      this.exportUI.init()

      this.keyCaptureService = new KeyCaptureService({ eventBus })
      this.keyCaptureService.init()

      this.keyCaptureUI = new KeyCaptureUI({
        eventBus,
        modalManager,
        document,
      })
      this.keyCaptureUI.init()

      this.commandService = new CommandService({
        storage: storageService,
        eventBus,
        i18n: i18next,
        ui: stoUI,
      })

      this.commandService.init()

      this.commandLibraryService = new CommandLibraryService({
        storage: storageService,
        eventBus,
        i18n: i18next,
        ui: stoUI,
        modalManager,
      })

      this.commandLibraryUI = new CommandLibraryUI({
        service: this.commandLibraryService,
        eventBus,
        ui: stoUI,
        modalManager,
        document,
      })

      this.commandChainService = new CommandChainService({
        eventBus,
        i18n: i18next,
      })
      this.commandChainUI      = new CommandChainUI({
        eventBus,
        ui: stoUI,
        document
      })

      this.parameterCommandService = new ParameterCommandService({
        eventBus
      })
      
      this.parameterCommandUI = new ParameterCommandUI({
        eventBus,
        modalManager,
        i18n: i18next,
        ui: stoUI
      })
      
      this.commandUI = new CommandUI({
        eventBus,
        ui: stoUI,
        modalManager,
        parameterCommandUI: this.parameterCommandUI,
        confirmDialog: this.confirmDialogUI
      })

      this.headerMenuUI = new HeaderMenuUI({
        eventBus,
        confirmDialog: this.confirmDialogUI,
        document
      })

      this.headerToolbarUI = new HeaderToolbarUI({
        eventBus,
        document
      })

      this.syncUI = new SyncUI({
        eventBus,
        ui: stoUI
      })

      this.aboutModalUI = new AboutModalUI({
        eventBus,
        document
      })

      this.interfaceModeService = new InterfaceModeService({
        eventBus,
        storage: storageService,
        profileService: this.profileService,
        app: this
      })

      this.interfaceModeUI = new InterfaceModeUI({
        eventBus,
        ui: stoUI,
        profileUI: this.profileUI,
        document
      })

      this.vfxManagerService = new VFXManagerService(eventBus, i18next)
      this.vfxManagerUI = new VFXManagerUI({eventBus, modalManager})
      this.vfxManagerService.init()
      this.vfxManagerUI.init()

      this.preferencesService = new PreferencesService({ storage: storageService, eventBus, i18n: i18next, ui: stoUI })
      this.preferencesUI = new PreferencesUI({ eventBus, service: this.preferencesService, ui: stoUI })
      this.preferencesManager = this.preferencesUI
      this.preferencesService.init()
      this.preferencesUI.init()

      window.stoAliases = this.aliasBrowserUI
      
      this.aliasBrowserService.init()
      this.aliasBrowserUI.init()
      this.commandLibraryService.init()
      this.commandLibraryUI.init()
      this.commandChainService.init()
      this.commandChainUI.init()
      this.keyBrowserService.init()
      this.keyBrowserUI.init()
      this.parameterCommandService.init()
      this.commandUI.init()
      this.parameterCommandUI.init()
    
      this.autoSyncManager = new AutoSync({ eventBus, storage: storageService, syncManager: window.stoSync, ui: stoUI })
      this.autoSyncManager.init()

      this.profileUI.init()

      try {
        this.interfaceModeService.init()
      } catch (error) {
        throw error // Re-throw to see the full error
      }

      try {
        this.headerMenuUI.onInit()
      } catch (error) {
        throw error // Re-throw to see the full error
      }

      try {
        this.headerToolbarUI.init()
      } catch (error) {
        throw error // Re-throw to see the full error
      }
      
      try {
        this.syncUI.init()
      } catch (error) {
        throw error // Re-throw to see the full error
      }
      
      try {
        this.aboutModalUI.onInit()
      } catch (error) {
        throw error // Re-throw to see the full error
      }
      
      try {
        this.interfaceModeUI.init()
      } catch (error) {
        throw error // Re-throw to see the full error
      }

      this.profileUI.renderProfiles()
      
      this.profileUI.updateProfileInfo()

      this.checkAndShowWelcomeMessage()
      
      stoUI.showToast(
        i18next.t('sto_tools_keybind_manager_loaded_successfully'),
        'success'
      )

      this.initialized = true

      eventBus.emit('sto-app-ready', { app: this })

      window.commandChainUI = this.commandChainUI

      window.keyBrowserUI = this.keyBrowserUI
      window.keyBrowserService = this.keyBrowserService

      this.projectManagementService = new ProjectManagementService({
        storage: storageService,
        ui: stoUI,
        app: this,
        eventBus,
      })


      this.importUI = new ImportUI({
        eventBus,
        document,
      })
      this.importUI.init()

      const { default: BindsetService }      = await import('./components/services/BindsetService.js')
      const { default: BindsetManagerUI }    = await import('./components/ui/BindsetManagerUI.js')
      const { default: BindsetSelectorService } = await import('./components/services/BindsetSelectorService.js')
      const { default: BindsetSelectorUI }   = await import('./components/ui/BindsetSelectorUI.js')

      this.bindsetService  = new BindsetService({ eventBus })
      this.bindsetManagerUI = new BindsetManagerUI({ eventBus, confirmDialog: this.confirmDialogUI, inputDialog: this.inputDialogUI })
      this.bindsetService.init()
      this.bindsetManagerUI.init()

      this.bindsetSelectorService = new BindsetSelectorService({ eventBus })
      this.bindsetSelectorUI = new BindsetSelectorUI({ eventBus, confirmDialog: this.confirmDialogUI, document })
      this.bindsetSelectorService.init()
      this.bindsetSelectorUI.init()

    } catch (error) {
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

  generateCommandId() {
    return `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }

  // Welcome message functionality (moved from welcome mixin)
  isFirstTime() {
    return !localStorage.getItem('sto_keybind_manager_visited')
  }

  checkAndShowWelcomeMessage() {
    if (this.isFirstTime()) {
      localStorage.setItem('sto_keybind_manager_visited', 'true')
      this.modalManagerService.show('aboutModal')
    }
  }
}
