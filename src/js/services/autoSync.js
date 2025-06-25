// STO Tools Keybind Manager - Auto Sync Manager
// Handles automatic synchronization of project data

import eventBus from '../core/eventBus.js'
import i18next from 'i18next'

export default class STOAutoSyncManager {
  constructor() {
    this.isEnabled = false
    this.interval = null
    this.syncInterval = null
    this.lastSync = null
  }

  init() {
    this.setupAutoSync()
  }

  setupAutoSync() {
    try {
      if (typeof storageService === 'undefined') {
        console.warn('storageService not available yet, deferring auto-sync setup')
        return
      }

      const settings = storageService.getSettings()
      
      if (settings.autoSync) {
        this.enable(settings.autoSyncInterval || 'change')
      }
    } catch (error) {
      console.error('Failed to setup auto-sync:', error)
    }
  }

  enable(interval = 'change') {
    this.disable() // Clear any existing sync

    this.isEnabled = true
    this.interval = interval

    if (interval === 'change') {
      // Listen for data changes
      eventBus.on('storage:data-changed', () => {
        this.sync()
      })
    } else {
      // Set up interval-based sync
      const intervalMs = parseInt(interval) * 1000
      this.syncInterval = setInterval(() => {
        this.sync()
      }, intervalMs)
    }

    // Save the setting
    if (typeof storageService !== 'undefined') {
      const settings = storageService.getSettings()
      settings.autoSync = true
      settings.autoSyncInterval = interval
      storageService.saveSettings(settings)
    }
  }

  disable() {
    this.isEnabled = false

    // Remove event listeners
    eventBus.off('storage:data-changed', this.sync)

    // Clear interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }

    // Save the setting
    if (typeof storageService !== 'undefined') {
      const settings = storageService.getSettings()
      settings.autoSync = false
      storageService.saveSettings(settings)
    }
  }

  async sync() {
    if (!this.isEnabled || !window.stoSync) {
      return
    }

    try {
      await window.stoSync.syncProject()
      this.lastSync = new Date()
    } catch (error) {
      console.error('Auto-sync failed:', error)
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

  // Public methods for manual control

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
      isEnabled: this.isEnabled,
      interval: this.interval,
      pendingChanges: this.pendingChanges,
      lastSyncTime: this.lastSync,
      lastSync: this.lastSync,
      timerActive: !!this.syncTimer
    }
  }

  // Force an immediate sync (for testing or manual triggers)
  async forcSync() {
    this.pendingChanges = true
    await this.performAutoSync()
  }
} 