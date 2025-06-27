import ComponentBase from '../ComponentBase.js'
import { request } from '../../core/requestResponse.js'

export default class CombatCommandService extends ComponentBase {
  constructor ({ eventBus } = {}) {
    super(eventBus)
    this.componentName = 'CombatCommandService'
  }

  /**
   * Build a combat command. Mirrored from legacy STOCommandManager implementation.
   */
  async build (commandId, params = {}) {
    try {
      const cmdDef = await request(this.eventBus, 'data:get-command-definition', { 
        categoryId: 'combat', 
        commandId 
      })
      if (!cmdDef) return null

      // Customisable combat commands ---------------------------------------
      if (cmdDef.customizable && cmdDef.parameters) {
        // Start with the template command string.
        let command = cmdDef.command

        // Replace parameters in the template using either provided params or default values.
        Object.entries(cmdDef.parameters).forEach(([paramName, paramConfig]) => {
          const value = params[paramName] ?? paramConfig.default ?? ''
          command = command.replace(`{{${paramName}}}`, value)
        })

        return {
          command,
          type: 'combat',
          icon: cmdDef.icon,
          text: cmdDef.name,
          description: cmdDef.description,
          environment: cmdDef.environment,
          parameters: params,
        }
      }

      // Static combat command ---------------------------------------------
      return {
        command: cmdDef.command,
        type: 'combat',
        icon: cmdDef.icon,
        text: cmdDef.name,
        description: cmdDef.description,
        environment: cmdDef.environment,
      }
    } catch (error) {
      // Fallback if DataService not available
      return null
    }
  }
} 