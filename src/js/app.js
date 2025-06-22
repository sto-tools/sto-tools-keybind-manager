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
)
;

