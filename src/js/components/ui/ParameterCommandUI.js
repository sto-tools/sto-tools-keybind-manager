import eventBus from '../../core/eventBus.js'
import ParameterCommandService from '../services/ParameterCommandService.js'
import ComponentBase from '../ComponentBase.js'
import { request } from '../../core/requestResponse.js'

// ---------------------------------------------------------------------------
// Singleton service instance – shared by the entire application layer
// ---------------------------------------------------------------------------
const svc = new ParameterCommandService({ eventBus })
// Initialize the service to start listening for events
svc.init()



/**
 * ParameterCommandUI – refactored UI component that owns the parameter editing
 * modal while delegating heavy business logic to `ParameterCommandService`.
 *
 * Now follows the project's broadcast/cache pattern:
 * • Extends ComponentBase for proper architecture
 * • Caches state locally from broadcast events
 * • Uses late-join state sync for components that initialize after state is set
 * • Emits events for actions instead of using request/response
 */
export default class ParameterCommandUI extends ComponentBase {
  constructor({
    modalManager = null,
    i18n = null,
    ui = null,
    document = null
  } = {}) {
    super(eventBus)
    this.componentName = 'ParameterCommandUI'
    
    this.modalManager = modalManager
    this.i18n = i18n
    this.ui = ui
    this.document = document || (typeof window !== 'undefined' ? window.document : null)
    
    // State cache
    this._selectedKey = null
    this._selectedAlias = null
    this._currentEnvironment = 'space'
    
    // REFACTORED: Remove direct service references
    // All service interactions now use request/response pattern
    this.currentParameterCommand = null
  }

  onInit() {
    this.setupEventListeners()
  }

  // Legacy properties for backward compatibility
  get selectedKey() { return this._selectedKey }
  set selectedKey(val) { this._selectedKey = val }
  
  get selectedAlias() { return this._selectedAlias }
  set selectedAlias(val) { this._selectedAlias = val }
  
  get currentEnvironment() { return this._currentEnvironment }
  set currentEnvironment(val) { this._currentEnvironment = val }

  setupEventListeners() {
    // Cache state from broadcast events
    this.addEventListener('key-selected', (data) => {
      this._selectedKey = data.key || data.name
      this._selectedAlias = null
      // Update legacy selectedKey for backward compatibility
      this.selectedKey = this._selectedKey
    })

    this.addEventListener('alias-selected', (data) => {
      this._selectedAlias = data.name
      this._selectedKey = null
      // Update legacy selectedKey for backward compatibility  
      this.selectedKey = this._selectedAlias
    })

    this.addEventListener('environment:changed', (data) => {
      const env = typeof data === 'string' ? data : data?.environment
      if (env) {
        this._currentEnvironment = env
      }
    })

    // Handle parameter command editing requests
    this.addEventListener('parameter-command:edit', ({ index, command, commandDef, categoryId, commandId }) => {
      if (commandDef && categoryId && commandId) {
        this.editParameterizedCommand(index, command, commandDef)
      }
    })
  }

  /* ------------------------------------------------------------
   * Late-join state sync
   * ---------------------------------------------------------- */
  getCurrentState() {
    return {
      selectedKey: this._selectedKey,
      selectedAlias: this._selectedAlias,
      currentEnvironment: this._currentEnvironment
    }
  }

  handleInitialState(sender, state) {
    if (!state) return
    
    if (state.selectedKey !== undefined) {
      this._selectedKey = state.selectedKey
      this.selectedKey = state.selectedKey
    }
    if (state.selectedAlias !== undefined) {
      this._selectedAlias = state.selectedAlias
      this.selectedKey = state.selectedAlias
    }
    if (state.currentEnvironment !== undefined) {
      this._currentEnvironment = state.currentEnvironment
    }
  }

  /* ------------------------------------------------------------
   * UI – Modal lifecycle
   * ---------------------------------------------------------- */
  showParameterModal (categoryId, commandId, commandDef) {
    this.currentParameterCommand = { categoryId, commandId, commandDef }

    // Create modal lazily
    if (!this.document.getElementById('parameterModal')) {
      this.createParameterModal()
    }

    // Persist command definition on the modal so it can be rebuilt on i18n
    const modal = this.document.getElementById('parameterModal')
    if (modal) {
      modal.setAttribute('data-command-def', JSON.stringify(commandDef))
    }

    this.populateParameterModal(commandDef)

    // Use injected modal manager
    this.modalManager?.show('parameterModal')
  }

