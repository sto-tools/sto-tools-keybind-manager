import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { respond } from '../../core/requestResponse.js'

const STO_DATA = globalThis.STO_DATA || {}

/**
 * ProjectManagementService – Handles import / export of complete project data and
 * keybind files.  Provides both an OO interface and legacy functional wrappers
 * for mix-in compatibility while the codebase migrates to service instances.
 */
export default class ProjectManagementService extends ComponentBase {
  constructor({
    storage = null,
    ui = null,
    app = null,
    eventBus = null,
    i18n = null
  } = {}) {
    super(eventBus)
    this.componentName = 'ProjectManagementService'

    this.storage = storage
    this.ui = ui
    this.i18n = i18n
    this.app = app

    // Only setup event handlers if eventBus is available
    if (this.eventBus) {
      this.setupEventHandlers()
      this.setupRequestHandlers()
    }
  }

  onInit() {
    console.log('[ProjectManagementService] Initialized and ready')
  }

  setupEventHandlers() {
    // Listen for backup/restore application state events from HeaderMenuUI
    this.eventBus.on('project:save', () => {
      this.backupApplicationState()
    })
    
    this.eventBus.on('project:open', () => {
      this.restoreApplicationState()
    })
  }

  setupRequestHandlers() {
    // Expose a unified restore endpoint for other services (e.g., SyncService)
    this.respond('project:restore-from-content', async ({ content, fileName } = {}) => {
      console.log('[ProjectManagementService] request project:restore-from-content', { fileName, size: content?.length })
      return await this.restoreFromProjectContent(content, fileName)
    })
  }

  // Backup & Restore Application State (same format as sync folder)
  async backupApplicationState() {
    try {
      const data = this.storage.getAllData()
      
      // Use the same project.json format as sync folder
      const projectData = {
        version: STO_DATA?.settings?.version || '1.0.0',
        exported: new Date().toISOString(),
        type: 'project',
        data: {
          profiles: data.profiles || {},
          settings: data.settings || {},
          currentProfile: data.currentProfile
        }
      }

      const jsonContent = JSON.stringify(projectData, null, 2)
      const blob = new Blob([jsonContent], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      
      const timestamp = new Date().toISOString().split('T')[0] // YYYY-MM-DD
      const filename = `STO_Tools_Backup_${timestamp}.json`
      
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      this.ui?.showToast(
        this.i18n.t('backup_created_successfully'),
        'success'
      )
      
      this.emit('project-backup-created', { filename, data: projectData })
      return { success: true, filename }
    } catch (error) {
      console.error('[ProjectManagementService] backupApplicationState failed', error)
      this.ui?.showToast(
        this.i18n.t('failed_to_create_backup', { error: error.message }),
        'error'
      )
      this.emit('project-backup-failed', { error })
      return { success: false, error: error.message }
    }
  }

  async restoreApplicationState() {
    try {
      // Create file input element
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json,application/json'
      
      return new Promise((resolve, reject) => {
        input.onchange = async (event) => {
          try {
            const file = event.target.files[0]
            if (!file) {
              resolve({ success: false, cancelled: true })
              return
            }

            const text = await file.text()
            console.log('[ProjectManagementService] restoreApplicationState: file selected', { name: file.name, size: text.length })
            const outcome = await this.restoreFromProjectContent(text, file.name)
            resolve(outcome)
          } catch (error) {
            console.error('[ProjectManagementService] restoreApplicationState failed:', error)
            this.ui?.showToast(
              this.i18n.t('backup_restore_failed', { error: error.message }),
              'error'
            )
            resolve({ success: false, error: error.message })
          }
        }

        input.oncancel = () => {
          resolve({ success: false, cancelled: true })
        }

        input.click()
      })
    } catch (error) {
      console.error('[ProjectManagementService] restoreApplicationState failed:', error)
      return { success: false, error: error.message }
    }
  }

  // Unified restore helper – used by both UI file-chooser and SyncService
  async restoreFromProjectContent(text, fileName = 'project.json') {
    try {
      console.log('[ProjectManagementService] restoreFromProjectContent: begin', { fileName, size: text?.length })

      // Import via ImportService - let ImportService handle JSON parsing and validation
      console.log('[ProjectManagementService] About to call ImportService with content length:', text?.length)
      const result = await this.request('import:project-file', { content: text })
      console.log('[ProjectManagementService] import:project-file result', {
        success: result?.success,
        error: result?.error,
        params: result?.params
      })
      if (!result?.success) {
        const errorMessage = result?.error || 'import_failed'
        const reason = result?.params?.reason || ''
        const fullMessage = reason ? `${errorMessage}: ${reason}` : errorMessage
        throw new Error(fullMessage)
      }

      // Force DataCoordinator to reload its state from storage
      try {
        const reload = await this.request('data:reload-state')
        console.log('[ProjectManagementService] data:reload-state done', reload)
      } catch (_) {}

      // If there's a currentProfile in the imported data, switch to it
      if (result.currentProfile) {
        try {
          const sw = await this.request('data:switch-profile', {
            profileId: result.currentProfile
          })
          console.log('[ProjectManagementService] data:switch-profile done', sw)
        } catch (error) {
          console.warn('Could not switch to imported current profile:', error?.message)
        }
      }

      this.ui?.showToast(
        this.i18n.t('backup_restored_successfully'),
        'success'
      )

      await this.emit('project-backup-restored', {
        filename: fileName,
        currentProfile: result.currentProfile,
        imported: result.imported
      }, { synchronous: true })
      console.log('[ProjectManagementService] restoreFromProjectContent: success')

      return { success: true, currentProfile: result.currentProfile, imported: result.imported }
    } catch (error) {
      console.error('[ProjectManagementService] restoreFromProjectContent: failed', error)
      return { success: false, error: error.message }
    }
  }

  // High-level helpers (trimmed to backup/restore only)

  

  

  

  

  // Legacy openProject() removed in favor of restoreApplicationState()

  
} 