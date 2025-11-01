import ComponentBase from '../ComponentBase.js'
import { enrichForDisplay, normalizeToString } from '../../lib/commandDisplayAdapter.js'

/*
* ParameterCommandUI – a UI component for editing parameterized commands.
*
* Responsibilities:
* 1. Provide a modal for editing parameterized commands.
* 2. Provide a preview of the generated command.
* 3. Provide a way to save the command.
*/
export default class ParameterCommandUI extends ComponentBase {
  constructor({
    eventBus,
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
    
    // ComponentBase handles activeBindset caching automatically

    this.currentParameterCommand = null
  }

  onInit() {
    this.setupEventListeners()
  }

  setupEventListeners() {
    // ComponentBase handles bindset caching automatically via bindset-selector:active-changed
    // No need to manually update _activeBindset - use this.cache.activeBindset instead

    // Handle parameter command editing requests
    this.addEventListener('parameter-command:edit', ({ index, command, commandDef, categoryId, commandId }) => {
      if (commandDef && categoryId && commandId) {
        this.editParameterizedCommand(index, command, commandDef)
      }
    })
  }

  // UI – Modal lifecycle
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
    this.onDom('saveParameterCommandBtn', 'click', 'parameter-command-save', () => {
      this.saveParameterCommand()
    })

    // Use EventBus for automatic cleanup
    modal.querySelectorAll('.modal-close, [data-modal="parameterModal"]').forEach(btn => {
      this.onDom(btn, 'click', 'parameter-modal-close', () => {
        this.cancelParameterCommand()
      })
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

  // Modal content helpers
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

  // Edit mode
  editParameterizedCommand (index, command, commandDef) {
    // Convert canonical string command to rich object for editing
    const commandString = normalizeToString(command)
    
    // Set up for editing mode
    this.currentParameterCommand = { 
      categoryId: commandDef.categoryId, 
      commandId: commandDef.commandId, 
      commandDef,
      editIndex: index,
      originalCommand: command,
      // Flag to indicate we are editing an existing item instead of adding new
      isEditing: true
    }

    // Create modal lazily
    if (!this.document.getElementById('parameterModal')) {
      this.createParameterModal()
    }

    // Persist command definition on the modal so it can be rebuilt on i18n
    const modal = this.document.getElementById('parameterModal')
    if (modal) {
      modal.setAttribute('data-command-def', JSON.stringify(commandDef))
    }

    // For editing, we need to extract existing parameters from the command
    const enrichCommand = async () => {
      try {
        // Get i18n object for translations
        const i18n = typeof i18next !== 'undefined' ? i18next : null
        
        // Enrich the command to get its parameters
        const richCommand = await enrichForDisplay(commandString, i18n, { eventBus: this.eventBus })
        const existingParams = richCommand.parameters || {}
        
        // Populate modal with existing parameters
        this.populateParameterModalForEdit(commandDef, existingParams)
        
        // Update button text for editing
        const saveBtn = this.document.getElementById('saveParameterCommandBtn')
        if (saveBtn) {
          saveBtn.textContent = this.i18n?.t?.('save') || 'Save'
        }

        // Use injected modal manager
        this.modalManager?.show('parameterModal')
      } catch (error) {
        console.error('[ParameterCommandUI] Error enriching command for editing:', error)
        // Fallback: populate without existing parameters
        this.populateParameterModalForEdit(commandDef, {})
        this.modalManager?.show('parameterModal')
      }
    }
    
    enrichCommand()
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

  // Live preview / param collection
  async updateParameterPreview () {
    if (!this.currentParameterCommand) return

    const { categoryId, commandId } = this.currentParameterCommand
    const commandDef = this.currentParameterCommand  // The commandDef properties are spread directly
    const params = this.getParameterValues()

    try {
      const cmd = await this.request('parameter-command:build', { categoryId, commandId, commandDef, params })
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
      const previewEl = this.document.getElementById('parameterCommandPreview')
      if (previewEl) {
        if (error.message === 'please_enter_a_raw_command') {
          const msg = this.i18n?.t?.('please_enter_a_raw_command') || 'Please enter a raw command'
          previewEl.textContent = msg
        } else {
          // Only log unexpected errors, not the expected "please_enter_a_raw_command"
          console.error('Error updating parameter preview:', error)
          const errMsg = this.i18n?.t?.('error_generating_command') || 'Error generating command'
          previewEl.textContent = errMsg
        }
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

  // Saving / Editing
  async saveParameterCommand (...args) {
    // Use ComponentBase cached state
    const currentEnv = this.cache.currentEnvironment || 'space'
    const selectedKey = currentEnv === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey
    

    
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
      const cmd = await this.request('parameter-command:build', { categoryId, commandId, commandDef, params })
      if (!cmd) return

      // Check if we're editing an existing command or adding a new one
      if (this.currentParameterCommand.isEditing && this.currentParameterCommand.editIndex !== undefined) {
        // Editing existing command - emit update event
        const bindset = this.cache.currentEnvironment === 'alias' ? null : this.cache.activeBindset
        console.log('[ParameterCommandUI] emitting command:edit [parameterized]', { 
          key: selectedKey, 
          index: this.currentParameterCommand.editIndex, 
          updatedCommand: cmd, 
          bindset 
        })
        this.emit('command:edit', { 
          key: selectedKey, 
          index: this.currentParameterCommand.editIndex, 
          updatedCommand: cmd, 
          bindset 
        })
      } else {
        // Adding new command - handle arrays as single batch to avoid race conditions
        // Include active bindset when not in alias mode
        const bindset = this.cache.currentEnvironment === 'alias' ? null : this.cache.activeBindset
        if (Array.isArray(cmd)) {
          console.log('[ParameterCommandUI] emitting command:add [bulk parameterized]', { commands: cmd, key: selectedKey })
          this.emit('command:add', { command: cmd, key: selectedKey, bindset })
        } else {
          console.log('[ParameterCommandUI] emitting command:add [single parameterized]', { command: cmd, key: selectedKey })
          this.emit('command:add', { command: cmd, key: selectedKey, bindset })
        }
      }
    } catch (error) {
      console.error('Error building parameterized command:', error)
      if (error.message === 'please_enter_a_raw_command') {
        const msg = this.i18n?.t?.('please_enter_a_raw_command') || 'Please enter a raw command'
        this.ui?.showToast?.(msg, 'warning')
      } else {
        const errMsg = this.i18n?.t?.('error_generating_command') || 'Error generating command'
        this.ui?.showToast?.(errMsg, 'error')
      }
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

  // Legacy facade methods – keep external API intact
  async editCommand (index) {
    // Use ComponentBase cached state
    const currentEnv = this.cache.currentEnvironment || 'space'
    const selectedKey = currentEnv === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey
    
    if (!selectedKey) return

    try {
      // Fetch commands for the selected key via request/response layer
      const commands = await this.request('command:get-for-selected-key')
      if (!commands || !commands[index]) return

      const command = commands[index]
      const commandDef = await this.request('parameter-command:find-definition', { commandString: command })
      if (!commandDef) return

      this.editParameterizedCommand(index, command, commandDef)
    } catch (error) {
      console.error('ParameterCommandUI.editCommand failed:', error)
    }
  }

  // Thin wrappers delegating to the service – keeps external API
  // intact for legacy code/tests.
  generateCommandId (...args) {
    return this.request('parameter-command:generate-id')
  }
  
  async buildParameterizedCommand (categoryId, commandId, commandDef, params) {
    return await this.request('parameter-command:build', { categoryId, commandId, commandDef, params })
  }
  
  async findCommandDefinition (commandString) {
    return await this.request('parameter-command:find-definition', { commandString })
  }

  // DRY helpers for parameter input generation
  formatParameterName (n) {
    return n.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  // Provide contextual help text for well-known parameters. Falls back to a
  // generic message when the parameter is unknown.
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

  // Resolve option labels with i18n support and special-case tray labels
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

  // Build all parameter inputs into a container element
  buildParameterInputs (container, commandDef, existingParams = {}) {
    Object.entries(commandDef.parameters).forEach(([paramName, paramDef]) => {
      const inputGroup = this.document.createElement('div')
      inputGroup.className = 'form-group'

      const label = this.document.createElement('label')
      label.textContent = this.i18n?.t?.(paramName) || this.formatParameterName(paramName)
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