import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'

/**
 * CommandUI – owns the parameter-editing modal and acts as the bridge between
 * UI interactions (coming from CommandLibraryUI) and CommandService.
 *
 * REFACTORED: Now fully decoupled from direct service dependencies
 * Uses broadcast/cache pattern for UI state and request/response for actions
 *
 * Responsibilities:
 * 1. Listen for `command:add` events emitted by CommandLibraryUI when the user
 *    selects a command from the library.
 * 2. For customizable commands, delegate to `parameterCommands.showParameterModal`
 *    to show the parameter configuration modal.
 * 3. For static commands, emit events for CommandService to handle.
 * 4. Cache UI state from broadcast events for immediate access.
 */
export default class CommandUI extends ComponentBase {
  constructor ({ eventBus: bus = eventBus,
                ui = null,
                modalManager = null,
                parameterCommandUI = null,
                document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(bus)
    this.componentName = 'CommandUI'
    this.ui           = ui || (typeof stoUI !== 'undefined' ? stoUI : null)
    this.modalManager = modalManager
    this.parameterCommandUI = parameterCommandUI

    // REFACTORED: Cache UI state from broadcast events
    this._selectedKey = null
    this._selectedAlias = null
    this._currentEnvironment = 'space'
    this._activeBindset = 'Primary Bindset' // Default to primary bindset

    // Store last validation issues
    this._lastValidation = { warnings: [], errors: [] }

    // Provide DOM access consistent with other UI components
    this.document = document
  }

  onInit () {
    this.setupEventListeners()
    this.setupUIStateEventListeners()

    // Listen for command:add events from CommandLibraryUI
    this.addEventListener('command-add', async (payload = {}) => {
      const { categoryId, commandId, commandDef } = payload

      if (commandDef && !categoryId && !commandId) {
        // Static command - add immediately using cached state
        try {
          const selectedKey = this.getSelectedKey()
          if (!selectedKey) {
            // Get current environment to show appropriate message
            const env = this.getCurrentEnvironment()
            const msgKey = env === 'alias' ? 'please_select_an_alias_first' : 'please_select_a_key_first'
            const message = await this.getI18nMessage(msgKey) || 
              (env === 'alias' ? 'Please select an alias first' : 'Please select a key first')

            await this.showToast(message, 'warning')
            return
          }

          // Include active bindset when not in alias mode
          const bindset = this._currentEnvironment === 'alias' ? null : this._activeBindset
          this.emit('command:add', { command: commandDef, key: selectedKey, bindset })
        } catch (error) {
          console.error('CommandUI: Failed to handle static command:', error)
        }
      } else if (categoryId && commandId && commandDef) {
        // Customizable command - show parameter modal
        if (this.parameterCommandUI) {
          this.parameterCommandUI.showParameterModal(categoryId, commandId, commandDef)
        } else {
          console.error('CommandUI: parameterCommandUI not available')
        }
      }
    })

    // Listen for validation results to update status indicator
    this.addEventListener('command-chain:validation-result', async ({ severity, warnings = [], errors = [] }) => {
      const ind = this.document.getElementById('statusIndicator')
      if (!ind) return
      const iconEl = ind.querySelector('i')
      const textEl = ind.querySelector('span')
      if (!iconEl || !textEl) return

      const mapping = {
        success: { icon: 'fa-check-circle', textKey: 'valid', textDefault: 'Valid', color: 'status-success' },
        warning: { icon: 'fa-exclamation-triangle', textKey: 'warning', textDefault: 'Warning', color: 'status-warning' },
        error:   { icon: 'fa-exclamation-circle',  textKey: 'error',  textDefault: 'Error',  color: 'status-error' }
      }
      const cfg = mapping[severity] || mapping.success

      // Update icon class and colour
      iconEl.className = `fas ${cfg.icon}`

      try {
        const translated = await this.request('i18n:translate', { key: cfg.textKey })
        const finalText = (translated && translated !== cfg.textKey) ? translated : cfg.textDefault
        // Update both content and data-i18n attribute so other i18n refreshes keep the correct label
        textEl.textContent = finalText
        textEl.setAttribute('data-i18n', cfg.textKey)
      } catch {
        textEl.textContent = cfg.textDefault
        textEl.setAttribute('data-i18n', cfg.textKey)
      }

      // Update color classes
      ind.classList.remove('status-success', 'status-warning', 'status-error')
      ind.classList.add(cfg.color)

      // Store issues for modal display
      this._lastValidation = { warnings, errors }

      if (severity !== 'success' && (warnings.length || errors.length)) {
        ind.classList.add('clickable')
        ind.onclick = () => this.showValidationDetails()
      } else {
        ind.classList.remove('clickable')
        ind.onclick = null
      }
    })
  }

  setupUIStateEventListeners() {
    // Cache state from broadcast events - same pattern as other UI components
    this.addEventListener('key-selected', (data) => {
      this._selectedKey = data.key || data.name
      this._selectedAlias = null
    })

    this.addEventListener('alias-selected', (data) => {
      this._selectedAlias = data.name
      this._selectedKey = null
    })

    this.addEventListener('environment:changed', (data) => {
      const env = typeof data === 'string' ? data : data?.environment
      if (env) {
        this._currentEnvironment = env
      }
    })

    this.addEventListener('bindset-selector:active-changed', (data) => {
      this._activeBindset = data.bindset || 'Primary Bindset'
    })
  }

  setupEventListeners() {
    if (this.eventListenersSetup) {
      return
    }
    this.eventListenersSetup = true


    this.eventBus.onDom('clearChainBtn', 'click', 'command-chain-clear', () => {
      const selectedKey = this.getSelectedKey()
      if (selectedKey) {
        this.confirmClearChain(selectedKey)
      }
    })

    this.eventBus.onDom('validateChainBtn', 'click', 'command-chain-validate', () => {
      const selectedKey = this.getSelectedKey()
      if (selectedKey) {
        this.validateCurrentChain(selectedKey)
      }
    })

    // Debounced command search input via eventBus helper
    this.eventBus.onDomDebounced(
      'commandSearch',
      'input',
      'command-search',
      (e) => {
        this.filterCommands(e.target.value)
      },
      250
    )

    this.eventBus.onDom('commandSearch', 'keydown', 'command-search-key', (e) => {
      if (e.key === 'Escape') {
        const input = e.target
        input.value = ''
        input.classList.remove('expanded')
        this.emit('command:filter', { filter: '' })
      } else if (e.key === 'Enter') {
        const input = e.target
        input.classList.remove('expanded')
        input.blur()
      }
    })

    // Clear Filter button – resets only Command Library search
    this.eventBus.onDom('showAllCommandsBtn', 'click', 'command-clear-filter', () => {
      const inp = this.document.getElementById('commandSearch')
      if (inp) {
        // Clear the input value
        inp.value = ''

        // Dispatch synthetic input event so the debounced handler resets and
        // any pending timer from the previous keystrokes is cancelled.
        const event = new Event('input', { bubbles: true })
        inp.dispatchEvent(event)
      }

      // Immediately clear the filter via direct call so UI updates without delay
      this.filterCommands('')
    })

    // Command search button
    this.eventBus.onDom('commandSearchBtn', 'click', 'command-search-toggle', () => {
      this.toggleCommandSearch()
    })

    // Import from key or alias button
    this.eventBus.onDom('importFromKeyOrAliasBtn', 'click', 'import-from-key-or-alias', () => {
      this.showImportFromKeyOrAliasModal()
    })

    // Save command button
    this.eventBus.onDom('saveCommandBtn', 'click', 'save-command', () => {
      this.saveCommand()
    })

    // Confirm import button
    this.eventBus.onDom('confirmImportBtn', 'click', 'confirm-import', () => {
      this.performImport()
    })
  }

  /* ------------------------------------------------------------
   * State Access - Use cached values from broadcast events
   * ---------------------------------------------------------- */

  /**
   * Get the currently selected key from cached state
   */
  getSelectedKey() {
    return this._currentEnvironment === 'alias' ? this._selectedAlias : this._selectedKey
  }

  /**
   * Get the current environment from cached state
   */
  getCurrentEnvironment() {
    return this._currentEnvironment
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
    }
    if (state.selectedAlias !== undefined) {
      this._selectedAlias = state.selectedAlias
    }
    if (state.currentEnvironment !== undefined) {
      this._currentEnvironment = state.currentEnvironment
    }
  }

