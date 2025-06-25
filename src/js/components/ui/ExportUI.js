import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import i18next from 'i18next'

export default class ExportUI extends ComponentBase {
  constructor ({ eventBus: bus = eventBus, exportService, manager = null } = {}) {
    super(bus || eventBus)
    if (!this.eventBus) this.eventBus = eventBus
    this.exportService = exportService
    this.manager = manager
  }

  /* ---------------------------------------------------------- */
  /* Lifecycle                                                  */
  /* ---------------------------------------------------------- */
  onInit () {
    this.setupEventListeners()
  }

  /* ---------------------------------------------------------- */
  /* Event binding                                              */
  /* ---------------------------------------------------------- */
  setupEventListeners () {
    this.eventBus.onDom('exportKeybindsBtn', 'click', 'exportKeybinds', () => {
      this.showExportOptions()
    })
    this.eventBus.onDom('confirmExportBtn', 'click', 'export-confirm', () => {
      this.performExport()
    })
    this.eventBus.onDom('copyPreviewBtn', 'click', 'copyPreview', () => {
      this.copyCommandPreview()
    })
  }

  /* ---------------------------------------------------------- */
  /* UI helpers                                                 */
  /* ---------------------------------------------------------- */
  showExportOptions () {
    const profile = app.getCurrentProfile()
    if (!profile) {
      stoUI.showToast(i18next.t('no_profile_selected_to_export'), 'warning')
      return
    }
    stoUI.showModal('exportModal')
  }

  populateExportModal () {
    const modal = document.getElementById('exportModal')
    if (modal && typeof window.applyTranslations === 'function') {
      window.applyTranslations(modal)
    }
  }

  performExport () {
    const profile = app.getCurrentProfile()
    if (!profile) {
      stoUI.showToast(i18next.t('no_profile_selected_to_export'), 'warning')
      return
    }
    const format = document.getElementById('exportFormat')?.value || 'sto_keybind'
    const env = document.getElementById('exportEnvironment')?.value || (profile.currentEnvironment || 'space')

    switch (format) {
      case 'sto_keybind':
        ;(this.manager?.exportSTOKeybindFile || this.exportSTOKeybindFile).call(this.manager || this, profile, env)
        break
      case 'json_profile':
        ;(this.manager?.exportJSONProfile || this.exportJSONProfile).call(this.manager || this, profile, env)
        break
      case 'json_project':
        ;(this.manager?.exportCompleteProject || this.exportCompleteProject).call(this.manager || this)
        break
      case 'csv_data':
        ;(this.manager?.exportCSVData || this.exportCSVData).call(this.manager || this, profile, env)
        break
      case 'html_report':
        ;(this.manager?.exportHTMLReport || this.exportHTMLReport).call(this.manager || this, profile, env)
        break
      case 'alias_file':
        ;(this.manager?.exportAliases || this.exportAliases).call(this.manager || this, profile)
        break
      default:
        break
    }
    stoUI.hideModal('exportModal')
  }

  /* ---------------------------------------------------------- */
  /* Individual export handlers                                 */
  /* ---------------------------------------------------------- */
  exportSTOKeybindFile (profile, env = 'space') {
    try {
      const content = this.exportService.generateSTOKeybindFile(profile, { environment: env })
      this.downloadFile(content, this.exportService.generateFileName(profile, 'txt', env), 'text/plain')
      stoUI.showToast(i18next.t('keybind_file_exported'), 'success')
    } catch (err) {
      stoUI.showToast(i18next.t('failed_to_export_keybind_file', { error: err.message }), 'error')
    }
  }

  exportJSONProfile (profile, env = 'space') {
    try {
      const payload = {
        version: STO_DATA.settings.version,
        exported: new Date().toISOString(),
        type: 'profile',
        profile: this.exportService.sanitizeProfileForExport(profile),
      }
      const content = JSON.stringify(payload, null, 2)
      this.downloadFile(content, this.exportService.generateFileName(profile, 'json', env), 'application/json')
      stoUI.showToast(i18next.t('profile_exported_json'), 'success')
    } catch (err) {
      stoUI.showToast(i18next.t('failed_to_export_profile', { error: err.message }), 'error')
    }
  }

  exportCompleteProject () {
    try {
      const data = storageService.getAllData()
      const payload = {
        version: STO_DATA.settings.version,
        exported: new Date().toISOString(),
        type: 'project',
        data,
      }
      const content = JSON.stringify(payload, null, 2)
      const filename = `STO_Tools_Keybinds_Project_${new Date().toISOString().split('T')[0]}.json`
      this.downloadFile(content, filename, 'application/json')
      stoUI.showToast(i18next.t('complete_project_exported'), 'success')
    } catch (err) {
      stoUI.showToast(i18next.t('failed_to_export_project', { error: err.message }), 'error')
    }
  }

  exportCSVData (profile, env = 'space') {
    try {
      const csv = this.exportService.generateCSVData(profile)
      this.downloadFile(csv, this.exportService.generateFileName(profile, 'csv', env), 'text/csv')
      stoUI.showToast(i18next.t('data_exported_csv'), 'success')
    } catch (err) {
      stoUI.showToast(i18next.t('failed_to_export_csv', { error: err.message }), 'error')
    }
  }

  exportHTMLReport (profile, env = 'space') {
    try {
      const html = this.exportService.generateHTMLReport(profile)
      this.downloadFile(html, this.exportService.generateFileName(profile, 'html', env), 'text/html')
      stoUI.showToast(i18next.t('html_report_exported'), 'success')
    } catch (err) {
      stoUI.showToast(i18next.t('failed_to_export_html_report', { error: err.message }), 'error')
    }
  }

  exportAliases (profile) {
    try {
      const content = this.exportService.generateAliasFile(profile)
      this.downloadFile(content, this.exportService.generateAliasFileName(profile, 'txt'), 'text/plain')
      stoUI.showToast(i18next.t('aliases_exported_successfully'), 'success')
    } catch (err) {
      stoUI.showToast(i18next.t('failed_to_export_aliases', { error: err.message }), 'error')
    }
  }

  /* ---------------------------------------------------------- */
  /* Bulk operations                                           */
  /* ---------------------------------------------------------- */
  exportAllProfiles () {
    const data = storageService.getAllData()
    const profiles = data.profiles
    if (!profiles || Object.keys(profiles).length === 0) {
      stoUI.showToast(i18next.t('no_profiles_to_export'), 'warning')
      return
    }
    Object.values(profiles).forEach((p, idx) => {
      setTimeout(() => this.exportSTOKeybindFile(p), idx * 100)
    })
    stoUI.showToast(i18next.t('exporting_profiles', { count: Object.keys(profiles).length }), 'info')
  }

  /* ---------------------------------------------------------- */
  /* Misc helpers                                               */
  /* ---------------------------------------------------------- */
  copyCommandPreview () {
    const preview = document.getElementById('commandPreview')
    if (!preview) return
    if (!preview.textContent.trim() && window.commandBuilderService?.getCommandChainPreview) {
      preview.textContent = window.commandBuilderService.getCommandChainPreview()
    }
    if (!preview.textContent.trim()) {
      stoUI.showToast(i18next.t('no_command_to_copy'), 'warning')
      return
    }
    stoUI.copyToClipboard(preview.textContent)
  }

  downloadFile (content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}