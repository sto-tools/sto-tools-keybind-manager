import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { parameterCommands } from '../../features/parameterCommands.js'

/**
 * CommandUI – owns the parameter-editing modal and acts as the bridge between
 * UI interactions (coming from CommandLibraryService) and CommandService.
 *
 * Responsibilities:
 * 1. Listen for `show-parameter-modal` events emitted by
 *    CommandLibraryService when the user selects a customisable command.
 * 2. Delegate to `parameterCommands.showParameterModal`, which already
 *    contains all the logic for building the modal DOM.
 * 3. Ensure `parameterCommands` has access to `commandService` so that when
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

    // Listen for request to display parameter modal.
    this.addEventListener('show-parameter-modal', ({ categoryId, commandId, commandDef }) => {
      if (!categoryId || !commandId || !commandDef) return
      parameterCommands.showParameterModal(categoryId, commandId, commandDef)
    })
  }
} 