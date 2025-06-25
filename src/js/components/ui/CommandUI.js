import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { parameterCommands } from './ParameterCommandUI.js'

/**
 * CommandUI – owns the parameter-editing modal and acts as the bridge between
 * UI interactions (coming from CommandLibraryUI) and CommandService.
 *
 * Responsibilities:
 * 1. Listen for `command:add` events emitted by CommandLibraryUI when the user
 *    selects a command from the library.
 * 2. For customizable commands, delegate to `parameterCommands.showParameterModal`
 *    to show the parameter configuration modal.
 * 3. For static commands, call `commandService.addCommand` immediately.
 * 4. Ensure `parameterCommands` has access to `commandService` so that when
 *    the user clicks "Save" the finished command is persisted.
 */
export default class CommandUI extends ComponentBase {
  constructor ({ eventBus: bus = eventBus, ui = null, modalManager = null, commandService = null, commandLibraryService = null } = {}) {
    super(bus)
    this.ui           = ui || (typeof stoUI !== 'undefined' ? stoUI : null)
    this.modalManager = modalManager
    this.commandService = commandService
    this.commandLibraryService = commandLibraryService
  }

  onInit () {
    // Provide commandService to parameterCommands so that save logic uses it.
    if (this.commandService) {
      parameterCommands.commandService = this.commandService
    }
    if (this.commandLibraryService) {
      parameterCommands.commandLibraryService = this.commandLibraryService
    }

    // Listen for command:add events from CommandLibraryUI
    this.addEventListener('command:add', (payload = {}) => {
      const { categoryId, commandId, commandDef } = payload

      if (commandDef && !categoryId && !commandId) {
        // Static command - add immediately using commandService.  We use the
        // most recently selected key from the event bus (cached on
        // `commandService`) but fall back to the payload if available.
        const selKey = this.commandService?.selectedKey || this.commandLibraryService?.selectedKey
        if (!selKey) {
          // Decide message based on current environment – alias vs keybinds
          const env = this.commandService?.currentEnvironment || this.commandLibraryService?.currentEnvironment
          const msgKey = env === 'alias' ? 'please_select_an_alias_first' : 'please_select_a_key_first'

          this.ui?.showToast?.(
            (this.commandService?.i18n?.t?.(msgKey)) ||
            (env === 'alias' ? 'Please select an alias first' : 'Please select a key first'),
            'warning'
          )
          return
        }
        this.commandService.addCommand(selKey, commandDef)
      } else if (categoryId && commandId && commandDef) {
        // Customizable command - show parameter modal
        parameterCommands.showParameterModal(categoryId, commandId, commandDef)
      }
    })
  }
} 