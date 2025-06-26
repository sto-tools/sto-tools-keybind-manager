import ComponentBase from '../ComponentBase.js'
import { parameterCommands } from './ParameterCommandUI.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'

/**
 * CommandLibraryUI - Handles all command library UI operations
 * Manages command chain rendering, library setup, and user interactions
 */
export default class CommandLibraryUI extends ComponentBase {
  constructor({ service, eventBus, ui, modalManager, document }) {
    super(eventBus)
    this.service = service
    this.ui = ui
    this.modalManager = modalManager
    this.document = document || (typeof window !== 'undefined' ? window.document : null)
    this.eventListenersSetup = false
  }

  /**
   * Initialize the CommandLibraryUI component
   */
  onInit() {
    this.setupEventListeners()
    // Build out the command categories before applying alias overlays
    this.setupCommandLibrary()
    // Ensure aliases and other dynamic elements are incorporated
    // (setupCommandLibrary already invokes updateCommandLibrary internally, so
    // calling it again here is no longer necessary)
    // this.updateCommandLibrary()

    // ---------------------------------------------
    // UI decoupling – listen for global UI events
    // ---------------------------------------------
    this.addEventListener('ui:render-command-chain', () => this.renderCommandChain())
    this.addEventListener('ui:update-profile-info', () => this.updateCommandLibrary())

    // Also re-render when command service broadcasts
    this.addEventListener('command:added', () => this.renderCommandChain())
    this.addEventListener('command:deleted', () => this.renderCommandChain())
    this.addEventListener('command:moved', () => this.renderCommandChain())
  }

  /**
   * Set up all event listeners for command library UI
   */
  setupEventListeners() {
    if (this.eventListenersSetup) {
      return // Prevent duplicate event listener setup
    }
    this.eventListenersSetup = true

    // Listen for service events directly from the service instance to decouple tests from the global eventBus
    if (this.service && typeof this.service.addEventListener === 'function') {
      this.service.addEventListener('command-added', () => {
        this.renderCommandChain()
      })

      this.service.addEventListener('command-deleted', () => {
        this.renderCommandChain()
      })

      this.service.addEventListener('command-moved', () => {
        this.renderCommandChain()
      })
    }

    // Listen for stabilize execution order checkbox changes
    this.eventBus.onDom('stabilizeExecutionOrder', 'change', 'stabilize-order-change', () => {
      this.renderCommandChain()
    })

    if (this.service && typeof this.service.addEventListener === 'function') {
      this.service.addEventListener('environment-changed', () => {
        this.filterCommandLibrary()
        this.renderCommandChain()
      })
      this.service.addEventListener('key-selected', () => {
        this.renderCommandChain()
      })
    }

    if (typeof this.addEventListener === 'function') {
      this.addEventListener('command-added', () => {
        this.renderCommandChain()
      })
      this.addEventListener('command-deleted', () => {
        this.renderCommandChain()
      })
      this.addEventListener('command-moved', () => {
        this.renderCommandChain()
      })
      this.addEventListener('environment-changed', () => {
        this.filterCommandLibrary()
        this.renderCommandChain()
      })
      this.addEventListener('key-selected', () => {
        this.renderCommandChain()
      })
    }
  }

