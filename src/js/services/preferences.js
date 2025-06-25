// STO Tools Keybind Manager - Preferences Manager
// Handles user preferences and settings persistence

import eventBus from '../core/eventBus.js'
import i18next from 'i18next'

export default class STOPreferencesManager {
  constructor() {
    this.settings = {}
    this.defaultSettings = {
      theme: 'default',
      autoSave: true,
      showTooltips: true,
      confirmDeletes: true,
      maxUndoSteps: 50,
      defaultMode: 'space',
      compactView: false,
      language: 'en',
      syncFolderName: null,
      syncFolderPath: null,
      autoSync: false,
      autoSyncInterval: 'change',
    }
  }

  init() {
    this.loadSettings()
    this.applySettings()
  }

  loadSettings() {
    try {
      if (typeof storageService === 'undefined') {
        console.warn('storageService not available yet, deferring settings load')
        return
      }

      const storedSettings = storageService.getSettings()
      this.settings = { ...this.defaultSettings, ...storedSettings }
    } catch (error) {
      console.error('Failed to load settings:', error)
      this.settings = { ...this.defaultSettings }
    }
  }

  saveSettings() {
    try {
      if (typeof storageService === 'undefined') {
        console.error('storageService not available')
        return false
      }

      const success = storageService.saveSettings(this.settings)
      return success
    } catch (error) {
      console.error('Failed to save settings:', error)
      return false
    }
  }

  getSetting(key) {
    return this.settings[key]
  }

  setSetting(key, value) {
    this.settings[key] = value
    this.saveSettings()
    this.applySettings()
  }

  getSettings() {
    return { ...this.settings }
  }

  setSettings(newSettings) {
    this.settings = { ...this.defaultSettings, ...newSettings }
    this.saveSettings()
    this.applySettings()
  }

  resetSettings() {
    this.settings = { ...this.defaultSettings }
    this.saveSettings()
    this.applySettings()
  }

  applySettings() {
    // Apply theme
    this.applyTheme()

    // Apply language
    this.applyLanguage()

    // Apply other settings
    this.applyOtherSettings()
  }

  applyTheme() {
    const theme = this.settings.theme || 'default'
    document.body.className = document.body.className.replace(/theme-\w+/g, '')
    document.body.classList.add(`theme-${theme}`)
  }

  applyLanguage() {
    const language = this.settings.language || 'en'
    if (typeof i18next !== 'undefined' && i18next.language !== language) {
      i18next.changeLanguage(language)
    }
  }

  applyOtherSettings() {
    // Apply auto-save setting
    if (typeof app !== 'undefined' && app.autoSave !== undefined) {
      app.autoSave = this.settings.autoSave
    }

    // Apply max undo steps
    if (typeof app !== 'undefined' && app.maxUndoSteps !== undefined) {
      app.maxUndoSteps = this.settings.maxUndoSteps
    }

    // Apply compact view
    if (this.settings.compactView) {
      document.body.classList.add('compact-view')
    } else {
      document.body.classList.remove('compact-view')
    }
  }

  getTheme() {
    return this.settings.theme || 'default'
  }

  setTheme(theme) {
    this.setSetting('theme', theme)
  }

  getLanguage() {
    return this.settings.language || 'en'
  }

  setLanguage(language) {
    this.setSetting('language', language)
  }

  getAutoSave() {
    return this.settings.autoSave !== false
  }

  setAutoSave(autoSave) {
    this.setSetting('autoSave', autoSave)
  }

  getShowTooltips() {
    return this.settings.showTooltips !== false
  }

  setShowTooltips(showTooltips) {
    this.setSetting('showTooltips', showTooltips)
  }

  getConfirmDeletes() {
    return this.settings.confirmDeletes !== false
  }

  setConfirmDeletes(confirmDeletes) {
    this.setSetting('confirmDeletes', confirmDeletes)
  }

  getMaxUndoSteps() {
    return this.settings.maxUndoSteps || 50
  }

  setMaxUndoSteps(maxUndoSteps) {
    this.setSetting('maxUndoSteps', maxUndoSteps)
  }

  getDefaultMode() {
    return this.settings.defaultMode || 'space'
  }

  setDefaultMode(defaultMode) {
    this.setSetting('defaultMode', defaultMode)
  }

  getCompactView() {
    return this.settings.compactView || false
  }

  setCompactView(compactView) {
    this.setSetting('compactView', compactView)
  }

  getSyncFolderName() {
    return this.settings.syncFolderName || null
  }

  setSyncFolderName(syncFolderName) {
    this.setSetting('syncFolderName', syncFolderName)
  }

  getSyncFolderPath() {
    return this.settings.syncFolderPath || null
  }

  setSyncFolderPath(syncFolderPath) {
    this.setSetting('syncFolderPath', syncFolderPath)
  }

  getAutoSync() {
    return this.settings.autoSync || false
  }

  setAutoSync(autoSync) {
    this.setSetting('autoSync', autoSync)
  }

  getAutoSyncInterval() {
    return this.settings.autoSyncInterval || 'change'
  }

  setAutoSyncInterval(autoSyncInterval) {
    this.setSetting('autoSyncInterval', autoSyncInterval)
  }

