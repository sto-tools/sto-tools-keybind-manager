import eventBus from '../../core/eventBus.js'
import ParameterCommandService from '../services/ParameterCommandService.js'
import { request } from '../../core/requestResponse.js'

// ---------------------------------------------------------------------------
// Singleton service instance – shared by the entire application layer
// ---------------------------------------------------------------------------
const svc = new ParameterCommandService({ eventBus })
// Initialize the service to start listening for events
svc.init()

/**
 * parameterCommands – refactored UI facade that owns the parameter editing
 * modal while delegating heavy business logic to `ParameterCommandService`.
 *
 * NOTE:
 *  • Only the UI-facing subset required by the rest of the codebase is
 *    implemented here (modal handling + editing helpers).
 *  • All call-sites that previously accessed `parameterCommands` continue to
 *    work unchanged because `src/js/features/parameterCommands.js` now
 *    re-exports this object.
 */
export const parameterCommands = {
  /* ============================================================
   * Public state – kept for backwards-compatibility so that tests
   * and other modules can still attach to these properties.
   * ========================================================== */
  currentParameterCommand: null,
  selectedKey:            null,
  commandLibraryService:  null,
  commandService:         null,

  /* Expose the underlying business service so consumers can hook in if they
   * need deeper access. */
  service: svc,

  /* ------------------------------------------------------------
   * UI – Modal lifecycle
   * ---------------------------------------------------------- */
  showParameterModal (categoryId, commandId, commandDef) {
    this.currentParameterCommand = { categoryId, commandId, commandDef }

    // Create modal lazily
    if (!document.getElementById('parameterModal')) {
      this.createParameterModal()
    }

    // Persist command definition on the modal so it can be rebuilt on i18n
    const modal = document.getElementById('parameterModal')
    if (modal) {
      modal.setAttribute('data-command-def', JSON.stringify(commandDef))
    }

    this.populateParameterModal(commandDef)

    // Use global modal manager (created in main.js)
    globalThis.modalManager?.show('parameterModal')
  },

  createParameterModal () {
    const modal           = document.createElement('div')
    modal.className       = 'modal'
    modal.id              = 'parameterModal'
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="parameterModalTitle">Configure Command Parameters</h3>
          <button class="modal-close" data-modal="parameterModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <div id="parameterInputs"></div>
          <div class="command-preview-modal">
            <label>Generated Command:</label>
            <div class="command-preview" id="parameterCommandPreview"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="saveParameterCommandBtn">Add Command</button>
          <button class="btn btn-secondary" data-modal="parameterModal">Cancel</button>
        </div>
      </div>`

    document.body.appendChild(modal)

    // Save / Cancel handlers
    eventBus.onDom('saveParameterCommandBtn', 'click', 'parameter-command-save', () => {
      this.saveParameterCommand()
    })

    modal.querySelectorAll('.modal-close, [data-modal="parameterModal"]').forEach(btn => {
      btn.addEventListener('click', () => this.cancelParameterCommand())
    })
  },

  cancelParameterCommand () {
    this.currentParameterCommand = null

    // Reset button text (i18n ready)
    const saveBtn = document.getElementById('saveParameterCommandBtn')
    if (saveBtn) {
      saveBtn.textContent = globalThis.i18next?.t?.('add_command') || 'Add Command'
    }

    globalThis.modalManager?.hide('parameterModal')
  },

  /* ------------------------------------------------------------
   * Modal content helpers
   * ---------------------------------------------------------- */
  populateParameterModal (commandDef) {
    const container    = document.getElementById('parameterInputs')
    const titleElement = document.getElementById('parameterModalTitle')

    if (!container || !titleElement) return

    titleElement.textContent = `Configure: ${commandDef.name}`
    container.innerHTML      = ''

    Object.entries(commandDef.parameters).forEach(([paramName, paramDef]) => {
      const inputGroup = document.createElement('div')
      inputGroup.className = 'form-group'

      const label = document.createElement('label')
      label.textContent = this.formatParameterName(paramName)
      label.setAttribute('for', `param_${paramName}`)

      let inputEl
      if (paramDef.type === 'select') {
        inputEl      = document.createElement('select')
        inputEl.id   = `param_${paramName}`
        inputEl.name = paramName
        paramDef.options.forEach(opt => {
          const o = document.createElement('option')
          o.value       = opt
          o.textContent = opt === 'STOTrayExecByTray'
            ? 'STOTrayExecByTray (shows key binding on UI)'
            : 'TrayExecByTray (no UI indication)'
          if (opt === paramDef.default) o.selected = true
          inputEl.appendChild(o)
        })
      } else {
        inputEl      = document.createElement('input')
        inputEl.type = paramDef.type === 'number' ? 'number' : 'text'
        inputEl.id   = `param_${paramName}`
        inputEl.name = paramName
        inputEl.value = paramDef.default || ''
        if (paramDef.placeholder) inputEl.placeholder = paramDef.placeholder
        if (paramDef.type === 'number') {
          if (paramDef.min !== undefined)  inputEl.min  = paramDef.min
          if (paramDef.max !== undefined)  inputEl.max  = paramDef.max
          if (paramDef.step !== undefined) inputEl.step = paramDef.step
        }
      }

      const help = document.createElement('small')
      help.textContent = this.getParameterHelp(paramName, paramDef)

      inputGroup.appendChild(label)
      inputGroup.appendChild(inputEl)
      inputGroup.appendChild(help)
      container.appendChild(inputGroup)

      // Live preview updates
      inputEl.addEventListener('input', () => this.updateParameterPreview())
      if (inputEl.tagName === 'SELECT') {
        inputEl.addEventListener('change', () => this.updateParameterPreview())
      }
    })

    // Initial preview
    this.updateParameterPreview()
  },

  /* ----- Small pure helpers ------------------------------------------- */
  formatParameterName (n) {
    return n.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  },

  getParameterHelp (paramName, paramDef) {
    const helps = {
      entityName: 'Name of the entity to target (e.g., ship name, player name)',
      active:     'Whether the command is active (1 = active, 0 = inactive)',
      tray:       'Primary tray number (0-9, where 0 is the first tray)',
      slot:       'Primary slot number (0-9, where 0 is the first slot)',
      backup_tray:'Backup tray number (0-9, where 0 is the first tray)',
      backup_slot:'Backup slot number (0-9, where 0 is the first slot)',
      amount:     'Throttle adjustment amount (-1 to 1)',
      position:   'Throttle position (-1 = full reverse, 0 = stop, 1 = full forward)',
      distance:   'Camera distance from target',
      filename:   'Name of the keybind file (without extension)',
      message:    'Text message to send',
      state:      'Enable (1) or disable (0) combat log',
      command_type: 'STOTrayExecByTray shows key binding on UI, TrayExecByTray does not',
    }
    return helps[paramName] || `${paramDef.type} value ${paramDef.min !== undefined ? `(${paramDef.min} to ${paramDef.max})` : ''}`
  },

  /* ------------------------------------------------------------
   * Live preview / param collection
   * ---------------------------------------------------------- */
  updateParameterPreview () {
    if (!this.currentParameterCommand) return

    const { categoryId, commandId, commandDef } = this.currentParameterCommand
    const params = this.getParameterValues()

    const cmd = this.service.buildParameterizedCommand(categoryId, commandId, commandDef, params)
    const previewEl = document.getElementById('parameterCommandPreview')
    if (!previewEl || !cmd) return

    if (Array.isArray(cmd)) {
      previewEl.textContent = cmd.map(c => c.command).join(' $$ ')
    } else {
      previewEl.textContent = cmd.command
    }
  },

  getParameterValues () {
    const out = {}
    document.querySelectorAll('#parameterInputs input, #parameterInputs select').forEach(input => {
      const name = input.name
      let val    = input.value
      if (input.type === 'number') val = parseFloat(val) || 0
      out[name] = val
    })
    return out
  },

  /* ------------------------------------------------------------
   * Saving / Editing
   * ---------------------------------------------------------- */
  async saveParameterCommand (...args) {
    // Use the service's cached state instead of function references
    const currentEnv = this.service.currentEnvironment || 'space'
    const selectedKey = currentEnv === 'alias' ? this.service.selectedAlias : this.service.selectedKey
    if (!selectedKey || !this.currentParameterCommand) {
      const message = currentEnv === 'alias' 
        ? (globalThis.i18next?.t?.('please_select_an_alias_first') || 'Please select an alias first')
        : (globalThis.i18next?.t?.('please_select_a_key_first') || 'Please select a key first')
      globalThis.stoUI?.showToast?.(message, 'warning')
      return
    }

    const { categoryId, commandId, commandDef, editIndex, isEditing } = this.currentParameterCommand
    const params  = this.getParameterValues()
    const command = this.service.buildParameterizedCommand(categoryId, commandId, commandDef, params)
    if (!command) {
      globalThis.stoUI?.showToast?.('Failed to build command - please check parameters', 'error')
      return
    }

    // Use request/response to call CommandService.addCommand - with proper validation
    const addCmd = async (c) => {
      if (!c || !c.command) {
        console.warn('[ParameterCommandUI] Skipping invalid command:', c)
        return
      }
      try {
        await request(eventBus, 'command:add', { command: c, key: selectedKey })
      } catch (error) {
        console.error('[ParameterCommandUI] Failed to add command:', error)
        globalThis.stoUI?.showToast?.('Failed to add command', 'error')
      }
    }
    
    if (Array.isArray(command)) {
      for (const c of command) await addCmd(c)
    } else {
      await addCmd(command)
    }

    globalThis.modalManager?.hide('parameterModal')
    this.currentParameterCommand = null
  },

  /* Editing existing commands (used by CommandChainService) */
  editParameterizedCommand (index, command, commandDef) {
    this.currentParameterCommand = {
      categoryId: command.type,
      commandId:  commandDef.commandId,
      commandDef,
      editIndex:  index,
      isEditing:  true,
    }

    if (!document.getElementById('parameterModal')) {
      this.createParameterModal()
    }

    this.populateParameterModalForEdit(commandDef, command.parameters)

    document.getElementById('parameterModalTitle').textContent = `Edit: ${commandDef.name}`
    document.getElementById('saveParameterCommandBtn').textContent = 'Update Command'

    globalThis.modalManager?.show('parameterModal')
  },

  populateParameterModalForEdit (commandDef, existingParams = {}) {
    const container = document.getElementById('parameterInputs')
    if (!container) return

    container.innerHTML = ''
    Object.entries(commandDef.parameters).forEach(([paramName, paramDef]) => {
      const inputGroup = document.createElement('div')
      inputGroup.className = 'form-group'

      const label = document.createElement('label')
      label.textContent = this.formatParameterName(paramName)
      label.setAttribute('for', `param_${paramName}`)

      let inputEl
      if (paramDef.type === 'select') {
        inputEl      = document.createElement('select')
        inputEl.id   = `param_${paramName}`
        inputEl.name = paramName
        paramDef.options.forEach(opt => {
          const o = document.createElement('option')
          o.value       = opt
          o.textContent = opt === 'STOTrayExecByTray'
            ? 'STOTrayExecByTray (shows key binding on UI)'
            : 'TrayExecByTray (no UI indication)'
          inputEl.appendChild(o)
        })
        inputEl.value = existingParams[paramName] ?? paramDef.default
      } else {
        inputEl      = document.createElement('input')
        inputEl.type = paramDef.type === 'number' ? 'number' : 'text'
        inputEl.id   = `param_${paramName}`
        inputEl.name = paramName
        inputEl.value = existingParams[paramName] ?? ''
        if (paramDef.placeholder) inputEl.placeholder = paramDef.placeholder
        if (paramDef.type === 'number') {
          if (paramDef.min !== undefined)  inputEl.min  = paramDef.min
          if (paramDef.max !== undefined)  inputEl.max  = paramDef.max
          if (paramDef.step !== undefined) inputEl.step = paramDef.step
        }
      }

      const help = document.createElement('small')
      help.textContent = this.getParameterHelp(paramName, paramDef)

      inputGroup.appendChild(label)
      inputGroup.appendChild(inputEl)
      inputGroup.appendChild(help)
      container.appendChild(inputGroup)

      inputEl.addEventListener('input', () => this.updateParameterPreview())
      if (inputEl.tagName === 'SELECT') {
        inputEl.addEventListener('change', () => this.updateParameterPreview())
      }
    })

    this.updateParameterPreview()
  },

  /* ------------------------------------------------------------ */
  // Added for backward-compatibility – provides the minimal behaviour needed
  // by editCommandImmutable.test (derive parameters without mutating original).
  editCommand (index) {
    const key = this.selectedKey || this.commandLibraryService?.selectedKey
    if (!key || typeof this.getCurrentProfile !== 'function') return

    const profile  = this.getCurrentProfile()
    const commands = profile?.keys?.[key]
    if (!commands || !commands[index]) return

    const sourceCmd = commands[index]
    // Work on a shallow copy only!
    const cmdCopy = sourceCmd.parameters
      ? { ...sourceCmd, parameters: { ...sourceCmd.parameters } }
      : { ...sourceCmd }

    // If parameters missing but command is TrayExec… derive them for UI use.
    if (!cmdCopy.parameters && /TrayExecByTray/.test(cmdCopy.command)) {
      const match = cmdCopy.command.match(/(?:\+)?(?:STO)?TrayExecByTray\s+(\d+)\s+(\d+)/i)
      if (match) {
        cmdCopy.parameters = { tray: parseInt(match[1]), slot: parseInt(match[2]) }
      }
    }

    // Delegate to parameterised edit flow if possible
    const def = this.findCommandDefinition?.(cmdCopy)
    if (def && def.customizable) {
      this.editParameterizedCommand(index, cmdCopy, def)
    }
  },

  /* ------------------------------------------------------------
   * Thin wrappers delegating to the service – keeps external API
   * intact for legacy code/tests.
   * ---------------------------------------------------------- */
  generateCommandId (...args) {
    return this.service.generateCommandId(...args)
  },
  buildParameterizedCommand (...args) {
    return this.service.buildParameterizedCommand(...args)
  },
  findCommandDefinition (...args) {
    return this.service.findCommandDefinition(...args)
  },
}

export default parameterCommands 