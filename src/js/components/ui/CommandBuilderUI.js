import ComponentBase from '../ComponentBase.js'

/**
 * CommandBuilderUI – Placeholder implementation for the ongoing refactor.
 *
 * The original UI generation lived inside `STOCommandManager`. During the
 * first stage of the migration we only need *some* implementation so that
 * future callers can reference `createXUI()` methods without crashing. The
 * UI itself will be fully ported in a follow-up task.
 */
export default class CommandBuilderUI extends ComponentBase {
  constructor ({ eventBus } = {}) {
    super(eventBus)
  }

  createTargetingUI () {
    return '<div class="command-builder-targeting"><select><option>Placeholder</option></select></div>'
  }

  createTrayUI () {
    return '<div class="command-builder-tray">Tray UI placeholder</div>'
  }

  createCommunicationUI () {
    return '<div class="command-builder-communication"><input type="text" placeholder="Enter message"></div>'
  }

  // Additional category UIs can be added incrementally.
} 