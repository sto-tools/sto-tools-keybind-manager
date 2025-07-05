import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'
import { enrichForDisplay, normalizeToString } from '../../lib/commandDisplayAdapter.js'

export default class CommandChainUI extends ComponentBase {
  constructor ({ eventBus: bus = eventBus, ui = null, document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(bus)
    this.componentName = 'CommandChainUI'
    this.ui = ui || (typeof stoUI !== 'undefined' ? stoUI : null)
    this.document = document
    this._selectedKey = null
    this._currentEnvironment = 'space'

  }

  async onInit () {
    // Initialize cached selection state
    this._selectedKey = null
    this._selectedAlias = null
    this._currentEnvironment = 'space'
    
    // Store detach functions for cleanup
    this._detachFunctions = []
    
    // Listen for chain-data updates broadcast by service
    this._detachFunctions.push(
      this.eventBus.on('chain-data-changed', ({ commands }) => {
        console.log('[CommandChainUI] chain-data-changed received with', commands.length, 'commands')
        this.render(commands)
      })
    )

    // Command lifecycle events are handled via chain-data-changed
    // No need to listen to individual command events

    // Listen for environment or key/alias changes for button state and caching
    this._detachFunctions.push(
      this.eventBus.on('environment:changed', (data) => {
        const env = typeof data === 'string' ? data : data?.environment
        if (env) {
          this._currentEnvironment = env
          this.updateChainActions()
          // Defer render slightly so data services have time to process the
          // environment change first. This avoids race-conditions that left
          // the header stuck in key-mode when starting in alias mode.
          this.render()
        }
      })
    )
    this._detachFunctions.push(
      this.eventBus.on('key-selected', (data) => {
        this._selectedKey = data.key || data.name
        this._selectedAlias = null
        this.updateChainActions()
        //setTimeout(() => this.render().catch(() => {}), 0)
      })
    )
    this._detachFunctions.push(
      this.eventBus.on('alias-selected', (data) => {
        this._selectedAlias = data.name
        this._selectedKey = null
        this.updateChainActions()
        //setTimeout(() => this.render().catch(() => {}), 0)
      })
    )

    // Listen for language changes to re-render command items with new translations
    this._detachFunctions.push(
      this.eventBus.on('language:changed', () => {
        this.render()
      })
    )

    // Setup stabilization button logic
    const stabilizeBtn = this.document.getElementById('stabilizeExecutionOrderBtn')
    if (stabilizeBtn && !this._stabilizeListenerAttached) {
      stabilizeBtn.addEventListener('click', async () => {
        await this.toggleStabilize()
      })
      this._stabilizeListenerAttached = true
    }

    // Drag/drop
    this.setupDragAndDrop()

    // Defer the first render until we have at least the initial environment
    // (and potentially a key/alias selection) to avoid showing the generic
    // key-mode empty-state when the application actually starts in alias
    // mode.  Rendering will now occur when one of the listeners below sets
    // the necessary state and explicitly calls `this.render()`.

    this.updateChainActions()
  }

  async render (commandsArg = null) {
      console.log('[CommandChainUI] render() called with:', commandsArg ? `${commandsArg.length} commands` : 'no commands arg')
      
      const container   = this.document.getElementById('commandList')
      const titleEl     = this.document.getElementById('chainTitle')
      const previewEl   = this.document.getElementById('commandPreview')
      const countSpanEl = this.document.getElementById('commandCount')
      const emptyState  = this.document.getElementById('emptyState')

      if (!container || !titleEl || !previewEl) return

      // When render is called with explicit commands (from chain-data-changed),
      // use those. When called without commands (from environment:changed),
      // only render if we have a selected key/alias to avoid race conditions
      // during initialization.
      let commands = commandsArg
      if (!commands) {
        const selectedKeyName = this._currentEnvironment === 'alias' ? this._selectedAlias : this._selectedKey
        if (!selectedKeyName) {
          // No selection yet - just show empty state and return
          const emptyStateInfo = await this.request('command:get-empty-state-info')
          titleEl.textContent   = emptyStateInfo.title
          previewEl.textContent = emptyStateInfo.preview
          if (countSpanEl) countSpanEl.textContent = emptyStateInfo.commandCount

          // Create new container content atomically
          const newContent = this.document.createElement('div')
          newContent.innerHTML = `
            <div class="empty-state show" id="emptyState">
              <i class="${emptyStateInfo.icon}"></i>
              <h4>${emptyStateInfo.emptyTitle}</h4>
              <p>${emptyStateInfo.emptyDesc}</p>
            </div>`
          
          // Atomic replacement
          container.replaceChildren(...newContent.children)
          return
        }
        // We have a selection, so request the commands
        commands = await this.request('command:get-for-selected-key')
      }

      console.log('[CommandChainUI] rendering with commands:', commands.length, commands)

      const emptyStateInfo = await this.request('command:get-empty-state-info')
      console.log('render getEmptyStateInfo', emptyStateInfo)

      // Use cached selection state from event listeners
      const selectedKeyName = this._currentEnvironment === 'alias' ? this._selectedAlias : this._selectedKey

      if (!selectedKeyName || commands.length === 0) {
        // Empty state - use empty state info for title and preview
        titleEl.textContent   = emptyStateInfo.title
        previewEl.textContent = emptyStateInfo.preview
        if (countSpanEl) countSpanEl.textContent = emptyStateInfo.commandCount

        // Create new container content atomically
        const newContent = this.document.createElement('div')
        newContent.innerHTML = `
          <div class="empty-state ${!selectedKeyName ? 'show' : ''}" id="emptyState">
            <i class="${emptyStateInfo.icon}"></i>
            <h4>${emptyStateInfo.emptyTitle}</h4>
            <p>${emptyStateInfo.emptyDesc}</p>
          </div>`
        
        // Atomic replacement
        container.replaceChildren(...newContent.children)
        return
      }

      // Non-empty state - use emptyStateInfo which actually contains the correct title/preview for selected keys
      titleEl.textContent   = emptyStateInfo.title
      previewEl.textContent = emptyStateInfo.preview
      if (countSpanEl) countSpanEl.textContent = commands.length.toString()

      // Hide any existing empty state
      if (emptyState) emptyState.classList.remove('show')

      // Build the complete new command list structure atomically
      console.log('[CommandChainUI] building new command list with', commands.length, 'commands')
      const newCommandElements = []
      for (let i = 0; i < commands.length; i++) {
        const el = await this.createCommandElement(commands[i], i, commands.length)
        console.log('[CommandChainUI] created element for command', i, commands[i])
        newCommandElements.push(el)
      }

      // Atomic replacement - this is the only DOM mutation that affects the command list
      container.replaceChildren(...newCommandElements)
      console.log('[CommandChainUI] finished atomic render, container children:', container.children.length)
  }

  /**
   * Adapted from legacy CommandLibraryUI implementation.
   */
  async createCommandElement (command, index, total) {
    const element = this.document.createElement('div') || {}
    if (!element.dataset) {
      element.dataset = {}
    }
    element.className = 'command-item-row'
    element.dataset.index = index
    element.draggable = true

    // Convert canonical string command to rich object for display
    const commandString = typeof command === 'string' ? command : normalizeToString(command)
    console.log('[CommandChainUI] createCommandElement enriching:', commandString)
    
    // Get i18n object for translations
    const i18n = typeof i18next !== 'undefined' ? i18next : null
    
    // Enrich command for display
    const richCommand = await enrichForDisplay(commandString, i18n, { eventBus: this.eventBus })
    console.log('[CommandChainUI] enriched command:', richCommand)

    // Look up definition for display helpers
    const commandDef = await this.request('command:find-definition', { command: commandString })
    const isParameterized = commandDef && commandDef.customizable

    // Helper function to format display text from i18n objects
    const formatDisplayText = (displayText) => {
      if (typeof displayText === 'string') {
        return displayText
      }
      if (typeof displayText === 'object' && displayText) {
        // Handle i18n structure with key/params/fallback
        if (displayText.key && displayText.fallback) {
          // Try to get i18n translation if available
          if (typeof i18next !== 'undefined' && i18next.t) {
            const translated = i18next.t(displayText.key, displayText.params || {})
            if (translated && translated !== displayText.key) {
              return translated
            }
          }
          // Fall back to the fallback text
          return displayText.fallback
        }
        // Handle simple fallback structure
        if (displayText.fallback) {
          return displayText.fallback
        }
        // Handle direct object with text properties
        if (displayText.text) {
          return displayText.text
        }
        // Handle object that might be a direct string value
        const baseName = displayText.name || displayText.displayText
        if (baseName) {
          return baseName
        }
      }
      return commandString // Fallback to command string
    }

    let displayName = formatDisplayText(richCommand.displayText) || richCommand.text || commandString
    let displayIcon = richCommand.icon

    if (isParameterized) {
      element.dataset.parameters = 'true'
      element.classList.add('customizable')

      element.addEventListener('dblclick', (e) => {
        console.log('[CommandChainUI] DOUBLE-CLICK on command element:', {
          index,
          target: e.target,
          targetClass: e.target.className
        })
        this.emit('commandchain:edit', { index })
      })
    }

    // Pass the command string (not object) to get-warning
    const warningInfo  = await this.request('command:get-warning', { command: commandString })
    const warningIcon  = warningInfo ? `<span class="command-warning-icon" title="${warningInfo}"><i class="fas fa-exclamation-triangle"></i></span>` : ''
    const parameterInd = isParameterized ? ' <span class="param-indicator" title="Editable parameters">⚙️</span>' : ''

    console.log('[CommandChainUI] command', command)
    console.log('[CommandChainUI] commandDef', commandDef)
    // Determine the actual command type from the definition, not from the parsed command
    let commandType = richCommand.type || richCommand.category
    // Preserve VFX alias type, don't override it with command definition categoryId
    // Also preserve other specific alias types like 'alias' or 'vfx-alias'
    if (commandDef && commandDef.categoryId && 
        !['vfx-alias', 'alias'].includes(richCommand.type) && 
        !['vfx-alias', 'alias'].includes(richCommand.category)) {
      commandType = commandDef.categoryId
    }

    element.innerHTML = `
      <div class="command-number">${index + 1}</div>
      <div class="command-content">
        <span class="command-icon">${displayIcon}</span>
        <span class="command-text">${displayName}${parameterInd}</span>
        ${warningIcon}
      </div>
      <span class="command-type ${commandType}">${commandType}</span>
      <div class="command-actions">
        <button class="btn btn-small-icon btn-edit" title="Edit Command"><i class="fas fa-edit"></i></button>
        <button class="btn btn-small-icon btn-danger btn-delete" title="Delete Command"><i class="fas fa-times"></i></button>
        <button class="btn btn-small-icon btn-up" title="Move Up" ${index === 0 ? 'disabled' : ''}><i class="fas fa-chevron-up"></i></button>
        <button class="btn btn-small-icon btn-down" title="Move Down" ${index === total - 1 ? 'disabled' : ''}><i class="fas fa-chevron-down"></i></button>
      </div>`

    // Wire up action buttons via event bus
    const editBtn   = element.querySelector('.btn-edit')
    const deleteBtn = element.querySelector('.btn-delete')
    const upBtn     = element.querySelector('.btn-up')
    const downBtn   = element.querySelector('.btn-down')

    // Add unique IDs for debugging
    if (editBtn) {
      editBtn.id = `edit-btn-${index}`
      editBtn.addEventListener('click', (e) => {
        console.log('[CommandChainUI] EDIT BUTTON CLICKED:', {
          index,
          buttonId: e.target.id,
          buttonClass: e.target.className,
          buttonElement: e.target
        })
        e.preventDefault()
        e.stopPropagation()
        this.emit('commandchain:edit', { index })
      })
    }

    if (deleteBtn) {
      deleteBtn.id = `delete-btn-${index}`
      deleteBtn.addEventListener('click', (e) => {
        console.log('[CommandChainUI] DELETE BUTTON CLICKED:', {
          index,
          buttonId: e.target.id,
          buttonClass: e.target.className,
          buttonElement: e.target
        })
        e.preventDefault()
        e.stopPropagation()
        this.emit('commandchain:delete', { index })
      })
    }

    if (upBtn) {
      upBtn.addEventListener('click', () => {
        this.emit('commandchain:move', { fromIndex: index, toIndex: index - 1 })
      })
    }

    if (downBtn) {
      downBtn.addEventListener('click', () => {
        this.emit('commandchain:move', { fromIndex: index, toIndex: index + 1 })
      })
    }

    return element
  }

  /**
   * Setup drag-and-drop for command list re-ordering.
   */
  setupDragAndDrop () {
    if (!this.ui || typeof this.ui.initDragAndDrop !== 'function') return
    const commandList = this.document.getElementById('commandList')
    if (!commandList) return

    this.ui.initDragAndDrop(commandList, {
      dragSelector: '.command-item-row',
      dropZoneSelector: '.command-item-row',
      onDrop: (e, dragState, dropZone) => {
        if (!this._selectedKey) return

        const fromIndex = parseInt(dragState.dragElement.dataset.index)
        const toIndex   = parseInt(dropZone.dataset.index)

        if (fromIndex !== toIndex) {
          // Delegate actual move logic via event so CommandChainService can
          // route it to the appropriate persistence layer (CommandService or
          // CommandLibraryService).  This matches the approach used by the
          // move buttons elsewhere in the UI.
          this.emit('commandchain:move', {
            fromIndex,
            toIndex,
          })
        }
      },
    })
  }

  /**
   * Enable/disable chain-related buttons depending on environment & selection.
   */
  async updateChainActions () {
    // Use cached state from event listeners
    const hasSelectedKey = !!(this._currentEnvironment === 'alias' ? this._selectedAlias : this._selectedKey)

    // Always enable stabilize button only when a chain is selected
    const stabBtn = this.document.getElementById('stabilizeExecutionOrderBtn')
    if (stabBtn) {
      stabBtn.disabled = !hasSelectedKey
      // Update active state from metadata
      if (hasSelectedKey) {
        const name = this._currentEnvironment === 'alias' ? this._selectedAlias : this._selectedKey
        try {
          const isActive = await this.request('command:is-stabilized', { name })
          stabBtn.classList.toggle('active', !!isActive)
        } catch {}
      } else {
        stabBtn.classList.remove('active')
      }
    }

    if (this._currentEnvironment === 'alias') {
      // Alias mode – alias specific buttons
      const aliasButtons = ['deleteAliasChainBtn', 'duplicateAliasChainBtn']
      aliasButtons.forEach((id) => {
        const btn = this.document.getElementById(id)
        if (btn) btn.disabled = !hasSelectedKey
      })

      const addCommandBtn = this.document.getElementById('addCommandBtn')
      if (addCommandBtn) addCommandBtn.disabled = !hasSelectedKey

      const importBtn = this.document.getElementById('importFromKeyOrAliasBtn')
      if (importBtn) importBtn.disabled = !hasSelectedKey

      const keyButtons = ['deleteKeyBtn', 'duplicateKeyBtn']
      keyButtons.forEach((id) => {
        const btn = this.document.getElementById(id)
        if (btn) btn.disabled = true
      })
    } else {
      const keyButtons = ['addCommandBtn', 'importFromKeyOrAliasBtn', 'deleteKeyBtn', 'duplicateKeyBtn']
      keyButtons.forEach((id) => {
        const btn = this.document.getElementById(id)
        if (btn) btn.disabled = !hasSelectedKey
      })

      const aliasButtons = ['deleteAliasChainBtn', 'duplicateAliasChainBtn']
      aliasButtons.forEach((id) => {
        const btn = this.document.getElementById(id)
        if (btn) btn.disabled = true
      })
    }
  }

  /** Toggle stabilization flag for the current selection */
  async toggleStabilize () {
    const name = this._currentEnvironment === 'alias' ? this._selectedAlias : this._selectedKey
    if (!name) return

    const stabBtn = this.document.getElementById('stabilizeExecutionOrderBtn')
    const currentlyActive = stabBtn?.classList.contains('active')

    try {
      const result = await this.request('command:set-stabilize', { name, stabilize: !currentlyActive })
      if (result && result.success && stabBtn) {
        stabBtn.classList.toggle('active', !currentlyActive)
        // Re-render preview after change
        this.render()
      }
    } catch (err) {
      console.error('[CommandChainUI] Failed to toggle stabilization', err)
    }
  }

  /**
   * Clean up event listeners when component is destroyed
   */
  destroy() {
    // Clean up event listeners to prevent memory leaks and duplicate handlers
    if (this._detachFunctions) {
      this._detachFunctions.forEach(detach => {
        if (typeof detach === 'function') {
          try {
            detach()
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      })
      this._detachFunctions = []
    }
  }

  /* ------------------------------------------------------------
   * Late-join: sync environment if InterfaceModeService broadcasts its
   * snapshot before we registered our listeners.
   * ---------------------------------------------------------- */
  handleInitialState (sender, state) {
    if (!state) return
    if (state.environment || state.currentEnvironment) {
      const env = state.environment || state.currentEnvironment
      this._currentEnvironment = env
      this.updateChainActions()
    }
  }
} 