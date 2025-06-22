// STO Tools Keybind Manager - Auto Sync Manager
// Handles automatic synchronization based on user preferences

import eventBus from '../core/eventBus.js'
import i18next from 'i18next'

export default class STOAutoSyncManager {
  constructor() {
    this.syncTimer = null
    this.pendingChanges = false
    this.lastSyncTime = null
    this.isEnabled = false
    this.interval = 'change' // 'change', '60', '120', '300' (seconds)
  }

  init() {
    this.loadSettings()
    this.setupEventListeners()
    this.updateAutoSync()
  }

  loadSettings() {
    if (typeof stoStorage === 'undefined') {
      console.warn('stoStorage not available yet, deferring auto-sync setup')
      return
    }
    
    const settings = stoStorage.getSettings()
    this.isEnabled = settings.autoSync || false
    this.interval = settings.autoSyncInterval || 'change'
  }

  setupEventListeners() {
    // Listen for data changes that should trigger auto-sync
    eventBus.on('profile-modified', () => {
      this.onDataChange()
    })

    eventBus.on('keybind-modified', () => {
      this.onDataChange()
    })

    eventBus.on('alias-modified', () => {
      this.onDataChange()
    })

    eventBus.on('command-modified', () => {
      this.onDataChange()
    })

    // Listen for manual save/sync to reset pending changes
    eventBus.on('project-saved', () => {
      this.onManualSave()
    })

    eventBus.on('project-synced', () => {
      this.onManualSave()
    })
  }

  onDataChange() {
    if (!this.isEnabled) return

    this.pendingChanges = true

    if (this.interval === 'change') {
      // Sync immediately after every change
      this.performAutoSync()
    } else {
      // Schedule sync for later if not already scheduled
      this.scheduleSync()
    }
  }

  onManualSave() {
    this.pendingChanges = false
    this.clearSyncTimer()
  }

  scheduleSync() {
    // Don't schedule if already scheduled
    if (this.syncTimer) return

    const intervalMs = parseInt(this.interval) * 1000
    this.syncTimer = setTimeout(() => {
      this.performAutoSync()
    }, intervalMs)
  }

  clearSyncTimer() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
      this.syncTimer = null
    }
  }

  async performAutoSync() {
    if (!this.isEnabled || !this.pendingChanges) return

    // Check if sync folder is configured
    if (typeof stoSync === 'undefined') {
      console.warn('Sync manager not available')
      return
    }

    const handle = await stoSync.getSyncFolderHandle()
    if (!handle) {
      console.warn('No sync folder configured for auto-sync')
      return
    }

    try {
      // Update the modified indicator to show syncing
      this.updateModifiedIndicator('syncing')

      // Perform the sync
      await stoSync.syncProject()

      // Mark changes as synced
      this.pendingChanges = false
      this.lastSyncTime = new Date()

      // Update the modified indicator to show synced
      this.updateModifiedIndicator('synced')

      // Only show toast notification for interval-based syncs, not for immediate syncs (change-based)
      // The sync indicator in the toolbar will show the sync status for immediate syncs
      if (this.interval !== 'change' && typeof stoUI !== 'undefined') {
        stoUI.showToast(i18next.t('auto_sync_completed'), 'success')
      }

      // Clear the timer
      this.clearSyncTimer()

      // Emit event for other components
      eventBus.emit('auto-sync-completed', { timestamp: this.lastSyncTime })

    } catch (error) {
      console.error('Auto-sync failed:', error)
      this.updateModifiedIndicator('error')
      
      // Don't show error toast for immediate sync to avoid spam
      if (this.interval !== 'change' && typeof stoUI !== 'undefined') {
        stoUI.showToast(i18next.t('auto_sync_failed', {error: error.message}), 'error')
      }
    }
  }

  updateModifiedIndicator(state) {
    const indicator = document.getElementById('modifiedIndicator')
    if (!indicator) return

    // Remove all state classes
    indicator.classList.remove('syncing', 'synced', 'error')

    switch (state) {
      case 'syncing':
        indicator.style.display = 'inline'
        indicator.classList.add('syncing')
        indicator.innerHTML = '<i class="fas fa-sync fa-spin"></i> Syncing...'
        break
      case 'synced':
        indicator.style.display = 'inline'
        indicator.classList.add('synced')
        indicator.innerHTML = '<i class="fas fa-check"></i> Synced'
        // Hide the synced indicator after 2 seconds
        setTimeout(() => {
          if (indicator.classList.contains('synced')) {
            indicator.style.display = 'none'
            indicator.classList.remove('synced')
          }
        }, 2000)
        break
      case 'error':
        indicator.style.display = 'inline'
        indicator.classList.add('error')
        indicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Sync Error'
        // Hide the error indicator after 5 seconds
        setTimeout(() => {
          if (indicator.classList.contains('error')) {
            indicator.style.display = 'none'
            indicator.classList.remove('error')
          }
        }, 5000)
        break
      default:
        // Reset to normal modified state
        indicator.style.display = 'none'
        indicator.innerHTML = ''
    }
  }

  updateAutoSync() {
    this.loadSettings()
    
    if (this.isEnabled) {
      // console.log(`Auto-sync enabled with interval: ${this.interval}`)
      // If we have pending changes and sync is now enabled, schedule sync
      if (this.pendingChanges && this.interval !== 'change') {
        this.scheduleSync()
      }
    } else {
      // console.log('Auto-sync disabled')
      this.clearSyncTimer()
    }
  }

  // Public methods for manual control
  enable() {
    this.isEnabled = true
    this.updateAutoSync()
  }

  disable() {
    this.isEnabled = false
    this.clearSyncTimer()
  }

  setInterval(interval) {
    this.interval = interval
    this.clearSyncTimer()
    if (this.isEnabled && this.pendingChanges && interval !== 'change') {
      this.scheduleSync()
    }
  }

  // Get status information
  getStatus() {
    return {
      enabled: this.isEnabled,
      interval: this.interval,
      pendingChanges: this.pendingChanges,
      lastSyncTime: this.lastSyncTime,
      timerActive: !!this.syncTimer
    }
  }

  // Force an immediate sync (for testing or manual triggers)
  async forcSync() {
    this.pendingChanges = true
    await this.performAutoSync()
  }
} 