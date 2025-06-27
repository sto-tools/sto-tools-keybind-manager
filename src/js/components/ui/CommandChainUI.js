import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'

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
      this.eventBus.on('chain-data-changed', ({ commands }) => this.render(commands))
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

    this.eventBus.onDom('stabilizeExecutionOrder', 'change', () => this.render())

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
      const container   = this.document.getElementById('commandList')
      const titleEl     = this.document.getElementById('chainTitle')
      const previewEl   = this.document.getElementById('commandPreview')
      const countSpanEl = this.document.getElementById('commandCount')
      const emptyState  = this.document.getElementById('emptyState')

      if (!container || !titleEl || !previewEl) return

      const commands = commandsArg || await request(this.eventBus, 'command:get-for-selected-key')

      const emptyStateInfo = await request(this.eventBus, 'command:get-empty-state-info')
      console.log('render getEmptyStateInfo', emptyStateInfo)

      // Use cached selection state from event listeners
      const selectedKeyName = this._currentEnvironment === 'alias' ? this._selectedAlias : this._selectedKey

      if (!selectedKeyName || commands.length === 0) {
        // Empty state - use empty state info for title and preview
        titleEl.textContent   = emptyStateInfo.title
        previewEl.textContent = emptyStateInfo.preview
        if (countSpanEl) countSpanEl.textContent = emptyStateInfo.commandCount

        // Only show empty state if there's actually no selection (not during auto-selection)
        container.innerHTML = `
          <div class="empty-state ${!selectedKeyName ? 'show' : ''}" id="emptyState">
            <i class="${emptyStateInfo.icon}"></i>
            <h4>${emptyStateInfo.emptyTitle}</h4>
            <p>${emptyStateInfo.emptyDesc}</p>
          </div>`
        return
      }

      // Non-empty state - use emptyStateInfo which actually contains the correct title/preview for selected keys
      titleEl.textContent   = emptyStateInfo.title
      previewEl.textContent = emptyStateInfo.preview
      if (countSpanEl) countSpanEl.textContent = emptyStateInfo.commandCount

      // Hide any existing empty state
      if (emptyState) emptyState.classList.remove('show')

      // Render command list
      container.innerHTML = ''
      for (let i=0;i<commands.length;i++) {
        const el = await this.createCommandElement(commands[i], i, commands.length)
        container.appendChild(el)
      }
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

    // Look up definition for display helpers
    const commandDef      = await request(this.eventBus, 'command:find-definition', { command })
    const isParameterized = commandDef && commandDef.customizable

    let displayName = command.text || command.command || command
    let displayIcon = command.icon

    // Ensure displayName is always a string
    if (typeof displayName === 'object') {
      displayName = displayName.command || displayName.text || '[Unknown Command]'
    }

    if (commandDef) {
      displayName = commandDef.name
      displayIcon = commandDef.icon

      // Parameter pretty-printing (copied from legacy)
      if (isParameterized && command.parameters) {
        const p = command.parameters
        if (commandDef.commandId === 'tray_with_backup') {
          displayName = `${commandDef.name} (${p.active} ${p.tray} ${p.slot} ${p.backup_tray} ${p.backup_slot})`
        } else if (commandDef.commandId === 'custom_tray') {
          displayName = `${commandDef.name} (${p.tray} ${p.slot})`
        } else if (commandDef.commandId === 'target') {
          displayName = `${commandDef.name}: ${p.entityName}`
        }
      } else if (isParameterized && !command.parameters && commandDef.commandId === 'custom_tray') {
        // Dynamically parse tray/slot from command string when parameters are absent
        const m = command.command.match(/(?:\+)?(?:STO)?TrayExecByTray\s+(\d+)\s+(\d+)/i)
        if (m) {
          displayName = `${commandDef.name} (${parseInt(m[1])} ${parseInt(m[2])})`
        }
      }
    }

    if (isParameterized) {
      element.dataset.parameters = 'true'
      element.classList.add('customizable')

      element.addEventListener('dblclick', () => {
        this.eventBus.emit('commandchain:edit', { index })
      })
    }

    const warningInfo  = await request(this.eventBus, 'command:get-warning', { command })
    const warningIcon  = warningInfo ? `<span class="command-warning-icon" title="${warningInfo}"><i class="fas fa-exclamation-triangle"></i></span>` : ''
    const parameterInd = isParameterized ? ' <span class="param-indicator" title="Editable parameters">⚙️</span>' : ''

    element.innerHTML = `
      <div class="command-number">${index + 1}</div>
      <div class="command-content">
        <span class="command-icon">${displayIcon}</span>
        <span class="command-text">${displayName}${parameterInd}</span>
        ${warningIcon}
      </div>
      <span class="command-type ${command.type}">${command.type}</span>
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
          this.eventBus.emit('commandchain:move', {
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

    if (this._currentEnvironment === 'alias') {
      // Alias mode – alias specific buttons
      const aliasButtons = ['deleteAliasChainBtn', 'duplicateAliasChainBtn']
      aliasButtons.forEach((id) => {
        const btn = this.document.getElementById(id)
        if (btn) btn.disabled = !hasSelectedKey
      })

      const addCommandBtn = this.document.getElementById('addCommandBtn')
      if (addCommandBtn) addCommandBtn.disabled = !hasSelectedKey

      const keyButtons = ['importFromKeyBtn', 'deleteKeyBtn', 'duplicateKeyBtn']
      keyButtons.forEach((id) => {
        const btn = this.document.getElementById(id)
        if (btn) btn.disabled = true
      })
    } else {
      const keyButtons = ['addCommandBtn', 'importFromKeyBtn', 'deleteKeyBtn', 'duplicateKeyBtn']
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