  /**
   * Render the command chain UI
   */
  async renderCommandChain() {
    const container = this.document.getElementById('commandList')
    const title = this.document.getElementById('chainTitle')
    const preview = this.document.getElementById('commandPreview')
    const commandCount = this.document.getElementById('commandCount')
    const emptyState = this.document.getElementById('emptyState')

    if (!container || !title || !preview) return

    // ---------------------------------------------------------------------
    // Avoid redundant re-renders that can confuse unit tests relying on
    // call-counts. If nothing material (selected key, environment, command
    // length) has changed since the last render just bail out early.
    // ---------------------------------------------------------------------
    const key   = this.service ? this.service.selectedKey : null
    const env   = this.service ? this.service.currentEnvironment : null
    const cmds  = await request(eventBus, 'command:get-for-selected-key')
    const cmdLen = cmds.length

    // Update memoization snapshot; skip early bail-out for now to avoid edge
    // cases where the command list changes but key/env/length appear stable
    // (e.g., alias chains or command edits).
    this._lastRender = { key, env, commandLength: cmdLen }

    const emptyStateInfo = this.service.getEmptyStateInfo()

    // We'll populate this later; ensures it's defined for cross-component emit
    let commands = cmds

    // Update title and preview
    title.textContent = emptyStateInfo.title
    preview.textContent = emptyStateInfo.preview
    if (commandCount) {
      commandCount.textContent = emptyStateInfo.commandCount
    }

    if (!this.service.selectedKey) {
      // No key selected - show empty state
      if (emptyState) emptyState.style.display = 'block'
      container.innerHTML = `
        <div class="empty-state" id="emptyState">
          <i class="${emptyStateInfo.icon}"></i>
          <h4>${emptyStateInfo.emptyTitle}</h4>
          <p>${emptyStateInfo.emptyDesc}</p>
        </div>`

      // Also instruct chain UI
      if (window.commandChainUI && typeof window.commandChainUI.render === 'function') {
        window.commandChainUI.render()
      }
      return
    }

    // Refresh commands list (already captured above) in case the service has
    // mutated state since the memoization snapshot. This is effectively a
    // no-op for most flows but keeps the original semantics intact.
    commands = await request(eventBus, 'command:get-for-selected-key')

    if (commands.length === 0) {
      // No commands - show empty state
      container.innerHTML = `
        <div class="empty-state">
          <i class="${emptyStateInfo.icon}"></i>
          <h4 data-i18n="no_commands">${emptyStateInfo.emptyTitle}</h4>
          <p>${emptyStateInfo.emptyDesc}</p>
        </div>`
    } else {
      // Render command list
      container.innerHTML = ''
      const elements = await Promise.all(commands.map((command, index) => this.createCommandElement(command, index, commands.length)))
      elements.forEach(el => container.appendChild(el))
    }

    // After updating UI, broadcast to new command-chain component (phase-2): still emit event but also call chainUI.render
    if (this.eventBus) {
      this.eventBus.emit('command-chain:update', {
        commands,
        selectedKey: key,
        environment: env,
      })
    }

    if (window.commandChainUI && typeof window.commandChainUI.render === 'function') {
      window.commandChainUI.render(commands)
    }
  }

