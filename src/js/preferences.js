// STO Tools Keybind Manager - Preferences Manager
// Handles the revamped preferences modal with category tree and flexible settings

import eventBus from './eventBus.js'
import i18next from 'i18next'

export default class STOPreferencesManager {
  constructor() {
    this.currentCategory = 'general'
    this.settings = {}
    this.settingDefinitions = this.defineSettings()
  }

  init() {
    this.setupEventListeners()
    this.loadSettings()
  }

  defineSettings() {
    return {
      // Sync Settings
      syncFolderName: {
        type: 'folder',
        default: null,
        category: 'sync',
        element: 'currentSyncFolder'
      },
      autoSync: {
        type: 'boolean',
        default: false,
        category: 'sync',
        element: 'autoSync'
      },
      autoSyncInterval: {
        type: 'select',
        default: 'change',
        options: ['change', '60', '120', '300'],
        category: 'sync',
        element: 'autoSyncInterval'
      }
    }
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

  loadSettings() {
    // Load from storage or use defaults
    if (typeof stoStorage === 'undefined') {
      console.warn('stoStorage not available yet, deferring settings load')
      return
    }
    
    const storedSettings = stoStorage.getSettings()
    
    Object.entries(this.settingDefinitions).forEach(([key, definition]) => {
      const value = storedSettings[key] !== undefined ? storedSettings[key] : definition.default
      this.settings[key] = value
      this.updateUI(key, value)
    })
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
      const settings = typeof stoStorage !== 'undefined' ? stoStorage.getSettings() : {}
      
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
    if (typeof stoStorage === 'undefined') {
      console.error('stoStorage not available')
      return
    }
    
    const success = stoStorage.saveSettings(this.settings)
    
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

  // Utility method to get current setting value
  getSetting(key) {
    return this.settings[key] !== undefined ? this.settings[key] : this.settingDefinitions[key]?.default
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
} 