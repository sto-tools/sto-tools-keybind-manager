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
    this.setupEventListeners()
  }

  setupEventListeners() {
    // Listen for sync:sync-now event from HeaderMenuUI (manual sync)
    this.eventBus.on('sync:sync-now', () => {
      this.performSync('manual')
    })

    // Note: Direct button click handler removed to avoid duplicate syncs
    // HeaderMenuUI now handles the button click and emits sync:sync-now
  }

  async performSync(source = 'manual') {
    this.ui?.showToast(i18next.t('syncing'), 'info')
    // Pass the source context to sync service
    await this.request('sync:sync-project', { source })
  }
} 