import UIComponentBase from '../UIComponentBase.js'
import { enrichForDisplay, normalizeToString } from '../../lib/commandDisplayAdapter.js'
import { STOError } from '../../core/errors.js'

/*
* ParameterCommandUI – a UI component for editing parameterized commands.
*
* Responsibilities:
* 1. Provide a modal for editing parameterized commands.
* 2. Provide a preview of the generated command.
* 3. Provide a way to save the command.
*/
export default class ParameterCommandUI extends UIComponentBase {
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

  /**
   * Safe Number parsing utility with NaN validation
   *
   * This function prevents NaN values from being passed to command building
   * by validating numeric inputs from HTML form fields. Invalid inputs like
   * "abc", "1.2.3", etc. throw validation errors with descriptive messages.
   *
   * @param {string} value - The string value to parse
   * @param {string} paramName - The parameter name being parsed (for error messages)
   * @returns {number} The parsed number
   * @throws {STOError} If the parsed value is NaN
   */
  safeParseNumber(value, paramName) {
    if (value === '' || value === undefined || value === null) {
      return undefined
    }

    const parsed = Number(value)
    if (Number.isNaN(parsed)) {
      throw new STOError(
        `Invalid number for ${paramName}: '${value}' is not a valid number`,
        'INVALID_PARAMETER_NUMBER'
      )
    }
    return parsed
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

    // Listen for language changes to regenerate modal if open
    // The ModalManagerService will automatically handle regeneration through registered callbacks
    this.addEventListener('language:changed', () => {
      // Modal regeneration is handled by ModalManagerService languageChanged handler
      // No need to manually regenerate here
    })
  }

