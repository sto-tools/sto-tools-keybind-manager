// STO Tools Keybind Manager - Main Application Controller
// Coordinates all modules and handles global application state
import store from './store.js'
import eventBus from './eventBus.js'
import STOPreferencesManager from './preferences.js'
import STOAutoSyncManager from './autoSync.js'
import { profileManagement } from './profileManagement.js'
import { keyHandling } from './keyHandling.js'
import { uiRendering } from './uiRendering.js'

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

  renderCommandChain() {
    const container = document.getElementById('commandList')
    const title = document.getElementById('chainTitle')
    const preview = document.getElementById('commandPreview')
    const commandCount = document.getElementById('commandCount')
    const emptyState = document.getElementById('emptyState')

    if (!container || !title || !preview) return

    if (!this.selectedKey) {
      const selectText = this.currentEnvironment === 'alias' ? 
        i18next.t('select_an_alias_to_edit') : 
        i18next.t('select_a_key_to_edit')
      const previewText = this.currentEnvironment === 'alias' ? 
        i18next.t('select_an_alias_to_see_the_generated_command') : 
        i18next.t('select_a_key_to_see_the_generated_command')
      
      title.textContent = selectText
      preview.textContent = previewText
      if (commandCount) {
        commandCount.textContent = '0'
      }
      if (emptyState) emptyState.style.display = 'block'
      const emptyIcon = this.currentEnvironment === 'alias' ? 'fas fa-mask' : 'fas fa-keyboard'
      const emptyTitle = this.currentEnvironment === 'alias' ? i18next.t('no_alias_selected') : i18next.t('no_key_selected')
      const emptyDesc = this.currentEnvironment === 'alias' ? 
        i18next.t('select_alias_from_left_panel') : 
        i18next.t('select_key_from_left_panel')
      
      container.innerHTML =
        `<div class="empty-state" id="emptyState"><i class="${emptyIcon}"></i><h4>${emptyTitle}</h4><p>${emptyDesc}</p></div>`
      return
    }

    // Get commands based on current mode
    let commands = []
    let profile
    
    if (this.currentEnvironment === 'alias') {
      // For aliases, get the raw profile since aliases are profile-level, not build-specific
      profile = stoStorage.getProfile(this.currentProfile)
      if (!profile) {
        container.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h4>No Valid Profile</h4>
            <p>Please create or select a valid profile to manage commands.</p>
          </div>
        `
        preview.textContent = ''
        return
      }
      
      const alias = profile.aliases && profile.aliases[this.selectedKey]
      if (alias && alias.commands) {
        // Convert alias command string to command array format
        const commandStrings = alias.commands.split('$$').map(cmd => cmd.trim()).filter(cmd => cmd.length > 0)
        commands = commandStrings.map((cmd, index) => {
          // Find the command definition to get the correct icon and name
          const commandDef = this.findCommandDefinition({ command: cmd })
          return {
            command: cmd,
            text: commandDef ? commandDef.name : cmd,
            type: 'alias',
            icon: commandDef ? commandDef.icon : '🎭', // Use command library icon if available, fallback to alias icon
            id: `alias_${index}`
          }
        })
      }
    } else {
      // For keybinds, use the build-specific view
      profile = this.getCurrentProfile()
      if (!profile) {
        container.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h4>No Valid Profile</h4>
            <p>Please create or select a valid profile to manage commands.</p>
          </div>
        `
        preview.textContent = ''
        return
      }
      commands = profile.keys[this.selectedKey] || []
    }

    const chainType = this.currentEnvironment === 'alias' ? 'Alias Chain' : 'Command Chain'
    title.textContent = `${chainType} for ${this.selectedKey}`
    if (commandCount) {
      commandCount.textContent = commands.length.toString()
    }

    if (commands.length === 0) {
      const emptyMessage = this.currentEnvironment === 'alias' ? 
        `${i18next.t('click_add_command_to_start_building_your_alias_chain')} ${this.selectedKey}.` :
        `${i18next.t('click_add_command_to_start_building_your_command_chain')} ${this.selectedKey}.`
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-plus-circle"></i>
          <h4 data-i18n="no_commands">${i18next.t('no_commands')}</h4>
          <p>${emptyMessage}</p>
        </div>
      `
      if (this.currentEnvironment === 'alias') {
        preview.textContent = `alias ${this.selectedKey} <&  &>`
      } else {
        preview.textContent = `${this.selectedKey} ""`
      }
    } else {
      container.innerHTML = ''
      commands.forEach((command, index) => {
        const element = this.createCommandElement(command, index, commands.length)
        container.appendChild(element)
      })

      // Generate preview based on mode
      if (this.currentEnvironment === 'alias') {
        // For aliases, show the alias command format with <& and &> delimiters
        const commandString = commands.map((cmd) => cmd.command).join(' $$ ')
        preview.textContent = `alias ${this.selectedKey} <& ${commandString} &>`
      } else {
        // For keybinds, use the existing logic with optional mirroring
        const stabilizeCheckbox = document.getElementById('stabilizeExecutionOrder')
      const shouldStabilize = stabilizeCheckbox && stabilizeCheckbox.checked

      let commandString
      if (shouldStabilize && commands.length > 1) {
        commandString = stoKeybinds.generateMirroredCommandString(commands)
      } else {
        commandString = commands.map((cmd) => cmd.command).join(' $$ ')
      }

      preview.textContent = `${this.selectedKey} "${commandString}"`
      }
    }
  }

  createCommandElement(command, index, totalCommands) {
    const element = document.createElement('div')
    element.className = 'command-item-row'
    element.dataset.index = index
    element.draggable = true

    // Check if this command matches a library definition
    const commandDef = this.findCommandDefinition(command)
    const isParameterized = commandDef && commandDef.customizable

    // Use library definition for display if available
    let displayName = command.text
    let displayIcon = command.icon

    if (commandDef) {
      displayName = commandDef.name
      displayIcon = commandDef.icon

      // For parameterized commands, add parameter details to the name
      if (isParameterized && command.parameters) {
        if (commandDef.commandId === 'tray_with_backup') {
          const p = command.parameters
          displayName = `${commandDef.name} (${p.active} ${p.tray} ${p.slot} ${p.backup_tray} ${p.backup_slot})`
        } else if (commandDef.commandId === 'custom_tray') {
          const p = command.parameters
          displayName = `${commandDef.name} (${p.tray} ${p.slot})`
        } else if (commandDef.commandId === 'target') {
          const p = command.parameters
          displayName = `${commandDef.name}: ${p.entityName}`
        }
      } else if (isParameterized) {
        // Extract parameters from command string for display
        if (command.command.includes('TrayExecByTrayWithBackup')) {
          const parts = command.command.split(' ')
          if (parts.length >= 6) {
            displayName = `${commandDef.name} (${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]} ${parts[5]})`
          }
        } else if (command.command.includes('TrayExec')) {
          const parts = command.command.replace('+', '').split(' ')
          if (parts.length >= 3) {
            displayName = `${commandDef.name} (${parts[1]} ${parts[2]})`
          }
        } else if (command.command.includes('Target ')) {
          const match = command.command.match(/Target "([^"]+)"/)
          if (match) {
            displayName = `${commandDef.name}: ${match[1]}`
          }
        }
      }
    }

    // Add parameters data attribute for styling
    if (isParameterized) {
      element.dataset.parameters = 'true'
      element.classList.add('customizable')
    }

    // Check if command has a warning
    const warningInfo = this.getCommandWarning(command)
    const warningIcon = warningInfo
      ? `<span class="command-warning-icon" title="${warningInfo}"><i class="fas fa-exclamation-triangle"></i></span>`
      : ''

    // Add parameter indicator for tray commands and other parameterized commands
    const parameterIndicator = isParameterized
      ? ' <span class="param-indicator" title="Editable parameters">⚙️</span>'
      : ''

    element.innerHTML = `
            <div class="command-number">${index + 1}</div>
            <div class="command-content">
                <span class="command-icon">${displayIcon}</span>
                <span class="command-text">${displayName}${parameterIndicator}</span>
                ${warningIcon}
            </div>
            <span class="command-type ${command.type}">${command.type}</span>
            <div class="command-actions">
                <button class="btn btn-small-icon" onclick="app.editCommand(${index})" title="Edit Command">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-small-icon btn-danger" onclick="app.deleteCommand('${this.selectedKey}', ${index})" title="Delete Command">
                    <i class="fas fa-times"></i>
                </button>
                <button class="btn btn-small-icon" onclick="app.moveCommand('${this.selectedKey}', ${index}, ${index - 1})" 
                        title="Move Up" ${index === 0 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-up"></i>
                </button>
                <button class="btn btn-small-icon" onclick="app.moveCommand('${this.selectedKey}', ${index}, ${index + 1})" 
                        title="Move Down" ${index === totalCommands - 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-down"></i>
                </button>
            </div>
        `

    return element
  }

  getCommandWarning(command) {
    // Look up the command in the data structure to find its warning
    const categories = STO_DATA.commands

    for (const [categoryId, category] of Object.entries(categories)) {
      for (const [cmdId, cmdData] of Object.entries(category.commands)) {
        // Match by command text or actual command
        if (
          cmdData.command === command.command ||
          cmdData.name === command.text ||
          command.command.includes(cmdData.command)
        ) {
          return cmdData.warning || null
        }
      }
    }

    return null
  }

  setupCommandLibrary() {
    const container = document.getElementById('commandCategories')
    if (!container) return

    container.innerHTML = ''

    Object.entries(STO_DATA.commands).forEach(([categoryId, category]) => {
      const categoryElement = this.createCategoryElement(categoryId, category)
      container.appendChild(categoryElement)
    })

    // Apply environment filtering after creating elements
    this.filterCommandLibrary()
    
    // Re-add aliases after rebuilding the command library
    // This ensures aliases are preserved when the library is rebuilt (e.g., on language change)
    if (typeof stoAliases !== 'undefined' && stoAliases.updateCommandLibrary) {
      stoAliases.updateCommandLibrary()
    }
  }

  createCategoryElement(categoryId, category) {
    const element = document.createElement('div')
    element.className = 'category'
    element.dataset.category = categoryId

    // Check if category should be collapsed (similar to Keys UI)
    const storageKey = `commandCategory_${categoryId}_collapsed`
    const isCollapsed = localStorage.getItem(storageKey) === 'true'

    element.innerHTML = `
            <h4 class="${isCollapsed ? 'collapsed' : ''}" data-category="${categoryId}">
                <i class="fas fa-chevron-right category-chevron"></i>
                <i class="${category.icon}"></i> 
                ${category.name}
                <span class="command-count">(${Object.keys(category.commands).length})</span>
            </h4>
            <div class="category-commands ${isCollapsed ? 'collapsed' : ''}">
                ${Object.entries(category.commands)
                  .map(
                    ([cmdId, cmd]) => `
                    <div class="command-item ${cmd.customizable ? 'customizable' : ''}" data-command="${cmdId}" title="${cmd.description}${cmd.customizable ? ' (Customizable)' : ''}">
                        ${cmd.icon} ${cmd.name}${cmd.customizable ? ' <span class="param-indicator">⚙️</span>' : ''}
                    </div>
                `
                  )
                  .join('')}
            </div>
        `

    // Add click handler for category header
    const header = element.querySelector('h4')
    header.addEventListener('click', () => {
      this.toggleCommandCategory(categoryId, element)
    })

    // Add click handlers for commands
    element.addEventListener('click', (e) => {
      if (e.target.classList.contains('command-item')) {
        const commandId = e.target.dataset.command
        this.addCommandFromLibrary(categoryId, commandId)
      }
    })

    return element
  }

  toggleCommandCategory(categoryId, element) {
    const header = element.querySelector('h4')
    const commands = element.querySelector('.category-commands')
    const chevron = header.querySelector('.category-chevron')

    const isCollapsed = commands.classList.contains('collapsed')
    const storageKey = `commandCategory_${categoryId}_collapsed`

    if (isCollapsed) {
      commands.classList.remove('collapsed')
      header.classList.remove('collapsed')
      chevron.style.transform = 'rotate(90deg)'
      localStorage.setItem(storageKey, 'false')
    } else {
      commands.classList.add('collapsed')
      header.classList.add('collapsed')
      chevron.style.transform = 'rotate(0deg)'
      localStorage.setItem(storageKey, 'true')
    }
  }

  addCommandFromLibrary(categoryId, commandId) {
    if (!this.selectedKey) {
      stoUI.showToast(i18next.t('please_select_a_key_first'), 'warning')
      return
    }

    const commandDef = STO_DATA.commands[categoryId].commands[commandId]
    if (!commandDef) return

    // Check if command is parameterized
    if (commandDef.customizable && commandDef.parameters) {
      this.showParameterModal(categoryId, commandId, commandDef)
      return
    }

    const command = {
      command: commandDef.command,
      type: categoryId,
      icon: commandDef.icon,
      text: commandDef.name,
      id: this.generateCommandId(),
    }

    this.addCommand(this.selectedKey, command)
  }

  setupDragAndDrop() {
    const commandList = document.getElementById('commandList')
    if (!commandList) return

    stoUI.initDragAndDrop(commandList, {
      dragSelector: '.command-item-row',
      dropZoneSelector: '.command-item-row',
      onDrop: (e, dragState, dropZone) => {
        if (!this.selectedKey) return

        const fromIndex = parseInt(dragState.dragElement.dataset.index)
        const toIndex = parseInt(dropZone.dataset.index)

        if (fromIndex !== toIndex) {
          this.moveCommand(this.selectedKey, fromIndex, toIndex)
        }
      },
    })
  }

  updateChainActions() {
    const hasSelectedKey = !!this.selectedKey

    if (this.currentEnvironment === 'alias') {
      // In alias mode, enable/disable alias-specific buttons
      const aliasButtons = ['deleteAliasChainBtn', 'duplicateAliasChainBtn']
      aliasButtons.forEach((btnId) => {
        const btn = document.getElementById(btnId)
        if (btn) {
          btn.disabled = !hasSelectedKey
        }
      })

      // Always enable addCommandBtn in alias mode when an alias is selected
      const addCommandBtn = document.getElementById('addCommandBtn')
      if (addCommandBtn) {
        addCommandBtn.disabled = !hasSelectedKey
      }

      // Disable key-specific buttons in alias mode
      const keyButtons = ['importFromKeyBtn', 'deleteKeyBtn', 'duplicateKeyBtn']
      keyButtons.forEach((btnId) => {
        const btn = document.getElementById(btnId)
        if (btn) {
          btn.disabled = true
        }
      })
    } else {
      // In key mode, enable/disable key-specific buttons
    const buttonsToToggle = [
      'addCommandBtn',
      'importFromKeyBtn',
      'deleteKeyBtn',
      'duplicateKeyBtn',
    ]

    buttonsToToggle.forEach((btnId) => {
      const btn = document.getElementById(btnId)
      if (btn) {
        btn.disabled = !hasSelectedKey
      }
    })

      // Disable alias-specific buttons in key mode
      const aliasButtons = ['deleteAliasChainBtn', 'duplicateAliasChainBtn']
      aliasButtons.forEach((btnId) => {
        const btn = document.getElementById(btnId)
        if (btn) {
          btn.disabled = true
        }
      })
    }
  }

  // Event Handlers
  setupEventListeners() {
    // Profile management
    const profileSelect = document.getElementById('profileSelect')
    profileSelect?.addEventListener('change', (e) => {
      this.switchProfile(e.target.value)
    })

    // Mode switching - fix event target issue by using currentTarget and closest
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        // Use currentTarget to get the button element, not the clicked child element
        const button = e.currentTarget
        const mode = button.dataset.mode
        if (mode) {
          this.switchMode(mode)
        }
      })
    })

    // File operations
    eventBus.onDom('openProjectBtn', 'click', 'project-open', () => {
      this.openProject()
    })

    eventBus.onDom('saveProjectBtn', 'click', 'project-save', () => {
      this.saveProject()
    })

    eventBus.onDom('exportKeybindsBtn', 'click', 'keybinds-export', () => {
      this.exportKeybinds()
    })

    // Vertigo VFX manager
    eventBus.onDom('vertigoBtn', 'click', 'vertigo-open', () => {
      this.showVertigoModal()
    })

    // Key management
    eventBus.onDom('addKeyBtn', 'click', 'key-add', () => {
      this.showKeySelectionModal()
    })

    eventBus.onDom('deleteKeyBtn', 'click', 'key-delete', () => {
      if (this.selectedKey) {
        this.confirmDeleteKey(this.selectedKey)
      }
    })

    eventBus.onDom('duplicateKeyBtn', 'click', 'key-duplicate', () => {
      if (this.selectedKey) {
        this.duplicateKey(this.selectedKey)
      }
    })

    // Alias chain management
    eventBus.onDom('addAliasChainBtn', 'click', 'alias-chain-add', () => {
      this.showAliasCreationModal()
    })

    eventBus.onDom('deleteAliasChainBtn', 'click', 'alias-chain-delete', () => {
      if (this.selectedKey && this.currentEnvironment === 'alias') {
        this.confirmDeleteAlias(this.selectedKey)
      }
    })

    eventBus.onDom('duplicateAliasChainBtn', 'click', 'alias-chain-duplicate', () => {
      if (this.selectedKey && this.currentEnvironment === 'alias') {
        this.duplicateAlias(this.selectedKey)
      }
    })

    // Command management
    eventBus.onDom('addCommandBtn', 'click', 'command-add', () => {
      modalManager.show('addCommandModal')
    })



    eventBus.onDom('clearChainBtn', 'click', 'command-chain-clear', () => {
      if (this.selectedKey) {
        this.confirmClearChain(this.selectedKey)
      }
    })

    eventBus.onDom(
      'validateChainBtn',
      'click',
      'command-chain-validate',
      () => {
        this.validateCurrentChain()
      }
    )

    // Stabilization checkbox
    eventBus.onDom(
      'stabilizeExecutionOrder',
      'change',
      'stabilize-change',
      (e) => {
        // Persist stabilization flag to stored profile (environment-scoped)
        if (this.selectedKey) {
          const env = this.currentEnvironment
          const storedProfile = stoStorage.getProfile(this.currentProfile)
          if (storedProfile) {
            if (!storedProfile.keybindMetadata) {
              storedProfile.keybindMetadata = {}
            }
            if (!storedProfile.keybindMetadata[env]) {
              storedProfile.keybindMetadata[env] = {}
            }
            if (!storedProfile.keybindMetadata[env][this.selectedKey]) {
              storedProfile.keybindMetadata[env][this.selectedKey] = {}
            }
            storedProfile.keybindMetadata[env][
              this.selectedKey
            ].stabilizeExecutionOrder = e.target.checked

            // Save immediately and mark modified
            stoStorage.saveProfile(this.currentProfile, storedProfile)
            this.setModified(true)
          }
        }
        this.renderCommandChain() // Update preview when checkbox changes
      }
    )

    // Search and filter
    eventBus.onDom('keyFilter', 'input', 'key-filter', (e) => {
      this.filterKeys(e.target.value)
    })

    eventBus.onDom('commandSearch', 'input', 'command-search', (e) => {
      this.filterCommands(e.target.value)
    })

    eventBus.onDom('showAllKeysBtn', 'click', 'show-all-keys', () => {
      this.showAllKeys()
    })

    // Key view toggle
    eventBus.onDom('toggleKeyViewBtn', 'click', 'toggle-key-view', () => {
      this.toggleKeyView()
    })

    // Library toggle
    eventBus.onDom('toggleLibraryBtn', 'click', 'toggle-library', () => {
      this.toggleLibrary()
    })

    // Alias options multiselect dropdown
    eventBus.onDom('aliasOptionsDropdown', 'click', 'alias-options-toggle', (e) => {
      e.stopPropagation()
      this.toggleAliasOptionsDropdown()
    })

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('aliasOptionsDropdown')
      const menu = document.getElementById('aliasOptionsMenu')
      if (dropdown && menu && !dropdown.contains(e.target) && !menu.contains(e.target)) {
        this.closeAliasOptionsDropdown()
      }
    })

    // Handle checkbox changes in alias options
    const aliasCheckboxes = ['aliasStabilizeOption', 'aliasToggleOption', 'aliasCycleOption']
    aliasCheckboxes.forEach(id => {
      eventBus.onDom(id, 'change', `alias-option-${id}`, () => {
        this.updateAliasOptionsLabel()
      })
    })

    // Modal handlers
    this.setupModalHandlers()

    // Auto-save
    setInterval(() => {
      if (this.isModified) {
        this.saveData()
      }
    }, 30000) // Auto-save every 30 seconds

    // Stabilize execution order toolbar button
    eventBus.onDom('stabilizeExecutionOrderBtn', 'click', 'stabilize-toggle', (e) => {
      const btn = e.target.closest('.toolbar-btn')
      const checkbox = document.getElementById('stabilizeExecutionOrder')
      
      // Toggle the hidden checkbox
      checkbox.checked = !checkbox.checked
      
      // Update button visual state
      btn.classList.toggle('active', checkbox.checked)
      
      // Trigger the existing change event
      checkbox.dispatchEvent(new Event('change'))
    })

    // Alias options toolbar button
    eventBus.onDom('aliasOptionsBtn', 'click', 'alias-options-toggle', (e) => {
      const btn = e.target.closest('.toolbar-btn')
      const optionsDiv = document.getElementById('aliasOptions')
      
      // Toggle visibility
      const isVisible = optionsDiv.style.display !== 'none'
      optionsDiv.style.display = isVisible ? 'none' : 'block'
      
      // Update button visual state
      btn.classList.toggle('active', !isVisible)
    })

    // Expandable search functionality
    this.setupExpandableSearch('keySearchBtn', 'keyFilter')
    this.setupExpandableSearch('aliasSearchBtn', 'aliasFilter')
    this.setupExpandableSearch('commandSearchBtn', 'commandSearch')
  }

  setupExpandableSearch(buttonId, inputId) {
    const button = document.getElementById(buttonId)
    const input = document.getElementById(inputId)
    
    if (!button || !input) return

    // Toggle search input visibility
    eventBus.onDom(buttonId, 'click', `${buttonId}-toggle`, (e) => {
      e.preventDefault()
      e.stopPropagation()
      
      const isExpanded = input.classList.contains('expanded')
      
      if (isExpanded) {
        // If expanded and has content, clear it; if empty, collapse
        if (input.value.trim()) {
          input.value = ''
          // Trigger the existing filter/search logic
          input.dispatchEvent(new Event('input'))
        } else {
          input.classList.remove('expanded')
          input.blur()
        }
      } else {
        // Expand and focus
        input.classList.add('expanded')
        setTimeout(() => input.focus(), 100)
      }
    })

    // Handle clicks outside to collapse
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.toolbar-search') && input.classList.contains('expanded')) {
        if (!input.value.trim()) {
          input.classList.remove('expanded')
        }
      }
    })

    // Handle escape key to collapse
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (input.value.trim()) {
          input.value = ''
          input.dispatchEvent(new Event('input'))
        } else {
          input.classList.remove('expanded')
          input.blur()
        }
      }
    })

    // Keep expanded if there's content
    input.addEventListener('input', () => {
      if (input.value.trim()) {
        input.classList.add('expanded')
      }
    })
  }

  setupModalHandlers() {
    // Add Key Modal
    eventBus.onDom('confirmAddKeyBtn', 'click', 'key-add-confirm', () => {
      const keyName = document.getElementById('newKeyName')?.value.trim()
      if (keyName) {
        this.addKey(keyName)
        modalManager.hide('addKeyModal')
      }
    })

    // Key suggestions
    document.querySelectorAll('.key-suggestion').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const keyName = e.target.dataset.key
        const input = document.getElementById('newKeyName')
        if (input) {
          input.value = keyName
        }
      })
    })

    // Key Capture functionality for Add Key Modal
    const addKeyCaptureBtn = document.getElementById('addKeyCaptureBtn')
    if (addKeyCaptureBtn) {
      addKeyCaptureBtn.addEventListener('click', () => {
        this.startKeyCapture('addKeyModal')
      })
    }

    // Add Command Modal
    eventBus.onDom('saveCommandBtn', 'click', 'command-save', () => {
      this.saveCommandFromModal()
    })

    // Modal close handlers
    document.querySelectorAll('.modal-close, [data-modal]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const modalId =
          e.target.dataset.modal || e.target.closest('button').dataset.modal
        if (modalId) {
          modalManager.hide(modalId)

          // Handle Vertigo modal cancellation - rollback to initial state
          if (modalId === 'vertigoModal') {
            // Only rollback if we're not in the middle of saving
            if (this.vertigoInitialState && !this.vertigoSaving) {
              vertigoManager.selectedEffects.space = new Set(
                this.vertigoInitialState.selectedEffects.space
              )
              vertigoManager.selectedEffects.ground = new Set(
                this.vertigoInitialState.selectedEffects.ground
              )
              vertigoManager.showPlayerSay =
                this.vertigoInitialState.showPlayerSay
            }

            // Clean up stored state
            delete this.vertigoInitialState
            this.vertigoSaving = false
          }
          
          // Stop key capture if modal is closed
          if (modalId === 'addKeyModal' || modalId === 'keySelectionModal') {
            this.stopKeyCapture()
          }
        }
      })
    })
  }

  // Utility Methods
  saveProfile() {
    const virtualProfile = this.getCurrentProfile()

    if (!virtualProfile) {
      return
    }

    // Save current build data to the proper structure
    this.saveCurrentBuild()

    // Get the actual stored profile structure AFTER saveCurrentBuild
    const actualProfile = stoStorage.getProfile(this.currentProfile)
    if (!actualProfile) {
      return
    }

    // Update profile-level data (aliases, metadata, etc.) from virtual profile
    // but preserve the builds structure that was just saved
    const updatedProfile = {
      ...actualProfile, // Keep the actual structure with builds (now includes saved keybinds)
      // Update profile-level fields from virtual profile
      name: virtualProfile.name,
      description: virtualProfile.description || actualProfile.description,
      aliases: virtualProfile.aliases || {},
      keybindMetadata:
        virtualProfile.keybindMetadata || actualProfile.keybindMetadata,
      // Preserve existing profile fields
      created: actualProfile.created,
      lastModified: new Date().toISOString(),
      currentEnvironment: this.currentEnvironment,
    }

    stoStorage.saveProfile(this.currentProfile, updatedProfile)
  }

  switchMode(mode) {
    // Guard against undefined or invalid mode values
    if (!mode || (mode !== 'space' && mode !== 'ground' && mode !== 'alias')) {
      console.warn('Invalid mode provided to switchMode:', mode)
      return
    }
    
    if (this.currentEnvironment !== mode) {
      // Save current build before switching (only for space/ground modes)
      if (this.currentEnvironment === 'space' || this.currentEnvironment === 'ground') {
      this.saveCurrentBuild()
      }

      this.currentEnvironment = mode

      // Update profile's current environment
      const profile = stoStorage.getProfile(this.currentProfile)
      if (profile) {
        profile.currentEnvironment = mode
        stoStorage.saveProfile(this.currentProfile, profile)
      }

      // Update UI components based on mode
      this.updateProfileInfo()
      this.updateModeUI()
      this.setModified(true)

      // Update button states after all other updates are complete
      this.updateModeButtons()

      stoUI.showToast(i18next.t('switched_to_mode', {mode: mode}), 'success')
    }
  }

  updateModeButtons() {
    // Update the active state of mode buttons
    const spaceBtn = document.querySelector('[data-mode="space"]')
    const groundBtn = document.querySelector('[data-mode="ground"]')
    const aliasBtn = document.querySelector('[data-mode="alias"]')

    if (spaceBtn && groundBtn && aliasBtn) {
      spaceBtn.classList.toggle('active', this.currentEnvironment === 'space')
      groundBtn.classList.toggle('active', this.currentEnvironment === 'ground')
      aliasBtn.classList.toggle('active', this.currentEnvironment === 'alias')
      
      // Ensure buttons are enabled when we have a valid profile
      spaceBtn.disabled = !this.currentProfile
      groundBtn.disabled = !this.currentProfile
      aliasBtn.disabled = !this.currentProfile
    }
  }

  updateModeUI() {
    if (this.currentEnvironment === 'alias') {
      // Show alias view, hide key view
      this.showAliasView()
      this.renderAliasGrid()
      this.renderCommandChain()
      this.updateChainOptionsForAlias()
    } else {
      // Show key view, hide alias view
      this.showKeyView()
      this.renderKeyGrid()
      this.renderCommandChain()
      this.updateChainOptionsForKeybind()
      this.filterCommandLibrary() // Apply environment filter to command library
    }
    
    // Update toggle button visibility based on environment
    this.updateToggleButtonVisibility()
  }

  updateToggleButtonVisibility() {
    const toggleBtn = document.getElementById('toggleKeyViewBtn')
    if (toggleBtn) {
      // Hide toggle button in alias mode, show in keybind modes
      toggleBtn.style.display = this.currentEnvironment === 'alias' ? 'none' : 'block'
    }
  }

  showAliasView() {
    const keyContainer = document.querySelector('.key-selector-container')
    const aliasContainer = document.getElementById('aliasSelectorContainer')
    
    if (keyContainer) keyContainer.style.display = 'none'
    if (aliasContainer) aliasContainer.style.display = 'block'
  }

  showKeyView() {
    const keyContainer = document.querySelector('.key-selector-container')
    const aliasContainer = document.getElementById('aliasSelectorContainer')
    
    if (keyContainer) keyContainer.style.display = 'block'
    if (aliasContainer) aliasContainer.style.display = 'none'
  }

  updateChainOptionsForAlias() {
    const stabilizeBtn = document.getElementById('stabilizeExecutionOrderBtn')
    const aliasOptionsBtn = document.getElementById('aliasOptionsBtn')
    const aliasOptions = document.getElementById('aliasOptions')
    
    if (stabilizeBtn) stabilizeBtn.style.display = 'none'
    if (aliasOptionsBtn) aliasOptionsBtn.style.display = 'block'
    if (aliasOptions) aliasOptions.style.display = 'none' // Initially hidden, shown when button is clicked
  }

  updateChainOptionsForKeybind() {
    const stabilizeBtn = document.getElementById('stabilizeExecutionOrderBtn')
    const aliasOptionsBtn = document.getElementById('aliasOptionsBtn')
    const aliasOptions = document.getElementById('aliasOptions')
    
    if (stabilizeBtn) stabilizeBtn.style.display = 'block'
    if (aliasOptionsBtn) aliasOptionsBtn.style.display = 'none'
    if (aliasOptions) aliasOptions.style.display = 'none'
  }

  renderAliasGrid() {
    const grid = document.getElementById('aliasGrid')
    if (!grid) return

    const profile = stoStorage.getProfile(this.currentProfile)
    if (!profile || !profile.aliases) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-mask"></i>
          <h4 data-i18n="no_aliases_defined">No aliases defined</h4>
          <p data-i18n="create_alias_to_get_started">Create an alias to get started</p>
        </div>
      `
      return
    }

    const aliases = Object.entries(profile.aliases)
    if (aliases.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-mask"></i>
          <h4 data-i18n="no_aliases_defined">No aliases defined</h4>
          <p data-i18n="create_alias_to_get_started">Create an alias to get started</p>
        </div>
      `
      return
    }

    // Simple grid view for aliases - no view modes needed
    grid.classList.remove('categorized')
    grid.innerHTML = aliases.map(([name, alias]) => 
      this.createAliasChainElement(name, alias)
    ).join('')

    // Add event listeners to alias elements
    grid.querySelectorAll('.alias-chain-item').forEach((item) => {
      item.addEventListener('click', () => {
        this.selectAlias(item.dataset.alias)
      })
    })
  }

  createAliasChainElement(name, alias) {
    const commandCount = alias.commands ? alias.commands.split('$$').length : 0
    const isSelected = this.selectedKey === name // Reuse selectedKey for alias selection
    const description = alias.description || ''
    
    // Calculate length class for dynamic font sizing (similar to key elements)
    // Since aliases don't use + separators like keys, use simple length-based logic
    const nameLength = name.length
    let lengthClass
    if (nameLength <= 8) {
      lengthClass = 'short'
    } else if (nameLength <= 12) {
      lengthClass = 'medium'
    } else if (nameLength <= 16) {
      lengthClass = 'long'
    } else {
      lengthClass = 'extra-long'
    }
    
    return `
      <div class="alias-chain-item ${isSelected ? 'selected' : ''}" data-alias="${name}" data-length="${lengthClass}" title="${description}">
        <div class="alias-name">${name}</div>
        <div class="alias-command-count">${commandCount} <span data-i18n="commands">commands</span></div>
      </div>
    `
  }

  selectAlias(aliasName) {
    // Reuse the selectedKey property for alias selection
    this.selectedKey = aliasName
    this.renderAliasGrid()
    this.renderCommandChain()
    this.updateChainActions()
  }

  showAliasCreationModal() {
    // Show a simplified modal for creating a new alias
    const modal = this.createAliasCreationModal()
    document.body.appendChild(modal)
    modalManager.show('aliasCreationModal')
  }

  createAliasCreationModal() {
    const modal = document.createElement('div')
    modal.id = 'aliasCreationModal'
    modal.className = 'modal'
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 data-i18n="create_new_alias">Create New Alias</h2>
          <button class="modal-close" data-modal="aliasCreationModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="newAliasName" data-i18n="alias_name">Alias Name:</label>
            <input type="text" id="newAliasName" class="form-control" placeholder="MyAlias" />
          </div>
          <div class="form-group">
            <label for="newAliasDescription" data-i18n="description">Description:</label>
            <input type="text" id="newAliasDescription" class="form-control" placeholder="Brief description" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-modal="aliasCreationModal" data-i18n="cancel">Cancel</button>
          <button class="btn btn-primary" id="confirmCreateAliasBtn" data-i18n="create">Create</button>
        </div>
      </div>
    `

    // Add event listener for create button
    modal.querySelector('#confirmCreateAliasBtn').addEventListener('click', () => {
      const name = modal.querySelector('#newAliasName').value.trim()
      const description = modal.querySelector('#newAliasDescription').value.trim()
      
      if (name) {
        this.createAliasChain(name, description)
        modalManager.hide('aliasCreationModal')
        document.body.removeChild(modal)
      }
    })

    return modal
  }

  createAliasChain(name, description = '') {
    const profile = stoStorage.getProfile(this.currentProfile)
    if (!profile) return

    // Initialize aliases object if it doesn't exist
    if (!profile.aliases) {
      profile.aliases = {}
    }

    // Check if alias already exists
    if (profile.aliases[name]) {
      stoUI.showToast(i18next.t('alias_already_exists', {name: name}), 'error')
      return
    }

    // Create new alias
    profile.aliases[name] = {
      description: description,
      commands: ''
    }

    // Save profile
    stoStorage.saveProfile(this.currentProfile, profile)
    
    // Update UI
    this.renderAliasGrid()
    this.selectAlias(name)
    this.setModified(true)
    
    stoUI.showToast(i18next.t('alias_created', {name: name}), 'success')
  }

  async confirmDeleteAlias(aliasName) {
    const confirmed = await stoUI.confirm(
      i18next.t('confirm_delete_alias', { aliasName }),
      i18next.t('delete_alias'),
      'danger'
    )

    if (confirmed) {
      this.deleteAliasChain(aliasName)
    }
  }

  deleteAliasChain(aliasName) {
    const profile = stoStorage.getProfile(this.currentProfile)
    if (!profile || !profile.aliases || !profile.aliases[aliasName]) return

    delete profile.aliases[aliasName]
    stoStorage.saveProfile(this.currentProfile, profile)

    // Clear selection if we deleted the selected alias
    if (this.selectedKey === aliasName) {
      this.selectedKey = null
    }

    this.renderAliasGrid()
    this.renderCommandChain()
    this.updateChainActions()
    this.setModified(true)

    stoUI.showToast(i18next.t('alias_deleted', {aliasName: aliasName}), 'success')
  }

  duplicateAlias(aliasName) {
    const profile = stoStorage.getProfile(this.currentProfile)
    if (!profile || !profile.aliases || !profile.aliases[aliasName]) return

    const originalAlias = profile.aliases[aliasName]
    
    // Find a suitable new alias name
    let newAliasName = aliasName + '_copy'
    let counter = 1
    
    while (profile.aliases[newAliasName]) {
      newAliasName = `${aliasName}_copy${counter}`
      counter++
    }

    // Create duplicate
    profile.aliases[newAliasName] = {
      description: originalAlias.description + ' (copy)',
      commands: originalAlias.commands
    }

    stoStorage.saveProfile(this.currentProfile, profile)
    
    this.renderAliasGrid()
    this.selectAlias(newAliasName)
    this.setModified(true)

    stoUI.showToast(i18next.t('alias_created_from_template', {newAliasName: newAliasName}), 'success')
  }
  
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

  openProject() {
    const input = document.getElementById('fileInput')
    input.accept = '.json'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          try {
            // Use the export manager's importJSONFile method to handle both
            // direct data and wrapped project files
            const success = stoExport.importJSONFile(e.target.result)
            if (success) {
              this.loadData()
              this.renderProfiles()
              this.renderKeyGrid()
              this.renderCommandChain()
              stoUI.showToast(i18next.t('project_loaded_successfully'), 'success')
            } else {
              stoUI.showToast(i18next.t('failed_to_load_project_file'), 'error')
            }
          } catch (error) {
            stoUI.showToast(i18next.t('invalid_project_file'), 'error')
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  saveProject() {
    const data = stoStorage.exportData()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sto_keybinds.json'
    a.click()
    URL.revokeObjectURL(url)

    stoUI.showToast(i18next.t('project_exported_successfully'), 'success')
    
    // Emit project-saved event for auto-sync
    eventBus.emit('project-saved')
  }

  exportKeybinds() {
    const profile = this.getCurrentProfile()
    if (!profile) return

    // Generate keybind file (per-key stabilization handled within export manager)
    const content = stoExport.generateSTOKeybindFile(profile, {
      environment: this.currentEnvironment,
    })

    // Download the file
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url

    // Include environment in filename
    const safeName = profile.name.replace(/[^a-zA-Z0-9]/g, '_')
    a.download = `${safeName}_${this.currentEnvironment}_keybinds.txt`
    a.click()
    URL.revokeObjectURL(url)

    stoUI.showToast(
      i18next.t('keybinds_exported_successfully', { environment: this.currentEnvironment }),
      'success'
    )
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

  // Parameter Modal for Customizable Commands
  showParameterModal(categoryId, commandId, commandDef) {
    this.currentParameterCommand = { categoryId, commandId, commandDef }

    // Create modal if it doesn't exist
    if (!document.getElementById('parameterModal')) {
      this.createParameterModal()
    }

    // Store command definition in modal for language change regeneration
    const modal = document.getElementById('parameterModal')
    if (modal) {
      modal.setAttribute('data-command-def', JSON.stringify(commandDef))
    }

    // Populate modal with parameter inputs
    this.populateParameterModal(commandDef)

    // Show modal
    modalManager.show('parameterModal')
  }

  createParameterModal() {
    const modal = document.createElement('div')
    modal.className = 'modal'
    modal.id = 'parameterModal'
    modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="parameterModalTitle">Configure Command Parameters</h3>
                    <button class="modal-close" data-modal="parameterModal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div id="parameterInputs">
                        <!-- Parameter inputs will be populated here -->
                    </div>
                    <div class="command-preview-modal">
                        <label>Generated Command:</label>
                        <div class="command-preview" id="parameterCommandPreview">
                            <!-- Command preview will be shown here -->
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" id="saveParameterCommandBtn">Add Command</button>
                    <button class="btn btn-secondary" data-modal="parameterModal">Cancel</button>
                </div>
            </div>
        `

    document.body.appendChild(modal)

    // Add event listeners
    eventBus.onDom(
      'saveParameterCommandBtn',
      'click',
      'parameter-command-save',
      () => {
        this.saveParameterCommand()
      }
    )

    // Close modal handlers - handle both X button and Cancel button
    const closeButtons = modal.querySelectorAll(
      '.modal-close, [data-modal="parameterModal"]'
    )
    closeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.cancelParameterCommand()
      })
    })
  }

  cancelParameterCommand() {
    // Clean up state
    this.currentParameterCommand = null

    // Reset modal button text in case we were editing
    const saveBtn = document.getElementById('saveParameterCommandBtn')
    if (saveBtn) {
      saveBtn.textContent = i18next.t('add_command')
    }

    // Hide modal
    modalManager.hide('parameterModal')
  }

  populateParameterModal(commandDef) {
    const container = document.getElementById('parameterInputs')
    const titleElement = document.getElementById('parameterModalTitle')

    titleElement.textContent = `Configure: ${commandDef.name}`
    container.innerHTML = ''

    // Create input for each parameter
    Object.entries(commandDef.parameters).forEach(([paramName, paramDef]) => {
      const inputGroup = document.createElement('div')
      inputGroup.className = 'form-group'

      const label = document.createElement('label')
      label.textContent = this.formatParameterName(paramName)
      label.setAttribute('for', `param_${paramName}`)

      let input // Declare input variable outside the if/else blocks

      // For message parameters, create input with $Target button
      if (paramName === 'message') {
        const inputContainer = document.createElement('div')
        inputContainer.className = 'input-with-button'

        input = document.createElement('input')
        input.type = 'text'
        input.id = `param_${paramName}`
        input.name = paramName
        input.value = paramDef.default || ''

        if (paramDef.placeholder) {
          input.placeholder = paramDef.placeholder
        }

        const targetButton = document.createElement('button')
        targetButton.type = 'button'
        targetButton.className = 'btn btn-small insert-target-btn'
        targetButton.title = 'Insert $Target variable'
        targetButton.innerHTML = '<i class="fas fa-crosshairs"></i> $Target'

        inputContainer.appendChild(input)
        inputContainer.appendChild(targetButton)

        const help = document.createElement('small')
        help.textContent = this.getParameterHelp(paramName, paramDef)

        const variableHelp = document.createElement('div')
        variableHelp.className = 'variable-help'
        variableHelp.innerHTML =
          "<strong>$Target</strong> - Use to include your current target's name in the message"

        inputGroup.appendChild(label)
        inputGroup.appendChild(inputContainer)
        inputGroup.appendChild(help)
        inputGroup.appendChild(variableHelp)

        // Note: Event handling is done by global event delegation in commands.js
      } else {
        // Handle different parameter types
        if (paramDef.type === 'select') {
          // Create select dropdown
          input = document.createElement('select')
          input.id = `param_${paramName}`
          input.name = paramName

          // Add options
          paramDef.options.forEach((option) => {
            const optionElement = document.createElement('option')
            optionElement.value = option
            optionElement.textContent =
              option === 'STOTrayExecByTray'
                ? 'STOTrayExecByTray (shows key binding on UI)'
                : 'TrayExecByTray (no UI indication)'
            if (option === paramDef.default) {
              optionElement.selected = true
            }
            input.appendChild(optionElement)
          })
        } else {
          // Regular input for non-select parameters
          input = document.createElement('input')
          input.type = paramDef.type === 'number' ? 'number' : 'text'
          input.id = `param_${paramName}`
          input.name = paramName
          input.value = paramDef.default || ''

          if (paramDef.placeholder) {
            input.placeholder = paramDef.placeholder
          }

          if (paramDef.type === 'number') {
            if (paramDef.min !== undefined) input.min = paramDef.min
            if (paramDef.max !== undefined) input.max = paramDef.max
            if (paramDef.step !== undefined) input.step = paramDef.step
          }
        }

        const help = document.createElement('small')
        help.textContent = this.getParameterHelp(paramName, paramDef)

        inputGroup.appendChild(label)
        inputGroup.appendChild(input)
        inputGroup.appendChild(help)
      }
      container.appendChild(inputGroup)

      // Add real-time preview update
      input.addEventListener('input', () => {
        this.updateParameterPreview()
      })

      // Also listen for 'change' event for select elements
      if (input.tagName === 'SELECT') {
        input.addEventListener('change', () => {
          this.updateParameterPreview()
        })
      }
    })

    // Initial preview update
    this.updateParameterPreview()
  }

  formatParameterName(paramName) {
    return paramName.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }

  getParameterHelp(paramName, paramDef) {
    const helps = {
      entityName: 'Name of the entity to target (e.g., ship name, player name)',
      active: 'Whether the command is active (1 = active, 0 = inactive)',
      tray: 'Primary tray number (0-9, where 0 is the first tray)',
      slot: 'Primary slot number (0-9, where 0 is the first slot)',
      backup_tray: 'Backup tray number (0-9, where 0 is the first tray)',
      backup_slot: 'Backup slot number (0-9, where 0 is the first slot)',
      amount: 'Throttle adjustment amount (-1 to 1)',
      position:
        'Throttle position (-1 = full reverse, 0 = stop, 1 = full forward)',
      distance: 'Camera distance from target',
      filename: 'Name of the keybind file (without extension)',
      message: 'Text message to send',
      state: 'Enable (1) or disable (0) combat log',
      command_type:
        'STOTrayExecByTray shows key binding on UI, TrayExecByTray does not',
    }

    return (
      helps[paramName] ||
      `${paramDef.type} value ${paramDef.min !== undefined ? `(${paramDef.min} to ${paramDef.max})` : ''}`
    )
  }

  updateParameterPreview() {
    if (!this.currentParameterCommand) return

    const { categoryId, commandId, commandDef } = this.currentParameterCommand
    const params = this.getParameterValues()

    // Generate command using the command builder
    const command = this.buildParameterizedCommand(
      categoryId,
      commandId,
      commandDef,
      params
    )

    const preview = document.getElementById('parameterCommandPreview')
    if (preview && command) {
      // Support both single and array command results
      if (Array.isArray(command)) {
        const commandStrings = command.map((cmd) => cmd.command)
        preview.textContent = commandStrings.join(' $$ ')
      } else {
        preview.textContent = command.command
      }
    }
  }

  getParameterValues() {
    const params = {}
    const inputs = document.querySelectorAll(
      '#parameterInputs input, #parameterInputs select'
    )

    inputs.forEach((input) => {
      const paramName = input.name
      let value = input.value

      if (input.type === 'number') {
        value = parseFloat(value) || 0
      }

      params[paramName] = value
    })

    return params
  }

  buildParameterizedCommand(categoryId, commandId, commandDef, params) {
    // Use the command builder logic from commands.js
    const builders = {
      targeting: (params) => {
        if (commandId === 'target' && params.entityName) {
          return {
            command: `${commandDef.command} "${params.entityName}"`,
            text: `Target: ${params.entityName}`,
          }
        }
        return { command: commandDef.command, text: commandDef.name }
      },
      tray: (params) => {
        const tray = params.tray || 0
        const slot = params.slot || 0

        if (commandId === 'tray_with_backup') {
          const active = params.active !== undefined ? params.active : 1
          const backupTray = params.backup_tray || 0
          const backupSlot = params.backup_slot || 0

          return {
            command: `TrayExecByTrayWithBackup ${active} ${tray} ${slot} ${backupTray} ${backupSlot}`,
            text: `Execute Tray ${tray + 1} Slot ${slot + 1} (backup: Tray ${backupTray + 1} Slot ${backupSlot + 1})`,
          }
        } else if (commandId === 'tray_range') {
          const startTray = params.start_tray || 0
          const startSlot = params.start_slot || 0
          const endTray = params.end_tray || 0
          const endSlot = params.end_slot || 0
          const commandType = params.command_type || 'STOTrayExecByTray'

          const commands = stoCommands.generateTrayRangeCommands(
            startTray,
            startSlot,
            endTray,
            endSlot,
            commandType
          )

          // Return array of command objects with slot-specific parameters
          return commands.map((cmd, index) => {
            // Attempt to extract tray and slot numbers from the command string
            let trayParam, slotParam
            try {
              const parts = cmd.replace('+', '').trim().split(/\s+/)
              trayParam = parseInt(parts[1])
              slotParam = parseInt(parts[2])
            } catch (_) {
              trayParam = undefined
              slotParam = undefined
            }

            return {
              command: cmd,
              type: categoryId,
              icon: commandDef.icon,
              text:
                index === 0
                  ? `Execute Range: Tray ${startTray + 1} Slot ${startSlot + 1} to Tray ${endTray + 1} Slot ${endSlot + 1}`
                  : cmd,
              id: this.generateCommandId(),
              parameters: { tray: trayParam, slot: slotParam },
            }
          })
        } else if (commandId === 'tray_range_with_backup') {
          const active = params.active || 1
          const startTray = params.start_tray || 0
          const startSlot = params.start_slot || 0
          const endTray = params.end_tray || 0
          const endSlot = params.end_slot || 0
          const backupStartTray = params.backup_start_tray || 0
          const backupStartSlot = params.backup_start_slot || 0
          const backupEndTray = params.backup_end_tray || 0
          const backupEndSlot = params.backup_end_slot || 0

          const commands = stoCommands.generateTrayRangeWithBackupCommands(
            active,
            startTray,
            startSlot,
            endTray,
            endSlot,
            backupStartTray,
            backupStartSlot,
            backupEndTray,
            backupEndSlot
          )

          // Return array with parsed parameters for each command
          return commands.map((cmd, index) => {
            let activeParam,
              primaryTray,
              primarySlot,
              backupTrayParam,
              backupSlotParam
            try {
              const parts = cmd.trim().split(/\s+/)
              // TrayExecByTrayWithBackup <active> <tray> <slot> <backup_tray> <backup_slot>
              activeParam = parseInt(parts[1])
              primaryTray = parseInt(parts[2])
              primarySlot = parseInt(parts[3])
              backupTrayParam = parseInt(parts[4])
              backupSlotParam = parseInt(parts[5])
            } catch (_) {}

            return {
              command: cmd,
              type: categoryId,
              icon: commandDef.icon,
              text:
                index === 0
                  ? `Execute Range with Backup: Tray ${startTray + 1}-${endTray + 1}`
                  : cmd,
              id: this.generateCommandId(),
              parameters: {
                active: activeParam,
                tray: primaryTray,
                slot: primarySlot,
                backup_tray: backupTrayParam,
                backup_slot: backupSlotParam,
              },
            }
          })
        } else if (commandId === 'whole_tray') {
          const commandType = params.command_type || 'STOTrayExecByTray'
          const commands = stoCommands.generateWholeTrayCommands(
            tray,
            commandType
          )

          // Return array of command objects instead of single command with $$
          return commands.map((cmd, index) => {
            // Extract slot number
            let slotParam
            try {
              const parts = cmd.replace('+', '').trim().split(/\s+/)
              slotParam = parseInt(parts[2])
            } catch (_) {
              slotParam = undefined
            }

            return {
              command: cmd,
              type: categoryId,
              icon: commandDef.icon,
              text: index === 0 ? `Execute Whole Tray ${tray + 1}` : cmd,
              id: this.generateCommandId(),
              parameters: { tray, slot: slotParam },
            }
          })
        } else if (commandId === 'whole_tray_with_backup') {
          const active = params.active || 1
          const backupTray = params.backup_tray || 0

          const commands = stoCommands.generateWholeTrayWithBackupCommands(
            active,
            tray,
            backupTray
          )

          // Return array with parsed parameters for each command
          return commands.map((cmd, index) => {
            let activeParam,
              primaryTray,
              primarySlot,
              backupTrayParam,
              backupSlotParam
            try {
              const parts = cmd.trim().split(/\s+/)
              // TrayExecByTrayWithBackup <active> <tray> <slot> <backup_tray> <backup_slot>
              activeParam = parseInt(parts[1])
              primaryTray = parseInt(parts[2])
              primarySlot = parseInt(parts[3])
              backupTrayParam = parseInt(parts[4])
              backupSlotParam = parseInt(parts[5])
            } catch (_) {}

            return {
              command: cmd,
              type: categoryId,
              icon: commandDef.icon,
              text:
                index === 0
                  ? `Execute Whole Tray ${tray + 1} (with backup Tray ${backupTray + 1})`
                  : cmd,
              id: this.generateCommandId(),
              parameters: {
                active: activeParam,
                tray: primaryTray,
                slot: primarySlot,
                backup_tray: backupTrayParam,
                backup_slot: backupSlotParam,
              },
            }
          })
        } else {
          // Preserve original command format when editing
          const isEditing =
            this.currentParameterCommand &&
            this.currentParameterCommand.isEditing
          const commandType = params.command_type || 'STOTrayExecByTray'
          const prefix = '+'

          if (isEditing) {
            const profile = this.getCurrentProfile()
            const existingCommand =
              profile.keys[this.selectedKey][
                this.currentParameterCommand.editIndex
              ]
            if (
              existingCommand &&
              (existingCommand.command.startsWith('TrayExecByTray') ||
                existingCommand.command.startsWith('+TrayExecByTray'))
            ) {
              return {
                command: `+TrayExecByTray ${tray} ${slot}`,
                text: `Execute Tray ${tray + 1} Slot ${slot + 1}`,
              }
            }
          }

          return {
            command: `${prefix}${commandType} ${tray} ${slot}`,
            text: `Execute Tray ${tray + 1} Slot ${slot + 1}`,
          }
        }
      },
      movement: (params) => {
        let command = commandDef.command
        if (commandId === 'throttle_adjust' && params.amount !== undefined) {
          command = `${commandDef.command} ${params.amount}`
        } else if (
          commandId === 'throttle_set' &&
          params.position !== undefined
        ) {
          command = `${commandDef.command} ${params.position}`
        }
        return { command, text: commandDef.name }
      },
      camera: (params) => {
        let command = commandDef.command
        if (commandId === 'cam_distance' && params.distance !== undefined) {
          command = `${commandDef.command} ${params.distance}`
        }
        return { command, text: commandDef.name }
      },
      communication: (params) => ({
        command: `${commandDef.command} ${params.message || 'Message text here'}`,
        text: `${commandDef.name}: ${params.message || 'Message text here'}`,
      }),
      system: (params) => {
        let command = commandDef.command
        if (
          (commandId === 'bind_save_file' || commandId === 'bind_load_file') &&
          params.filename
        ) {
          command = `${commandDef.command} ${params.filename}`
        } else if (commandId === 'combat_log' && params.state !== undefined) {
          command = `${commandDef.command} ${params.state}`
        }
        return { command, text: commandDef.name }
      },
    }

    const builder = builders[categoryId]
    if (builder) {
      const result = builder(params)
      // If tray (or other) builder returned an array of command objects, forward it
      if (Array.isArray(result)) {
        return result
      }

      // Otherwise wrap single command
      return {
        command: result.command,
        type: categoryId,
        icon: commandDef.icon,
        text: result.text,
        id: this.generateCommandId(),
        parameters: params,
      }
    }

    return null
  }

  saveParameterCommand() {
    if (!this.selectedKey || !this.currentParameterCommand) return

    const { categoryId, commandId, commandDef, editIndex, isEditing } =
      this.currentParameterCommand
    const params = this.getParameterValues()

    const command = this.buildParameterizedCommand(
      categoryId,
      commandId,
      commandDef,
      params
    )

    if (command) {
      if (isEditing && editIndex !== undefined) {
        // For arrays of commands, we need to handle replacement differently
        if (Array.isArray(command)) {
          const profile = this.getCurrentProfile()
          const commands = profile.keys[this.selectedKey]

          // Remove the old command and insert the new array of commands
          commands.splice(editIndex, 1, ...command)

          stoStorage.saveProfile(this.currentProfile, profile)
          this.renderCommandChain()
          this.setModified(true)
          stoUI.showToast(
            i18next.t('commands_updated_successfully', { count: command.length }),
            'success'
          )
        } else {
          // Update existing single command
          const profile = this.getCurrentProfile()
          profile.keys[this.selectedKey][editIndex] = command
          stoStorage.saveProfile(this.currentProfile, profile)
          this.renderCommandChain()
          this.setModified(true)
          stoUI.showToast(i18next.t('command_updated_successfully'), 'success')
        }
      } else {
        // Add new command (addCommand already handles arrays)
        this.addCommand(this.selectedKey, command)
      }

      modalManager.hide('parameterModal')
      this.currentParameterCommand = null

      // Reset modal button text
      document.getElementById('saveParameterCommandBtn').textContent =
        i18next.t('add_command')
    }
  }

  editCommand(index) {
    if (!this.selectedKey) return

    const profile = this.getCurrentProfile()
    const commands = profile.keys[this.selectedKey]

    if (!commands || !commands[index]) return

    const command = commands[index]

    // Check if this is a parameterized command that can be edited
    if (command.parameters && command.type) {
      // Find the original command definition
      const commandDef = this.findCommandDefinition(command)
      if (commandDef && commandDef.customizable) {
        this.editParameterizedCommand(index, command, commandDef)
        return
      }
    }

    // Also check if command is detectable as parameterized via findCommandDefinition
    const commandDef = this.findCommandDefinition(command)
    if (commandDef && commandDef.customizable) {
      this.editParameterizedCommand(index, command, commandDef)
      return
    }

    // For non-parameterized commands, show command details
    stoUI.showToast(
      i18next.t('command_info', { command: command.command, type: command.type }),
      'info',
      3000
    )
  }

  findCommandDefinition(command) {
    // Special handling for tray execution commands - detect by command string
    if (command.command.includes('TrayExec')) {
      const trayCategory = STO_DATA.commands.tray
      if (trayCategory) {
        // Check for multiple TrayExecByTrayWithBackup commands (range with backup)
        if (
          command.command.includes('TrayExecByTrayWithBackup') &&
          command.command.includes('$$')
        ) {
          const parts = command.command.split('$$').map((s) => s.trim())
          if (parts.length > 1) {
            const trayRangeWithBackupDef =
              trayCategory.commands.tray_range_with_backup
            if (trayRangeWithBackupDef) {
              return {
                commandId: 'tray_range_with_backup',
                ...trayRangeWithBackupDef,
              }
            }
          }
        }
        // Check for multiple STOTrayExecByTray/TrayExecByTray commands (range)
        else if (
          (command.command.includes('STOTrayExecByTray') ||
            command.command.includes('TrayExecByTray')) &&
          command.command.includes('$$') &&
          !command.command.includes('WithBackup')
        ) {
          const parts = command.command.split('$$').map((s) => s.trim())
          if (parts.length > 1) {
            const trayRangeDef = trayCategory.commands.tray_range
            if (trayRangeDef) {
              return { commandId: 'tray_range', ...trayRangeDef }
            }
          }
        }
        // Check for single TrayExecByTrayWithBackup
        else if (command.command.includes('TrayExecByTrayWithBackup')) {
          const trayWithBackupDef = trayCategory.commands.tray_with_backup
          if (trayWithBackupDef) {
            return { commandId: 'tray_with_backup', ...trayWithBackupDef }
          }
        }
        // Check for STOTrayExecByTray or TrayExecByTray (both use same dialog)
        else if (
          command.command.includes('STOTrayExecByTray') ||
          (command.command.includes('TrayExecByTray') &&
            !command.command.includes('WithBackup'))
        ) {
          const customTrayDef = trayCategory.commands.custom_tray
          if (customTrayDef) {
            return { commandId: 'custom_tray', ...customTrayDef }
          }
        }
      }
    }

    const category = STO_DATA.commands[command.type]
    if (!category) return null

    // First try to find exact command match (for non-customizable commands)
    for (const [commandId, commandDef] of Object.entries(category.commands)) {
      if (commandDef.command === command.command) {
        return { commandId, ...commandDef }
      }
    }

    // Then try to find the command by matching the base command string (for customizable commands)
    for (const [commandId, commandDef] of Object.entries(category.commands)) {
      if (
        commandDef.customizable &&
        command.command.startsWith(commandDef.command.split(' ')[0])
      ) {
        return { commandId, ...commandDef }
      }
    }

    return null
  }

  editParameterizedCommand(index, command, commandDef) {
    this.currentParameterCommand = {
      categoryId: command.type,
      commandId: commandDef.commandId,
      commandDef,
      editIndex: index,
      isEditing: true,
    }

    // Create modal if it doesn't exist
    if (!document.getElementById('parameterModal')) {
      this.createParameterModal()
    }

    // Populate modal with existing parameter values
    this.populateParameterModalForEdit(commandDef, command.parameters)

    // Change modal title and button text for editing
    document.getElementById('parameterModalTitle').textContent =
      `Edit: ${commandDef.name}`
    document.getElementById('saveParameterCommandBtn').textContent =
      'Update Command'

    // Show modal
    modalManager.show('parameterModal')
  }

  populateParameterModalForEdit(commandDef, existingParams) {
    const container = document.getElementById('parameterInputs')
    container.innerHTML = ''

    // Create input for each parameter with existing values
    Object.entries(commandDef.parameters).forEach(([paramName, paramDef]) => {
      const inputGroup = document.createElement('div')
      inputGroup.className = 'form-group'

      const label = document.createElement('label')
      label.textContent = this.formatParameterName(paramName)
      label.setAttribute('for', `param_${paramName}`)

      let input

      // Handle different parameter types
      if (paramDef.type === 'select') {
        // Create select dropdown
        input = document.createElement('select')
        input.id = `param_${paramName}`
        input.name = paramName

        // Add options
        paramDef.options.forEach((option) => {
          const optionElement = document.createElement('option')
          optionElement.value = option
          optionElement.textContent =
            option === 'STOTrayExecByTray'
              ? 'STOTrayExecByTray (shows key binding on UI)'
              : 'TrayExecByTray (no UI indication)'
          input.appendChild(optionElement)
        })

        // Set existing value or default
        const existingValue =
          existingParams && existingParams[paramName] !== undefined
            ? existingParams[paramName]
            : paramDef.default
        input.value =
          existingValue !== undefined && existingValue !== null
            ? existingValue
            : paramDef.default
      } else {
        // Regular input for non-select parameters
        input = document.createElement('input')
        input.type = paramDef.type === 'number' ? 'number' : 'text'
        input.id = `param_${paramName}`
        input.name = paramName

        // Use existing parameter value or default
        const existingValue =
          existingParams && existingParams[paramName] !== undefined
            ? existingParams[paramName]
            : paramDef.default
        input.value =
          existingValue !== undefined && existingValue !== null
            ? existingValue
            : ''

        if (paramDef.placeholder) {
          input.placeholder = paramDef.placeholder
        }

        if (paramDef.type === 'number') {
          if (paramDef.min !== undefined) input.min = paramDef.min
          if (paramDef.max !== undefined) input.max = paramDef.max
          if (paramDef.step !== undefined) input.step = paramDef.step
        }
      }

      const help = document.createElement('small')
      help.textContent = this.getParameterHelp(paramName, paramDef)

      inputGroup.appendChild(label)
      inputGroup.appendChild(input)
      inputGroup.appendChild(help)
      container.appendChild(inputGroup)

      // Add real-time preview update
      input.addEventListener('input', () => {
        this.updateParameterPreview()
      })

      // Also listen for 'change' event for select elements
      if (input.tagName === 'SELECT') {
        input.addEventListener('change', () => {
          this.updateParameterPreview()
        })
      }
    })

    // Initial preview update
    this.updateParameterPreview()
  }

  filterCommandLibrary() {
    // Filter commands in the command library based on current environment
    const commandItems = document.querySelectorAll('.command-item')

    commandItems.forEach((item) => {
      const commandId = item.dataset.command
      if (!commandId) return

      // Find the command definition
      let commandDef = null
      let categoryKey = null

      // Search through all categories for this command
      for (const [catKey, category] of Object.entries(STO_DATA.commands)) {
        if (category.commands[commandId]) {
          commandDef = category.commands[commandId]
          categoryKey = catKey
          break
        }
      }

      if (commandDef) {
        let shouldShow = true

        // Check if command has environment restriction
        if (commandDef.environment) {
          // If command has specific environment, only show it in that environment
          shouldShow = commandDef.environment === this.currentEnvironment
        } else {
          // If no environment specified, show in all environments
          shouldShow = true
        }

        // Apply visibility
        item.style.display = shouldShow ? 'flex' : 'none'
      }
    })

    // Hide/show categories based on whether they have visible commands
    const categories = document.querySelectorAll('.category')
    categories.forEach((category) => {
      const visibleCommands = category.querySelectorAll(
        '.command-item:not([style*="display: none"])'
      )
      const categoryVisible = visibleCommands.length > 0
      category.style.display = categoryVisible ? 'block' : 'none'
    })
  }

  showKeySelectionModal() {
    console.log('[KeyCapture] showKeySelectionModal called')
    this.setupKeySelectionModal()
    modalManager.show('keySelectionModal')
  }

  setupKeySelectionModal() {
    console.log('[KeyCapture] setupKeySelectionModal called')
    
    // Initialize the modifier + key selection interface
    this.setupModifierKeySelection()
    
    // Setup Key Capture functionality
    const captureKeyBtn = document.getElementById('keySelectionCaptureBtn')
    console.log('[KeyCapture] setupKeySelectionModal: captureKeyBtn:', captureKeyBtn)
    if (captureKeyBtn) {
      // Remove any existing handlers
      captureKeyBtn.onclick = null
      captureKeyBtn.removeEventListener('click', () => {})
      
      // Add event listener that will work for clicks anywhere on the button
      captureKeyBtn.addEventListener('click', (event) => {
        console.log('[KeyCapture] captureKeyBtn clicked (event delegation)')
        event.preventDefault()
        event.stopPropagation()
        this.startKeyCapture('keySelectionModal')
      })
    }
  }

  setupModifierKeySelection() {
    // Initialize state
    this.selectedModifiers = []
    this.selectedKey = null

    // Dynamically generate modifier buttons from data.js
    const modifierButtonsContainer = document.querySelector('.modifier-buttons')
    if (modifierButtonsContainer) {
      modifierButtonsContainer.innerHTML = ''
      const modifiers = (STO_DATA.keys.modifiers && STO_DATA.keys.modifiers.keys) || []
      modifiers.forEach(mod => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'modifier-btn'
        btn.dataset.modifier = mod.key
        btn.dataset.selected = 'false'
        
        // Create span with i18n support
        const span = document.createElement('span')
        span.className = 'modifier-label'
        
        // Map modifier keys to i18n strings
        const i18nKey = mod.key.toLowerCase()
        if (i18nKey === 'ctrl' || i18nKey === 'alt' || i18nKey === 'shift') {
          span.setAttribute('data-i18n', i18nKey)
          span.textContent = mod.description || mod.key
        } else {
          span.textContent = mod.description || mod.key
        }
        
        btn.appendChild(span)
        
        btn.addEventListener('click', () => {
          const isSelected = btn.dataset.selected === 'true'
          if (isSelected) {
            btn.dataset.selected = 'false'
            this.selectedModifiers = this.selectedModifiers.filter(m => m !== mod.key)
          } else {
            btn.dataset.selected = 'true'
            this.selectedModifiers.push(mod.key)
          }
          this.updateKeyPreview()
        })
        modifierButtonsContainer.appendChild(btn)
      })
    }

    // Setup tab switching
    const tabBtns = document.querySelectorAll('.tab-btn')
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab
        
        // Update active tab button
        tabBtns.forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        
        // Update active tab content
        const tabContents = document.querySelectorAll('.key-tab')
        tabContents.forEach(tab => tab.classList.remove('active'))
        document.getElementById(`${tabName}-tab`).classList.add('active')
        
        // Populate the selected tab if not already done
        this.populateKeyTab(tabName)
      })
    })
    
    // Setup confirm button
    const confirmBtn = document.getElementById('confirmKeySelection')
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        if (this.selectedKey) {
          const keyCombination = this.buildKeyCombination()
          this.selectKeyFromModal(keyCombination)
        }
      })
    }
    
    // Populate the initial tab (common)
    this.populateKeyTab('common')
  }

  populateKeyTab(tabName) {
    const gridId = `${tabName}KeyGrid`
    const grid = document.getElementById(gridId)
    if (!grid || grid.children.length > 0) return // Already populated
    
    let keys = []
    
    switch (tabName) {
      case 'common':
        keys = STO_DATA.keys.common.keys
        break
      case 'letters':
        keys = STO_DATA.keys.letters.keys
        break
      case 'numbers':
        keys = STO_DATA.keys.numbers.keys
        break
      case 'function':
        keys = STO_DATA.keys.function.keys
        break
      case 'arrows':
        keys = STO_DATA.keys.arrows.keys
        break
      case 'symbols':
        keys = STO_DATA.keys.symbols.keys
        break
      case 'mouse':
        keys = STO_DATA.keys.mouse.keys
        break
      case 'gamepad':
        keys = STO_DATA.keys.gamepad.keys
        break
    }
    
    grid.innerHTML = ''
    keys.forEach(keyData => {
      const keyItem = document.createElement('div')
      keyItem.className = 'key-item'
      keyItem.dataset.key = keyData.key
      
      // Smart formatting for compound keys and font sizing
      const formattedKeyName = this.formatKeyName(keyData.key)
      const hasLineBreaks = formattedKeyName.includes('<br>')
      
      // Determine length classification
      let lengthClass
      if (hasLineBreaks) {
        // For compound keys with line breaks, check the longest part
        const parts = keyData.key.split(/[+_]/)
        const longestPart = Math.max(...parts.map((part) => part.length))
        if (longestPart <= 4) {
          lengthClass = 'short'
        } else if (longestPart <= 8) {
          lengthClass = 'medium'
        } else {
          lengthClass = 'long'
        }
      } else {
        // For single keys, use total length
        const keyLength = keyData.key.length
        if (keyLength <= 3) {
          lengthClass = 'short'
        } else if (keyLength <= 5) {
          lengthClass = 'medium'
        } else if (keyLength <= 8) {
          lengthClass = 'long'
        } else {
          lengthClass = 'extra-long'
        }
      }
      
      keyItem.dataset.length = lengthClass
      
      keyItem.innerHTML = `
        <div class="key-label">${formattedKeyName}</div>
      `
      
      keyItem.addEventListener('click', () => {
        // Remove selection from other keys in this tab
        grid.querySelectorAll('.key-item').forEach(item => {
          item.classList.remove('selected')
        })
        
        // Select this key
        keyItem.classList.add('selected')
        this.selectedKey = keyData.key
        this.updateKeyPreview()
      })
      
      grid.appendChild(keyItem)
    })
  }

  buildKeyCombination() {
    if (!this.selectedKey) return null
    
    if (this.selectedModifiers.length === 0) {
      return this.selectedKey
    }
    
    return [...this.selectedModifiers, this.selectedKey].join('+')
  }

  updateKeyPreview() {
    const previewDisplay = document.getElementById('keyPreviewDisplay')
    const confirmBtn = document.getElementById('confirmKeySelection')
    
    if (!previewDisplay || !confirmBtn) return
    
    const combination = this.buildKeyCombination()
    
    if (combination) {
      previewDisplay.innerHTML = `<span class="key-combination">${combination}</span>`
      confirmBtn.disabled = false
    } else {
      previewDisplay.innerHTML = '<span class="no-selection" data-i18n="no_key_selected">No key selected</span>'
      confirmBtn.disabled = true
    }

    // Setup Key Capture functionality
    const captureKeyBtn = document.getElementById('captureKeyBtn')
    console.log('[KeyCapture] setupKeySelectionModal: captureKeyBtn:', captureKeyBtn)
    if (captureKeyBtn) {
      // Remove any existing handlers
      captureKeyBtn.onclick = null
      captureKeyBtn.removeEventListener('click', () => {})
      
      // Add event listener that will work for clicks anywhere on the button
      captureKeyBtn.addEventListener('click', (event) => {
        console.log('[KeyCapture] captureKeyBtn clicked (event delegation)')
        event.preventDefault()
        event.stopPropagation()
        this.startKeyCapture('keySelectionModal')
      })
    }
  }

  populateCommonKeys() {
    const commonKeysGrid = document.getElementById('commonKeysGrid')
    if (!commonKeysGrid) return

    const commonKeys = STO_DATA.keys.common.keys
    commonKeysGrid.innerHTML = ''

    commonKeys.forEach((keyData) => {
      const keyButton = document.createElement('div')
      keyButton.className = 'key-button'
      keyButton.onclick = () => this.selectKeyFromModal(keyData.key)

      keyButton.innerHTML = `
                <div class="key-name">${keyData.key}</div>
                <div class="key-desc">${keyData.description}</div>
            `

      commonKeysGrid.appendChild(keyButton)
    })
  }

  selectKeyFromModal(keyName) {
    modalManager.hide('keySelectionModal')
    
    // Add the key to the profile if it doesn't exist, then select it
    this.addKey(keyName)
  }

  insertTargetVariable(input) {
    const targetVar = '$Target'
    const cursorPosition = input.selectionStart
    const value = input.value
    const newValue =
      value.slice(0, cursorPosition) + targetVar + value.slice(cursorPosition)
    input.value = newValue
    input.setSelectionRange(
      cursorPosition + targetVar.length,
      cursorPosition + targetVar.length
    )
    input.focus()

    // Trigger input event to update preview
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  // Vertigo VFX Manager Methods
  showVertigoModal() {
    // Load state from root profile (not build-specific view)
    const rootProfile = stoStorage.getProfile(this.currentProfile)
    if (rootProfile) {
      vertigoManager.loadState(rootProfile)
    }

    // Store the initial state for potential rollback on cancel
    this.vertigoInitialState = {
      selectedEffects: {
        space: new Set(vertigoManager.selectedEffects.space),
        ground: new Set(vertigoManager.selectedEffects.ground),
      },
      showPlayerSay: vertigoManager.showPlayerSay,
    }

    this.populateVertigoModal()
    this.setupVertigoEventListeners()
    modalManager.show('vertigoModal')
  }

  populateVertigoModal() {
    // Populate space effects
    const spaceList = document.getElementById('spaceEffectsList')
    if (spaceList) {
      spaceList.innerHTML = ''
      VFX_EFFECTS.space.forEach((effect) => {
        const effectItem = this.createEffectItem('space', effect)
        spaceList.appendChild(effectItem)
      })
    }

    // Populate ground effects
    const groundList = document.getElementById('groundEffectsList')
    if (groundList) {
      groundList.innerHTML = ''
      VFX_EFFECTS.ground.forEach((effect) => {
        const effectItem = this.createEffectItem('ground', effect)
        groundList.appendChild(effectItem)
      })
    }

    // Update UI state based on loaded data
    this.updateVertigoCheckboxes('space')
    this.updateVertigoCheckboxes('ground')

    // Update PlayerSay checkbox
    const playerSayCheckbox = document.getElementById('vertigoShowPlayerSay')
    if (playerSayCheckbox) {
      playerSayCheckbox.checked = vertigoManager.showPlayerSay
    }

    // Update effect counts and preview
    this.updateVertigoEffectCounts()
    this.updateVertigoPreview()
  }

  createEffectItem(environment, effect) {
    const item = document.createElement('div')
    item.className = 'effect-item'
    item.innerHTML = `
            <input type="checkbox" id="effect_${environment}_${effect.effect.replace(/[^a-zA-Z0-9]/g, '_')}" 
                   data-environment="${environment}" 
                   data-effect="${effect.effect}">
            <label for="effect_${environment}_${effect.effect.replace(/[^a-zA-Z0-9]/g, '_')}" 
                   class="effect-label">${effect.label}</label>
        `

    const checkbox = item.querySelector('input[type="checkbox"]')
    checkbox.addEventListener('change', () => {
      vertigoManager.toggleEffect(environment, effect.effect)
      this.updateVertigoEffectCounts()
      this.updateVertigoPreview()
      item.classList.toggle('selected', checkbox.checked)

      // Note: Don't save immediately - only save when "Generate Aliases" is clicked
      // This allows for proper transaction behavior with rollback on cancel
    })

    const label = item.querySelector('.effect-label')
    label.addEventListener('click', () => {
      checkbox.checked = !checkbox.checked
      checkbox.dispatchEvent(new Event('change'))
    })

    return item
  }

  setupVertigoEventListeners() {
    // Clear existing listeners to avoid duplicates
    const existingListeners = [
      'spaceSelectAll',
      'spaceClearAll',
      'groundSelectAll',
      'groundClearAll',
      'vertigoShowPlayerSay',
      'saveVertigoBtn',
    ]
    existingListeners.forEach((id) => {
      const element = document.getElementById(id)
      if (element) {
        element.replaceWith(element.cloneNode(true))
      }
    })

    // Space controls
    eventBus.onDom(
      'spaceSelectAll',
      'click',
      'vertigo-space-select-all',
      () => {
        try {
          vertigoManager.selectAllEffects('space')
          this.updateVertigoCheckboxes('space')
          this.updateVertigoEffectCounts()
          this.updateVertigoPreview()

          // Note: Don't save immediately - only save when "Generate Aliases" is clicked
        } catch (error) {
          if (error instanceof InvalidEnvironmentError) {
            stoUI.showToast(i18next.t('error_message', {error: error.message}), 'error')
          } else {
            stoUI.showToast(i18next.t('failed_to_select_all_space_effects'), 'error')
            console.error('Error selecting all space effects:', error)
          }
        }
      }
    )

    eventBus.onDom('spaceClearAll', 'click', 'vertigo-space-clear-all', () => {
      vertigoManager.selectedEffects.space.clear()
      this.updateVertigoCheckboxes('space')
      this.updateVertigoEffectCounts()
      this.updateVertigoPreview()

      // Note: Don't save immediately - only save when "Generate Aliases" is clicked
    })

    // Ground controls
    eventBus.onDom(
      'groundSelectAll',
      'click',
      'vertigo-ground-select-all',
      () => {
        try {
          vertigoManager.selectAllEffects('ground')
          this.updateVertigoCheckboxes('ground')
          this.updateVertigoEffectCounts()
          this.updateVertigoPreview()

          // Note: Don't save immediately - only save when "Generate Aliases" is clicked
        } catch (error) {
          if (error instanceof InvalidEnvironmentError) {
            stoUI.showToast(i18next.t('error_message', {error: error.message}), 'error')
          } else {
            stoUI.showToast(i18next.t('failed_to_select_all_ground_effects'), 'error')
            console.error('Error selecting all ground effects:', error)
          }
        }
      }
    )

    eventBus.onDom(
      'groundClearAll',
      'click',
      'vertigo-ground-clear-all',
      () => {
        vertigoManager.selectedEffects.ground.clear()
        this.updateVertigoCheckboxes('ground')
        this.updateVertigoEffectCounts()
        this.updateVertigoPreview()

        // Note: Don't save immediately - only save when "Generate Aliases" is clicked
      }
    )

    // Show Player Say toggle
    eventBus.onDom(
      'vertigoShowPlayerSay',
      'change',
      'vertigo-show-playersay',
      (e) => {
        vertigoManager.showPlayerSay = e.target.checked
        this.updateVertigoPreview()

        // Note: Don't save immediately - only save when "Generate Aliases" is clicked
      }
    )

    // Generate aliases button
    eventBus.onDom('saveVertigoBtn', 'click', 'vertigo-save', () => {
      this.generateVertigoAliases()
    })
  }

  updateVertigoCheckboxes(environment) {
    const checkboxes = document.querySelectorAll(
      `input[data-environment="${environment}"]`
    )
    checkboxes.forEach((checkbox) => {
      const effectName = checkbox.dataset.effect
      const isSelected = vertigoManager.isEffectSelected(
        environment,
        effectName
      )
      checkbox.checked = isSelected
      checkbox.closest('.effect-item').classList.toggle('selected', isSelected)
    })
  }

  updateVertigoEffectCounts() {
    const spaceCount = vertigoManager.getEffectCount('space')
    const groundCount = vertigoManager.getEffectCount('ground')

    const spaceCounter = document.getElementById('spaceEffectCount')
    const groundCounter = document.getElementById('groundEffectCount')

    if (spaceCounter) {
      spaceCounter.textContent = `${spaceCount} selected`
    }

    if (groundCounter) {
      groundCounter.textContent = `${groundCount} selected`
    }
  }

  updateVertigoPreview() {
    const spacePreview = document.getElementById('spaceAliasCommand')
    const groundPreview = document.getElementById('groundAliasCommand')

    // Update space preview
    if (spacePreview) {
      try {
        const spaceAlias = vertigoManager.generateAlias('space')
        spacePreview.textContent = spaceAlias || 'No space effects selected'
      } catch (error) {
        if (error instanceof InvalidEnvironmentError) {
          spacePreview.textContent = 'Error: Invalid environment'
          stoUI.showToast(i18next.t('space_preview_error', {error: error.message}), 'error')
        } else {
          spacePreview.textContent = 'Error generating preview'
          console.error('Error generating space alias preview:', error)
        }
      }
    }
    
    // Update ground preview
    if (groundPreview) {
      try {
        const groundAlias = vertigoManager.generateAlias('ground')
        groundPreview.textContent = groundAlias || 'No ground effects selected'
      } catch (error) {
        if (error instanceof InvalidEnvironmentError) {
          groundPreview.textContent = 'Error: Invalid environment'
          stoUI.showToast(i18next.t('ground_preview_error', {error: error.message}), 'error')
        } else {
          groundPreview.textContent = 'Error generating preview'
          console.error('Error generating ground alias preview:', error)
        }
      }
    }
  }

  generateVertigoAliases() {
    let spaceAlias = ''
    let groundAlias = ''

    // Generate aliases with error handling
    try {
      spaceAlias = vertigoManager.generateAlias('space')
    } catch (error) {
      if (error instanceof InvalidEnvironmentError) {
        stoUI.showToast(i18next.t('space_alias_error', {error: error.message}), 'error')
        return
      } else {
        stoUI.showToast(i18next.t('failed_to_generate_space_alias'), 'error')
        console.error('Error generating space alias:', error)
        return
      }
    }

    try {
      groundAlias = vertigoManager.generateAlias('ground')
    } catch (error) {
      if (error instanceof InvalidEnvironmentError) {
        stoUI.showToast(i18next.t('ground_alias_error', {error: error.message}), 'error')
        return
      } else {
        stoUI.showToast(i18next.t('failed_to_generate_ground_alias'), 'error')
        console.error('Error generating ground alias:', error)
        return
      }
    }

    if (!spaceAlias && !groundAlias) {
      stoUI.showToast(
        i18next.t('no_effects_selected'),
        'warning'
      )
      return
    }

    const currentProfile = this.getCurrentProfile()
    if (!currentProfile) {
      stoUI.showToast(i18next.t('no_profile_selected'), 'error')
      return
    }

    // Get the root profile object (not the build-specific view)
    const rootProfile = stoStorage.getProfile(this.currentProfile)
    if (!rootProfile) {
      stoUI.showToast(i18next.t('no_profile_found'), 'error')
      return
    }

    let addedCount = 0

    // Ensure aliases structure exists at profile level (not build-specific)
    if (!rootProfile.aliases) {
      rootProfile.aliases = {}
    }

    // Add space alias if effects are selected
    if (spaceAlias) {
      const spaceAliasName = 'dynFxSetFXExlusionList_Space'
      // Extract commands from the full alias (remove the alias name and brackets)
      // spaceAlias format: 'alias aliasName <& commands&>'
      const match = spaceAlias.match(/alias\s+\w+\s+<&\s+(.+?)&>/)
      const spaceCommands = match ? match[1] : ''

      rootProfile.aliases[spaceAliasName] = {
        name: spaceAliasName,
        description: 'VFX - Disable Space Visual Effects',
        commands: spaceCommands,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      }
      addedCount++
    }

    // Add ground alias if effects are selected
    if (groundAlias) {
      const groundAliasName = 'dynFxSetFXExlusionList_Ground'
      // Extract commands from the full alias (remove the alias name and brackets)
      // groundAlias format: 'alias aliasName <& commands&>'
      const match = groundAlias.match(/alias\s+\w+\s+<&\s+(.+?)&>/)
      const groundCommands = match ? match[1] : ''

      rootProfile.aliases[groundAliasName] = {
        name: groundAliasName,
        description: 'VFX - Disable Ground Visual Effects',
        commands: groundCommands,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      }
      addedCount++
    }

    // Save current state to root profile so it persists (commit the transaction)
    vertigoManager.saveState(rootProfile)

    // Save the root profile to storage
    stoStorage.saveProfile(this.currentProfile, rootProfile)

    // Save the changes - follow the same pattern as aliases.js
    this.saveProfile()
    this.setModified(true)

    // Update the command library to show the new VFX aliases
    if (typeof stoAliases !== 'undefined' && stoAliases.updateCommandLibrary) {
      stoAliases.updateCommandLibrary()
    }

    // Update the stored initial state to the new saved state
    this.vertigoInitialState = {
      selectedEffects: {
        space: new Set(vertigoManager.selectedEffects.space),
        ground: new Set(vertigoManager.selectedEffects.ground),
      },
      showPlayerSay: vertigoManager.showPlayerSay,
    }

    // Set flag to indicate we're saving (not canceling)
    this.vertigoSaving = true

    // Close modal and show success message
    modalManager.hide('vertigoModal')
    stoUI.showToast(
      i18next.t('generated_vertigo_aliases', { count: addedCount, plural: addedCount > 1 ? 'es' : '' }),
      'success'
    )
  }

  // Theme Management
  applyTheme() {
    const settings = stoStorage.getSettings()
    const theme = settings.theme || 'default'

    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }

    this.updateThemeToggleButton(theme)
  }

  toggleTheme() {
    const settings = stoStorage.getSettings()
    const currentTheme = settings.theme || 'default'
    const newTheme = currentTheme === 'dark' ? 'default' : 'dark'

    settings.theme = newTheme
    stoStorage.saveSettings(settings)

    this.applyTheme()

    const themeName = newTheme === 'dark' ? 'Dark Mode' : 'Light Mode'
    stoUI.showToast(i18next.t('switched_to_theme', {themeName: themeName}), 'success')
  }

  updateThemeToggleButton(theme) {
    const themeToggleBtn = document.getElementById('themeToggleBtn')
    const themeToggleText = document.getElementById('themeToggleText')
    const themeIcon = themeToggleBtn?.querySelector('i')

    if (themeToggleBtn && themeToggleText && themeIcon) {
      if (theme === 'dark') {
        themeIcon.className = 'fas fa-sun'
        themeToggleText.textContent = 'Light Mode'
      } else {
        themeIcon.className = 'fas fa-moon'
        themeToggleText.textContent = 'Dark Mode'
      }
    }
  }

  async applyLanguage() {
    const settings = stoStorage.getSettings()
    const lang = settings.language || 'en'

    if (typeof i18next !== 'undefined' && i18next.language !== lang) {
      await i18next.changeLanguage(lang)
    }

    if (typeof applyTranslations === 'function') {
      applyTranslations()
    }

    const flag = document.getElementById('languageFlag')
    const flagClasses = { en: 'fi fi-gb', de: 'fi fi-de', es: 'fi fi-es', fr: 'fi fi-fr' }
    if (flag) {
      flag.className = flagClasses[lang] || 'fi fi-gb'
    }
  }

  async changeLanguage(lang) {
    const settings = stoStorage.getSettings()
    settings.language = lang
    stoStorage.saveSettings(settings)

    await this.applyLanguage()
    
    // Re-localize command data with new language
    if (window.localizeCommandData) {
      window.localizeCommandData()
    }
    
    // Re-render all dynamic content
    this.renderProfiles()
    this.renderKeyGrid()
    this.renderCommandChain()
    
    // Update command library if it exists
    if (this.setupCommandLibrary) {
      this.setupCommandLibrary()
    }
    
    // Update export formats if export manager exists
    if (typeof stoExport !== 'undefined' && stoExport.init) {
      stoExport.init()
    }
    
    stoUI.showToast(i18next.t('language_updated'), 'success')
  }

  // Alias Options Multiselect Methods
  toggleAliasOptionsDropdown() {
    const dropdown = document.getElementById('aliasOptionsDropdown')
    const menu = document.getElementById('aliasOptionsMenu')
    
    if (!dropdown || !menu) return
    
    const isOpen = menu.style.display === 'block'
    
    if (isOpen) {
      this.closeAliasOptionsDropdown()
    } else {
      this.openAliasOptionsDropdown()
    }
  }

  openAliasOptionsDropdown() {
    const dropdown = document.getElementById('aliasOptionsDropdown')
    const menu = document.getElementById('aliasOptionsMenu')
    
    if (!dropdown || !menu) return
    
    dropdown.classList.add('active')
    menu.style.display = 'block'
  }

  closeAliasOptionsDropdown() {
    const dropdown = document.getElementById('aliasOptionsDropdown')
    const menu = document.getElementById('aliasOptionsMenu')
    
    if (!dropdown || !menu) return
    
    dropdown.classList.remove('active')
    menu.style.display = 'none'
  }

  updateAliasOptionsLabel() {
    const checkboxes = [
      { id: 'aliasStabilizeOption', label: 'Stabilize' },
      { id: 'aliasToggleOption', label: 'Toggle' },
      { id: 'aliasCycleOption', label: 'Cycle' }
    ]
    
    const selected = checkboxes.filter(cb => {
      const checkbox = document.getElementById(cb.id)
      return checkbox && checkbox.checked
    })
    
    const label = document.querySelector('#aliasOptionsDropdown .multiselect-label')
    if (label) {
      if (selected.length === 0) {
        label.textContent = i18next.t('select_options')
      } else if (selected.length === 1) {
        label.textContent = selected[0].label
      } else {
        label.textContent = `${selected.length} options selected`
      }
    }
  }

  // Key Capture Methods
  startKeyCapture(modalContext = 'keySelectionModal') {
    console.log('[KeyCapture] startKeyCapture called for modal:', modalContext)
    this.isCapturingKeys = true
    this.pressedCodes = new Set()
    this.currentCaptureContext = modalContext
    this.hasCapturedValidKey = false  // Add flag to track if we've captured a valid key
    
    // Determine which elements to use based on modal context
    const captureStatusId = modalContext === 'addKeyModal' ? 'addKeyCaptureStatus' : 'keyCaptureStatus'
    const capturedKeysId = modalContext === 'addKeyModal' ? 'addKeyCapturedKeys' : 'capturedKeys'
    const captureBtnId = modalContext === 'addKeyModal' ? 'addKeyCaptureBtn' : 'keySelectionCaptureBtn'

    
    // Show capture status
    const captureStatus = document.getElementById(captureStatusId)
    const capturedKeys = document.getElementById(capturedKeysId)
    const captureBtn = document.getElementById(captureBtnId)
    
    console.log('[KeyCapture] Elements found:', {
      captureStatus: !!captureStatus,
      capturedKeys: !!capturedKeys,
      captureBtn: !!captureBtn,
      modalContext
    })
    
    if (captureStatus) captureStatus.style.display = 'block'
    if (capturedKeys) {
      capturedKeys.textContent = ''
      capturedKeys.setAttribute('data-placeholder', 'Press keys...')
    }
    if (captureBtn) captureBtn.disabled = true
    
    // Add event listeners
    console.log('[KeyCapture] Adding key event listeners to document')
    document.addEventListener('keydown', this.boundHandleKeyDown)
    document.addEventListener('keyup', this.boundHandleKeyUp)
    
    // Test if listeners are attached
    console.log('[KeyCapture] Event listeners attached:', {
      keydown: document.onkeydown,
      hasKeydown: !!document.onkeydown
    })
    
    // Focus on the modal to capture keys
    const modal = document.getElementById(modalContext)
    console.log('[KeyCapture] Modal found:', !!modal)
    if (modal) {
      modal.focus()
      console.log('[KeyCapture] Modal focused')
    }
    
    console.log('[KeyCapture] startKeyCapture completed')
  }

  stopKeyCapture() {
    this.isCapturingKeys = false
    this.pressedCodes.clear()
    
    // Determine which elements to use based on current context
    const modalContext = this.currentCaptureContext || 'keySelectionModal'
    const captureStatusId = modalContext === 'addKeyModal' ? 'addKeyCaptureStatus' : 'keyCaptureStatus'
    const captureBtnId = modalContext === 'addKeyModal' ? 'addKeyCaptureBtn' : 'keySelectionCaptureBtn'

    
    // Hide capture status
    const captureStatus = document.getElementById(captureStatusId)
    const captureBtn = document.getElementById(captureBtnId)
    
    if (captureStatus) captureStatus.style.display = 'none'
    if (captureBtn) captureBtn.disabled = false
    
    // Hide confirm section if in addKeyModal
    if (modalContext === 'addKeyModal') {
      const confirmSection = document.getElementById('addKeyConfirmSection')
      if (confirmSection) confirmSection.style.display = 'none'
    }
    
    // Remove event listeners
    document.removeEventListener('keydown', this.boundHandleKeyDown)
    document.removeEventListener('keyup', this.boundHandleKeyUp)
    
    // Clear context
    this.currentCaptureContext = null
  }

  handleKeyDown(event) {
    if (!this.isCapturingKeys) return
    
    // Ignore pure modifier presses
    if (this.isPureModifier(event.code)) {
      this.pressedCodes.add(event.code)
      this.updateCapturedKeysDisplay()
      return
    }

    // At this point, a "real" key was pressed—grab the full set
    this.pressedCodes.add(event.code)
    const chord = this.chordToString(this.pressedCodes)
    
    // Update display
    this.updateCapturedKeysDisplay(chord)
    
    // Add a button to select the captured key
    this.addCapturedKeySelectionButton(chord)
    
    // Mark that we've captured a valid key combination
    this.hasCapturedValidKey = true
    
    // Do NOT auto-stop capture; wait for user to confirm
    event.preventDefault()
  }

  addCapturedKeySelectionButton(chord) {
    const modalContext = this.currentCaptureContext || 'keySelectionModal'
 
    if (modalContext === 'addKeyModal') {
      // For addKeyModal, use the existing behavior
      const capturedKeysId = 'addKeyCapturedKeys'
      const capturedKeys = document.getElementById(capturedKeysId)
      if (!capturedKeys) return
      
      // Clear any existing selection button
      const existingButton = capturedKeys.querySelector('.captured-key-select-btn')
      if (existingButton) {
        existingButton.remove()
      }
      
      // Show the select button
      const selectButton = document.createElement('button')
      selectButton.className = 'btn btn-primary captured-key-select-btn'
      selectButton.textContent = `Select "${chord}"`
      selectButton.onclick = () => {

        const keyNameInput = document.getElementById('newKeyName')
        if (keyNameInput) {
          keyNameInput.value = chord
        }
        this.addKey(chord)
        modalManager.hide('addKeyModal')
        this.stopKeyCapture()
      }
      capturedKeys.appendChild(selectButton)
    } else {
      // For keySelectionModal, update the key preview and enable the Select This Key button
      const previewDisplay = document.getElementById('keyPreviewDisplay')
      const confirmBtn = document.getElementById('confirmKeySelection')
      
      if (previewDisplay && confirmBtn) {
        // Update the preview display with the captured key
        previewDisplay.innerHTML = `<span class="key-combination">${chord}</span>`
        
        // Enable the Select This Key button
        confirmBtn.disabled = false
        
        // Store the captured key for when the user clicks "Select This Key"
        this.selectedKey = chord
        this.selectedModifiers = [] // Clear any selected modifiers since we captured a complete key
        
        // Clear any selected modifiers in the UI
        const modifierBtns = document.querySelectorAll('.modifier-btn')
        modifierBtns.forEach(btn => {
          btn.dataset.selected = 'false'
        })
        
        // Clear any selected keys in the grids
        const keyItems = document.querySelectorAll('.key-item.selected')
        keyItems.forEach(item => {
          item.classList.remove('selected')
        })
      }
      
      // Stop key capture
      this.stopKeyCapture()
    }
  }

  handleKeyUp(event) {
    if (!this.isCapturingKeys) return
    
    // Only clear pressed codes if we haven't captured a valid key yet
    if (!this.hasCapturedValidKey) {

    this.pressedCodes.delete(event.code)
    this.updateCapturedKeysDisplay()

    }
  }

  isPureModifier(code) {
    return [
      'ShiftLeft', 'ShiftRight',
      'ControlLeft', 'ControlRight',
      'AltLeft', 'AltRight',
      'MetaLeft', 'MetaRight'
    ].includes(code)
  }

  chordToString(codes) {
    // Sort so you get a consistent order
    return [...codes]
      .sort()
      .map(code => {
        // Convert to STO key format
        if (code.startsWith('Control')) return 'Ctrl'
        if (code.startsWith('Alt')) return 'Alt'
        if (code.startsWith('Shift')) return 'Shift'
        if (code.startsWith('Meta')) return 'Meta'
        
        // DigitX → X
        const digitMatch = code.match(/^Digit(\d)$/)
        if (digitMatch) return digitMatch[1]
        
        // KeyX → X (for letters)
        const keyMatch = code.match(/^Key([A-Z])$/)
        if (keyMatch) return keyMatch[1]
        
        // Function keys
        if (code.startsWith('F') && /^F\d+$/.test(code)) {
          return code
        }
        
        // Special keys
        const specialKeyMap = {
          'Space': 'Space',
          'Enter': 'Enter',
          'Tab': 'Tab',
          'Escape': 'Escape',
          'Backspace': 'Backspace',
          'Delete': 'Delete',
          'Home': 'Home',
          'End': 'End',
          'PageUp': 'PageUp',
          'PageDown': 'PageDown',
          'ArrowUp': 'Up',
          'ArrowDown': 'Down',
          'ArrowLeft': 'Left',
          'ArrowRight': 'Right',
          'BracketLeft': '[',
          'BracketRight': ']',
          'Semicolon': ';',
          'Quote': "'",
          'Comma': ',',
          'Period': '.',
          'Slash': '/',
          'Backslash': '\\',
          'Minus': '-',
          'Equal': '=',
          'Backquote': '`',
          'IntlBackslash': '\\'
        }
        
        return specialKeyMap[code] || code.replace(/^Key/, '')
      })
      .join('+')
  }

  updateCapturedKeysDisplay(chord = null) {
    const modalContext = this.currentCaptureContext || 'keySelectionModal'
    const capturedKeysId = modalContext === 'addKeyModal' ? 'addKeyCapturedKeys' : 'capturedKeys'
    const capturedKeys = document.getElementById(capturedKeysId)
    if (!capturedKeys) return
    
    if (chord) {
      capturedKeys.textContent = chord
    } else if (this.pressedCodes.size > 0) {
      const currentChord = this.chordToString(this.pressedCodes)
      capturedKeys.textContent = currentChord
    } else {
      capturedKeys.textContent = ''
      capturedKeys.setAttribute('data-placeholder', 'Press keys...')
    }
  }

  // Utility Methods
}

// Initialize application
Object.assign(STOToolsKeybindManager.prototype, profileManagement, keyHandling, uiRendering);
