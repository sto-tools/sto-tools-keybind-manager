import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'
import i18next from 'i18next'

export default class PreferencesUI extends ComponentBase {
  constructor({ service = null, ui = null, modalManager = null, document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(eventBus)
    this.componentName = 'PreferencesUI'
    
    // Keep service reference for backward compatibility during migration
    this._legacyService = service
    
    this.ui = ui || (typeof stoUI !== 'undefined' ? stoUI : null)
    this.modalManager = modalManager || (typeof modalManager !== 'undefined' ? modalManager : null)
    this.document = document

    this.eventsSetup = false

    // Adopt settingDefinitions from historical implementation
    this.settingDefinitions = {
      theme: { type: 'select', element: 'themeSelect' },
      language: { type: 'select', element: 'languageSelect' },
      autoSave: { type: 'boolean', element: 'autoSaveCheckbox' },
      compactView: { type: 'boolean', element: 'compactViewCheckbox' },
      autoSync: { type: 'boolean', element: 'autoSyncCheckbox' },
      autoSyncInterval: { type: 'select', element: 'autoSyncInterval' },
    }
  }

  async init() {
    // Use request/response instead of direct service call
    await request(eventBus, 'preferences:init')
    this.populatePreferencesModal()
    this.setupEventListeners()
  }

  /* --------------------------------------------------
   * UI helpers (adapted from legacy STOPreferencesManager)
   * ------------------------------------------------ */
  setupEventListeners() {
    // Category navigation buttons
    document.querySelectorAll('.category-item').forEach((item) => {
      eventBus.onDom(item, 'click', 'pref-cat', (e) => {
        const cat = e.currentTarget.dataset.category
        this.switchCategory(cat)
      })
    })

    // Save button
    eventBus.onDom('savePreferencesBtn', 'click', 'pref-save', () => {
      this.saveAllSettings(true)
    })

    this.setupSettingControls()

    // Set Sync Folder button – needs direct user activation
    const syncBtn = document.getElementById('setSyncFolderBtn')
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        if (window.stoSync?.setSyncFolder) {
          try {
            const handle = await window.stoSync.setSyncFolder(true)
            if (handle) {
              // Reload settings (folder name/path updated by stoSync)
              await request(eventBus, 'preferences:load-settings')
              this.updateFolderDisplay()
            }
          } catch (err) {
            console.error('[PreferencesUI] setSyncFolder failed', err)
          }
        }
      })
    }
  }

  setupSettingControls() {
    Object.entries(this.settingDefinitions).forEach(([key, def]) => {
      const el = document.getElementById(def.element)
      if (!el) return

      switch (def.type) {
        case 'boolean':
          eventBus.onDom(el, 'change', `pref-${key}`, (e) => {
            this.updateSetting(key, e.target.checked)
          })
          break
        case 'select':
          eventBus.onDom(el, 'change', `pref-${key}`, (e) => {
            this.updateSetting(key, e.target.value)
          })
          break
      }
    })
  }

  switchCategory(cat) {
    document.querySelectorAll('.category-item').forEach((i) => i.classList.remove('active'))
    const active = document.querySelector(`[data-category="${cat}"]`)
    active && active.classList.add('active')

    document.querySelectorAll('.settings-panel').forEach((p) => p.classList.remove('active'))
    const panel = document.getElementById(`${cat}-settings`)
    panel && panel.classList.add('active')
  }

  async updateSetting(key, value) {
    // Use request/response instead of direct service call
    await this.setSetting(key, value)

    if (key === 'syncFolderName' || key === 'syncFolderPath') {
      this.updateFolderDisplay()
    }
  }

  updateUI(key, value) {
    const def = this.settingDefinitions[key]
    if (!def) return
    const el = document.getElementById(def.element)
    if (!el) return

    if (def.type === 'boolean') {
      el.checked = !!value
    } else if (def.type === 'select') {
      el.value = value
    }
  }

  async saveAllSettings(manual = true) {
    // Use request/response instead of direct service call
    const ok = await this.saveSettings()
    if (ok && manual && this.ui?.showToast) {
      this.ui.showToast(i18next.t('preferences_saved'), 'success')
    }
    this.modalManager?.hide('preferencesModal')
  }

  async showPreferences() {
    // Use request/response to get fresh settings
    await request(eventBus, 'preferences:load-settings')
    const settings = await request(eventBus, 'preferences:get-settings')
    Object.entries(settings).forEach(([k, v]) => this.updateUI(k, v))
    this.updateFolderDisplay()
    this.modalManager?.show('preferencesModal')
  }

  async populatePreferencesModal() {
    // Use request/response to load settings
    await request(eventBus, 'preferences:load-settings')
    this.updatePreferencesFromStorage()
    this.setupPreferencesEventListeners()
  }

  async updateFolderDisplay() {
    const settings = await request(eventBus, 'preferences:get-settings')
    const { syncFolderName, syncFolderPath } = settings
    
    // Update folder display UI
    const folderNameEl = this.document.getElementById('syncFolderName')
    const folderPathEl = this.document.getElementById('syncFolderPath')
    
    if (folderNameEl) folderNameEl.textContent = syncFolderName || 'No folder selected'
    if (folderPathEl) folderPathEl.textContent = syncFolderPath || ''
  }

  async setSetting(key, value) {
    // Use request/response instead of direct service call
    await request(eventBus, 'preferences:set-setting', { key, value })
    this.updateUI(key, value)
  }

  async saveSettings() {
    // Use request/response instead of direct service call
    const ok = await request(eventBus, 'preferences:save-settings')
    if (ok) {
      this.ui?.showToast('Settings saved successfully', 'success')
    } else {
      this.ui?.showToast('Failed to save settings', 'error')
    }
    return ok
  }

  updatePreferencesFromStorage() {
    // Implementation needed
  }

  setupPreferencesEventListeners() {
    // Implementation needed
  }
} 