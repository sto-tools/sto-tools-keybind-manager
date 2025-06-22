import eventBus from './eventBus.js'

export const projectOperations = {
  openProject() {
    const input = document.getElementById('fileInput')
    input.accept = '.json'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          try {
            // Use the export manager's importJSONFile method to handle both
            // direct data and wrapped project files
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
    const data = stoStorage.exportData()
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