  /* ------------------------------------------------------------
   * Action Methods - Use request/response for i18n and actions
   * ---------------------------------------------------------- */

  /**
   * Get i18n message using request/response
   */
  async getI18nMessage(key, params = {}) {
    try {
      return await this.request('i18n:translate', { key, params })
    } catch (error) {
      console.error('CommandUI: Failed to get i18n message:', error)
      return null
    }
  }

  /**
   * Show toast using request/response
   */
  async showToast(message, type = 'info') {
    try {
      // Use UI service if available, otherwise fallback to direct UI
      if (this.ui?.showToast) {
        this.ui.showToast(message, type)
      } else {
        await this.request('toast:show', { message, type })
      }
    } catch (error) {
      console.error('CommandUI: Failed to show toast:', error)
      // Fallback to browser alert if all else fails
      alert(message)
    }
  }

  /**
   * Confirm clearing the command chain for a key
   */
  async confirmClearChain(key) {
    if (!key) return
    
    try {
      const message = await this.getI18nMessage('confirm_clear_commands', { keyName: key }) || 
        `Clear command chain for ${key}?`
      
      if (confirm(message)) {
        this.emit('command-chain:clear', { key })
      }
    } catch (error) {
      console.error('CommandUI: Failed to confirm clear chain:', error)
    }
  }

