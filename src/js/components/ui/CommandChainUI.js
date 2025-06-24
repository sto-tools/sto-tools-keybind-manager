import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'

export default class CommandChainUI extends ComponentBase {
  constructor ({ service, ui = null, document = window.document }) {
    super(eventBus)
    this.service = service
    this.ui = ui || (typeof stoUI !== 'undefined' ? stoUI : null)
    this.document = document
  }

  onInit () {
    if (!this.service) return
    // Listen for service-level change broadcast
    this.service.addEventListener('chain-data-changed', ({ commands }) => {
      this.render(commands)
    })

    // Listen for command events directly from the service
    ;['command-added', 'command-deleted', 'command-moved'].forEach(evt => {
      this.service.addEventListener(evt, () => this.render())
    })

    // Listen for environment changes to re-render
    this.service.addEventListener('environment-changed', () => this.render())

    // React to manual stabilize checkbox toggle
    this.eventBus.onDom('stabilizeExecutionOrder', 'change', () => this.render())

    // Drag and drop setup after DOM ready
    this.setupDragAndDrop()

    // Chain actions buttons state
    this.updateChainActions()

    // Keep in-sync with key/environment changes
    this.service.addEventListener('key-selected', () => this.updateChainActions())
    this.service.addEventListener('environment-changed', () => this.updateChainActions())

    // Initial paint
    this.render()
  }

  render (commandsArg = null) {
    const container   = this.document.getElementById('commandList')
    const titleEl     = this.document.getElementById('chainTitle')
    const previewEl   = this.document.getElementById('commandPreview')
    const countSpanEl = this.document.getElementById('commandCount')
    const emptyState  = this.document.getElementById('emptyState')

    if (!container || !titleEl || !previewEl) return

    const commands = commandsArg || this.service.getCommandsForSelectedKey()

    const emptyStateInfo = this.service.getEmptyStateInfo()

    // Update title / preview / count
    titleEl.textContent   = emptyStateInfo.title
    previewEl.textContent = emptyStateInfo.preview
    if (countSpanEl) countSpanEl.textContent = emptyStateInfo.commandCount

    // No key selected or no commands
    if (!this.service.selectedKey || commands.length === 0) {
      if (emptyState) emptyState.style.display = 'block'
      container.innerHTML = `
        <div class="empty-state" id="emptyState">
          <i class="${emptyStateInfo.icon}"></i>
          <h4>${emptyStateInfo.emptyTitle}</h4>
          <p>${emptyStateInfo.emptyDesc}</p>
        </div>`
      return
    }

    // Render command list
    container.innerHTML = ''
    commands.forEach((cmd, idx) => {
      container.appendChild(this.createCommandElement(cmd, idx, commands.length))
    })
  }

  /**
   * Adapted from legacy CommandLibraryUI implementation.
   */
  createCommandElement (command, index, total) {
    const element = this.document.createElement('div') || {}
    if (!element.dataset) {
      element.dataset = {}
    }
    element.className = 'command-item-row'
    element.dataset.index = index
    element.draggable = true

    // Look up definition for display helpers
    const commandDef      = this.service.findCommandDefinition(command)
    const isParameterized = commandDef && commandDef.customizable

    let displayName = command.text
    let displayIcon = command.icon

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

    const warningInfo  = this.service.getCommandWarning(command)
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
        if (!this.service.selectedKey) return

        const fromIndex = parseInt(dragState.dragElement.dataset.index)
        const toIndex   = parseInt(dropZone.dataset.index)

        if (fromIndex !== toIndex) {
          this.service.moveCommand(this.service.selectedKey, fromIndex, toIndex)
        }
      },
    })
  }

  /**
   * Enable/disable chain-related buttons depending on environment & selection.
   */
  updateChainActions () {
    const hasSelectedKey = !!this.service.selectedKey

    if (this.service.currentEnvironment === 'alias') {
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
} 