import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'
import i18next from 'i18next'

export default class PreferencesUI extends ComponentBase {
  constructor({ ui = null, document = null } = {}) {
    super(eventBus)
    this.componentName = 'PreferencesUI'
    
    this.ui = ui
    this.document = document || (typeof window !== 'undefined' ? window.document : null)

    this.eventsSetup = false

    // Adopt settingDefinitions from historical implementation
    this.settingDefinitions = {
      theme: { type: 'select', element: 'themeSelect' },
      language: { type: 'select', element: 'languageSelect' },
      autoSave: { type: 'boolean', element: 'autoSaveCheckbox' },
      compactView: { type: 'boolean', element: 'compactViewCheckbox' },
      autoSync: { type: 'boolean', element: 'autoSync' },
      autoSyncInterval: { type: 'select', element: 'autoSyncInterval' },
    }
  }

  async init() {
    // Use request/response instead of direct service call
    await this.request('preferences:init')
    this.populatePreferencesModal()
    this.setupEventListeners()
  }

  /* --------------------------------------------------
   * UI helpers (adapted from legacy STOPreferencesManager)
   * ------------------------------------------------ */
  setupEventListeners() {
    // Listen for preferences:show event from HeaderMenuUI
    this.eventBus.on('preferences:show', () => {
      this.showPreferences()
    })

    // Listen for sync folder changes
    this.eventBus.on('sync:folder-set', () => {
      this.updateFolderDisplay()
    })

    // Listen for settings changes that should update AutoSync
    this.eventBus.on('preferences:changed', (data) => {
      if (data.key === 'autoSync' || data.key === 'autoSyncInterval') {
        this.notifyAutoSyncSettingsChanged()
      }
    })

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
              await this.request('preferences:load-settings')
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

    // PreferencesService already emits 'preferences:changed' when setting is updated
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
    
    // Notify AutoSync of setting changes
    this.notifyAutoSyncSettingsChanged()
    
    // Use event bus instead of direct modalManager call
    this.emit('modal:hide', { modalId: 'preferencesModal' })
  }

  async showPreferences() {
    // Use request/response to get fresh settings
    await this.request('preferences:load-settings')
    const settings = await this.request('preferences:get-settings')
    Object.entries(settings).forEach(([k, v]) => this.updateUI(k, v))
    this.updateFolderDisplay()
    // Use event bus instead of direct modalManager call
    this.emit('modal:show', { modalId: 'preferencesModal' })
  }

  async populatePreferencesModal() {
    // Use request/response to load settings
    await this.request('preferences:load-settings')
    this.updatePreferencesFromStorage()
    this.setupPreferencesEventListeners()
  }

  async updateFolderDisplay() {
    const settings = await this.request('preferences:get-settings')
    const { syncFolderName, syncFolderPath } = settings
    
    // Update folder display UI - use correct element ID from HTML
    const folderDisplayEl = this.document.getElementById('currentSyncFolder')
    
    if (folderDisplayEl) {
      if (syncFolderName) {
        folderDisplayEl.textContent = syncFolderName
        // Remove the data-i18n attribute when showing actual folder name
        folderDisplayEl.removeAttribute('data-i18n')
      } else {
        folderDisplayEl.textContent = i18next.t('no_folder_selected')
        folderDisplayEl.setAttribute('data-i18n', 'no_folder_selected')
      }
    }
  }

  async notifyAutoSyncSettingsChanged() {
    // Emit event for AutoSync service to listen to
    this.emit('preferences:autosync-settings-changed')
  }

  async setSetting(key, value) {
    // Use request/response instead of direct service call
    await this.request('preferences:set-setting', { key, value })
    this.updateUI(key, value)
  }

  async saveSettings() {
    // Use request/response instead of direct service call
    const ok = await this.request('preferences:save-settings')
    return ok
  }

  updatePreferencesFromStorage() {
    // Implementation needed
  }

  setupPreferencesEventListeners() {
    // Implementation needed
  }

  toggleSettingsMenu() {
    const settingsBtn = this.document.getElementById('settingsBtn')
    const dropdown = settingsBtn?.closest('.dropdown')
    if (dropdown) {
      dropdown.classList.toggle('active')
    }
  }


} 