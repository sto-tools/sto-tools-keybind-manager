import PreferencesService from '../services/PreferencesService.js'
import eventBus from '../../core/eventBus.js'
import i18next from 'i18next'

export default class PreferencesUI {
  constructor({ service, modalManager, ui } = {}) {
    // Underlying service (logic + persistence)
    this.componentName = 'PreferencesUI'
    this.service = service
    this.modalManager = modalManager
    this.ui = ui

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

  init() {
    // Ensure settings loaded and UI updated
    this.service.init()
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
              this.service.loadSettings()
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

  updateSetting(key, value) {
    this.service.setSetting(key, value)
    this.updateUI(key, value)

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

  saveAllSettings(manual = true) {
    const ok = this.service.saveSettings()
    if (ok && manual && this.ui?.showToast) {
      this.ui.showToast(i18next.t('preferences_saved'), 'success')
    }
    this.modalManager?.hide('preferencesModal')
  }

  showPreferences() {
    // Ensure we have freshest data from storage
    this.service.loadSettings()
    const settings = this.service.getSettings()
    Object.entries(settings).forEach(([k, v]) => this.updateUI(k, v))
    this.updateFolderDisplay()
    this.modalManager?.show('preferencesModal')
  }

  populatePreferencesModal() {
    const modal = document.getElementById('preferencesModal')
    if (modal && typeof window.applyTranslations === 'function') {
      window.applyTranslations(modal)
    }
  }

  updateFolderDisplay() {
    const el = document.getElementById('currentSyncFolder')
    if (!el) return
    const { syncFolderName, syncFolderPath } = this.service.getSettings()
    if (syncFolderName) {
      el.textContent = syncFolderName
      el.title = syncFolderPath || ''
    } else {
      el.textContent = i18next.t('no_folder_selected')
      el.title = ''
    }
  }
} 