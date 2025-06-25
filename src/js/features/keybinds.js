// STO Tools Keybind Manager - Keybind Operations
// Handles keybind parsing, validation, and file operations
import store from '../core/store.js'
import i18next from 'i18next'
import STOFileHandler from '../lib/fileHandler.js'
import { StorageService } from '../components/services/index.js'

export default class STOKeybindFileManager extends STOFileHandler {
  constructor() {
    super()
  }

  init() {
    this.setupEventListeners()
  }

  // Import keybind file content into the current profile
  importKeybindFile(content) {
    const actualProfile = storageService.getProfile(store.currentProfile)
    if (!actualProfile) {
      stoUI.showToast(i18next.t('no_profile_selected_for_import'), 'warning')
      return { success: false, error: 'No active profile' }
    }

    try {
      const parsed = this.parseKeybindFile(content)
      const keyCount = Object.keys(parsed.keybinds).length
      if (keyCount === 0) {
        stoUI.showToast(i18next.t('no_keybinds_found_in_file'), 'warning')
        return { success: false, error: 'No keybinds found' }
      }

      if (!actualProfile.builds) {
        actualProfile.builds = { space: { keys: {} }, ground: { keys: {} } }
      }
      if (!actualProfile.builds[store.currentEnvironment]) {
        actualProfile.builds[store.currentEnvironment] = { keys: {} }
      }
      const buildKeys = actualProfile.builds[store.currentEnvironment].keys

      Object.entries(parsed.keybinds).forEach(([key, keybindData]) => {
        const commandString = keybindData.commands
          .map((cmd) => cmd.command)
          .join(' $$ ')
        const mirrorInfo = this.detectAndUnmirrorCommands(commandString)
        if (mirrorInfo.isMirrored) {
          buildKeys[key] = this.parseCommandString(
            mirrorInfo.originalCommands.join(' $$ ')
          )
          const env = store.currentEnvironment
          if (!actualProfile.keybindMetadata) actualProfile.keybindMetadata = {}
          if (!actualProfile.keybindMetadata[env]) {
            actualProfile.keybindMetadata[env] = {}
          }
          actualProfile.keybindMetadata[env][key] = {
            stabilizeExecutionOrder: true,
          }
        } else {
          buildKeys[key] = keybindData.commands
        }
      })

      storageService.saveProfile(store.currentProfile, actualProfile)
      app.setModified(true)
      app.renderKeyGrid()

      const message = i18next.t('import_completed_keybinds', { count: keyCount })
      if (Object.keys(parsed.aliases).length > 0) {
        stoUI.showToast(
          i18next.t('import_completed_keybinds_with_aliases', {
            keyCount,
            aliasCount: Object.keys(parsed.aliases).length,
          }),
          'success'
        )
      } else {
        stoUI.showToast(message, 'success')
      }

      return {
        success: true,
        imported: { keys: keyCount },
        errors: parsed.errors,
      }
    } catch (error) {
      stoUI.showToast(
        i18next.t('failed_to_import_keybind_file', { error: error.message }),
        'error'
      )
      return { success: false, error: error.message }
    }
  }

  // Separate Alias Import
  importAliasFile(content) {
    const profile = app.getCurrentProfile()
    if (!profile) {
      stoUI.showToast(i18next.t('no_profile_selected_for_import'), 'warning')
      return { success: false, error: 'No active profile' }
    }

    try {
      const parsed = this.parseKeybindFile(content)
      const aliasCount = Object.keys(parsed.aliases).length
      if (aliasCount === 0) {
        stoUI.showToast(i18next.t('no_aliases_found_in_file'), 'warning')
        return { success: false, error: 'No aliases found' }
      }

      const actualProfile = storageService.getProfile(store.currentProfile)
      if (!actualProfile) {
        stoUI.showToast(i18next.t('failed_to_get_profile_for_import'), 'error')
        return { success: false, error: 'Profile not found' }
      }
      if (!actualProfile.aliases) actualProfile.aliases = {}
      Object.entries(parsed.aliases).forEach(([name, aliasData]) => {
        actualProfile.aliases[name] = {
          commands: aliasData.commands,
          description: aliasData.description || '',
        }
      })

      storageService.saveProfile(store.currentProfile, actualProfile)
      app.setModified(true)

      if (
        window.stoAliases &&
        typeof window.stoAliases.updateCommandLibrary === 'function'
      ) {
        window.stoAliases.updateCommandLibrary()
      }

      stoUI.showToast(
        i18next.t('import_completed_aliases', { count: aliasCount }),
        'success'
      )

      return {
        success: true,
        imported: { aliases: aliasCount },
        errors: parsed.errors,
      }
    } catch (error) {
      stoUI.showToast(
        i18next.t('import_failed', { error: error.message }),
        'error'
      )
      return { success: false, error: error.message }
    }
  }

  // Export profile to keybind file format using library method
  exportProfile(profile) {
    return this.generateKeybindFile(profile)
  }

  isValidKey(key) {
    if (!key || typeof key !== 'string' || !Array.isArray(this.validKeys)) return false;
    return this.validKeys.some(
      (validKey) => validKey.toLowerCase() === key.toLowerCase()
    );
  }

  isValidAliasName(name) {
    return STO_DATA.validation.aliasNamePattern.test(name)
  }

  validateKeybind(key, commands) {
    const errors = []
    if (!this.isValidKey(key)) {
      errors.push(`Invalid key name: ${key}`)
    }
    if (!commands || commands.length === 0) {
      errors.push('At least one command is required')
    } else {
      commands.forEach((command, index) => {
        if (!command.command || command.command.trim().length === 0) {
          errors.push(`Command ${index + 1} is empty`)
        }
      })
    }
    if (commands && commands.length > STO_DATA.validation.maxCommandsPerKey) {
      errors.push(`Too many commands (max ${STO_DATA.validation.maxCommandsPerKey})`)
    }
    return { valid: errors.length === 0, errors }
  }

  suggestKeys(filter = '') {
    const filterLower = filter.toLowerCase()
    return this.validKeys
      .filter((key) => key.toLowerCase().includes(filterLower))
      .slice(0, 20)
  }

  getCommonKeys() {
    return [
      'Space','Tab','Enter','F1','F2','F3','F4','F5','F6','F7','F8','1','2','3','4','5','6','7','8','9','0',
      'Ctrl+1','Ctrl+2','Ctrl+3','Ctrl+4','Alt+1','Alt+2','Alt+3','Alt+4','Shift+1','Shift+2','Shift+3','Shift+4'
    ]
  }

  setupEventListeners() {
    // Note: File input handling is done directly in profiles.js
  }

  handleKeybindFileImport(event) {
    const file = event.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        this.importKeybindFile(e.target.result)
      } catch (error) {
        stoUI.showToast(
          i18next.t('failed_to_import_keybind_file', { error: error.message }),
          'error'
        )
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  generateKeybindId() {
    return 'keybind_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  }

  cloneKeybind(keybind) {
    return JSON.parse(JSON.stringify(keybind))
  }
}