  /**
   * Validate the current command chain
   */
  async validateCurrentChain(key) {
    if (key) {
      // Determine whether Stabilize Execution Order is enabled for this key/alias
      let stabilized = false
      try {
        stabilized = await this.request('command-chain:is-stabilized', { name: key })
      } catch (_) {}

      const isAlias = this.getCurrentEnvironment() === 'alias'
      this.emit('command-chain:validate', { key, stabilized, isAlias })
    }
  }

  /**
   * Filter commands by search term
   */
  filterCommands(value) {
    this.emit('command:filter', { filter: value })

    // Update search button active state for accessibility
    const searchBtn = this.document.getElementById('commandSearchBtn')
    if (searchBtn) {
      const active = !!(value && value.trim())
      searchBtn.classList.toggle('active', active)
      searchBtn.setAttribute('aria-pressed', active)
    }
  }

  /**
   * Toggle command search functionality
   */
  toggleCommandSearch() {
    const doc = this.document || (typeof window !== 'undefined' ? window.document : undefined)
    if (!doc) return
    const searchInput = doc.getElementById('commandSearch')
    if (!searchInput) return

    const expanded = searchInput.classList.toggle('expanded')
    if (expanded) {
      searchInput.focus()
    } else {
      searchInput.blur()
    }
  }

  /**
   * Show the import from key or alias modal
   */
  async showImportFromKeyOrAliasModal() {
    const selectedKey = this.getSelectedKey()
    if (!selectedKey) {
      const env = this.getCurrentEnvironment()
      const msgKey = env === 'alias' ? 'please_select_an_alias_first' : 'please_select_a_key_first'
      const message = await this.getI18nMessage(msgKey) || 
        (env === 'alias' ? 'Please select an alias first' : 'Please select a key first')
      await this.showToast(message, 'warning')
      return
    }
    
    // Populate the modal with available sources
    await this.populateImportSources()
    
    // Show the modal
    if (this.modalManager) {
      this.modalManager.show('importFromKeyOrAliasModal')
    }
  }

