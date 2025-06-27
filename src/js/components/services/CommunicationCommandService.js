import ComponentBase from '../ComponentBase.js'
import { request } from '../../core/requestResponse.js'

export default class CommunicationCommandService extends ComponentBase {
  constructor ({ eventBus } = {}) {
    super(eventBus)
    this.componentName = 'CommunicationCommandService'
  }

  async build (commandId, params = {}) {
    try {
      const cmdDef = await request(this.eventBus, 'data:get-command-definition', { 
        categoryId: 'communication', 
        commandId 
      })
      if (!cmdDef) return null

      const message = params.message ?? 'Message text here'

      return {
        command: `${cmdDef.command} ${message}`,
        type: 'communication',
        icon: cmdDef.icon,
        text: `${cmdDef.name}: ${message}`,
        description: cmdDef.description,
        parameters: { message },
      }
    } catch (error) {
      // Fallback if DataService not available
      return null
    }
  }
} 