  // UI – Modal lifecycle
  showParameterModal (categoryId, commandId, commandDef) {
    this.currentParameterCommand = { categoryId, commandId, commandDef }

    // Create modal lazily
    if (!this.document.getElementById('parameterModal')) {
      this.createParameterModal()
    } else {
      // Re-register regeneration callback if modal already exists
      // This ensures language changes work for subsequent modal openings
      this.modalManager?.registerRegenerateCallback('parameterModal', () => {
        this.regenerateParameterModal()
      })
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
          <h3 id="parameterModalTitle" data-i18n="parameter_configuration">Parameter Configuration</h3>
          <button class="modal-close" data-modal="parameterModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <div id="parameterInputs"></div>
          <div class="command-preview-modal">
            <label data-i18n="generated_command">${this.i18n.t('generated_command')}</label>
            <div class="command-preview" id="parameterCommandPreview"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="saveParameterCommandBtn">${this.i18n.t('add_command')}</button>
          <button class="btn btn-secondary" data-modal="parameterModal">${this.i18n.t('cancel')}</button>
        </div>
      </div>`

    this.document.body.appendChild(modal)

    // Register regeneration callback for language changes
    this.modalManager?.registerRegenerateCallback('parameterModal', () => {
      this.regenerateParameterModal()
    })

    // Attach event handlers using helper method
    this.attachModalEventHandlers()
  }

  cancelParameterCommand () {
    // Emit event to notify services that editing has ended
    this.emit('parameter-edit:end')

    this.currentParameterCommand = null

    // Reset button text (i18n ready)
    const saveBtn = this.document.getElementById('saveParameterCommandBtn')
    if (saveBtn) {
      saveBtn.textContent = this.i18n.t('add_command')
    }

    // Unregister regeneration callback when cancelling
    this.modalManager?.unregisterRegenerateCallback('parameterModal')

    this.modalManager?.hide('parameterModal')
  }

  /**
   * Regeneration method for language changes
   * Rebuilds the modal content while preserving current state
   */
  regenerateParameterModal() {
    if (!this.currentParameterCommand) return

    // Capture current state before regeneration
    const { commandDef, isEditing, editIndex, originalCommand } = this.currentParameterCommand
    const currentParameterValues = this.getParameterValues()

    // Rebuild modal content
    const modal = this.document.getElementById('parameterModal')
    if (!modal) return

    // Update modal HTML with current language
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="parameterModalTitle" data-i18n="parameter_configuration">Parameter Configuration</h3>
          <button class="modal-close" data-modal="parameterModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <div id="parameterInputs"></div>
          <div class="command-preview-modal">
            <label data-i18n="generated_command">${this.i18n.t('generated_command')}</label>
            <div class="command-preview" id="parameterCommandPreview"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="saveParameterCommandBtn">${this.i18n.t(isEditing ? 'save' : 'add_command')}</button>
          <button class="btn btn-secondary" data-modal="parameterModal">${this.i18n.t('cancel')}</button>
        </div>
      </div>`

    
    // Re-attach event handlers for the new modal content
    this.attachModalEventHandlers()

    // Restore modal state
    if (isEditing) {
      this.populateParameterModalForEdit(commandDef, currentParameterValues)
      // Update button text for editing
      const saveBtn = this.document.getElementById('saveParameterCommandBtn')
      if (saveBtn) {
        saveBtn.textContent = this.i18n.t('save')
      }
    } else {
      this.populateParameterModal(commandDef)
    }
  }

  /**
   * Helper method to attach modal event handlers
   * Used both during modal creation and regeneration
   */
  attachModalEventHandlers() {
    // Save button handler
    this.onDom('saveParameterCommandBtn', 'click', 'parameter-command-save', () => {
      this.saveParameterCommand()
    })

    // Modal close handlers
    const modal = this.document.getElementById('parameterModal')
    if (modal) {
      modal.querySelectorAll('.modal-close, [data-modal="parameterModal"]').forEach(btn => {
        this.onDom(btn, 'click', 'parameter-modal-close', () => {
          this.cancelParameterCommand()
        })
      })
    }
  }

  // Modal content helpers
  populateParameterModal (commandDef) {
    const container    = this.document.getElementById('parameterInputs')
    const titleElement = this.document.getElementById('parameterModalTitle')

    if (!container || !titleElement) return

    titleElement.textContent = `${this.i18n.t('configure_colon')} ${commandDef.name}`
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
        // Use injected i18n object for translations
        const richCommand = await enrichForDisplay(commandString, this.i18n, { eventBus: this.eventBus })
        const existingParams = richCommand.parameters || {}
        
        // Populate modal with existing parameters
        this.populateParameterModalForEdit(commandDef, existingParams)
        
        // Update button text for editing
        const saveBtn = this.document.getElementById('saveParameterCommandBtn')
        if (saveBtn) {
          saveBtn.textContent = this.i18n.t('save')
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

    titleElement.textContent = `${this.i18n.t('edit_colon')} ${commandDef.name}`
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

    let params
    try {
      params = this.getParameterValues()
    } catch (error) {
      // Handle validation errors from safeParseNumber
      const previewEl = this.document.getElementById('parameterCommandPreview')
      if (previewEl) {
        previewEl.textContent = error.message || 'Invalid parameter values'
        previewEl.style.color = '#d63031' // Error color
      }
      return
    }

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
      // Reset color to default on successful preview
      previewEl.style.color = ''
    } catch (error) {
      const previewEl = this.document.getElementById('parameterCommandPreview')
      if (previewEl) {
        if (error.message === 'please_enter_a_raw_command') {
          const msg = this.i18n.t('please_enter_a_raw_command')
          previewEl.textContent = msg
        } else {
          // Only log unexpected errors, not the expected "please_enter_a_raw_command"
          console.error('Error updating parameter preview:', error)
          const errMsg = this.i18n.t('error_generating_command')
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
        values[name] = this.safeParseNumber(input.value, name)
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
        ? this.i18n.t('please_select_an_alias_first')
        : this.i18n.t('please_select_a_key_first')
      this.ui?.showToast?.(message, 'warning')
      return
    }

    const { categoryId, commandId } = this.currentParameterCommand
    const commandDef = this.currentParameterCommand  // The commandDef properties are spread directly

    let params
    try {
      params = this.getParameterValues()
    } catch (error) {
      // Handle validation errors from safeParseNumber
      this.ui?.showToast?.(error.message || 'Invalid parameter values', 'error')
      return
    }

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
        const msg = this.i18n.t('please_enter_a_raw_command')
        this.ui?.showToast?.(msg, 'warning')
      } else {
        const errMsg = this.i18n.t('error_generating_command')
        this.ui?.showToast?.(errMsg, 'error')
      }
      return
    }

    // Unregister regeneration callback when saving
    this.modalManager?.unregisterRegenerateCallback('parameterModal')

    // Close modal
    this.modalManager?.hide('parameterModal')

    // Emit event to notify services that editing has ended
    this.emit('parameter-edit:end')

    this.currentParameterCommand = null

    // Reset button text (i18n ready)
    const saveBtn = this.document.getElementById('saveParameterCommandBtn')
    if (saveBtn) {
      saveBtn.textContent = this.i18n.t('add_command')
    }

    // Unregister regeneration callback when cancelling
    this.modalManager?.unregisterRegenerateCallback('parameterModal')
  }

  
  // DRY helpers for parameter input generation
  formatParameterName (n) {
    return n.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  // Provide contextual help text for well-known parameters. Falls back to a
  // generic message when the parameter is unknown.
  getParameterHelp (paramName, paramDef) {
    if (paramDef.help) return paramDef.help

    // Use the new command_parameters structure for unified parameter data
    return this.i18n.t(`command_parameters.${paramName}.help`) || this.i18n.t('parameter_value')
  }

  // Resolve option labels with i18n support and special-case tray labels
  getOptionLabel (paramName, value) {
    if (paramName === 'verb') {
      return this.i18n.t(`verb.${value}`)
    }
    if (value === 'STOTrayExecByTray') {
      return this.i18n.t('stotrayexecbytray_description')
    }
    if (value === 'TrayExecByTray') {
      return this.i18n.t('trayexecbytray_description')
    }
    return value
  }

  // Build all parameter inputs into a container element
  buildParameterInputs (container, commandDef, existingParams = {}) {
    Object.entries(commandDef.parameters).forEach(([paramName, paramDef]) => {
      const inputGroup = this.document.createElement('div')
      inputGroup.className = 'form-group'

      const label = this.document.createElement('label')
      label.textContent = paramDef.label || this.i18n.t(`command_parameters.${paramName}.label`) || this.i18n.t(paramName) || this.formatParameterName(paramName)
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
        if (paramDef.placeholder) {
          // Translate placeholder if it's a translation key
          if (paramDef.placeholder.startsWith('command_definitions.') && this.i18n) {
            inputEl.placeholder = this.i18n.t(paramDef.placeholder) || paramDef.placeholder
          } else {
            inputEl.placeholder = paramDef.placeholder
          }
        }
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