  createParameterModal () {
    const modal           = this.document.createElement('div')
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

    this.document.body.appendChild(modal)

    // Save / Cancel handlers
    this.eventBus.onDom('saveParameterCommandBtn', 'click', 'parameter-command-save', () => {
      this.saveParameterCommand()
    })

    modal.querySelectorAll('.modal-close, [data-modal="parameterModal"]').forEach(btn => {
      btn.addEventListener('click', () => this.cancelParameterCommand())
    })
  }

  cancelParameterCommand () {
    // Emit event to notify services that editing has ended
    this.emit('parameter-edit:end')
    
    this.currentParameterCommand = null

    // Reset button text (i18n ready)
    const saveBtn = this.document.getElementById('saveParameterCommandBtn')
    if (saveBtn) {
      saveBtn.textContent = this.i18n?.t?.('add_command') || 'Add Command'
    }

    this.modalManager?.hide('parameterModal')
  }

  /* ------------------------------------------------------------
   * Modal content helpers
   * ---------------------------------------------------------- */
  populateParameterModal (commandDef) {
    const container    = this.document.getElementById('parameterInputs')
    const titleElement = this.document.getElementById('parameterModalTitle')

    if (!container || !titleElement) return

    titleElement.textContent = `Configure: ${commandDef.name}`
    container.innerHTML = ''
    this.buildParameterInputs(container, commandDef)

    // Initial preview
    this.updateParameterPreview()
  }

  /* ------------------------------------------------------------
   * Edit mode
   * ---------------------------------------------------------- */
  editParameterizedCommand (index, command, commandDef) {
    // Emit event for services that need editing context
    const currentEnv = this._currentEnvironment || 'space'
    const selectedKey = currentEnv === 'alias' ? this._selectedAlias : this._selectedKey
    
    this.emit('parameter-edit:start', {
      index,
      key: selectedKey,
      command,
      commandDef
    })

    this.currentParameterCommand = {
      ...commandDef,
      editIndex: index,
      isEditing: true,
    }

    if (!this.document.getElementById('parameterModal')) {
      this.createParameterModal()
    }

    this.populateParameterModalForEdit(commandDef, command.parameters || {})

    // Update button text for editing
    const saveBtn = this.document.getElementById('saveParameterCommandBtn')
    if (saveBtn) {
      saveBtn.textContent = this.i18n?.t?.('update_command') || 'Update Command'
    }

    this.modalManager?.show('parameterModal')
  }

  populateParameterModalForEdit (commandDef, existingParams = {}) {
    const container    = this.document.getElementById('parameterInputs')
    const titleElement = this.document.getElementById('parameterModalTitle')

    if (!container || !titleElement) return

    titleElement.textContent = `Edit: ${commandDef.name}`
    container.innerHTML = ''
    this.buildParameterInputs(container, commandDef, existingParams)

    // Initial preview
    this.updateParameterPreview()
  }

  /* ------------------------------------------------------------
   * Live preview / param collection
   * ---------------------------------------------------------- */
  async updateParameterPreview () {
    if (!this.currentParameterCommand) return

    const { categoryId, commandId } = this.currentParameterCommand
    const commandDef = this.currentParameterCommand  // The commandDef properties are spread directly
    const params = this.getParameterValues()

    try {
      const cmd = await svc.buildParameterizedCommand(categoryId, commandId, commandDef, params)
      const previewEl = this.document.getElementById('parameterCommandPreview')
      if (!previewEl || !cmd) return

      if (Array.isArray(cmd)) {
        previewEl.textContent = cmd.map(c => c.command || c).filter(c => c).join(' $$ ')
      } else {
        // Handle both string commands and command objects
        let commandText = ''
        if (typeof cmd === 'string') {
          commandText = cmd
        } else if (cmd.command) {
          commandText = cmd.command
        } else {
          // Fallback for malformed command objects
          commandText = 'Error: Invalid command format'
        }
        previewEl.textContent = commandText
      }
    } catch (error) {
      console.error('Error updating parameter preview:', error)
      const previewEl = this.document.getElementById('parameterCommandPreview')
      if (previewEl) {
        previewEl.textContent = 'Error generating command'
      }
    }
  }

