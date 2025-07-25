import ComponentBase from '../ComponentBase.js'

import i18next from 'i18next'
import eventBus from '../../core/eventBus.js'
import FileSystemService, {
  writeFile as fsWriteFile,
  KEY_SYNC_FOLDER,
} from './FileSystemService.js'

// Re-export the helper so existing imports (especially tests) continue to work
export const writeFile = fsWriteFile

export default class SyncService extends ComponentBase {
  constructor({ eventBus, storage, ui, fs } = {}) {
    super(eventBus)
    this.componentName = 'SyncService'

    this.storage = storage
    this.ui = ui
    this.fs = fs || new FileSystemService({ eventBus })

    // Ensure FileSystemService instance
    if (!this.fs) this.fs = new FileSystemService({ eventBus })

    // Register Request/Response endpoints for UI components
    if (this.eventBus) {
      this.respond('sync:sync-project', ({ source } = {}) => this.syncProject(source))
      this.respond('sync:set-sync-folder', ({ autoSync } = {}) => this.setSyncFolder(autoSync))
      this.respond('sync:get-sync-folder-handle', () => this.getSyncFolderHandle())
    }
  }

  // Set sync folder and optionally enable auto-sync
  async setSyncFolder(autoSync = false) {
    try {
      let handle, folderName

      // Check if File System Access API is supported (Chromium browsers)
      if ('showDirectoryPicker' in window) {
        handle = await window.showDirectoryPicker()
        await this.fs.saveDirectoryHandle(KEY_SYNC_FOLDER, handle)
        folderName = handle.name
      } else {
        // Firefox doesn't support File System Access API
        this.ui?.showToast(i18next.t('sync_not_supported_firefox'), 'error')
        
        // Show a more detailed explanation using inform dialog (OK button only)
        if (typeof window !== 'undefined' && window.confirmDialog && window.confirmDialog.inform) {
          await window.confirmDialog.inform(
            i18next.t('sync_not_supported_detailed'),
            i18next.t('sync_not_supported_title'),
            'info'
          )
        }
        
        return null
      }

      if (this.storage) {
        const settings = this.storage.getSettings()
        settings.syncFolderName = folderName
        settings.syncFolderPath = `Selected folder: ${folderName}`
        settings.syncFolderFallback = false
        settings.autoSync = autoSync
        this.storage.saveSettings(settings)
      }
      this.ui?.showToast(i18next.t('sync_folder_set'), 'success')
      this.emit('sync:folder-set', { handle })
      return handle
    } catch (err) {
      if (err?.name !== 'AbortError') {
        this.ui?.showToast(i18next.t('failed_to_set_sync_folder', { error: err.message }), 'error')
      }
      return null
    }
  }

  async getSyncFolderHandle() {
    try {
      return await this.fs.getDirectoryHandle(KEY_SYNC_FOLDER)
    } catch (err) {
      console.error('[SyncService] getSyncFolderHandle failed', err)
      return null
    }
  }

  async ensurePermission(handle) {
    if (!handle) return false
    try {
      const opts = { mode: 'readwrite' }
      const perm = await handle.queryPermission(opts)
      if (perm === 'granted') return true
      const req = await handle.requestPermission(opts)
      return req === 'granted'
    } catch (err) {
      console.error('[SyncService] ensurePermission failed', err)
      return false
    }
  }

  async syncProject(source = 'auto') {
    const handle = await this.getSyncFolderHandle()
    if (!handle) {
      this.ui?.showToast(i18next.t('no_sync_folder_selected'), 'warning')
      return
    }
    const allowed = await this.ensurePermission(handle)
    if (!allowed) {
      this.ui?.showToast(i18next.t('permission_denied_to_folder'), 'error')
      return
    }
    try {
      // Use request/response system instead of global window.stoExport
      await this.request('export:sync-to-folder', { dirHandle: handle })

      // Determine when to show success toast:
      // - Always show on manual sync (sync now button)
      // - Show on time-based auto sync (e.g., "every 30 seconds")  
      // - Don't show on change-based auto sync ("after every change")
      const settings = this.storage?.getSettings() || {}
      const isAutoSyncEnabled = settings.autoSync
      const autoSyncInterval = settings.autoSyncInterval || 'change'
      const isChangeBasedAutoSync = isAutoSyncEnabled && autoSyncInterval === 'change'
      const shouldShowToast = source === 'manual' || (source === 'auto' && !isChangeBasedAutoSync)
      
      if (shouldShowToast) {
        this.ui?.showToast(i18next.t('project_synced_successfully'), 'success')
      }

      eventBus.emit('project-synced')
    } catch (err) {
      this.ui?.showToast(i18next.t('failed_to_sync_project', { error: err.message }), 'error')
    }
  }

} 