  /**
   * Populate the import sources dropdown based on current environment
   */
  async populateImportSources() {
    const doc = this.document || (typeof window !== 'undefined' ? window.document : undefined)
    if (!doc) return

    const select = doc.getElementById('importSourceSelect')
    if (!select) return

    // Clear existing options
    select.innerHTML = ''
    
    const currentEnv = this.getCurrentEnvironment()
    const currentKey = this.getSelectedKey()
    
    try {
      if (currentEnv === 'alias') {
        // In alias mode, show keys from all environments and other aliases
        
        // Add space keys
        const spaceKeys = await this.request('data:get-keys', { environment: 'space' }) || {}
        Object.keys(spaceKeys).forEach(key => {
          if (Object.keys(spaceKeys[key] || {}).length > 0) { // Only show keys with commands
            const option = doc.createElement('option')
            option.value = `space:${key}`
            option.textContent = `Space: ${key}`
            select.appendChild(option)
          }
        })
        
        // Add ground keys
        const groundKeys = await this.request('data:get-keys', { environment: 'ground' }) || {}
        Object.keys(groundKeys).forEach(key => {
          if (Object.keys(groundKeys[key] || {}).length > 0) { // Only show keys with commands
            const option = doc.createElement('option')
            option.value = `ground:${key}`
            option.textContent = `Ground: ${key}`
            select.appendChild(option)
          }
        })
        
        // Add other aliases
        const aliases = await this.request('alias:get-all') || {}
        Object.keys(aliases).forEach(aliasName => {
          if (aliasName !== currentKey && aliases[aliasName]?.commands) { // Exclude current alias and empty aliases
            const option = doc.createElement('option')
            option.value = `alias:${aliasName}`
            option.textContent = `Alias: ${aliasName}`
            select.appendChild(option)
          }
        })
      } else {
        // In key mode, show keys from both environments and aliases
        
        // Add space keys  
        const spaceKeys = await this.request('data:get-keys', { environment: 'space' }) || {}
        Object.keys(spaceKeys).forEach(key => {
          const isCurrentKey = (currentEnv === 'space' && key === currentKey)
          if (!isCurrentKey && Object.keys(spaceKeys[key] || {}).length > 0) { // Exclude current key and empty keys
            const option = doc.createElement('option')
            option.value = `space:${key}`
            option.textContent = `Space: ${key}`
            select.appendChild(option)
          }
        })
        
        // Add ground keys
        const groundKeys = await this.request('data:get-keys', { environment: 'ground' }) || {}
        Object.keys(groundKeys).forEach(key => {
          const isCurrentKey = (currentEnv === 'ground' && key === currentKey)
          if (!isCurrentKey && Object.keys(groundKeys[key] || {}).length > 0) { // Exclude current key and empty keys
            const option = doc.createElement('option')
            option.value = `ground:${key}`
            option.textContent = `Ground: ${key}`
            select.appendChild(option)
          }
        })
        
        // Add aliases
        const aliases = await this.request('alias:get-all') || {}
        Object.keys(aliases).forEach(aliasName => {
          if (aliases[aliasName]?.commands) { // Only show aliases with commands
            const option = doc.createElement('option')
            option.value = `alias:${aliasName}`
            option.textContent = `Alias: ${aliasName}`
            select.appendChild(option)
          }
        })
      }
      
      // Add default option if no sources available
      if (select.children.length === 0) {
        const option = doc.createElement('option')
        option.value = ''
        option.textContent = await this.getI18nMessage('no_sources_available') || 'No sources available'
        option.disabled = true
        select.appendChild(option)
      }
      
    } catch (error) {
      console.error('CommandUI: Failed to populate import sources:', error)
      const option = doc.createElement('option')
      option.value = ''
      option.textContent = await this.getI18nMessage('error_loading_sources') || 'Error loading sources'
      option.disabled = true
      select.appendChild(option)
    }
  }

  /**
   * Check if a command is compatible with the target environment
   */
  async isCommandCompatible(commandName, targetEnvironment) {
    if (!commandName) {
      console.warn('isCommandCompatible called with undefined commandName')
      return true // treat as universal so we don't block import pipeline
    }

    try {
      const commandData = await this.request('data:find-command-by-name', { command: commandName })
      
      // Special debug logging for Holster commands
      if (commandName.toLowerCase().includes('holster')) {
        console.log(`[DEBUG] Holster command "${commandName}" lookup result:`, commandData)
        console.log(`[DEBUG] Target environment: ${targetEnvironment}`)
      }
      
      if (!commandData || !commandData.environment) {
        // Command has no environment restriction, so it's universal
        if (commandName.toLowerCase().includes('holster')) {
          console.log(`[DEBUG] Holster command "${commandName}" treated as universal (no environment found)`)
        }
        return true
      }
      
      // Command has environment restriction - check compatibility
      const compatible = commandData.environment === targetEnvironment
      if (commandName.toLowerCase().includes('holster')) {
        console.log(`[DEBUG] Holster command "${commandName}" environment: ${commandData.environment}, compatible: ${compatible}`)
      }
      return compatible
    } catch (error) {
      // If we can't determine compatibility, assume it's universal
      console.warn(`CommandUI: Could not check compatibility for command "${commandName}":`, error)
      return true
    }
  }

