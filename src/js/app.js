// STO Tools Keybind Manager - Main Application Controller
// Coordinates all modules and handles global application state
import store from './store.js'
import eventBus from './eventBus.js'
import STOPreferencesManager from './preferences.js'
import STOAutoSyncManager from './autoSync.js'
import { profileManagement } from './profileManagement.js'
import { keyHandling } from './keyHandling.js'
import { uiRendering } from './uiRendering.js'
import { parameterCommands } from './parameterCommands.js'
import { keyCapture } from './keyCapture.js'
import { eventHandlers } from './eventHandlers.js'
import { projectManagement } from './projectManagement.js'
import { modeManagement } from './modeManagement.js'
import { commandLibrary } from './commandLibrary.js'
import { aliasView } from './aliasView.js'
import { viewManagement } from './viewManagement.js'
import { welcome } from './welcome.js'

export default class STOToolsKeybindManager {
  constructor() {
    this.store = store
    this.eventListeners = new Map()
    this.preferencesManager = new STOPreferencesManager()
    this.autoSyncManager = new STOAutoSyncManager()

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

  get currentProfile() {
    return this.store.currentProfile
  }
  set currentProfile(val) {
    this.store.currentProfile = val
  }

  get currentMode() {
    return this.store.currentMode
  }
  set currentMode(val) {
    this.store.currentMode = val
  }

  get currentEnvironment() {
    return this.store.currentEnvironment
  }
  set currentEnvironment(val) {
    this.store.currentEnvironment = val
  }

  get selectedKey() {
    return this.store.selectedKey
  }
  set selectedKey(val) {
    this.store.selectedKey = val
  }

  get isModified() {
    return this.store.isModified
  }
  set isModified(val) {
    this.store.isModified = val
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

      // Load data from storage
      await this.loadData()

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

      // Render initial state
      this.renderProfiles()
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
}

// Initialize application
Object.assign(
  STOToolsKeybindManager.prototype,
  profileManagement,
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