  getParameterValues () {
    const container = this.document.getElementById('parameterInputs')
    if (!container) return {}

    const values = {}
    container.querySelectorAll('input, select').forEach(input => {
      const name = input.name
      if (!name) return

      if (input.type === 'number') {
        values[name] = input.value === '' ? undefined : Number(input.value)
      } else {
        values[name] = input.value
      }
    })

    return values
  }

  /* ------------------------------------------------------------
   * Saving / Editing
   * ---------------------------------------------------------- */
  async saveParameterCommand (...args) {
    // Use cached state instead of request/response
    const currentEnv = this._currentEnvironment || 'space'
    const selectedKey = currentEnv === 'alias' ? this._selectedAlias : this._selectedKey
    

    
    if (!selectedKey || !this.currentParameterCommand) {
      const message = currentEnv === 'alias' 
        ? (this.i18n?.t?.('please_select_an_alias_first') || 'Please select an alias first')
        : (this.i18n?.t?.('please_select_a_key_first') || 'Please select a key first')
      this.ui?.showToast?.(message, 'warning')
      return
    }

    const { categoryId, commandId } = this.currentParameterCommand
    const commandDef = this.currentParameterCommand  // The commandDef properties are spread directly
    const params = this.getParameterValues()

    try {
      const cmd = await svc.buildParameterizedCommand(categoryId, commandId, commandDef, params)
      if (!cmd) return

      // Check if we're editing an existing command or adding a new one
      if (this.currentParameterCommand.isEditing && this.currentParameterCommand.editIndex !== undefined) {
        // Editing existing command - emit update event
        console.log('[ParameterCommandUI] emitting command:edit [parameterized]', { 
          key: selectedKey, 
          index: this.currentParameterCommand.editIndex, 
          updatedCommand: cmd 
        })
        this.emit('command:edit', { 
          key: selectedKey, 
          index: this.currentParameterCommand.editIndex, 
          updatedCommand: cmd 
        })
      } else {
        // Adding new command - handle arrays as single batch to avoid race conditions
        if (Array.isArray(cmd)) {
          console.log('[ParameterCommandUI] emitting command:add [bulk parameterized]', { commands: cmd, key: selectedKey })
          this.emit('command:add', { command: cmd, key: selectedKey })
        } else {
          console.log('[ParameterCommandUI] emitting command:add [single parameterized]', { command: cmd, key: selectedKey })
          this.emit('command:add', { command: cmd, key: selectedKey })
        }
      }
    } catch (error) {
      console.error('Error building parameterized command:', error)
      this.ui?.showToast?.('Error generating command', 'error')
      return
    }

    // Close modal
    this.modalManager?.hide('parameterModal')
    
    // Emit event to notify services that editing has ended
    this.emit('parameter-edit:end')
    
    this.currentParameterCommand = null

    // Reset button text (i18n ready)
    const saveBtn = this.document.getElementById('saveParameterCommandBtn')
    if (saveBtn) {
      saveBtn.textContent = this.i18n?.t?.('add_command') || 'Add Command'
    }
  }

  /* ------------------------------------------------------------
   * Legacy facade methods – keep external API intact
   * ---------------------------------------------------------- */
  async editCommand (index) {
    // Use cached state instead of request/response
    const currentEnv = this._currentEnvironment || 'space'
    const selectedKey = currentEnv === 'alias' ? this._selectedAlias : this._selectedKey
    
    if (!selectedKey) return

    try {
      // Fetch commands for the selected key via request/response layer
      const commands = await this.request('command:get-for-selected-key')
      if (!commands || !commands[index]) return

      const command = commands[index]
      const commandDef = await svc.findCommandDefinition(command)
      if (!commandDef) return

      this.editParameterizedCommand(index, command, commandDef)
    } catch (error) {
      console.error('ParameterCommandUI.editCommand failed:', error)
    }
  }

