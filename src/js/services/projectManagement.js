import eventBus from '../core/eventBus.js'

export const projectManagement = {
  async exportProject() {
    try {
      const data = storageService.exportData()
      
      // Create a blob with the project data
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      })
      
      // Create download link
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sto-keybinds-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      eventBus.emit('project-exported', { data })
      return { success: true, data }
    } catch (error) {
      console.error('Failed to export project:', error)
      eventBus.emit('project-export-failed', { error })
      return { success: false, error: error.message }
    }
  },

  async importProject(file) {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      
      // Validate the imported data
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid project file format')
      }
      
      // Import the data
      const result = storageService.importData(text)
      if (!result) {
        throw new Error('Failed to import project data')
      }
      
      eventBus.emit('project-imported', { data })
      return { success: true, data }
    } catch (error) {
      console.error('Failed to import project:', error)
      eventBus.emit('project-import-failed', { error })
      return { success: false, error: error.message }
    }
  },

  async loadProjectFromFile() {
    try {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json'
      
      return new Promise((resolve, reject) => {
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
      console.error('Failed to load project from file:', error)
      return { success: false, error: error.message }
    }
  },

  async saveProjectToFile() {
    try {
      const result = await this.exportProject()
      return result
    } catch (error) {
      console.error('Failed to save project to file:', error)
      return { success: false, error: error.message }
    }
  },

  validateProjectData(data) {
    try {
      // Basic validation
      if (!data || typeof data !== 'object') {
        return { valid: false, error: 'Invalid data format' }
      }
      
      // Check for required fields
      if (!data.profiles || typeof data.profiles !== 'object') {
        return { valid: false, error: 'Missing profiles data' }
      }
      
      if (!data.currentProfile) {
        return { valid: false, error: 'Missing current profile' }
      }
      
      // Validate profiles structure
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
  },

  openProject() {
    const input = document.getElementById('fileInput')
    input.accept = '.json'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          try {
            const success = stoExport.importJSONFile(e.target.result)
            if (success) {
              this.loadData()
              this.renderProfiles()
              this.renderKeyGrid()
              this.renderCommandChain()
              stoUI.showToast(i18next.t('project_loaded_successfully'), 'success')
            } else {
              stoUI.showToast(i18next.t('failed_to_load_project_file'), 'error')
            }
          } catch (error) {
            stoUI.showToast(i18next.t('invalid_project_file'), 'error')
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  },

  saveProject() {
    const data = storageService.exportData()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sto_keybinds.json'
    a.click()
    URL.revokeObjectURL(url)

    stoUI.showToast(i18next.t('project_exported_successfully'), 'success')

    // Emit project-saved event for auto-sync
    eventBus.emit('project-saved')
  },

  exportKeybinds() {
    const profile = this.getCurrentProfile()
    if (!profile) return

    // Generate keybind file (per-key stabilization handled within export manager)
    const content = stoExport.generateSTOKeybindFile(profile, {
      environment: this.currentEnvironment,
    })

    // Download the file
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url

    // Include environment in filename
    const safeName = profile.name.replace(/[^a-zA-Z0-9]/g, '_')
    a.download = `${safeName}_${this.currentEnvironment}_keybinds.txt`
    a.click()
    URL.revokeObjectURL(url)

    stoUI.showToast(
      i18next.t('keybinds_exported_successfully', { environment: this.currentEnvironment }),
      'success'
    )
  },
}

