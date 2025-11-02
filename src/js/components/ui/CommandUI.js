import UIComponentBase from '../UIComponentBase.js'

/**
 * CommandUI – owns the parameter-editing modal and acts as the bridge between
 * UI interactions (coming from CommandLibraryUI) and CommandService.
 *
 * Responsibilities:
 * 1. Listen for `command:add` events emitted by CommandLibraryUI when the user
 *    selects a command from the library.
 * 2. For customizable commands, delegate to `parameterCommands.showParameterModal`
 *    to show the parameter configuration modal.
 * 3. For static commands, emit events for CommandService to handle.
 * 4. Cache UI state from broadcast events for immediate access.
 */
export default class CommandUI extends UIComponentBase {
  constructor ({ eventBus,
                ui = null,
                modalManager = null,
                parameterCommandUI = null,
                confirmDialog = null,
                i18n = null,
                document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(eventBus)
    this.componentName = 'CommandUI'
    this.ui           = ui || (typeof stoUI !== 'undefined' ? stoUI : null)
    this.modalManager = modalManager
    this.parameterCommandUI = parameterCommandUI
    this.confirmDialog = confirmDialog || (typeof window !== 'undefined' ? window.confirmDialog : null)
    this.i18n = i18n

    this._activeBindset = 'Primary Bindset'

    // Store last validation issues
    this._lastValidation = { warnings: [], errors: [] }

    // Track last toast severity per key so we avoid repeating identical toasts
    this._toastSeverityByKey = new Map()

    this.document = document
  }

  onInit () {
    this.setupEventListeners()
    this.setupUIStateEventListeners()
  }

  setupUIStateEventListeners() {
    this.addEventListener('bindset-selector:active-changed', (data) => {
      this._activeBindset = data.bindset || 'Primary Bindset'
    })
  }

  setupEventListeners() {
    if (this.eventListenersSetup) {
      return
    }
    this.eventListenersSetup = true

    // Clear command chain button
    this.onDom('clearChainBtn', 'click', 'command-chain-clear', () => {
      const selectedKey = this.getSelectedKey()
      if (selectedKey) {
        this.confirmClearChain(selectedKey)
      }
    })

    // Validate command chain button
    this.onDom('validateChainBtn', 'click', 'command-chain-validate', () => {
      const selectedKey = this.getSelectedKey()
      if (selectedKey) {
        this.validateCurrentChain(selectedKey)
      }
    })

    // Debounced command search input
    this.onDomDebounced(
      'commandSearch',
      'input',
      'command-search',
      (e) => {
        this.filterCommands(e.target.value)
      },
      250
    )

    // Command search keydown
    this.onDom('commandSearch', 'keydown', 'command-search-key', (e) => {
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

    // Clear Filter button
    this.onDom('showAllCommandsBtn', 'click', 'command-clear-filter', () => {
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

    // Command search button - toggle command search functionality
    this.onDom('commandSearchBtn', 'click', 'command-search-toggle', () => {
      this.toggleCommandSearch()
    })

    // Import from key or alias button - show import from key or alias modal
    this.onDom('importFromKeyOrAliasBtn', 'click', 'import-from-key-or-alias', () => {
      this.showImportFromKeyOrAliasModal()
    })

    // Confirm import button - perform import from selected source
    this.onDom('confirmImportBtn', 'click', 'confirm-import', () => {
      this.performImport()
    })


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
          const bindset = this.cache.currentEnvironment === 'alias' ? null : this._activeBindset
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
    this.addEventListener('command-chain:validation-result', async ({ key, severity, warnings = [], errors = [] }) => {
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

      // Default to the fallback label immediately so UI updates synchronously
      textEl.textContent = cfg.textDefault
      textEl.setAttribute('data-i18n', cfg.textKey)

      // Update color classes
      ind.classList.remove('status-success', 'status-warning', 'status-error')
      ind.classList.add(cfg.color)

      // Store issues for modal display
      this._lastValidation = { warnings, errors }

      const hasIssues = (warnings && warnings.length > 0) || (errors && errors.length > 0)
      const stateKey = key || '__global__'
      let shouldShowIssueToasts = false

      if (!hasIssues || severity === 'success') {
        this._toastSeverityByKey.delete(stateKey)
      } else {
        const previousSeverity = this._toastSeverityByKey.get(stateKey)
        shouldShowIssueToasts = previousSeverity !== severity
        this._toastSeverityByKey.set(stateKey, severity)
      }

      const resolveIssueMessage = (issue) => {
        const translated = this.i18n?.t?.(issue.key, issue.params)
        const looksMissing = typeof translated === 'string' && (
          translated === issue.key || translated.startsWith(`${issue.key}:`)
        )

        if (!looksMissing && typeof translated === 'string' && translated) {
          return translated
        }

        return issue.defaultMessage || issue.key
      }

      if (shouldShowIssueToasts) {
        errors.forEach(error => {
          const message = resolveIssueMessage(error)
          this.showToast(message, 'error')
        })

        warnings.forEach(warning => {
          const message = resolveIssueMessage(warning)
          this.showToast(message, 'warning')
        })
      }

      // Refresh the label once translations resolve
      try {
        const translated = await this.request('i18n:translate', { key: cfg.textKey })
        if (typeof translated === 'string' && translated && translated !== cfg.textKey) {
          textEl.textContent = translated
        }
      } catch (_) {
        // Ignore translation failures - fallback text already applied
      }

      if (severity !== 'success' && (warnings.length || errors.length)) {
        ind.classList.add('clickable')
        ind.onclick = () => this.showValidationDetails()
      } else {
        ind.classList.remove('clickable')
        ind.onclick = null
      }
    })
  }

  // Get the currently selected key from cached state
  getSelectedKey() {
    const env = this.cache.currentEnvironment || 'space'
    return env === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey
  }

  // Get the current environment from cached state
  getCurrentEnvironment() {
    return this.cache.currentEnvironment || 'space'
  }

  // Get i18n message using request/response
  async getI18nMessage(key, params = {}) {
    try {
      return await this.request('i18n:translate', { key, params })
    } catch (error) {
      console.error('CommandUI: Failed to get i18n message:', error)
      return null
    }
  }

  
  // Confirm clearing the command chain for a key or alias
  async confirmClearChain(key) {
    if (!key) return
    
    const currentEnv = this.getCurrentEnvironment()
    const isAliasMode = currentEnv === 'alias'
    const itemType = isAliasMode ? 'alias' : 'key'
    
    try {
      const message = await this.getI18nMessage('confirm_clear_commands', { keyName: key }) || 
        `Clear command chain for ${itemType} ${key}?`
      const title = await this.getI18nMessage('confirm_clear') || 'Confirm Clear'
      
      // Check if confirmDialog is available
      if (!this.confirmDialog) {
        console.error('CommandUI: confirmDialog not available, cannot show confirmation dialog')
        await this.showToast('Confirmation dialog not available', 'error')
        return
      }
      
      if (await this.confirmDialog.confirm(message, title, 'warning')) {
        console.log(`[CommandUI] Requesting clear command chain for ${itemType}: "${key}" in env: "${currentEnv}"`)
        
        this.emit('command-chain:clear', { key })
      }
    } catch (error) {
      console.error('CommandUI: Failed to confirm clear chain:', error)
      // Show error toast to user when confirmation fails
      await this.showToast('Failed to show confirmation dialog', 'error')
    }
  }

  // Validate the current command chain
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

  // Filter commands by search term
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

  // Toggle command search functionality
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

  // Show the import from key or alias modal
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

  // Populate the import sources dropdown based on current environment
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
      // Get import sources from CommandService
      const sources = await this.request('command:get-import-sources', { 
        environment: currentEnv, 
        currentKey: currentKey 
      })
      
      // Populate the dropdown with sources
      sources.forEach(source => {
        const option = doc.createElement('option')
        option.value = source.value
        option.textContent = source.label
        select.appendChild(option)
      })
      
      // Add default option if no sources available
      if (sources.length === 0) {
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

  // Check if a command is compatible with the target environment
  async isCommandCompatible(commandName, targetEnvironment) {
    return await this.request('command:check-environment-compatibility', { 
      command: commandName, 
      environment: targetEnvironment 
    })
  }

  // Perform the import from the selected source
  async performImport() {
    const doc = this.document || (typeof window !== 'undefined' ? window.document : undefined)
    if (!doc) return

    const select = doc.getElementById('importSourceSelect')
    const clearCheckbox = doc.getElementById('clearDestinationBeforeImport')
    
    if (!select || !clearCheckbox) return
    
    const sourceValue = select.value
    const clearDestination = clearCheckbox.checked
    const targetKey = this.getSelectedKey()
    const currentEnv = this.getCurrentEnvironment()
    
    if (!sourceValue || !targetKey) {
      const message = await this.getI18nMessage('please_select_a_source') || 'Please select a source'
      await this.showToast(message, 'warning')
      return
    }
    
    try {
      // Delegate to CommandService for business logic
      const result = await this.request('command:import-from-source', {
        sourceValue,
        targetKey,
        clearDestination,
        currentEnvironment: currentEnv
      })
      
      // Handle success response
      if (result.success) {
        // Show warning for dropped commands if any
        if (result.droppedCount > 0) {
          const sourceEnvName = result.sourceType.charAt(0).toUpperCase() + result.sourceType.slice(1)
          const targetEnvName = currentEnv.charAt(0).toUpperCase() + currentEnv.slice(1)
          const message = await this.getI18nMessage('cross_environment_import_warning', {
            dropped: result.droppedCount,
            sourceEnv: sourceEnvName,
            targetEnv: targetEnvName
          }) || `Warning: ${result.droppedCount} ${sourceEnvName}-specific commands were dropped when importing to ${targetEnvName}`
          await this.showToast(message, 'warning')
        }
        
        // Success toast
        const successMsg = await this.getI18nMessage('commands_imported_successfully', {
          count: result.importedCount,
          source: result.sourceName
        }) || `Imported ${result.importedCount} commands from ${result.sourceName}`
        
        await this.showToast(successMsg, 'success')
        
        // Close modal
        if (this.modalManager) {
          this.modalManager.hide('importFromKeyOrAliasModal')
        }
      }
      
    } catch (error) {
      console.error('CommandUI: Failed to import commands:', error)
      
      // Handle specific error messages
      let message
      if (error.message === 'Source has no commands to import') {
        message = await this.getI18nMessage('source_has_no_commands') || 'Source has no commands to import'
      } else if (error.message === 'No compatible commands found for import') {
        message = await this.getI18nMessage('no_compatible_commands_to_import') || 'No compatible commands to import after filtering'
      } else {
        message = await this.getI18nMessage('import_failed', { error: error?.message || error }) || `Import failed: ${error?.message || error}`
      }
      
      await this.showToast(message, 'error')
    }
  }

  // Show modal with validation details (warnings/errors)
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
