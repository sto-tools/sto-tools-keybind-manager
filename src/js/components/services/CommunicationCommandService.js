import ComponentBase from '../ComponentBase.js'

export default class CommunicationCommandService extends ComponentBase {
  constructor ({ eventBus } = {}) {
    super(eventBus)
    this.componentName = 'CommunicationCommandService'
  }

  build (commandId, params = {}) {
    const cmdDef = globalThis.STO_DATA?.commands?.communication?.commands?.[commandId]
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
  }
} 