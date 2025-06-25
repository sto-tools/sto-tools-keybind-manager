import eventBus from '../../core/eventBus.js'
import i18next from 'i18next'

export default class SyncUI {
  constructor({ service, ui } = {}) {
    this.service = service
    this.ui = ui
  }

  init() {
    const btn = document.getElementById('syncNowBtn')
    if (btn) {
      btn.addEventListener('click', async () => {
        if (!this.service) return
        this.ui?.showToast(i18next.t('syncing'), 'info')
        await this.service.syncProject()
      })
    }
  }
} 