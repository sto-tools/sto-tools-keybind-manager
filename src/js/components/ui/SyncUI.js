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
    // Listen for sync:sync-now event from HeaderMenuUI
    this.eventBus.on('sync:sync-now', () => {
      this.performSync()
    })

    // Direct button click handler (keeping for backward compatibility)
    const btn = document.getElementById('syncNowBtn')
    if (btn) {
      btn.addEventListener('click', () => {
        this.performSync()
      })
    }
  }

  async performSync() {
    this.ui?.showToast(i18next.t('syncing'), 'info')
    // Use request/response instead of direct service call
    await this.request('sync:sync-project')
  }
} 