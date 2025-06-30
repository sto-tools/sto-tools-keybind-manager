import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'

/**
 * ProjectManagementService – Handles import / export of complete project data and
 * keybind files.  Provides both an OO interface and legacy functional wrappers
 * for mix-in compatibility while the codebase migrates to service instances.
 */
export default class ProjectManagementService extends ComponentBase {
  constructor({
    storage = null,
    ui = null,
    exportManager = null,
    i18n = null,
    app = null,
    eventBus = null
  } = {}) {
    super(eventBus)
    this.componentName = 'ProjectManagementService'
    
    // REFACTORED: Strict dependency injection - no global fallbacks
    this.storage = storage
    this.ui = ui
    this.exportManager = exportManager
    this.i18n = i18n
    this.app = app
  }

  /* --------------------------------------------------
   *  High-level helpers
   * ------------------------------------------------ */
  async exportProject() {
    try {
      const data = this.storage.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sto-keybinds-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      this.emit('project-exported', { data })
      return { success: true, data }
    } catch (error) {
      console.error('[ProjectManagementService] exportProject failed', error)
      this.emit('project-export-failed', { error })
      return { success: false, error: error.message }
    }
  }

  async importProject(file) {
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (!data || typeof data !== 'object') {
        throw new Error('Invalid project file format')
      }

      const result = this.storage.importData(text)
      if (!result) {
        throw new Error('Failed to import project data')
      }

      this.emit('project-imported', { data })
      return { success: true, data }
    } catch (error) {
      console.error('[ProjectManagementService] importProject failed', error)
      this.emit('project-import-failed', { error })
      return { success: false, error: error.message }
    }
  }

  async loadProjectFromFile() {
    try {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json'

      return await new Promise((resolve) => {
        input.onchange = async (event) => {
          const file = event.target.files[0]
          if (!file) {
            resolve({ success: false, error: 'No file selected' })
            return
          }
          const result = await this.importProject(file)
          resolve(result)
        }

        input.oncancel = () => {
          resolve({ success: false, error: 'File selection cancelled' })
        }

        input.click()
      })
    } catch (error) {
      console.error('[ProjectManagementService] loadProjectFromFile failed', error)
      return { success: false, error: error.message }
    }
  }

  async saveProjectToFile() {
    try {
      return await this.exportProject()
    } catch (error) {
      console.error('[ProjectManagementService] saveProjectToFile failed', error)
      return { success: false, error: error.message }
    }
  }

  validateProjectData(data) {
    try {
      if (!data || typeof data !== 'object') {
        return { valid: false, error: 'Invalid data format' }
      }
      if (!data.profiles || typeof data.profiles !== 'object') {
        return { valid: false, error: 'Missing profiles data' }
      }
      if (!data.currentProfile) {
        return { valid: false, error: 'Missing current profile' }
      }
      for (const [profileId, profile] of Object.entries(data.profiles)) {
        if (!profile || typeof profile !== 'object') {
          return { valid: false, error: `Invalid profile structure for ${profileId}` }
        }
        if (!profile.name || typeof profile.name !== 'string') {
          return { valid: false, error: `Missing profile name for ${profileId}` }
        }
      }
      return { valid: true }
    } catch (error) {
      return { valid: false, error: error.message }
    }
  }

  /* --------------------------------------------------
   *  UI-centric helpers – depend on injected `app`, `ui`, `i18n`
   * ------------------------------------------------ */
  openProject() {
    const input = document.getElementById('fileInput') || document.createElement('input')
    if (!input.id) input.id = 'fileInput'
    input.type = 'file'
    input.accept = '.json'

    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const success = this.exportManager.importJSONFile(ev.target.result)
          if (success) {
            this.app?.loadData?.()
            this.app?.renderProfiles?.()
            this.app?.renderKeyGrid?.()
            // Command chain rendering is now handled by CommandChainUI via events
            this.ui?.showToast(this.i18n?.t('project_loaded_successfully') ?? 'Project loaded', 'success')
          } else {
            this.ui?.showToast(this.i18n?.t('failed_to_load_project_file') ?? 'Failed to load project', 'error')
          }
        } catch (err) {
          this.ui?.showToast(this.i18n?.t('invalid_project_file') ?? 'Invalid project file', 'error')
        }
      }
      reader.readAsText(file)
    }

    input.click()
  }

  saveProject() {
    const data = this.storage.exportData()
    const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sto_keybinds.json'
    a.click()
    URL.revokeObjectURL(url)

    this.ui?.showToast(this.i18n?.t('project_exported_successfully') ?? 'Project exported', 'success')

    this.emit('project-saved')
  }

  exportKeybinds() {
    const profile = this.app?.getCurrentProfile?.()
    if (!profile) return

    const env = this.app?.currentEnvironment || 'space'

    const content = this.exportManager.generateSTOKeybindFile(profile, {
      environment: env,
    })

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url

    const safeName = profile.name.replace(/[^a-zA-Z0-9]/g, '_')
    a.download = `${safeName}_${env}_keybinds.txt`
    a.click()
    URL.revokeObjectURL(url)

    this.ui?.showToast(
      this.i18n?.t('keybinds_exported_successfully', { environment: env }) ?? 'Keybinds exported',
      'success',
    )
  }

  /* --------------------------------------------------
   *  Optional singleton helper – keeps pattern consistent with other services
   *  but no longer exposes legacy mix-in API.
   * ------------------------------------------------ */
  static #singleton = null

  static getInstance() {
    if (!this.#singleton) this.#singleton = new ProjectManagementService()
    return this.#singleton
  }
} 