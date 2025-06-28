import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'
import { parameterCommands } from './ParameterCommandUI.js'

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
  constructor ({ eventBus: bus = eventBus, ui = null, modalManager = null } = {}) {
    super(bus)
    this.componentName = 'CommandUI'
    this.ui           = ui || (typeof stoUI !== 'undefined' ? stoUI : null)
    this.modalManager = modalManager

    // REFACTORED: Cache UI state from broadcast events
    this._selectedKey = null
    this._selectedAlias = null
    this._currentEnvironment = 'space'
  }

  onInit () {
    this.setupEventListeners()
    this.setupUIStateEventListeners()

    // Listen for command:add events from CommandLibraryUI
    this.addEventListener('command:add', async (payload = {}) => {
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

          // Emit event for CommandService to handle - following broadcast pattern
          this.eventBus.emit('command:add', { command: commandDef, key: selectedKey })
        } catch (error) {
          console.error('CommandUI: Failed to handle static command:', error)
        }
      } else if (categoryId && commandId && commandDef) {
        // Customizable command - show parameter modal
        parameterCommands.showParameterModal(categoryId, commandId, commandDef)
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
  }

  setupEventListeners() {
    if (this.eventListenersSetup) {
      return
    }
    this.eventListenersSetup = true

    // Command management DOM events
    this.eventBus.onDom('addCommandBtn', 'click', 'command-add-modal', () => {
      this.modalManager.show('addCommandModal')
    })

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

    // Command search
    this.eventBus.onDom('commandSearch', 'input', 'command-search', (e) => {
      this.filterCommands(e.target.value)
    })

    // Command search button
    this.eventBus.onDom('commandSearchBtn', 'click', 'command-search-toggle', () => {
      this.toggleCommandSearch()
    })

    // Import from key button
    this.eventBus.onDom('importFromKeyBtn', 'click', 'import-from-key', () => {
      this.importFromKey()
    })

    // Save command button
    this.eventBus.onDom('saveCommandBtn', 'click', 'save-command', () => {
      this.saveCommand()
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
      return await request(this.eventBus, 'i18n:translate', { key, params })
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
        await request(this.eventBus, 'ui:show-toast', { message, type })
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
      const message = await this.getI18nMessage('confirm_clear_chain', { key }) || 
        `Clear command chain for ${key}?`
      
      if (confirm(message)) {
        this.eventBus.emit('command-chain:clear', { key })
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
      this.eventBus.emit('command-chain:validate', { key })
      
      try {
        // Show validation success toast
        const message = await this.getI18nMessage('command_chain_is_valid') || 'Command chain is valid'
        await this.showToast(message, 'success')
      } catch (error) {
        console.error('CommandUI: Failed to show validation toast:', error)
      }
    }
  }

  /**
   * Filter commands by search term
   */
  filterCommands(value) {
    this.eventBus.emit('command:filter', { filter: value })
  }

  /**
   * Toggle command search functionality
   */
  toggleCommandSearch() {
    const searchInput = this.document.getElementById('commandSearch')
    if (searchInput) {
      searchInput.focus()
      // If search is empty, show placeholder or help
      if (!searchInput.value) {
        searchInput.placeholder = 'Search commands...'
      }
    }
  }

  /**
   * Import commands from the selected key
   */
  async importFromKey() {
    const selectedKey = this.getSelectedKey()
    if (!selectedKey) {
      const message = await this.getI18nMessage('please_select_a_key_first') || 'Please select a key first'
      await this.showToast(message, 'warning')
      return
    }
    
    this.eventBus.emit('command:import-from-key', { key: selectedKey })
  }

  /**
   * Save the command from the add command modal
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
      const message = await this.getI18nMessage(msgKey) || 
        (env === 'alias' ? 'Please select an alias first' : 'Please select a key first')
      await this.showToast(message, 'warning')
      return
    }

    // Emit command save event
    this.eventBus.emit('command:save', {
      key: selectedKey,
      type: commandType,
      command: commandPreview
    })

    // Close modal
    if (this.modalManager) {
      this.modalManager.hide('addCommandModal')
    }
  }
} 