  /**
   * Perform the import from the selected source
   */
  async performImport() {
    const doc = this.document || (typeof window !== 'undefined' ? window.document : undefined)
    if (!doc) return

    const select = doc.getElementById('importSourceSelect')
    const clearCheckbox = doc.getElementById('clearDestinationBeforeImport')
    
    if (!select || !clearCheckbox) return
    
    const sourceValue = select.value
    const clearDestination = clearCheckbox.checked
    const targetKey = this.getSelectedKey()
    
    if (!sourceValue || !targetKey) {
      const message = await this.getI18nMessage('please_select_a_source') || 'Please select a source'
      await this.showToast(message, 'warning')
      return
    }
    
    try {
      // Parse source value (format: "environment:key" or "alias:aliasName")
      const [sourceType, sourceName] = sourceValue.split(':')
      
      let sourceCommands = []
      
      if (sourceType === 'alias') {
        // Get commands from alias
        const aliases = await this.request('alias:get-all') || {}
        const alias = aliases[sourceName]
        if (alias && alias.commands) {
          // Handle both legacy string format and new canonical array format
          let commandString
          if (Array.isArray(alias.commands)) {
            // New canonical array format - join with $$
            commandString = alias.commands.join(' $$ ')
          } else {
            // Legacy string format
            commandString = alias.commands
          }

          if (commandString && commandString.trim()) {
            const result = await this.request('parser:parse-command-string', { 
              commandString 
            })
            sourceCommands = result.commands || []
          }
        }
      } else {
        // Get commands from key
        sourceCommands = await this.request('data:get-key-commands', { 
          environment: sourceType, 
          key: sourceName 
        }) || []
      }
      
      if (sourceCommands.length === 0) {
        const message = await this.getI18nMessage('source_has_no_commands') || 'Source has no commands to import'
        await this.showToast(message, 'warning')
        return
      }
      
      // Check for cross-environment import and filter commands
      const currentEnv = this.getCurrentEnvironment()
      let filteredCommands = sourceCommands
      let droppedCount = 0
      
      if (currentEnv !== 'alias' && sourceType !== 'alias') {
        // Key-to-key import: check for cross-environment issues
        if (sourceType !== currentEnv) {
          // Cross-environment import: filter out environment-specific commands
          console.log(`[DEBUG] Cross-environment import: ${sourceType} -> ${currentEnv}`)
          console.log('[DEBUG] Source commands:', sourceCommands)
          
          const originalCount = sourceCommands.length
          const compatibilityPromises = sourceCommands.map(async (cmdString) => {
            const isCompatible = await this.isCommandCompatible(cmdString, currentEnv)
            return { command: cmdString, isCompatible }
          })
          
          const compatibilityResults = await Promise.all(compatibilityPromises)
          console.log('[DEBUG] Compatibility results:', compatibilityResults.map(r => ({ command: r.command, compatible: r.isCompatible })))

          // Drop incompatible commands
          filteredCommands = compatibilityResults
            .filter(result => result.isCompatible)
            .map(result => result.command)

          droppedCount = originalCount - filteredCommands.length

          console.log('[DEBUG] Filtered commands:', filteredCommands)
          console.log(`[DEBUG] Dropped ${droppedCount} commands`)

          if (droppedCount > 0) {
            const sourceEnvName = sourceType.charAt(0).toUpperCase() + sourceType.slice(1)
            const targetEnvName = currentEnv.charAt(0).toUpperCase() + currentEnv.slice(1)
            const message = await this.getI18nMessage('cross_environment_import_warning', {
              dropped: droppedCount,
              sourceEnv: sourceEnvName,
              targetEnv: targetEnvName
            }) || `Warning: ${droppedCount} ${sourceEnvName}-specific commands were dropped when importing to ${targetEnvName}`
            await this.showToast(message, 'warning')
          }
        }
      }

      if (filteredCommands.length === 0) {
        const message = await this.getI18nMessage('no_compatible_commands_to_import') || 'No compatible commands to import after filtering'
        await this.showToast(message, 'warning')
        return
      }

      // Clear destination if requested
      if (clearDestination) {
        await this.request('command-chain:clear', { key: targetKey })
      }

      // Import commands
      for (const cmd of filteredCommands) {
        // Use CommandService endpoint so both broadcast and synchronous
        // paths share the same underlying implementation.
        await this.request('command:add', {
          key: targetKey,
          command: cmd
        })
      }

      // Success toast
      const successMsg = await this.getI18nMessage('commands_imported_successfully', {
        count: filteredCommands.length,
        source: sourceName
      }) || `Imported ${filteredCommands.length} commands from ${sourceName}`

      await this.showToast(successMsg, 'success')

      // Close modal
      if (this.modalManager) {
        this.modalManager.hide('importFromKeyOrAliasModal')
      }

    } catch (error) {
      console.error('CommandUI: Failed to import commands:', error)
      const message = await this.getI18nMessage('import_failed', { error: error?.message || error }) || `Import failed: ${error?.message || error}`
      await this.showToast(message, 'error')
    }
  }

