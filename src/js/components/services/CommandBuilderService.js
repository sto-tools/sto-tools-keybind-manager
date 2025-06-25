import ComponentBase from '../ComponentBase.js'
import TrayCommandService from './TrayCommandService.js'
import CombatCommandService from './CombatCommandService.js'
import CommunicationCommandService from './CommunicationCommandService.js'

/**
 * CommandBuilderService – thin coordinator that exposes a unified
 * `build(category, commandId, params)` API.  The heavy-lifting is delegated
 * to dedicated category services (Tray/Combat/Communication for now).
 *
 * The intent is to progressively migrate ALL command-building logic out of
 * the legacy `src/js/features/commands.js` file into small, focussed service
 * classes that extend `ComponentBase` and contain **no UI concerns**.
 */
export default class CommandBuilderService extends ComponentBase {
  constructor ({ eventBus } = {}) {
    super(eventBus)

    // Instantiate specialised category services. Additional categories will
    // be added as the migration progresses.
    this.trayService           = new TrayCommandService({ eventBus })
    this.combatService         = new CombatCommandService({ eventBus })
    this.communicationService  = new CommunicationCommandService({ eventBus })

    // Registry so external callers can list supported categories or implement
    // dynamic routing without a switch-statement.
    this.builders = new Map([
      ['tray',          this.trayService],
      ['combat',        this.combatService],
      ['communication', this.communicationService],
    ])
  }

  /**
   * Build a command definition.
   *
   * @param {string} category   – command category (e.g., "tray", "combat").
   * @param {string} commandId  – id within the STO_DATA taxonomy.
   * @param {object} params     – free-form params object accepted by the
   *                              specific category service.
   * @returns {object|object[]} – single command or array of commands depending
   *                              on the category/commandId, or `null` if the
   *                              category is unknown or build fails.
   */
  build (category, commandId, params = {}) {
    const service = this.builders.get(category)
    if (!service || typeof service.build !== 'function') return null
    return service.build(commandId, params)
  }

  /**
   * Convenience helper returning a plain object of supported categories so
   * UI layers can easily iterate over them.
   */
  getSupportedCategories () {
    return Array.from(this.builders.keys())
  }
} 