  /* ------------------------------------------------------------
   * Thin wrappers delegating to the service – keeps external API
   * intact for legacy code/tests.
   * ---------------------------------------------------------- */
  generateCommandId (...args) {
    return svc.generateCommandId(...args)
  }
  
  async buildParameterizedCommand (...args) {
    return await svc.buildParameterizedCommand(...args)
  }
  
  async findCommandDefinition (...args) {
    return await svc.findCommandDefinition(...args)
  }

  /* ------------------------------------------------------------
   * DRY helpers for parameter input generation
   * ---------------------------------------------------------- */

  /**
   * Convert parameter key to a nicely formatted label (e.g. start_tray → Start Tray)
   */
  formatParameterName (n) {
    return n.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  /**
   * Provide contextual help text for well-known parameters. Falls back to a
   * generic message when the parameter is unknown.
   */
  getParameterHelp (paramName, paramDef) {
    if (paramDef.help) return paramDef.help

    const helpMap = {
      tray:         'Tray number (0-9)',
      slot:         'Slot number (0-9)',
      start_tray:   'Starting tray number',
      end_tray:     'Ending tray number',
      start_slot:   'Starting slot number',
      end_slot:     'Ending slot number',
      backup_tray:  'Backup tray number',
      backup_slot:  'Backup slot number',
      active:       '0: Disabled, 1: Enabled',
      entityName:   'Name of the entity to target',
      message:      'Message text to send',
      distance:     'Camera distance value',
      amount:       'Throttle adjustment amount',
      position:     'Throttle position (0-100)',
      filename:     'File name (without extension)',
      state:        '1 to enable, 0 to disable',
      verb:         'Communication channel (say, team, zone)',
      alias_name:   'Name of the alias to execute',
    }

    return helpMap[paramName] || 'Parameter value'
  }

  /**
   * Resolve option labels with i18n support and special-case tray labels
   */
  getOptionLabel (paramName, value) {
    if (paramName === 'verb') {
      return this.i18n?.t?.(`verb.${value}`) || value
    }
    if (value === 'STOTrayExecByTray') {
      return 'STOTrayExecByTray (shows key binding on UI)'
    }
    if (value === 'TrayExecByTray') {
      return 'TrayExecByTray (no UI indication)'
    }
    return value
  }

  /**
   * Build all parameter inputs into a container element
   * @param {HTMLElement} container  target element
   * @param {object}       commandDef definition containing parameters map
   * @param {object}       existingParams values to pre-select (edit mode)
   */
  buildParameterInputs (container, commandDef, existingParams = {}) {
    Object.entries(commandDef.parameters).forEach(([paramName, paramDef]) => {
      const inputGroup = this.document.createElement('div')
      inputGroup.className = 'form-group'

      const label = this.document.createElement('label')
      label.textContent = this.formatParameterName(paramName)
      label.setAttribute('for', `param_${paramName}`)

      let inputEl
      const selectedVal = existingParams[paramName] ?? paramDef.default

      if (paramDef.type === 'select') {
        inputEl      = this.document.createElement('select')
        inputEl.id   = `param_${paramName}`
        inputEl.name = paramName

        paramDef.options.forEach(opt => {
          const o = this.document.createElement('option')
          o.value       = opt
          o.textContent = this.getOptionLabel(paramName, opt)
          if (opt === selectedVal) o.selected = true
          inputEl.appendChild(o)
        })
      } else {
        inputEl      = this.document.createElement('input')
        inputEl.type = paramDef.type === 'number' ? 'number' : 'text'
        inputEl.id   = `param_${paramName}`
        inputEl.name = paramName
        inputEl.value = selectedVal ?? ''
        if (paramDef.placeholder) inputEl.placeholder = paramDef.placeholder
        if (paramDef.type === 'number') {
          if (paramDef.min !== undefined)  inputEl.min  = paramDef.min
          if (paramDef.max !== undefined)  inputEl.max  = paramDef.max
          if (paramDef.step !== undefined) inputEl.step = paramDef.step
        }
      }

      const help = this.document.createElement('small')
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
  }
}

// Legacy singleton removed - now initialized in app.js with proper dependencies 