  /**
   * Save the command from the add-command modal
   */
  async saveCommand() {
    const commandType = this.document.getElementById('commandType')?.value
    const commandPreview = this.document.getElementById('modalCommandPreview')?.textContent

    if (!commandType || !commandPreview) {
      const message = await this.getI18nMessage('please_complete_command_configuration') || 'Please complete the command configuration'
      await this.showToast(message, 'warning')
      return
    }

    const selectedKey = this.getSelectedKey()
    if (!selectedKey) {
      const env = this.getCurrentEnvironment()
      const msgKey = env === 'alias' ? 'please_select_an_alias_first' : 'please_select_a_key_first'
      const message = await this.getI18nMessage(msgKey) || (env === 'alias' ? 'Please select an alias first' : 'Please select a key first')
      await this.showToast(message, 'warning')
      return
    }

    // Emit command save event
    this.emit('command:save', {
      key: selectedKey,
      type: commandType,
      command: commandPreview
    })

  }

  /**
   * Show modal with validation details (warnings/errors)
   */
  async showValidationDetails() {
    const { warnings = [], errors = [] } = this._lastValidation || {}
    if (!warnings.length && !errors.length) return

    const translateEntry = async (entry) => {
      if (typeof entry === 'string') {
        return this.request('i18n:translate', { key: entry }).catch(()=>entry)
      }
      if (entry && entry.key) {
        return this.request('i18n:translate', { key: entry.key, params: entry.params || {} }).catch(()=> (entry.defaultMessage || entry.key))
      }
      if (entry && entry.defaultMessage) {
        return entry.defaultMessage
      }
      return ''
    }

    const translatedErrors = await Promise.all(errors.map(translateEntry))
    const translatedWarnings = await Promise.all(warnings.map(translateEntry))

    // Build grouped sections
    const errorLabel = await translateEntry('error')
    const warningLabel = await translateEntry('warning')

    let sectionsHtml = ''
    if (translatedErrors.length) {
      const errLis = translatedErrors.map(e=>`<li class=\"error-item\">${e}</li>`).join('')
      sectionsHtml += `<h4>${errorLabel}</h4><ul>${errLis}</ul>`
    }
    if (translatedWarnings.length) {
      const warnLis = translatedWarnings.map(w=>`<li class=\"warning-item\">${w}</li>`).join('')
      sectionsHtml += `<h4>${warningLabel}</h4><ul>${warnLis}</ul>`
    }

    const i18nTranslate = (k) => this.request('i18n:translate', { key: k })

    const title = await i18nTranslate('validation_details') || 'Validation Details'
    const okText = await i18nTranslate('ok') || 'OK'

    const modalId = 'validationDetailsModal'
    const existing = this.document.getElementById(modalId)
    if (existing) existing.remove()

    const modal = this.document.createElement('div')
    modal.id = modalId
    modal.className = 'modal'

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header"><h3>${title}</h3></div>
        <div class="modal-body">${sectionsHtml}</div>
        <div class="modal-footer"><button class="btn btn-primary" id="validationOkBtn">${okText}</button></div>
      </div>`

    this.document.body.appendChild(modal)

    const close = () => {
      if (this.modalManager) {
        this.modalManager.hide(modalId)
      }
      modal.remove()
    }
    modal.querySelector('#validationOkBtn').addEventListener('click', close)

    if (this.modalManager) {
      this.modalManager.show(modalId)
    } else {
      requestAnimationFrame(()=> modal.classList.add('active'))
    }
  }
}