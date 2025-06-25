import ComponentBase from '../ComponentBase.js'

/**
 * AutoSync – watches for storage changes and triggers stoSync operations.
 */
export default class AutoSync extends ComponentBase {
  constructor({ eventBus, storage, syncManager, ui } = {}) {
    super(eventBus)
    this.storage     = storage
    this.syncManager = syncManager // instance of STOSyncManager
    this.ui          = ui

    // prefs
    this.isEnabled   = false
    this.interval    = 'change' // 'change' or seconds string
    this._intervalId = null
    this.lastSync    = null

    // Bind for off()
    this._onStorageChange = () => this.sync()
  }

  onInit() {
    this.setupFromSettings()
  }

  /* --------------------------------------------------
   * Setup helpers
   * ------------------------------------------------ */
  setupFromSettings() {
    if (!this.storage) return
    const settings = this.storage.getSettings()
    if (settings.autoSync) {
      this.enable(settings.autoSyncInterval || 'change')
    }
  }

  /* --------------------------------------------------
   * Enable / disable
   * ------------------------------------------------ */
  enable(interval = 'change') {
    this.disable()
    this.isEnabled = true
    this.interval  = interval

    if (interval === 'change') {
      this.eventBus.on('storage:data-changed', this._onStorageChange)
    } else {
      const ms = parseInt(interval, 10) * 1000
      this._intervalId = setInterval(() => this.sync(), ms)
    }

    // Persist
    this._persistSettings(true)
  }

  disable() {
    this.isEnabled = false
    this.eventBus.off('storage:data-changed', this._onStorageChange)
    if (this._intervalId) {
      clearInterval(this._intervalId)
      this._intervalId = null
    }

    this._persistSettings(false)
  }

  _persistSettings(enabled) {
    if (!this.storage) return
    const s = this.storage.getSettings()
    s.autoSync = enabled
    if (enabled) s.autoSyncInterval = this.interval
    this.storage.saveSettings(s)
  }

  /* --------------------------------------------------
   * Sync
   * ------------------------------------------------ */
  async sync() {
    if (!this.isEnabled || !this.syncManager) return
    try {
      await this.syncManager.syncProject()
      this.lastSync = new Date()
      this._updateIndicator('synced')
    } catch (err) {
      console.error('[AutoSync] sync failed', err)
      this._updateIndicator('error')
    }
  }

  /* --------------------------------------------------
   * Status helpers
   * ------------------------------------------------ */
  getStatus() {
    return {
      enabled: this.isEnabled,
      interval: this.interval,
      lastSync: this.lastSync,
    }
  }

  /* --------------------------------------------------
   * UI indicator (optional)
   * ------------------------------------------------ */
  _updateIndicator(state) {
    if (!this.ui || typeof document === 'undefined') return
    const indicator = document.getElementById('modifiedIndicator')
    if (!indicator) return

    indicator.classList.remove('syncing','synced','error')
    switch(state) {
      case 'synced':
        indicator.style.display='inline'
        indicator.classList.add('synced')
        indicator.innerHTML='<i class="fas fa-check"></i> Synced'
        setTimeout(()=>{ indicator.style.display='none'; indicator.classList.remove('synced') },2000)
        break
      case 'error':
        indicator.style.display='inline'
        indicator.classList.add('error')
        indicator.innerHTML='<i class="fas fa-exclamation-triangle"></i> Sync Error'
        setTimeout(()=>{ indicator.style.display='none'; indicator.classList.remove('error') },5000)
        break
    }
  }
} 