  /**
   * Create a command element for the UI
   */
  async createCommandElement(command, index, totalCommands) {
    const element = this.document.createElement('div') || {}
    // Ensure compatibility with test mocks that may not fully implement DOM APIs
    if (!element.dataset) {
      element.dataset = {}
    }
    element.className = 'command-item-row'
    element.dataset.index = index
    element.draggable = true

    // Check if this command matches a library definition
    const commandDef = await request(eventBus, 'command:find-definition', { command })
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
    const warningInfo = this.service.getCommandWarning(command)
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
        <button class="btn btn-small-icon btn-edit" title="Edit Command"><i class="fas fa-edit"></i></button>
        <button class="btn btn-small-icon btn-danger btn-delete" title="Delete Command"><i class="fas fa-times"></i></button>
        <button class="btn btn-small-icon btn-up" title="Move Up" ${index === 0 ? 'disabled' : ''}><i class="fas fa-chevron-up"></i></button>
        <button class="btn btn-small-icon btn-down" title="Move Down" ${index === totalCommands - 1 ? 'disabled' : ''}><i class="fas fa-chevron-down"></i></button>
      </div>
    `

    // Attach button handlers that emit events
    const editBtn   = element.querySelector('.btn-edit')
    const deleteBtn = element.querySelector('.btn-delete')
    const upBtn     = element.querySelector('.btn-up')
    const downBtn   = element.querySelector('.btn-down')

    if (editBtn) {
      editBtn.addEventListener('click', () => {
        this.eventBus.emit('commandchain:edit', { index })
      })
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.eventBus.emit('commandchain:delete', { index })
      })
    }

    if (upBtn) {
      upBtn.addEventListener('click', () => {
        this.eventBus.emit('commandchain:move', { fromIndex: index, toIndex: index - 1 })
      })
    }

    if (downBtn) {
      downBtn.addEventListener('click', () => {
        this.eventBus.emit('commandchain:move', { fromIndex: index, toIndex: index + 1 })
      })
    }

    // Double-click edit for customizable commands
    if (isParameterized) {
      element.addEventListener('dblclick', () => {
        this.eventBus.emit('commandchain:edit', { index })
      })
    }

    return element
  }

  /**
   * Setup the command library UI
   */
  async setupCommandLibrary() {
    const container = this.document.getElementById('commandCategories')
    if (!container) return

    container.innerHTML = ''

    const categories = await request(eventBus, 'command:get-categories')
    Object.entries(categories).forEach(([categoryId, category]) => {
      const categoryElement = this.createCategoryElement(categoryId, category)
      container.appendChild(categoryElement)
    })

    // Apply environment filtering after creating elements
    this.filterCommandLibrary()
    
    // Re-add aliases after rebuilding the command library
    // This ensures aliases are preserved when the library is rebuilt (e.g., on language change)
    this.updateCommandLibrary()
  }

  /**
   * Create a category element for the command library
   */
  createCategoryElement(categoryId, category) {
    const element = this.document.createElement('div') || {}
    if (!element.dataset) {
      element.dataset = {}
    }
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
    const header = element.querySelector ? element.querySelector('h4') : null
    if (header && header.addEventListener) {
      header.addEventListener('click', () => {
        this.toggleCommandCategory(categoryId, element)
      })
    }

    // Add click handlers for commands
    if (element.addEventListener) {
      element.addEventListener('click', (e) => {
        if (e.target.classList.contains('command-item')) {
          const commandId = e.target.dataset.command
          const categoryId = e.target.closest('.category').dataset.category
          
          // Get the command definition from STO_DATA
          const commandDef = STO_DATA?.commands?.[categoryId]?.commands?.[commandId]
          if (!commandDef) return
          
          if (commandDef.customizable) {
            // For customizable commands, pass category/command info
            this.eventBus.emit('command:add', { categoryId, commandId, commandDef })
          } else {
            // For static commands, pass the fully-hydrated definition
            const fullyHydratedCommand = {
              command: commandDef.command,
              type: categoryId,
              icon: commandDef.icon,
              text: commandDef.name,
              id: this.service.generateCommandId(),
            }
            this.eventBus.emit('command:add', { commandDef: fullyHydratedCommand })
          }
        }
      })
    }

    return element
  }

  /**
   * Toggle command category collapse state
   */
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

  /**
   * Create an alias category element for the command library
   */
  createAliasCategoryElement(
    aliases,
    categoryType = 'aliases',
    titleKey = 'command_aliases',
    iconClass = 'fas fa-mask'
  ) {
    const element = document.createElement('div')
    element.className = 'category'
    element.dataset.category = categoryType

    const storageKey = `commandCategory_${categoryType}_collapsed`
    const isCollapsed = localStorage.getItem(storageKey) === 'true'

    const isVertigo = categoryType === 'vertigo-aliases'
    const itemIcon = isVertigo ? '👁️' : '🎭'
    const itemClass = isVertigo
      ? 'command-item vertigo-alias-item'
      : 'command-item alias-item'

    element.innerHTML = `
            <h4 class="${isCollapsed ? 'collapsed' : ''}" data-category="${categoryType}">
                <i class="fas fa-chevron-right category-chevron"></i>
                <i class="${iconClass}"></i>
                ${i18next.t(titleKey)}
                <span class="command-count">(${aliases.length})</span>
            </h4>
            <div class="category-commands ${isCollapsed ? 'collapsed' : ''}">
                ${aliases
                  .map(
                    ([name, alias]) => `
                    <div class="${itemClass}" data-alias="${name}" title="${alias.description || alias.commands}">
                        ${itemIcon} ${name}
                    </div>
                `
                  )
                  .join('')}
            </div>
        `

    const header = element.querySelector('h4')
    header.addEventListener('click', () => {
      this.toggleAliasCategory(categoryType, element)
    })

    element.addEventListener('click', (e) => {
      if (
        e.target.classList.contains('alias-item') ||
        e.target.classList.contains('vertigo-alias-item')
      ) {
        const aliasName = e.target.dataset.alias

        const profile = this.service.storage.getProfile(this.service.currentProfile)
        const alias = profile.aliases[aliasName]

        const fullyHydratedAlias = {
          command: aliasName,
          type: 'alias',
          icon: '🎭',
          text: `Alias: ${aliasName}`,
          description: alias.description,
          id: this.service.generateCommandId(),
        }

        this.eventBus.emit('command:add', { commandDef: fullyHydratedAlias })
      }
    })

    return element
  }

  /**
   * Toggle alias category collapse state
   */
  toggleAliasCategory(categoryType, element) {
    const header = element.querySelector('h4')
    const commands = element.querySelector('.category-commands')
    const chevron = header.querySelector('.category-chevron')

    const isCollapsed = commands.classList.contains('collapsed')
    const storageKey = `commandCategory_${categoryType}_collapsed`

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

  /**
   * Update the command library
   */
    updateCommandLibrary() {
      const profile = this.service.storage.getProfile(this.service.currentProfile)
      if (!profile) return
  
      const categories = document.getElementById('commandCategories')
      if (!categories) return
  
      const existingAliasCategory = categories.querySelector('[data-category="aliases"]')
      if (existingAliasCategory) {
        existingAliasCategory.remove()
      }
      const existingVertigoCategory = categories.querySelector('[data-category="vertigo-aliases"]')
      if (existingVertigoCategory) {
        existingVertigoCategory.remove()
      }
  
      const allAliases = Object.entries(profile.aliases || {})
      const regularAliases = allAliases.filter(
        ([name]) => !name.startsWith('dynFxSetFXExlusionList_')
      )
      const vertigoAliases = allAliases.filter(([name]) =>
        name.startsWith('dynFxSetFXExlusionList_')
      )
  
      // Only create regular aliases category if there are regular aliases
      if (regularAliases.length > 0) {
        const aliasCategory = this.createAliasCategoryElement(
          regularAliases,
          'aliases',
          'command_aliases',
          'fas fa-mask'
        )
        categories.appendChild(aliasCategory)
      }
  
      // Only create VERTIGO category if there are VERTIGO aliases
      if (vertigoAliases.length > 0) {
        const vertigoCategory = this.createAliasCategoryElement(
          vertigoAliases,
          'vertigo-aliases',
          'vfx_aliases',
          'fas fa-eye-slash'
        )
        categories.appendChild(vertigoCategory)
      }
    }

  /**
   * Filter command library based on current environment
   */
  filterCommandLibrary() {
    this.service.filterCommandLibrary()
  }  
  /**
   * Setup drag and drop for command reordering
   */
  setupDragAndDrop() {
    if (window.commandChainUI && typeof window.commandChainUI.setupDragAndDrop === 'function') {
      window.commandChainUI.setupDragAndDrop()
      return
    }

    // Fallback (test environment)
    const commandList = this.document.getElementById('commandList')
    if (!commandList || !this.ui || typeof this.ui.initDragAndDrop !== 'function') return

    this.ui.initDragAndDrop(commandList, {
      dragSelector: '.command-item-row',
      dropZoneSelector: '.command-item-row',
      onDrop: (e, dragState, dropZone) => {
        if (!this.service.selectedKey) return

        const fromIndex = parseInt(dragState.dragElement.dataset.index)
        const toIndex = parseInt(dropZone.dataset.index)

        if (fromIndex !== toIndex) {
          this.service.moveCommand(this.service.selectedKey, fromIndex, toIndex)
        }
      },
    })
  }

  /**
   * Update chain action buttons state
   */
  updateChainActions() {
    if (window.commandChainUI && typeof window.commandChainUI.updateChainActions === 'function') {
      window.commandChainUI.updateChainActions()
      return
    }

    // Fallback for test mocks
    const hasSelectedKey = !!this.service.selectedKey

    const doc = this.document

    if (this.service.currentEnvironment === 'alias') {
      ;['deleteAliasChainBtn', 'duplicateAliasChainBtn'].forEach((id) => {
        const btn = doc.getElementById(id)
        if (btn) btn.disabled = !hasSelectedKey
      })
      const ac = doc.getElementById('addCommandBtn')
      if (ac) ac.disabled = !hasSelectedKey
      ;['importFromKeyBtn', 'deleteKeyBtn', 'duplicateKeyBtn'].forEach((id) => {
        const btn = doc.getElementById(id)
        if (btn) btn.disabled = true
      })
    } else {
      ;['addCommandBtn', 'importFromKeyBtn', 'deleteKeyBtn', 'duplicateKeyBtn'].forEach((id) => {
        const btn = doc.getElementById(id)
        if (btn) btn.disabled = !hasSelectedKey
      })
      ;['deleteAliasChainBtn', 'duplicateAliasChainBtn'].forEach((id) => {
        const btn = doc.getElementById(id)
        if (btn) btn.disabled = true
      })
    }
  }

  /**
   * Toggle library visibility
   */
  toggleLibrary() {
    const content = this.document.getElementById('libraryContent')
    const btn = this.document.getElementById('toggleLibraryBtn')

    if (content && btn) {
      const isCollapsed = content.style.display === 'none'
      content.style.display = isCollapsed ? 'block' : 'none'

      const icon = btn.querySelector('i')
      if (icon) {
        icon.className = isCollapsed ? 'fas fa-chevron-up' : 'fas fa-chevron-down'
      }
    }
  }

  /**
   * Show template modal
   */
  showTemplateModal() {
    this.ui.showToast(this.service.i18n.t('template_system_coming_soon'))
  }
}