  setupEventListeners() {
    // Category navigation
    document.querySelectorAll('.category-item').forEach(item => {
      eventBus.onDom(item, 'click', 'category-select', (e) => {
        const category = e.currentTarget.dataset.category
        this.switchCategory(category)
      })
    })

    // Save button
    eventBus.onDom('savePreferencesBtn', 'click', 'save-preferences', () => {
      this.saveAllSettings()
    })

    // Sync folder button (use direct event listener to preserve user activation)
    const syncFolderBtn = document.getElementById('setSyncFolderBtn')
    if (syncFolderBtn) {
      syncFolderBtn.addEventListener('click', async () => {
        // Call the sync manager directly to maintain user activation
        if (typeof stoSync !== 'undefined' && stoSync.setSyncFolder) {
          try {
            const result = await stoSync.setSyncFolder()
            if (result && result.name) {
              // Update our local settings after successful folder selection
              this.loadSettings() // Reload all settings to get the updated syncFolderName and path
              this.updateFolderUI() // Refresh the folder display
            }
          } catch (error) {
            console.error('Failed to set sync folder:', error)
          }
        } else {
          console.warn('Sync functionality not available')
        }
      })
    }

    // Setting controls
    this.setupSettingControls()
  }

  setupSettingControls() {
    Object.entries(this.settingDefinitions).forEach(([key, definition]) => {
      const element = document.getElementById(definition.element)
      if (!element) return

      switch (definition.type) {
        case 'boolean':
          eventBus.onDom(element, 'change', `setting-${key}`, (e) => {
            this.updateSetting(key, e.target.checked)
          })
          break
        case 'select':
          eventBus.onDom(element, 'change', `setting-${key}`, (e) => {
            this.updateSetting(key, e.target.value)
          })
          break
      }
    })
  }

  switchCategory(category) {
    // Update active category in sidebar
    document.querySelectorAll('.category-item').forEach(item => {
      item.classList.remove('active')
    })
    document.querySelector(`[data-category="${category}"]`).classList.add('active')

    // Show corresponding settings panel
    document.querySelectorAll('.settings-panel').forEach(panel => {
      panel.classList.remove('active')
    })
    document.getElementById(`${category}-settings`).classList.add('active')

    this.currentCategory = category
  }

  updateUI(settingKey, value) {
    const definition = this.settingDefinitions[settingKey]
    if (!definition) return

    const element = document.getElementById(definition.element)
    if (!element) return

    switch (definition.type) {
      case 'boolean':
        // Ensure the checkbox state matches the actual setting value
        element.checked = !!value;
        break;
      case 'select':
        element.value = value;
        break;
      case 'folder':
        // For folder settings, always refresh the UI with current settings
        this.updateFolderUI(value);
        break;
    }
    
    // Special handling for auto-sync to ensure toggle state is correct
    if (settingKey === 'autoSync') {
      // Force update the auto-sync manager to match the UI state
      if (typeof app !== 'undefined' && app.autoSyncManager) {
        app.autoSyncManager.isEnabled = !!value;
      }
    }
  }

  updateFolderUI(folderInfo) {
    const folderElement = document.getElementById('currentSyncFolder')
    if (folderElement) {
      // Get the most current settings
      const settings = typeof storageService !== 'undefined' ? storageService.getSettings() : {}
      
      // Use the stored folder name and path
      const folderName = settings.syncFolderName
      const folderPath = settings.syncFolderPath
      
      if (folderName && folderName !== 'null') {
        // Display the folder name as the main text
        folderElement.textContent = folderName
        
        // Use the full path description as tooltip if available
        if (folderPath && folderPath !== folderName) {
          folderElement.title = folderPath
        } else {
          folderElement.title = `Selected sync folder: ${folderName}`
        }
      } else {
        folderElement.textContent = typeof i18next !== 'undefined' ? i18next.t('no_folder_selected') : 'No folder selected'
        folderElement.title = ''
      }
    }
  }

  updateSetting(key, value) {
    this.settings[key] = value
    
    // Apply immediate changes for certain settings
    switch (key) {
      case 'autoSync':
        // Update auto-sync behavior
        if (typeof app !== 'undefined' && app.autoSyncManager) {
          app.autoSyncManager.updateAutoSync()
        }
        break
      case 'autoSyncInterval':
        // Update auto-sync interval
        if (typeof app !== 'undefined' && app.autoSyncManager) {
          app.autoSyncManager.updateAutoSync()
        }
        break
    }
  }

  saveAllSettings() {
    // Save to storage
    if (typeof storageService === 'undefined') {
      console.error('storageService not available')
      return
    }
    
    const success = storageService.saveSettings(this.settings)
    
    if (success) {
      if (typeof stoUI !== 'undefined') {
        stoUI.showToast(i18next.t('preferences_saved'), 'success')
      }
      
      // Apply all settings
      Object.entries(this.settings).forEach(([key, value]) => {
        switch (key) {
          case 'autoSave':
            // Apply auto-save setting
            break
          case 'autoSync':
            // Apply auto-sync setting
            break
        }
      })
      
      // Close modal
      if (typeof modalManager !== 'undefined') {
        modalManager.hide('preferencesModal')
      }
    } else {
      if (typeof stoUI !== 'undefined') {
        stoUI.showToast(i18next.t('failed_to_save_preferences'), 'error')
      }
    }
  }

  showPreferences() {
    // Load current settings and update UI
    this.loadSettings()
    
    // Ensure folder UI is properly updated with latest path information
    this.updateFolderUI()
    
    // Show modal
    if (typeof modalManager !== 'undefined') {
      modalManager.show('preferencesModal')
    }
    
    // Switch to sync category by default since general was removed
    this.switchCategory('sync')
  }

  // Utility method to add new settings dynamically
  addSetting(key, definition) {
    this.settingDefinitions[key] = definition
    this.settings[key] = definition.default
  }

  // Utility method to remove settings
  removeSetting(key) {
    delete this.settingDefinitions[key]
    delete this.settings[key]
  }

  // Regenerate preferences modal content for language changes
  populatePreferencesModal() {
    // Re-apply translations to the modal
    const modal = document.getElementById('preferencesModal')
    if (modal && typeof window.applyTranslations === 'function') {
      window.applyTranslations(modal)
    }
    
    // Update folder UI with current language
    this.updateFolderUI()
  }
} 