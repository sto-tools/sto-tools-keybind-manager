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
  updateViewToggleButton(viewMode) {
    const toggleBtn = document.getElementById('toggleKeyViewBtn')
    if (toggleBtn) {
      const icon = toggleBtn.querySelector('i')
      if (viewMode === 'categorized') {
        icon.className = 'fas fa-sitemap'
        toggleBtn.title = 'Switch to key type view'
      } else if (viewMode === 'key-types') {
        icon.className = 'fas fa-th'
        toggleBtn.title = 'Switch to grid view'
      } else {
        icon.className = 'fas fa-list'
        toggleBtn.title = 'Switch to command categories'
      }
    }
  }

  toggleKeyView() {
    // Only allow view mode changes in keybind mode, not alias mode
    if (this.currentEnvironment === 'alias') {
      return
    }
    
    const currentMode = localStorage.getItem('keyViewMode') || 'key-types'
    let newMode

    // 3-way toggle: key-types → grid → categorized → key-types
    if (currentMode === 'key-types') {
      newMode = 'grid'
    } else if (currentMode === 'grid') {
      newMode = 'categorized'
    } else {
      newMode = 'key-types'
    }

    localStorage.setItem('keyViewMode', newMode)
    this.renderKeyGrid()
    this.updateViewToggleButton(newMode)
  }

  // Utility Methods
  
  saveCurrentBuild() {
    const profile = stoStorage.getProfile(this.currentProfile)
    const currentBuild = this.getCurrentProfile()

    if (profile && currentBuild) {
      // Ensure builds structure exists
      if (!profile.builds) {
        profile.builds = {
          space: { keys: {} },
          ground: { keys: {} },
        }
      }

      // Save current build data
      profile.builds[this.currentEnvironment] = {
        keys: currentBuild.keys || {},
        // Note: aliases are profile-level, not build-specific
      }

      stoStorage.saveProfile(this.currentProfile, profile)
    }
  }

  async confirmDeleteKey(keyName) {
    const confirmed = await stoUI.confirm(
      i18next.t('confirm_delete_key', { keyName }),
      i18next.t('delete_key'),
      'danger'
    )

    if (confirmed) {
      this.deleteKey(keyName)
    }
  }

  async confirmClearChain(keyName) {
    const confirmed = await stoUI.confirm(
      i18next.t('confirm_clear_commands', { keyName }),
      i18next.t('clear_commands'),
      'warning'
    )

    if (confirmed) {
      const profile = this.getCurrentProfile()
      profile.keys[keyName] = []
      this.saveCurrentBuild() // Use saveCurrentBuild for build-level data
      this.renderCommandChain()
      this.renderKeyGrid()
      this.setModified(true)

      stoUI.showToast(i18next.t('commands_cleared_for_key', {keyName: keyName}), 'success')
    }
  }


  isFirstTime() {
    return !localStorage.getItem('sto_keybind_manager_visited')
  }

  showWelcomeMessage() {
    localStorage.setItem('sto_keybind_manager_visited', 'true')
    modalManager.show('aboutModal')
  }

  // Additional Methods
  duplicateKey(keyName) {
    const profile = this.getCurrentProfile()
    const commands = profile.keys[keyName]

    if (!commands || commands.length === 0) {
      stoUI.showToast(i18next.t('no_commands_to_duplicate'), 'warning')
      return
    }

    // Find a suitable new key name
    let newKeyName = keyName + '_copy'
    let counter = 1

    while (profile.keys[newKeyName]) {
      newKeyName = `${keyName}_copy_${counter}`
      counter++
    }

    // Clone commands
    const clonedCommands = commands.map((cmd) => ({
      ...cmd,
      id: this.generateCommandId(),
    }))

    profile.keys[newKeyName] = clonedCommands
    stoStorage.saveProfile(this.currentProfile, profile)
    this.renderKeyGrid()
    this.setModified(true)

    stoUI.showToast(i18next.t('key_duplicated', {keyName: keyName, newKeyName: newKeyName}), 'success')
  }

  showTemplateModal() {
    stoUI.showToast(i18next.t('template_system_coming_soon'))
  }

  validateCurrentChain() {
    if (!this.selectedKey) {
      stoUI.showToast(i18next.t('no_key_selected'), 'warning')
      return
    }

    const profile = this.getCurrentProfile()
    const commands = profile.keys[this.selectedKey] || []

    if (commands.length === 0) {
      stoUI.showToast(i18next.t('no_commands_to_validate'), 'warning')
      return
    }

    const validation = stoKeybinds.validateKeybind(this.selectedKey, commands)

    if (validation.valid) {
      stoUI.showToast(i18next.t('command_chain_is_valid'), 'success')
    } else {
      const errorMsg = 'Validation errors:\n' + validation.errors.join('\n')
      stoUI.showToast(i18next.t('error_message', {error: errorMsg}), 'error', 5000)
    }
  }

  filterKeys(filter) {
    const filterLower = filter.toLowerCase()

    // Filter grid view keys (.key-item)
    const keyItems = document.querySelectorAll('.key-item')
    keyItems.forEach((item) => {
      const keyName = item.dataset.key.toLowerCase()
      const visible = !filter || keyName.includes(filterLower)
      item.style.display = visible ? 'flex' : 'none'
    })

    // Filter categorized/key-type view keys (.command-item[data-key])
    const commandItems = document.querySelectorAll('.command-item[data-key]')
    commandItems.forEach((item) => {
      const keyName = item.dataset.key.toLowerCase()
      const visible = !filter || keyName.includes(filterLower)
      item.style.display = visible ? 'flex' : 'none'
    })

    // Hide/show categories based on whether they have visible keys
    const categories = document.querySelectorAll('.category')
    categories.forEach((category) => {
      const visibleKeys = category.querySelectorAll(
        '.command-item[data-key]:not([style*="display: none"])'
      )
      const categoryVisible = !filter || visibleKeys.length > 0
      category.style.display = categoryVisible ? 'block' : 'none'
    })
  }

  filterCommands(filter) {
    const commandItems = document.querySelectorAll('.command-item')
    const filterLower = filter.toLowerCase()

    // Filter command items
    commandItems.forEach((item) => {
      const text = item.textContent.toLowerCase()
      const visible = !filter || text.includes(filterLower)
      item.style.display = visible ? 'flex' : 'none'
    })

    // Hide/show categories based on whether they have visible commands
    const categories = document.querySelectorAll('.category')
    categories.forEach((category) => {
      const visibleCommands = category.querySelectorAll(
        '.command-item:not([style*="display: none"])'
      )
      const categoryVisible = !filter || visibleCommands.length > 0
      category.style.display = categoryVisible ? 'block' : 'none'
    })
  }

  showAllKeys() {
    // Show all grid view keys
    const keyItems = document.querySelectorAll('.key-item')
    keyItems.forEach((item) => {
      item.style.display = 'flex'
    })

    // Show all categorized/key-type view keys
    const commandItems = document.querySelectorAll('.command-item[data-key]')
    commandItems.forEach((item) => {
      item.style.display = 'flex'
    })

    // Show all categories
    const categories = document.querySelectorAll('.category')
    categories.forEach((category) => {
      category.style.display = 'block'
    })

    const filterInput = document.getElementById('keyFilter')
    if (filterInput) {
      filterInput.value = ''
    }
  }

  toggleLibrary() {
    const content = document.getElementById('libraryContent')
    const btn = document.getElementById('toggleLibraryBtn')

    if (content && btn) {
      const isCollapsed = content.style.display === 'none'
      content.style.display = isCollapsed ? 'block' : 'none'

      const icon = btn.querySelector('i')
      if (icon) {
        icon.className = isCollapsed
          ? 'fas fa-chevron-up'
          : 'fas fa-chevron-down'
      }
    }
  }

  saveCommandFromModal() {
    if (!this.selectedKey) {
      stoUI.showToast(i18next.t('please_select_a_key_first'), 'warning')
      return
    }

    const command = stoCommands.getCurrentCommand()
    if (!command) {
      stoUI.showToast(i18next.t('please_configure_a_command'), 'warning')
      return
    }

    const validation = stoCommands.validateCommand(command)
    if (!validation.valid) {
      stoUI.showToast(i18next.t('validation_error'), 'error')
      return
    }

    this.addCommand(this.selectedKey, command)
    modalManager.hide('addCommandModal')
  }

  // Utility Methods
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
)
;

