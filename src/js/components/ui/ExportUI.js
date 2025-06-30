import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'
import i18next from 'i18next'

export default class ExportUI extends ComponentBase {
  constructor ({ eventBus: bus = eventBus } = {}) {
    super(bus || eventBus)
    if (!this.eventBus) this.eventBus = eventBus
    
    // Cache current profile state
    this.currentProfile = null
  }

  /* ---------------------------------------------------------- */
  /* Lifecycle                                                  */
  /* ---------------------------------------------------------- */
  onInit () {
    this.setupEventListeners()
    this.setupStateListeners()
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

  setupStateListeners () {
    // Listen for profile state changes
    this.addEventListener('profile:switched', ({ profile } = {}) => {
      this.currentProfile = profile
    })
    
    // Listen for profile updates
    this.addEventListener('profile-updated', ({ profile } = {}) => {
      if (this.currentProfile && profile && this.currentProfile.id === profile.id) {
        this.currentProfile = profile
      }
    })
  }

  /* ---------------------------------------------------------- */
  /* UI helpers                                                 */
  /* ---------------------------------------------------------- */
  showExportOptions () {
    if (!this.currentProfile) {
      this.emit('toast:show', { 
        message: i18next.t('no_profile_selected_to_export'), 
        type: 'warning' 
      })
      return
    }
    this.emit('modal:show', { modalId: 'exportModal' })
  }

  populateExportModal () {
    const modal = document.getElementById('exportModal')
    if (modal && typeof window.applyTranslations === 'function') {
      window.applyTranslations(modal)
    }
  }

  performExport () {
    if (!this.currentProfile) {
      this.emit('toast:show', { 
        message: i18next.t('no_profile_selected_to_export'), 
        type: 'warning' 
      })
      return
    }
    const format = document.getElementById('exportFormat')?.value || 'sto_keybind'
    const env = document.getElementById('exportEnvironment')?.value || (this.currentProfile.currentEnvironment || 'space')

    switch (format) {
      case 'sto_keybind':
        this.exportSTOKeybindFile(this.currentProfile, env)
        break
      case 'json_profile':
        this.exportJSONProfile(this.currentProfile, env)
        break
      case 'json_project':
        this.exportCompleteProject()
        break
      case 'csv_data':
        this.exportCSVData(this.currentProfile, env)
        break
      case 'html_report':
        this.exportHTMLReport(this.currentProfile, env)
        break
      case 'alias_file':
        this.exportAliases(this.currentProfile)
        break
      default:
        break
    }
    this.emit('modal:hide', { modalId: 'exportModal' })
  }

  /* ---------------------------------------------------------- */
  /* Individual export handlers                                 */
  /* ---------------------------------------------------------- */
  async exportSTOKeybindFile (profile, env = 'space') {
    try {
      const content = await this.request('export:generate-keybind-file', {
        profile, 
        options: { environment: env }
      })
      const filename = await this.request('export:generate-filename', {
        profile, 
        extension: 'txt', 
        environment: env
      })
      this.downloadFile(content, filename, 'text/plain')
      this.emit('toast:show', { 
        message: i18next.t('keybind_file_exported'), 
        type: 'success' 
      })
    } catch (err) {
      this.emit('toast:show', { 
        message: i18next.t('failed_to_export_keybind_file', { error: err.message }), 
        type: 'error' 
      })
    }
  }

  async exportJSONProfile (profile, env = 'space') {
    try {
      const sanitizedProfile = await this.request('export:sanitize-profile', { profile })
      const payload = {
        version: STO_DATA.settings.version,
        exported: new Date().toISOString(),
        type: 'profile',
        profile: sanitizedProfile,
      }
      const content = JSON.stringify(payload, null, 2)
      const filename = await this.request('export:generate-filename', {
        profile, 
        extension: 'json', 
        environment: env
      })
      this.downloadFile(content, filename, 'application/json')
      this.emit('toast:show', { 
        message: i18next.t('profile_exported_json'), 
        type: 'success' 
      })
    } catch (err) {
      this.emit('toast:show', { 
        message: i18next.t('failed_to_export_profile', { error: err.message }), 
        type: 'error' 
      })
    }
  }

  async exportCompleteProject () {
    try {
      const data = await this.request('storage:get-all-data')
      const payload = {
        version: STO_DATA.settings.version,
        exported: new Date().toISOString(),
        type: 'project',
        data,
      }
      const content = JSON.stringify(payload, null, 2)
      const filename = `STO_Tools_Keybinds_Project_${new Date().toISOString().split('T')[0]}.json`
      this.downloadFile(content, filename, 'application/json')
      this.emit('toast:show', { 
        message: i18next.t('complete_project_exported'), 
        type: 'success' 
      })
    } catch (err) {
      this.emit('toast:show', { 
        message: i18next.t('failed_to_export_project', { error: err.message }), 
        type: 'error' 
      })
    }
  }

  async exportCSVData (profile, env = 'space') {
    try {
      const csv = await this.request('export:generate-csv-data', { profile })
      const filename = await this.request('export:generate-filename', {
        profile, 
        extension: 'csv', 
        environment: env
      })
      this.downloadFile(csv, filename, 'text/csv')
      this.emit('toast:show', { 
        message: i18next.t('data_exported_csv'), 
        type: 'success' 
      })
    } catch (err) {
      this.emit('toast:show', { 
        message: i18next.t('failed_to_export_csv', { error: err.message }), 
        type: 'error' 
      })
    }
  }

  async exportHTMLReport (profile, env = 'space') {
    try {
      const html = await this.request('export:generate-html-report', { profile })
      const filename = await this.request('export:generate-filename', {
        profile, 
        extension: 'html', 
        environment: env
      })
      this.downloadFile(html, filename, 'text/html')
      this.emit('toast:show', { 
        message: i18next.t('html_report_exported'), 
        type: 'success' 
      })
    } catch (err) {
      this.emit('toast:show', { 
        message: i18next.t('failed_to_export_html_report', { error: err.message }), 
        type: 'error' 
      })
    }
  }

  async exportAliases (profile) {
    try {
      const content = await this.request('export:generate-alias-file', { profile })
      const filename = await this.request('export:generate-alias-filename', {
        profile, 
        extension: 'txt'
      })
      this.downloadFile(content, filename, 'text/plain')
      this.emit('toast:show', { 
        message: i18next.t('aliases_exported_successfully'), 
        type: 'success' 
      })
    } catch (err) {
      this.emit('toast:show', { 
        message: i18next.t('failed_to_export_aliases', { error: err.message }), 
        type: 'error' 
      })
    }
  }

  /* ---------------------------------------------------------- */
  /* Bulk operations                                           */
  /* ---------------------------------------------------------- */
  async exportAllProfiles () {
    try {
      const data = await this.request('storage:get-all-data')
      const profiles = data.profiles
      if (!profiles || Object.keys(profiles).length === 0) {
        this.emit('toast:show', { 
          message: i18next.t('no_profiles_to_export'), 
          type: 'warning' 
        })
        return
      }
      Object.values(profiles).forEach((p, idx) => {
        setTimeout(() => this.exportSTOKeybindFile(p), idx * 100)
      })
      this.emit('toast:show', { 
        message: i18next.t('exporting_profiles', { count: Object.keys(profiles).length }), 
        type: 'info' 
      })
    } catch (err) {
      this.emit('toast:show', { 
        message: i18next.t('failed_to_export_profiles', { error: err.message }), 
        type: 'error' 
      })
    }
  }

  /* ---------------------------------------------------------- */
  /* Misc helpers                                               */
  /* ---------------------------------------------------------- */
  async copyCommandPreview () {
    const preview = document.getElementById('commandPreview')
    if (!preview) return
    if (!preview.textContent.trim()) {
      try {
        const previewText = await this.request('command:get-chain-preview')
        if (previewText) {
          preview.textContent = previewText
        }
      } catch (err) {
        // Ignore if command service not available
      }
    }
    if (!preview.textContent.trim()) {
      this.emit('toast:show', { 
        message: i18next.t('no_command_to_copy'), 
        type: 'warning' 
      })
      return
    }
    this.emit('ui:copy-to-clipboard', { text: preview.textContent })
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