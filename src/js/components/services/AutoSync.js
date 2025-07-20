import ComponentBase from '../ComponentBase.js'

/**
 * AutoSync – watches for storage changes and triggers stoSync operations.
 */
export default class AutoSync extends ComponentBase {
  constructor({ eventBus, storage, syncManager, ui } = {}) {
    super(eventBus)
    this.componentName = 'AutoSync'
    this.storage     = storage
    this.syncManager = syncManager // instance of SyncService
    this.ui          = ui
    this.isEnabled   = false
    this.interval    = 'change' // 'change' or seconds string
    this._intervalId = null
    this.lastSync    = null

    // Debouncing for change-based sync to prevent multiple rapid syncs
    this._syncDebounceTimeout = null
    this._syncDebounceDelay = 500 // 500ms debounce delay

    // Bind for off()
    this._onStorageChange = () => this.debouncedSync()
    
    // Listen for preferences changes
    this.setupPreferencesListeners()
  }

  onInit() {
    this.setupFromSettings()
  }

  // Setup helpers
  setupPreferencesListeners() {
    // Listen for AutoSync settings changes from PreferencesUI
    this.eventBus.on('preferences:autosync-settings-changed', () => {
      this.setupFromSettings()
    })
    
    // Listen for individual setting changes
    this.eventBus.on('preferences:changed', (data) => {
      // Handle both single-setting changes and bulk changes
      const changes = data.changes || { [data.key]: data.value }
      
      if (changes.autoSync !== undefined || changes.autoSyncInterval !== undefined) {
        this.setupFromSettings()
      }
      
      // Trigger immediate sync for any preference change if sync is enabled
      if (this.isEnabled) {
        console.log('[AutoSync] Preference setting changed, triggering immediate sync')
        this.sync()
      }
    })
  }

  setupFromSettings() {
    if (!this.storage) return
    const settings = this.storage.getSettings()
    if (settings.autoSync) {
      this.enable(settings.autoSyncInterval || 'change')
    } else {
      this.disable()
    }
  }

  // Enable / disable
  enable(interval = 'change') {
    this.disable()
    this.isEnabled = true
    this.interval  = interval

    if (interval === 'change') {
      this.eventBus.on('storage:data-changed', this._onStorageChange)
    } else {
      // Validate interval is a valid positive number
      const parsedInterval = parseInt(interval, 10)
      if (isNaN(parsedInterval) || parsedInterval <= 0) {
        console.warn(`[AutoSync] Invalid interval '${interval}', falling back to 'change' mode`)
        this.interval = 'change'
        this.eventBus.on('storage:data-changed', this._onStorageChange)
      } else {
        const ms = parsedInterval * 1000
        this._intervalId = setInterval(() => this.sync(), ms)
      }
    }

    // Don't persist here to avoid circular updates
    console.log(`[AutoSync] Enabled with interval: ${this.interval}`)
  }

  disable() {
    this.isEnabled = false
    this.eventBus.off('storage:data-changed', this._onStorageChange)
    if (this._intervalId) {
      clearInterval(this._intervalId)
      this._intervalId = null
    }

    // Clear any pending debounced sync
    if (this._syncDebounceTimeout) {
      clearTimeout(this._syncDebounceTimeout)
      this._syncDebounceTimeout = null
    }
    
    console.log('[AutoSync] Disabled')
  }

  _persistSettings(enabled) {
    if (!this.storage) return
    const s = this.storage.getSettings()
    s.autoSync = enabled
    if (enabled) s.autoSyncInterval = this.interval
    this.storage.saveSettings(s)
  }

  // Debounced sync for change-based mode
  debouncedSync() {
    // Clear any existing timeout
    if (this._syncDebounceTimeout) {
      clearTimeout(this._syncDebounceTimeout)
    }

    // Set a new timeout to trigger sync after debounce delay
    this._syncDebounceTimeout = setTimeout(() => {
      this._syncDebounceTimeout = null
      this.sync()
    }, this._syncDebounceDelay)
  }

  // Sync
  async sync() {
    if (!this.isEnabled || !this.syncManager) return
    try {
      await this.syncManager.syncProject('auto')
      this.lastSync = new Date()
      this._updateIndicator('synced')
    } catch (err) {
      console.error('[AutoSync] sync failed', err)
      this._updateIndicator('error')
    }
  }

  // Status helpers
  getStatus() {
    return {
      enabled: this.isEnabled,
      interval: this.interval,
      lastSync: this.lastSync,
    }
  }

  // UI indicator (optional)
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