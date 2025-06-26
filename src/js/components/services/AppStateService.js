import ComponentBase from '../ComponentBase.js'
import { request, respond } from '../../core/requestResponse.js'
import eventBus from '../../core/eventBus.js'

/**
 * AppStateService – aggregates commonly-needed state data so UIs can fetch
 * everything in a single request:  await request(eventBus,'state:snapshot').
 */
export default class AppStateService extends ComponentBase {
  constructor ({ eventBusInstance = eventBus } = {}) {
    super(eventBusInstance)

    // Single snapshot responder
    respond(this.eventBus, 'state:snapshot', async () => {
      const [environment, selectedKey, selectedAlias, profile] = await Promise.all([
        request(this.eventBus, 'state:current-environment'),
        request(this.eventBus, 'key:get-selected-name'),
        request(this.eventBus, 'alias:get-selected-name'),
        request(this.eventBus, 'profile:get-current'),
      ])

      return {
        environment,
        selectedKey,
        selectedAlias,
        profileId,
      }
    })
  }

  // No further lifecycle needed
} 