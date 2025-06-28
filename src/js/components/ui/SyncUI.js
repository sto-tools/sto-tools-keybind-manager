import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'
import i18next from 'i18next'

export default class SyncUI extends ComponentBase {
  constructor({ ui = null } = {}) {
    super(eventBus)
    this.componentName = 'SyncUI'
    this.ui = ui
  }

  init() {
    const btn = document.getElementById('syncNowBtn')
    if (btn) {
      btn.addEventListener('click', async () => {
        this.ui?.showToast(i18next.t('syncing'), 'info')
        // Use request/response instead of direct service call
        await request(eventBus, 'sync:sync-project')
      })
    }
  }
} 